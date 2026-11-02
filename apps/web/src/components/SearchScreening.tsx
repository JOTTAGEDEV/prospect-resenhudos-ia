import { contactResearchSchema, websiteScreeningSchema } from "@jotage/shared";
import { ResearchReport, ResearchSources } from "./ResearchReport";

const labels = {
  pending: "Aguardando verificação",
  has_website: "Descartada desta pesquisa: tem site",
  not_found: "Site não localizado: revisar",
  inconclusive: "Verificação inconclusiva",
};

export function SearchScreening({ result }: { result: unknown }) {
  const discovery = contactResearchSchema.safeParse(
    result && typeof result === "object" && "discoveryReport" in result
      ? result.discoveryReport
      : undefined,
  );
  const parsed = websiteScreeningSchema.safeParse(result);
  if (!parsed.success && !discovery.success) return null;
  const candidates = parsed.success ? parsed.data.candidates : [];
  const count = (decision: string) =>
    candidates.filter((item) => item.decision === decision).length;
  return (
    <section className="mb-6 space-y-3" aria-label="Pesquisa e verificação">
      {discovery.success && (
        <details className="rounded-md border p-3">
          <summary className="cursor-pointer text-sm font-medium">
            Pesquisa inicial — informações e fontes
          </summary>
          <div className="mt-4">
            <ResearchReport report={discovery.data} />
          </div>
        </details>
      )}
      {parsed.success && (
        <>
          <h3>Verificação de sites</h3>
          <p className="helper">
            {count("has_website")} com site · {count("not_found")} para revisar
            · {count("inconclusive")} inconclusivas · {count("pending")}{" "}
            aguardando
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
              <p className="helper mt-3">
                {[item.lead.address, item.lead.city, item.lead.state]
                  .filter(Boolean)
                  .join(" · ") || "Localidade não confirmada"}
              </p>
              {(item.lead.phone || item.lead.email) && (
                <p className="mt-2 text-sm break-words">
                  {[item.lead.phone, item.lead.email]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              )}
              <div className="mt-3">
                <ResearchSources
                  sources={item.sources}
                  searchSuggestions={item.searchSuggestions}
                  title={`Sugestões Google: ${item.lead.name}`}
                />
              </div>
            </details>
          ))}
        </>
      )}
    </section>
  );
}
