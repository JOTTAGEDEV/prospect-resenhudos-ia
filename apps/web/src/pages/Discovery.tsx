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
type SearchRecord = {
  id: string;
  createdAt: string;
  status: string;
  total: number;
  duplicates: number;
  query: { category: string; city: string };
  results: Lead[];
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
        description="Uma região, um segmento e informações públicas para iniciar sua pesquisa."
      />
      <div className="grid-2">
        <section className="panel">
          <div className="panel-head">
            <div>
              <h2>Onde vamos procurar?</h2>
              <p className="helper">
                Coordenadas manuais · consultas de até 50 km
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
                  label="Limite de resultados"
                  value={limit}
                  onChange={setLimit}
                  options={[10, 20, 50].map((v) => ({
                    value: String(v),
                    label: `Até ${v} empresas`,
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
              <Button type="submit" disabled={action.isPending}>
                <Search data-icon="inline-start" />
                {action.isPending ? "Iniciando…" : "Buscar empresas"}
              </Button>
            </FieldGroup>
          </form>
          <p className="helper mt-4">
            O centro geográfico determina a área. Cidade e UF identificam a
            pesquisa, sem geocodificação automática.
          </p>
        </section>
        <section className="stack">
          <Alert>
            <Info />
            <AlertTitle>Dados reais. Cobertura variável.</AlertTitle>
            <AlertDescription>
              OpenStreetMap pode não ter todos os contatos ou empresas da
              região. Ausência na fonte não comprova inexistência. Pesquisas
              repetidas usam cache por 24 horas.
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
            ©{" "}
            <a
              href="https://www.openstreetmap.org/copyright"
              target="_blank"
              rel="noreferrer"
            >
              OpenStreetMap contributors
            </a>{" "}
            · ODbL. Uso local e pontual. Antes de uso comercial contínuo,
            configure uma instância própria ou um provedor autorizado.
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
