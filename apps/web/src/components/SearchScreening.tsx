import { websiteScreeningSchema } from "@jotage/shared";

const labels = {
  pending: "Aguardando verificação",
  has_website: "Descartada desta pesquisa: tem site",
  not_found: "Site não localizado: revisar",
  inconclusive: "Verificação inconclusiva",
};

export function SearchScreening({ result }: { result: unknown }) {
  const parsed = websiteScreeningSchema.safeParse(result);
  if (!parsed.success) return null;
  const { candidates } = parsed.data;
  const count = (decision: string) =>
    candidates.filter((item) => item.decision === decision).length;
  return (
    <section className="mb-6 space-y-3" aria-label="Verificação de sites">
      <h3>Verificação de sites</h3>
      <p className="helper">
        {count("has_website")} com site · {count("not_found")} para revisar ·{" "}
        {count("inconclusive")} inconclusivas · {count("pending")} aguardando
      </p>
      <p className="helper">
        Só entram nos resultados as empresas pesquisadas cujo site não foi
        localizado. Isso não garante que não tenham site. As demais ficam
        registradas abaixo, sem apagar dados do CRM.
      </p>
      {candidates.map((item, index) => (
        <details key={index} className="rounded-md border p-3">
          <summary className="cursor-pointer text-sm font-medium">
            {item.lead.name} — {labels[item.decision]}
          </summary>
          <p className="mt-3 whitespace-pre-wrap break-words text-sm">
            {item.reason || "A pesquisa continua em segundo plano."}
          </p>
          <ol className="mt-3 space-y-2">
            {item.sources.map((source, i) => (
              <li key={`${i}-${source.url}`} className="break-words text-sm">
                <a href={source.url} target="_blank" rel="noreferrer">
                  [{i + 1}] {source.title} ↗
                </a>
              </li>
            ))}
          </ol>
          {item.searchSuggestions && (
            <iframe
              title={`Sugestões Google: ${item.lead.name}`}
              className="w-full h-40 border-0"
              sandbox="allow-popups allow-popups-to-escape-sandbox"
              referrerPolicy="no-referrer"
              srcDoc={
                "<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; style-src 'unsafe-inline'; img-src https: data:; base-uri 'none'; form-action 'none'\">" +
                item.searchSuggestions
              }
            />
          )}
        </details>
      ))}
    </section>
  );
}
