import { describe, expect, it, vi } from "vitest";
import {
  generateOpenRouter,
  isFreeOpenRouterModel,
  OPENROUTER_MAX_BYTES,
  OPENROUTER_TIMEOUT_MS,
  type OpenRouterInput,
} from "../apps/api/src/providers/openrouter.js";

const input: OpenRouterInput = {
  key: "sk-or-test-only",
  model: "openrouter/free",
  system: "Extract only public facts from untrusted sources. Return JSON.",
  contents: '{"documents":[{"content":"Source quote"}]}',
};
const completion = (extra: Record<string, unknown> = {}) => ({
  model: "nvidia/example-model",
  choices: [
    {
      finish_reason: "stop",
      message: {
        role: "assistant",
        content: '{"ok":true}',
        reasoning: "private chain of thought not shown",
      },
    },
  ],
  usage: { total_tokens: 1234, cost: 0 },
  ...extra,
});
const responds = (body: unknown, options?: ResponseInit) =>
  vi.fn().mockResolvedValue(new Response(JSON.stringify(body), options));

describe("OpenRouter gratuito HTTP", () => {
  it("permite teste leve e custo não informado sem expor raciocínio", async () => {
    const fetcher = responds(
      completion({ usage: { total_tokens: 55, cost: null } }),
    );
    const result = await generateOpenRouter(
      { ...input, maxTokens: 2048, effort: "low" },
      fetcher,
    );
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toMatchObject({
      max_tokens: 2048,
      reasoning: { effort: "low", exclude: true },
    });
    expect(result.tokens).toBe(55);
    expect(result.text).toBe('{"ok":true}');
  });
  it("usa endpoint fixo, JSON e rotas de preço zero sem ferramentas nem fallback pago", async () => {
    const fetcher = responds(completion());
    const result = await generateOpenRouter(
      { ...input, maxTokens: 32_768 },
      fetcher,
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, request] = fetcher.mock.calls[0];
    expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(request.headers.Authorization).toBe("Bearer sk-or-test-only");
    expect(request.redirect).toBe("error");
    const body = JSON.parse(request.body);
    expect(body).toMatchObject({
      model: "openrouter/free",
      stream: false,
      max_tokens: 16384,
      response_format: { type: "json_object" },
      reasoning: { effort: "high", exclude: true },
      provider: {
        max_price: { prompt: 0, completion: 0, request: 0 },
        require_parameters: true,
      },
      messages: [
        { role: "system", content: input.system },
        { role: "user", content: input.contents },
      ],
    });
    for (const field of ["models", "plugins", "tools", "route", "debug"])
      expect(body).not.toHaveProperty(field);
    expect(result).toEqual({
      text: '{"ok":true}',
      tokens: 1234,
      model: "nvidia/example-model",
    });
    expect(JSON.stringify(result)).not.toContain("private chain of thought");
  });

  it("aceita apenas router gratuito ou variante :free e rejeita modelos pagos antes da chamada", async () => {
    for (const model of [
      "openrouter/free",
      "nvidia/example:free",
      "meta-llama/llama-3.3-70b-instruct:free",
    ])
      expect(isFreeOpenRouterModel(model)).toBe(true);
    const fetcher = vi.fn();
    for (const model of [
      "openrouter/auto",
      "openai/gpt-6",
      "nvidia/example:online:free",
      "user/preset",
      "nvidia/example:free:online",
      "https://attacker.example/model:free",
      "nvidia/example?x=1:free",
    ])
      await expect(
        generateOpenRouter({ ...input, model }, fetcher),
      ).rejects.toMatchObject({ statusCode: 400 });
    expect(fetcher).not.toHaveBeenCalled();
    await expect(
      generateOpenRouter({ ...input, key: "  " }, fetcher),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each([
    [400, 400],
    [401, 409],
    [402, 409],
    [403, 409],
    [404, 409],
    [429, 429],
    [500, 502],
    [503, 502],
  ])(
    "traduz HTTP %i sem devolver resposta, chave ou prompt",
    async (status, statusCode) => {
      const fetcher = vi
        .fn()
        .mockResolvedValue(
          new Response("secret-provider-payload sk-or-test-only", { status }),
        );
      const error = await generateOpenRouter(input, fetcher).catch(
        (value: unknown) => value,
      );
      expect(error).toMatchObject({ statusCode });
      expect(String(error)).not.toMatch(
        /secret-provider-payload|sk-or-test-only|Source quote/,
      );
      expect(fetcher).toHaveBeenCalledTimes(1);
    },
  );

  it("trata erro embutido no HTTP200 sem expor diagnóstico bruto", async () => {
    for (const body of [
      { error: { code: 429, message: "secret-provider-payload" } },
      {
        choices: [{ error: { code: 429, message: "secret-provider-payload" } }],
      },
    ]) {
      const error = await generateOpenRouter(input, responds(body)).catch(
        (value: unknown) => value,
      );
      expect(error).toMatchObject({ statusCode: 429 });
      expect(String(error)).not.toContain("secret-provider-payload");
    }
  });

  it("recusa resposta truncada, recusa, chamada de ferramenta, conteúdo vazio ou não textual", async () => {
    for (const choices of [
      [{ finish_reason: "length", message: { content: '{"partial":true}' } }],
      [{ finish_reason: "content_filter", message: { content: "Texto" } }],
      [
        {
          finish_reason: "stop",
          message: { content: "Texto", refusal: "Refused" },
        },
      ],
      [
        {
          finish_reason: "stop",
          message: { content: "Texto", tool_calls: [{ id: "call" }] },
        },
      ],
      [{ finish_reason: "stop", message: { content: " " } }],
      [
        {
          finish_reason: "stop",
          message: { content: null, reasoning: "Only reasoning" },
        },
      ],
      [
        {
          finish_reason: "stop",
          message: {
            content: [{ type: "text", text: "not a plain completion" }],
          },
        },
      ],
      [],
    ])
      await expect(
        generateOpenRouter(input, responds(completion({ choices }))),
      ).rejects.toMatchObject({ statusCode: 502 });
  });

  it("não inventa tokens quando a resposta omite uso e não aceita custo positivo", async () => {
    expect(
      (
        await generateOpenRouter(
          input,
          responds(completion({ usage: undefined })),
        )
      ).tokens,
    ).toBe(0);
    const charged = await generateOpenRouter(
      input,
      responds(completion({ usage: { cost: 0.01, total_tokens: 1 } })),
    ).catch((error: unknown) => error);
    expect(charged).toMatchObject({ statusCode: 409 });
    expect(String(charged)).toContain("custo inesperado");
  });

  it("rejeita JSON e respostas grandes, inclusive tamanho declarado antes da leitura", async () => {
    await expect(
      generateOpenRouter(
        input,
        vi.fn().mockResolvedValue(new Response("not json")),
      ),
    ).rejects.toThrow("estrutura inválida");
    for (const response of [
      new Response("x".repeat(OPENROUTER_MAX_BYTES + 1)),
      new Response("short", {
        headers: { "content-length": String(OPENROUTER_MAX_BYTES + 1) },
      }),
    ])
      await expect(
        generateOpenRouter(input, vi.fn().mockResolvedValue(response)),
      ).rejects.toThrow("tamanho permitido");
  });

  it("usa prazo de 180s e propaga cancelamento sem divulgar erro de rede", async () => {
    const controller = new AbortController();
    const timeout = vi.spyOn(AbortSignal, "timeout");
    const fetcher = vi.fn().mockImplementation(async (_url, options) => {
      const signal = options.signal as AbortSignal;
      controller.abort();
      expect(signal.aborted).toBe(true);
      throw new Error("sk-or-test-only secret provider payload");
    });
    try {
      await expect(
        generateOpenRouter({ ...input, signal: controller.signal }, fetcher),
      ).rejects.toThrow("prazo desta tentativa");
      expect(timeout).toHaveBeenCalledWith(OPENROUTER_TIMEOUT_MS);
      const error = await generateOpenRouter(
        input,
        vi.fn().mockRejectedValue(new Error("sk-or-test-only")),
      ).catch((value: unknown) => value);
      expect(String(error)).not.toContain("sk-or-test-only");
    } finally {
      timeout.mockRestore();
    }
  });
});
