import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, MapPin, Info } from "lucide-react";
import { segments, type Lead, type Settings } from "@jotage/shared";
import { api, useAction, formatDate } from "../lib/api";
import {
  PageHead,
  SelectField,
  TextField,
  Failure,
} from "../components/common";
import { Button } from "../components/ui/button";
import { FieldGroup } from "../components/ui/field";
import { Alert, AlertDescription, AlertTitle } from "../components/ui/alert";
import { LeadTable } from "../components/LeadTable";
import { Jobs } from "../components/Jobs";
import { SearchScreening } from "../components/SearchScreening";
type SearchRecord = {
  id: string;
  createdAt: string;
  status: string;
  total: number;
  duplicates: number;
  query: { category: string; city: string };
  results: Lead[];
  jobs?: { result: unknown; kind: string }[];
};
export default function Discovery() {
  const [city, setCity] = useState("Palhoça"),
    [state, setState] = useState("SC"),
    [latitude, setLatitude] = useState("-27.645"),
    [longitude, setLongitude] = useState("-48.669"),
    [radius, setRadius] = useState("5"),
    [limit, setLimit] = useState("20"),
    [category, setCategory] = useState<string>("Oficinas mecânicas"),
    [selected, setSelected] = useState("");
  const [excludeWithWebsite, setExcludeWithWebsite] = useState(true);
  const action = useAction<SearchRecord>((value) => setSelected(value.id));
  const settings = useQuery({
    queryKey: ["settings"],
    queryFn: () => api<Settings>("/settings"),
  });
  const searches = useQuery({
    queryKey: ["searches"],
    queryFn: () => api<SearchRecord[]>("/searches"),
    refetchInterval: 3000,
  });
  const detail = useQuery({
    queryKey: ["search", selected],
    queryFn: () => api<SearchRecord>(`/searches/${selected}`),
    enabled: !!selected,
    refetchInterval: 3000,
  });
  return (
    <>
      <PageHead
        eyebrow="DESCOBERTA LOCAL"
        title="Encontre sua próxima oportunidade."
        description="O Gemini cruza Google Search e Google Maps para localizar empresas, sites e contatos comerciais com fontes."
      />
      <div className="grid-2">
        <section className="panel">
          <div className="panel-head">
            <div>
              <h2>Onde vamos procurar?</h2>
              <p className="helper">
                Pesquisa com Gemini · região de até 50 km
              </p>
            </div>
            <MapPin size={20} className="muted" />
          </div>
          <Button
            type="button"
            variant="outline"
            className="mb-5"
            disabled={!settings.data}
            onClick={() => {
              if (settings.data) {
                setCity(settings.data.city);
                setLatitude(String(settings.data.latitude));
                setLongitude(String(settings.data.longitude));
                setRadius(String(settings.data.radiusKm));
              }
            }}
          >
            Usar região salva nas configurações
          </Button>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              action.mutate({
                path: "/searches",
                body: {
                  city,
                  state,
                  latitude: Number(latitude),
                  longitude: Number(longitude),
                  radiusKm: Number(radius),
                  limit: Number(limit),
                  category,
                  excludeWithWebsite,
                },
              });
            }}
          >
            <FieldGroup>
              <div className="form-grid">
                <TextField
                  label="Cidade ou região"
                  value={city}
                  onChange={setCity}
                  required
                />
                <TextField
                  label="UF"
                  value={state}
                  onChange={setState}
                  required
                />
                <TextField
                  label="Latitude do centro"
                  value={latitude}
                  onChange={setLatitude}
                  required
                />
                <TextField
                  label="Longitude do centro"
                  value={longitude}
                  onChange={setLongitude}
                  required
                />
                <SelectField
                  label="Raio de pesquisa"
                  value={radius}
                  onChange={setRadius}
                  options={[1, 2, 3, 5, 10, 20, 30, 50].map((v) => ({
                    value: String(v),
                    label: `${v} km`,
                  }))}
                />
                <SelectField
                  label="Limite de candidatos"
                  value={limit}
                  onChange={setLimit}
                  options={[10, 20, 50].map((v) => ({
                    value: String(v),
                    label: `Até ${v} empresas para pesquisar`,
                  }))}
                />
                <div className="full">
                  <SelectField
                    label="Segmento"
                    value={category}
                    onChange={setCategory}
                    options={segments.map((s) => ({ value: s, label: s }))}
                  />
                </div>
              </div>
              <label className="flex items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={excludeWithWebsite}
                  onChange={(e) => setExcludeWithWebsite(e.target.checked)}
                />
                <span>
                  Verificar sites antes de enviar para revisão
                  <span className="helper block mt-1">
                    Separa empresas com site próprio e verificações
                    inconclusivas. A rodada salva o progresso e pode levar até
                    10 minutos. Redes sociais não contam como site.
                  </span>
                </span>
              </label>
              <Button type="submit" disabled={action.isPending}>
                <Search data-icon="inline-start" />
                {action.isPending ? "Iniciando…" : "Buscar empresas"}
              </Button>
            </FieldGroup>
          </form>
          <p className="helper mt-4">
            Cidade, UF e coordenadas orientam a busca. Sem coordenadas
            confirmadas da empresa, a distância é aproximada. Confira o endereço
            e as fontes antes de fazer contato.
          </p>
        </section>
        <section className="stack">
          <Alert>
            <Info />
            <AlertTitle>Mais fontes, com evidências para conferir</AlertTitle>
            <AlertDescription>
              A IA busca site oficial, endereço e canais comerciais públicos,
              comparando nome e localidade. Não encontrar um site não comprova
              que ele não exista. O limite de candidatos é um máximo; a
              quantidade final depende das fontes e da verificação.
            </AlertDescription>
          </Alert>
          <div className="panel">
            <div className="panel-head">
              <h2>Central de tarefas</h2>
              <span className="badge-dot" />
            </div>
            <Jobs />
          </div>
          <p className="helper">
            Esta pesquisa usa Google Search e{" "}
            <span translate="no">Google Maps</span>, conforme o suporte do
            modelo. Tokens por minuto, chamadas de IA e buscas têm quotas
            diferentes. Cada nova rodada pode consumir sua quota; a chave e o
            modelo são os salvos em Configurações.
          </p>
        </section>
      </div>
      <section className="panel mt-6">
        <div className="panel-head">
          <h2>Histórico de pesquisas</h2>
          <select
            className="native-select max-w-80"
            aria-label="Selecionar pesquisa"
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
          >
            <option value="">Escolha uma pesquisa</option>
            {searches.data?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.query.category} · {formatDate(s.createdAt)}
              </option>
            ))}
          </select>
        </div>
        {searches.error ? (
          <Failure error={searches.error} />
        ) : detail.error ? (
          <Failure error={detail.error} />
        ) : detail.data ? (
          <>
            <SearchScreening
              result={
                detail.data.jobs?.find((job) => job.kind === "search")?.result
              }
            />
            <p className="helper mb-4">
              {detail.data.total} resultados · {detail.data.duplicates}{" "}
              duplicatas identificadas
            </p>
            <LeadTable leads={detail.data.results} />
          </>
        ) : (
          <p className="helper">
            Inicie uma pesquisa para consultar e salvar empresas no seu
            workspace.
          </p>
        )}
      </section>
    </>
  );
}
