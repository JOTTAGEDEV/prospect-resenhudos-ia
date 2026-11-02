import type { ContactResearch } from "@jotage/shared";

export function ResearchSources({
  sources,
  searchSuggestions,
  title = "Sugestões de pesquisa do Google",
}: {
  sources: ContactResearch["sources"];
  searchSuggestions?: string;
  title?: string;
}) {
  return (
    <div className="space-y-3">
      <ol className="space-y-2">
        {sources.map((source, index) => (
          <li key={`${index}-${source.url}`} className="break-words text-sm">
            <a href={source.url} target="_blank" rel="noreferrer">
              [{index + 1}] {source.title} ↗
            </a>
            {source.provider && (
              <span className="helper block" translate="no">
                {source.provider}
              </span>
            )}
          </li>
        ))}
      </ol>
      {searchSuggestions && (
        <iframe
          title={title}
          className="w-full h-40 border-0"
          sandbox="allow-popups allow-popups-to-escape-sandbox"
          referrerPolicy="no-referrer"
          srcDoc={
            "<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; style-src 'unsafe-inline'; img-src https: data:; base-uri 'none'; form-action 'none'\">" +
            searchSuggestions
          }
        />
      )}
    </div>
  );
}

function isGoogleMapsLink(value: string) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    return (
      url.protocol === "https:" &&
      (host === "maps.google.com" ||
        host === "maps.app.goo.gl" ||
        ([
          "www.google.com",
          "google.com",
          "www.google.com.br",
          "google.com.br",
        ].includes(host) &&
          url.pathname.startsWith("/maps")))
    );
  } catch {
    return false;
  }
}

export function ResearchReport({ report }: { report: ContactResearch }) {
  const company = report.company;
  const locality = [company?.city, company?.state].filter(Boolean).join(" / ");
  return (
    <div className="space-y-4">
      {company && (
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="helper">Site próprio</dt>
            <dd className="break-words">
              {company.website ? (
                <a href={company.website} target="_blank" rel="noreferrer">
                  {company.website} ↗
                </a>
              ) : company.websiteStatus === "not_found" ? (
                "Não localizado na pesquisa"
              ) : (
                "Verificação inconclusiva"
              )}
            </dd>
          </div>
          <div>
            <dt className="helper">Telefone comercial</dt>
            <dd>{company.phone || "Não localizado"}</dd>
          </div>
          <div>
            <dt className="helper">Email comercial</dt>
            <dd className="break-words">{company.email || "Não localizado"}</dd>
          </div>
          <div>
            <dt className="helper">Localidade</dt>
            <dd>{locality || "Não confirmada"}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="helper">Endereço</dt>
            <dd>{company.address || "Não localizado"}</dd>
          </div>
          {company.mapsUrl && isGoogleMapsLink(company.mapsUrl) && (
            <div className="sm:col-span-2">
              <dt className="helper" translate="no">
                Google Maps
              </dt>
              <dd>
                <a href={company.mapsUrl} target="_blank" rel="noreferrer">
                  Conferir a localização ↗
                </a>
              </dd>
            </div>
          )}
        </dl>
      )}
      <p className="whitespace-pre-wrap break-words text-sm">{report.text}</p>
      <ResearchSources
        sources={report.sources}
        searchSuggestions={report.searchSuggestions}
      />
    </div>
  );
}
