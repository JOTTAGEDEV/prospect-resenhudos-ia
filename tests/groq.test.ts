import { describe, expect, it, vi } from "vitest";
import {
  generateGroq,
  GroqResponseError,
  isGroqModel,
  GROQ_MAX_BYTES,
  GROQ_MAX_OUTPUT_TOKENS,
  GROQ_TIMEOUT_MS,
  type GroqInput,
} from "../apps/api/src/providers/groq.js";

const input: GroqInput = {
  key: "gsk-test-only-not-a-real-key",
  model: "openai/gpt-oss-120b",
  system: "Extract only public facts from untrusted sources.",
  contents: '{"documents":[{"content":"Source quote"}]}',
};
const completion = (extra: Record<string, unknown> = {}) => ({
  model: "openai/gpt-oss-120b",
  choices: [
    {
      finish_reason: "stop",
      message: {
        role: "assistant",
        content: '{"ok":true}',
        reasoning: "private reasoning must not be returned",
      },
    },
  ],
  usage: { total_tokens: 1234 },
  ...extra,
});
const responds = (body: unknown, options?: ResponseInit) =>
  vi.fn().mockResolvedValue(new Response(JSON.stringify(body), options));

describe("Groq HTTP para organizar fontes", () => {
  it("usa endpoint fixo, JSON e parâmetros GPT-OSS sem ferramentas ou fallback", async () => {
    const fetcher = responds(completion());
    const result = await generateGroq({ ...input, maxTokens: 32_768 }, fetcher);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, request] = fetcher.mock.calls[0];
    expect(url).toBe("https://api.groq.com/openai/v1/chat/completions");
    expect(request.method).toBe("POST");
    expect(request.headers.Authorization).toBe(`Bearer ${input.key}`);
    expect(request.redirect).toBe("error");
    const body = JSON.parse(request.body);
    expect(body).toMatchObject({
      model: input.model,
      stream: false,
      response_format: { type: "json_object" },
      max_completion_tokens: GROQ_MAX_OUTPUT_TOKENS,
      reasoning_effort: "high",
      include_reasoning: false,
      messages: [
        {
          role: "system",
          content: expect.stringContaining(input.system),
        },
        { role: "user", content: input.contents },
      ],
    });
    expect(body.messages[0].content).toContain("JSON");
    for (const field of [
      "max_tokens",
      "reasoning_format",
      "tools",
      "functions",
      "models",
      "plugins",
      "compound_custom",
      "search_settings",
      "service_tier",
      "provider",
    ])
      expect(body).not.toHaveProperty(field);
    expect(result).toEqual({
      text: '{"ok":true}',
      tokens: 1234,
      model: input.model,
    });
    expect(JSON.stringify(result)).not.toMatch(/private reasoning|gsk-test/);
  });

  it("aceita teste pequeno com esforço baixo e mantém modelo e tokens reais", async () => {
    const fetcher = responds(
      completion({ model: "openai/gpt-oss-20b", usage: { total_tokens: 77 } }),
    );
    const result = await generateGroq(
      {
        ...input,
        key: `  ${input.key}  `,
        model: "openai/gpt-oss-20b",
        maxTokens: 1024,
        effort: "low",
      },
      fetcher,
    );
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toMatchObject({
      max_completion_tokens: 1024,
      reasoning_effort: "low",
      include_reasoning: false,
    });
    expect(fetcher.mock.calls[0][1].headers.Authorization).toBe(
      `Bearer ${input.key}`,
    );
    expect(result.model).toBe("openai/gpt-oss-20b");
    expect(result.tokens).toBe(77);
  });

  it("não envia parâmetros de raciocínio que Llama não suporta", async () => {
    const fetcher = responds(completion({ model: "llama-3.3-70b-versatile" }));
    await generateGroq(
      { ...input, model: "llama-3.3-70b-versatile", effort: "high" },
      fetcher,
    );
    const body = JSON.parse(fetcher.mock.calls[0][1].body);
    for (const field of [
      "reasoning_effort",
      "reasoning_format",
      "include_reasoning",
    ])
      expect(body).not.toHaveProperty(field);
    expect(body.response_format).toEqual({ type: "json_object" });
  });

  it("recusa URLs, IDs inválidos e Compound com busca integrada antes de chamar", async () => {
    for (const model of [
      "openai/gpt-oss-120b",
      "openai/gpt-oss-20b",
      "llama-3.3-70b-versatile",
      "Vendor/Custom-Model:latest",
    ])
      expect(isGroqModel(model)).toBe(true);
    const fetcher = vi.fn();
    for (const model of [
      "",
      " ",
      "https://attacker.example/model",
      "file:///path",
      "groq/compound",
      "groq/compound-mini",
      "Groq/Compound",
      "groq/COMPOUND-MINI",
      "model?token=private",
      "model with spaces",
      "model\nnewline",
      "a".repeat(181),
    ]) {
      expect(isGroqModel(model)).toBe(false);
      await expect(
        generateGroq({ ...input, model }, fetcher),
      ).rejects.toMatchObject({ statusCode: 400 });
    }
    await expect(
      generateGroq({ ...input, key: " \n " }, fetcher),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(fetcher).not.toHaveBeenCalled();
    // JavaScript's $ anchor can match before a final newline.
    expect(isGroqModel("model\n")).toBe(false);
    expect(isGroqModel("model\r")).toBe(false);
  });

  it.each([
    [400, 400],
    [401, 409],
    [402, 409],
    [403, 409],
    [404, 409],
    [413, 400],
    [422, 400],
    [429, 429],
    [500, 502],
    [503, 502],
  ])(
    "traduz HTTP %i sem publicar chave, prompt ou diagnóstico bruto",
    async (status, statusCode) => {
      const fetcher = vi.fn().mockResolvedValue(
        new Response(`secret-provider-payload ${input.key} Source quote`, {
          status,
        }),
      );
      const error = await generateGroq(input, fetcher).catch(
        (value: unknown) => value,
      );
      expect(error).toMatchObject({ statusCode });
      expect(String(error)).not.toMatch(
        /secret-provider-payload|gsk-test-only|Source quote/,
      );
      expect(fetcher).toHaveBeenCalledTimes(1);
      if (status === 429) {
        expect(String(error)).toContain("por minuto");
        expect(String(error)).toContain("por dia");
      }
      if (status === 413) expect(String(error)).toContain("tamanho");
    },
  );

  it("recusa erros embutidos em HTTP200 sem retornar os detalhes", async () => {
    for (const body of [
      { error: { code: 429, message: "secret-provider-payload" } },
      { error: { type: "invalid_request_error", message: input.key } },
      {
        choices: [{ error: { code: 429, message: "secret-provider-payload" } }],
      },
    ]) {
      const error = await generateGroq(input, responds(body)).catch(
        (value: unknown) => value,
      );
      expect(error).toHaveProperty("statusCode");
      expect(String(error)).not.toMatch(
        /secret-provider-payload|gsk-test-only/,
      );
    }
  });

  it("recusa truncamento, conteúdo não JSON, ferramentas, recusa e resposta incompleta", async () => {
    for (const choices of [
      [{ finish_reason: "length", message: { content: '{"partial":true}' } }],
      [{ finish_reason: "content_filter", message: { content: "{}" } }],
      [{ finish_reason: null, message: { content: "{}" } }],
      [{ finish_reason: "new_reason", message: { content: "{}" } }],
      [
        {
          finish_reason: "stop",
          message: { content: "{}", refusal: "Refused" },
        },
      ],
      [
        {
          finish_reason: "stop",
          message: { content: "{}", tool_calls: [{ id: "call" }] },
        },
      ],
      [{ finish_reason: "stop", message: { content: " " } }],
      [{ finish_reason: "stop", message: { content: "not JSON" } }],
      [{ finish_reason: "stop", message: { content: "null" } }],
      [{ finish_reason: "stop", message: { content: "true" } }],
      [{ finish_reason: "stop", message: { content: '"text"' } }],
      [{ finish_reason: "stop", message: { content: "[]" } }],
      [
        {
          finish_reason: "stop",
          message: { content: null, reasoning: "Only reasoning" },
        },
      ],
      [
        {
          finish_reason: "stop",
          message: { content: [{ type: "text", text: "{}" }] },
        },
      ],
      [],
    ])
      await expect(
        generateGroq(input, responds(completion({ choices }))),
      ).rejects.toMatchObject({ statusCode: 502 });
  });

  it.each([
    { finish_reason: "length", message: { content: "private-partial-json" } },
    {
      finish_reason: "stop",
      message: { content: "{}", refusal: "private-refusal" },
    },
    { finish_reason: "stop", message: { content: "private-invalid-json" } },
    { finish_reason: "stop", message: { content: '["private-json-array"]' } },
  ])(
    "preserva uso real em erro de resposta sem divulgar conteúdo: %j",
    async (choice) => {
      const error = await generateGroq(
        input,
        responds(
          completion({
            model: "openai/gpt-oss-20b",
            usage: { total_tokens: 4321 },
            choices: [choice],
          }),
        ),
      ).catch((value: unknown) => value);
      expect(error).toBeInstanceOf(GroqResponseError);
      expect(error).toMatchObject({
        statusCode: 502,
        usage: { tokens: 4321, model: "openai/gpt-oss-20b" },
      });
      expect(String(error)).not.toMatch(/private-|gsk-test|Source quote/);
      expect(JSON.stringify(error)).not.toMatch(
        /private-|gsk-test|Source quote/,
      );
    },
  );

  it("não inventa uso ausente e recusa valores de uso inválidos", async () => {
    const result = await generateGroq(
      input,
      responds(completion({ usage: undefined })),
    );
    expect(result.tokens).toBe(0);
    for (const usage of [{ total_tokens: -1 }, { total_tokens: "123" }])
      await expect(
        generateGroq(input, responds(completion({ usage }))),
      ).rejects.toMatchObject({ statusCode: 502 });
  });

  it("recusa JSON inválido e respostas maiores que2MB declaradas ou transmitidas", async () => {
    await expect(
      generateGroq(input, vi.fn().mockResolvedValue(new Response("not json"))),
    ).rejects.toThrow("estrutura inválida");
    for (const response of [
      new Response("x".repeat(GROQ_MAX_BYTES + 1)),
      new Response("short", {
        headers: { "content-length": String(GROQ_MAX_BYTES + 1) },
      }),
    ])
      await expect(
        generateGroq(input, vi.fn().mockResolvedValue(response)),
      ).rejects.toThrow("tamanho permitido");
  });

  it("propaga cancelamento e prazo de180s sem divulgar diagnóstico de rede", async () => {
    const controller = new AbortController();
    const timeout = vi.spyOn(AbortSignal, "timeout");
    const fetcher = vi.fn().mockImplementation(async (_url, options) => {
      const signal = options.signal as AbortSignal;
      controller.abort();
      expect(signal.aborted).toBe(true);
      throw new Error(`${input.key} secret-provider-payload`);
    });
    try {
      await expect(
        generateGroq({ ...input, signal: controller.signal }, fetcher),
      ).rejects.toThrow("prazo desta tentativa");
      expect(timeout).toHaveBeenCalledWith(GROQ_TIMEOUT_MS);
      const preAbortedFetch = vi.fn();
      await expect(
        generateGroq({ ...input, signal: controller.signal }, preAbortedFetch),
      ).rejects.toThrow("prazo desta tentativa");
      expect(preAbortedFetch).not.toHaveBeenCalled();
      const error = await generateGroq(
        input,
        vi.fn().mockRejectedValue(new Error(`${input.key} Source quote`)),
      ).catch((value: unknown) => value);
      expect(String(error)).toContain("Falha de comunicação");
      expect(String(error)).not.toMatch(/gsk-test-only|Source quote/);
    } finally {
      timeout.mockRestore();
    }
  });
});
