import { z } from "zod";
import { AppError } from "../services/leads.js";

export type SearchDocument = {
  id: number;
  title: string;
  url: string;
  content: string;
};
export const TAVILY_MAX_BYTES = 2 * 1024 * 1024;
const DOCUMENT_MAX_CHARS = 16_000;
const resultsSchema = z.object({
  results: z.array(
    z.object({
      title: z.string(),
      url: z.string(),
      content: z.string(),
      raw_content: z.string().nullable().optional(),
    }),
  ),
});

function documentContent(
  result: z.infer<typeof resultsSchema>["results"][number],
) {
  if (!result.raw_content?.trim())
    return result.content.slice(0, DOCUMENT_MAX_CHARS);
  const snippet = result.content.slice(0, 4000);
  const separator = snippet ? "\n\n" : "";
  const available = DOCUMENT_MAX_CHARS - snippet.length - separator.length;
  const raw = result.raw_content.trim();
  if (raw.length <= available) return snippet + separator + raw;
  // Business identity is often near the header; address and contacts near the
  // footer. Keep both as literal source excerpts without fetching extra URLs.
  const marker = "\n[... trecho intermediário omitido ...]\n";
  const head = Math.floor((available - marker.length) / 2);
  const tail = available - marker.length - head;
  return snippet + separator + raw.slice(0, head) + marker + raw.slice(-tail);
}

function tavilyError(status: number) {
  if (status === 401 || status === 403)
    return new AppError(
      409,
      "Tavily recusou a chave de busca. Confira a chave em Configurações.",
    );
  if ([429, 432, 433].includes(status))
    return new AppError(
      429,
      "Limite de buscas Tavily atingido. Confira os créditos e limites no painel Tavily antes de retomar.",
    );
  if (status === 400 || status === 422)
    return new AppError(
      400,
      "Tavily rejeitou os parâmetros da pesquisa. Confira a região e o segmento.",
    );
  return new AppError(
    502,
    "Tavily está temporariamente indisponível. A pesquisa poderá ser retomada.",
  );
}

async function boundedJson(response: Response) {
  if (Number(response.headers.get("content-length") || 0) > TAVILY_MAX_BYTES) {
    await response.body?.cancel();
    throw new AppError(
      502,
      "A resposta da busca excedeu o tamanho permitido. Nenhum contato foi salvo.",
    );
  }
  const reader = response.body?.getReader();
  if (!reader) throw new AppError(502, "Tavily retornou uma resposta vazia.");
  const parts: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > TAVILY_MAX_BYTES) {
        await reader.cancel();
        throw new AppError(
          502,
          "A resposta da busca excedeu o tamanho permitido. Nenhum contato foi salvo.",
        );
      }
      parts.push(part.value);
    }
  } finally {
    reader.releaseLock();
  }
  return JSON.parse(Buffer.concat(parts).toString("utf8")) as unknown;
}

// One basic search costs one Tavily credit; no automatic upgrade or follow-up requests.
export async function searchTavily(
  key: string,
  query: string,
  maxResults = 20,
  signal?: AbortSignal,
  fetcher: typeof fetch = fetch,
): Promise<SearchDocument[]> {
  if (!key.trim())
    throw new AppError(
      409,
      "Configure a chave Tavily em Configurações para pesquisar na web.",
    );
  const timeout = AbortSignal.timeout(45_000);
  const requestSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;
  try {
    const response = await fetcher("https://api.tavily.com/search", {
      method: "POST",
      redirect: "error",
      signal: requestSignal,
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: query.slice(0, 400),
        topic: "general",
        search_depth: "basic",
        auto_parameters: false,
        max_results: Math.max(1, Math.min(20, Math.floor(maxResults))),
        include_answer: false,
        include_raw_content: "markdown",
        include_images: false,
        include_usage: true,
        country: "brazil",
      }),
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw tavilyError(response.status);
    }
    const parsed = resultsSchema.parse(await boundedJson(response));
    const seen = new Set<string>();
    return parsed.results.slice(0, 20).flatMap((result) => {
      try {
        const url = new URL(result.url);
        if (
          !/^https?:$/.test(url.protocol) ||
          url.username ||
          url.password ||
          result.url.length > 2000 ||
          seen.has(url.href)
        )
          return [];
        seen.add(url.href);
        return [
          {
            id: seen.size,
            title: result.title.slice(0, 500),
            url: result.url,
            content: documentContent(result),
          },
        ];
      } catch {
        return [];
      }
    });
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (requestSignal.aborted)
      throw new AppError(
        502,
        "A busca Tavily excedeu o prazo desta tentativa. A tarefa poderá ser retomada.",
      );
    if (error instanceof z.ZodError || error instanceof SyntaxError)
      throw new AppError(
        502,
        "Tavily retornou uma resposta inválida. Nenhum contato foi salvo.",
      );
    // Never expose provider response bodies or fetch errors: they can contain keys.
    throw new AppError(
      502,
      "Falha de comunicação com Tavily. Tente novamente em instantes.",
    );
  }
}
