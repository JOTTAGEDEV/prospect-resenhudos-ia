import { AppError } from "../services/leads.js";

// Inspect provider diagnostics, but never return raw messages, prompts or keys.
export function geminiError(error: unknown): AppError {
  const e =
    error && typeof error === "object"
      ? (error as Record<string, unknown>)
      : {};
  let detail: Record<string, unknown> = {};
  if (typeof e.message === "string") {
    try {
      const parsed = JSON.parse(e.message);
      detail = parsed.error || parsed;
    } catch {
      /* Non-JSON SDK error. */
    }
  }
  const code = Number(e.status || detail.code || 0);
  if (code === 429) {
    const diagnostic = JSON.stringify(detail);
    const search = /ground|search/i.test(diagnostic);
    const zero = /"quotaValue"\s*:\s*"?0"?[,}]/.test(diagnostic);
    return new AppError(
      429,
      search
        ? `Limite da pesquisa Google do Gemini atingido${zero ? " (quota disponível: zero)" : ""}. Esse limite é separado dos tokens de texto. Confira a quota da ferramenta no Google AI Studio antes de retomar.`
        : "Quota do Gemini atingida (HTTP 429). Pode ser limite de requisições por minuto ou por dia, mesmo com tokens disponíveis. Confira os limites do modelo no Google AI Studio.",
    );
  }
  if (code === 400)
    return new AppError(
      400,
      "Gemini rejeitou os parâmetros ou a ferramenta para este modelo (HTTP 400). Selecione um modelo compatível com a operação.",
    );
  if (code === 404)
    return new AppError(
      409,
      "Modelo Gemini não encontrado ou indisponível para esta chave (HTTP 404). Recarregue os modelos em Configurações.",
    );
  if (code === 401 || code === 403)
    return new AppError(
      409,
      `Google recusou a chave ou a permissão do projeto (HTTP ${code}). Confira a chave e as restrições no Google AI Studio.`,
    );
  if (code === 503 || code === 500)
    return new AppError(
      502,
      `Gemini temporariamente indisponível (HTTP ${code}). Tente novamente mais tarde.`,
    );
  if (e.name === "TimeoutError" || e.name === "AbortError")
    return new AppError(
      502,
      "Gemini não respondeu dentro do prazo da chamada. Tente novamente em instantes.",
    );
  return new AppError(
    502,
    "Falha de comunicação com Gemini. O Google não retornou um diagnóstico reconhecido; não é possível concluir que faltam tokens.",
  );
}
