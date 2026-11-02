import { z } from "zod";
import { AppError } from "../services/leads.js";

export const GROQ_MAX_BYTES = 2 * 1024 * 1024;
export const GROQ_TIMEOUT_MS = 180_000;
export const GROQ_MAX_OUTPUT_TOKENS = 8192;
export type GroqInput = {
  key: string;
  model: string;
  system: string;
  contents: string;
  maxTokens?: number;
  effort?: "low" | "high";
  signal?: AbortSignal;
};
export type GroqOutput = {
  text: string;
  tokens: number;
  model: string;
};
export class GroqResponseError extends AppError {
  constructor(
    statusCode: number,
    message: string,
    public readonly usage: { tokens: number; model: string },
  ) {
    super(statusCode, message);
  }
}

export function isGroqModel(model: string) {
  return (
    model.length > 0 &&
    model.length <= 180 &&
    /^[a-zA-Z0-9][a-zA-Z0-9._:/-]*$/.test(model) &&
    !/\s/.test(model) &&
    !model.includes("://") &&
    !["groq/compound", "groq/compound-mini"].includes(model.toLowerCase())
  );
}

const responseSchema = z.object({
  model: z.string().min(1).max(200),
  choices: z
    .array(
      z.object({
        finish_reason: z.string().nullable(),
        message: z.object({
          content: z.string().nullable(),
          refusal: z.unknown().optional(),
          tool_calls: z.array(z.unknown()).optional(),
        }),
      }),
    )
    .length(1),
  usage: z
    .object({
      total_tokens: z.number().int().nonnegative().optional(),
    })
    .optional(),
});

function providerError(status: number) {
  if (status === 401 || status === 403)
    return new AppError(
      409,
      "Groq recusou a chave ou a permissão para este modelo. Confira a chave e o acesso da conta em Configurações.",
    );
  if (status === 402)
    return new AppError(
      409,
      "Groq recusou o acesso pelo limite de consumo da conta. Confira os limites e o plano diretamente na Groq.",
    );
  if (status === 404)
    return new AppError(
      409,
      "Modelo Groq indisponível para esta conta. Confira o identificador e selecione um modelo habilitado em Configurações.",
    );
  if (status === 413)
    return new AppError(
      400,
      "O conteúdo da pesquisa excedeu o tamanho aceito pela Groq. Reduza o limite de empresas e confira os limites de contexto e tokens por minuto do modelo.",
    );
  if (status === 429)
    return new AppError(
      429,
      "Limite da Groq atingido. Confira chamadas e tokens por minuto e por dia na conta; ter tokens diários disponíveis não elimina o limite por minuto. Aguarde antes de retomar.",
    );
  if (status === 400 || status === 422)
    return new AppError(
      400,
      "Groq rejeitou os parâmetros, o formato JSON ou o tamanho do contexto deste modelo. Confira o modelo e tente uma pesquisa com menos empresas.",
    );
  return new AppError(
    502,
    "Groq está temporariamente indisponível. A pesquisa poderá ser retomada em instantes.",
  );
}

async function boundedJson(response: Response): Promise<unknown> {
  if (Number(response.headers.get("content-length") || 0) > GROQ_MAX_BYTES) {
    await response.body?.cancel();
    throw new AppError(502, "A resposta Groq excedeu o tamanho permitido.");
  }
  const reader = response.body?.getReader();
  if (!reader) throw new AppError(502, "Groq retornou uma resposta vazia.");
  const parts: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > GROQ_MAX_BYTES) {
        await reader.cancel();
        throw new AppError(502, "A resposta Groq excedeu o tamanho permitido.");
      }
      parts.push(part.value);
    }
  } finally {
    reader.releaseLock();
  }
  return JSON.parse(Buffer.concat(parts).toString("utf8")) as unknown;
}

function embeddedError(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const error = (value as Record<string, unknown>).error;
  if (!error || typeof error !== "object") return null;
  const code = Number((error as Record<string, unknown>).code);
  return Number.isInteger(code) && code >= 400 && code <= 599
    ? providerError(code)
    : providerError(502);
}

