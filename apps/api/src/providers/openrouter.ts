import { z } from "zod";
import { AppError } from "../services/leads.js";

export const OPENROUTER_MAX_BYTES = 2 * 1024 * 1024;
export const OPENROUTER_TIMEOUT_MS = 180_000;
export type OpenRouterInput = {
  key: string;
  model: string;
  system: string;
  contents: string;
  maxTokens?: number;
  effort?: "low" | "high";
  signal?: AbortSignal;
};
export type OpenRouterOutput = {
  text: string;
  tokens: number;
  model: string;
};

// Do not accept paid fallbacks, :online variants, presets or arbitrary endpoints.
export function isFreeOpenRouterModel(model: string) {
  return (
    model === "openrouter/free" ||
    /^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._/-]*:free$/.test(model)
  );
}

const responseSchema = z.object({
  model: z.string().min(1).max(200),
  choices: z
    .array(
      z.object({
        finish_reason: z.string().nullable().optional(),
        message: z.object({
          content: z.string().nullable(),
          refusal: z.unknown().optional(),
          tool_calls: z.array(z.unknown()).optional(),
        }),
      }),
    )
    .min(1),
  usage: z
    .object({
      total_tokens: z.number().int().nonnegative().optional(),
      cost: z.number().nonnegative().nullable().optional(),
    })
    .optional(),
});

function providerError(status: number) {
  if (status === 401 || status === 403)
    return new AppError(
      409,
      "OpenRouter recusou a chave ou o acesso. Confira a chave e as permissões da conta em Configurações.",
    );
  if (status === 402)
    return new AppError(
      409,
      "OpenRouter recusou o acesso gratuito desta conta. Confira seus limites e créditos; o site não muda para modelos pagos.",
    );
  if (status === 429)
    return new AppError(
      429,
      "Limite do OpenRouter atingido. Confira as chamadas por minuto e por dia antes de retomar a tarefa.",
    );
  if (status === 400 || status === 422)
    return new AppError(
      400,
      "OpenRouter rejeitou os parâmetros deste modelo. Selecione outro modelo gratuito compatível com JSON.",
    );
  if (status === 404)
    return new AppError(
      409,
      "Não há endpoint gratuito disponível para este modelo no OpenRouter. Confira o modelo e as preferências da conta.",
    );
  return new AppError(
    502,
    "OpenRouter está temporariamente indisponível. A tarefa poderá ser retomada; nenhum modelo pago será usado.",
  );
}

async function boundedJson(response: Response): Promise<unknown> {
  if (
    Number(response.headers.get("content-length") || 0) > OPENROUTER_MAX_BYTES
  ) {
    await response.body?.cancel();
    throw new AppError(
      502,
      "A resposta OpenRouter excedeu o tamanho permitido.",
    );
  }
  const reader = response.body?.getReader();
  if (!reader)
    throw new AppError(502, "OpenRouter retornou uma resposta vazia.");
  const parts: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > OPENROUTER_MAX_BYTES) {
        await reader.cancel();
        throw new AppError(
          502,
          "A resposta OpenRouter excedeu o tamanho permitido.",
        );
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

export async function generateOpenRouter(
  input: OpenRouterInput,
  fetcher: typeof fetch = fetch,
): Promise<OpenRouterOutput> {
  const model = input.model.trim();
  if (!isFreeOpenRouterModel(model))
    throw new AppError(
      400,
      "Use openrouter/free ou um identificador terminado em :free. Esta integração aceita apenas modelos gratuitos.",
    );
  if (!input.key.trim())
    throw new AppError(
      409,
      "Configure a chave OpenRouter em Configurações antes de pesquisar.",
    );
  const timeout = AbortSignal.timeout(OPENROUTER_TIMEOUT_MS);
  const requestSignal = input.signal
    ? AbortSignal.any([input.signal, timeout])
    : timeout;
  try {
    const response = await fetcher(
      "https://openrouter.ai/api/v1/chat/completions",
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
            { role: "system", content: input.system },
            { role: "user", content: input.contents },
          ],
          stream: false,
          response_format: { type: "json_object" },
          max_tokens: Math.max(
            1,
            Math.min(16384, Math.floor(input.maxTokens || 16384)),
          ),
          reasoning: { effort: input.effort || "high", exclude: true },
          provider: {
            // A free model ID alone is insufficient if a paid fallback is added.
            // Keep both the model allowlist and explicit zero-price routing.
            max_price: { prompt: 0, completion: 0, request: 0 },
            require_parameters: true,
          },
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
    const choice = parsed.choices[0];
    if (
      !choice.message.content?.trim() ||
      choice.message.refusal ||
      choice.message.tool_calls?.length ||
      ["length", "content_filter", "tool_calls", "error"].includes(
        choice.finish_reason || "",
      )
    )
      throw new AppError(
        502,
        "OpenRouter retornou uma resposta incompleta ou sem texto utilizável. Nenhum contato foi alterado.",
      );
    if ((parsed.usage?.cost || 0) > 0)
      throw new AppError(
        409,
        "OpenRouter informou um custo inesperado para uma rota gratuita. O resultado foi recusado; confira a conta antes de retomar.",
      );
    return {
      text: choice.message.content,
      tokens: parsed.usage?.total_tokens || 0,
      model: parsed.model,
    };
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (requestSignal.aborted)
      throw new AppError(
        502,
        "OpenRouter excedeu o prazo desta tentativa ou a tarefa foi interrompida. A pesquisa poderá ser retomada.",
      );
    if (error instanceof z.ZodError || error instanceof SyntaxError)
      throw new AppError(
        502,
        "OpenRouter retornou uma estrutura inválida. Nenhum contato foi alterado.",
      );
    // Fetch errors may echo headers or provider payloads. Never expose them.
    throw new AppError(
      502,
      "Falha de comunicação com OpenRouter. Tente novamente em instantes.",
    );
  }
}