export async function generateGroq(
  input: GroqInput,
  fetcher: typeof fetch = fetch,
): Promise<GroqOutput> {
  const model = input.model.trim();
  if (!isGroqModel(model))
    throw new AppError(
      400,
      "Informe um identificador de modelo Groq válido. Rotas Compound com ferramentas integradas não são aceitas nesta pesquisa.",
    );
  if (!input.key.trim())
    throw new AppError(
      409,
      "Configure a chave Groq em Configurações antes de pesquisar.",
    );
  const timeout = AbortSignal.timeout(GROQ_TIMEOUT_MS);
  const requestSignal = input.signal
    ? AbortSignal.any([input.signal, timeout])
    : timeout;
  try {
    requestSignal.throwIfAborted();
    const gptOss = ["openai/gpt-oss-120b", "openai/gpt-oss-20b"].includes(
      model,
    );
    const outputTokens = Number.isFinite(input.maxTokens)
      ? Math.max(
          1,
          Math.min(GROQ_MAX_OUTPUT_TOKENS, Math.floor(input.maxTokens!)),
        )
      : GROQ_MAX_OUTPUT_TOKENS;
    const response = await fetcher(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        redirect: "error",
        signal: requestSignal,
        headers: {
          Authorization: `Bearer ${input.key.trim()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: "system",
              content: `${input.system}\nResponda somente com um objeto JSON válido, sem cercas de código.`,
            },
            { role: "user", content: input.contents },
          ],
          stream: false,
          response_format: { type: "json_object" },
          max_completion_tokens: outputTokens,
          // GPT-OSS rejects reasoning_format; use include_reasoning instead.
          // Other models do not necessarily accept reasoning_effort either.
          ...(gptOss
            ? {
                reasoning_effort: input.effort || "high",
                include_reasoning: false,
              }
            : {}),
        }),
      },
    );
    if (!response.ok) {
      await response.body?.cancel();
      throw providerError(response.status);
    }
    const raw = await boundedJson(response);
    const topError = embeddedError(raw);
    if (topError) throw topError;
    const firstChoice =
      raw && typeof raw === "object"
        ? (raw as { choices?: unknown[] }).choices?.[0]
        : undefined;
    const choiceError = embeddedError(firstChoice);
    if (choiceError) throw choiceError;
    const parsed = responseSchema.parse(raw);
    const usage = {
      tokens: parsed.usage?.total_tokens || 0,
      model: parsed.model,
    };
    const choice = parsed.choices[0];
    if (
      choice.finish_reason !== "stop" ||
      !choice.message.content?.trim() ||
      choice.message.refusal ||
      choice.message.tool_calls?.length
    )
      throw new GroqResponseError(
        502,
        "Groq retornou uma resposta incompleta ou sem texto utilizável. Nenhum contato foi alterado.",
        usage,
      );
    let object: unknown;
    try {
      object = JSON.parse(choice.message.content) as unknown;
    } catch {
      throw new GroqResponseError(
        502,
        "Groq retornou uma estrutura inválida. Nenhum contato foi alterado.",
        usage,
      );
    }
    if (!object || typeof object !== "object" || Array.isArray(object))
      throw new GroqResponseError(
        502,
        "Groq retornou uma estrutura inválida. Nenhum contato foi alterado.",
        usage,
      );
    return {
      text: choice.message.content,
      ...usage,
    };
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (requestSignal.aborted)
      throw new AppError(
        502,
        "Groq excedeu o prazo desta tentativa ou a tarefa foi interrompida. A pesquisa poderá ser retomada.",
      );
    if (error instanceof z.ZodError || error instanceof SyntaxError)
      throw new AppError(
        502,
        "Groq retornou uma estrutura inválida. Nenhum contato foi alterado.",
      );
    // Never expose raw provider errors, which may contain keys or source text.
    throw new AppError(
      502,
      "Falha de comunicação com Groq. Tente novamente em instantes.",
    );
  }
}
