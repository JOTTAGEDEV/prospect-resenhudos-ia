import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { Plus, Download, Upload, Sparkles } from "lucide-react";
import { segments, stages, type Lead } from "@jotage/shared";
import { api, useAction } from "../lib/api";
import { PageHead, Loading, Failure } from "../components/common";
import { LeadTable } from "../components/LeadTable";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { Field, FieldLabel, FieldGroup } from "../components/ui/field";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "../components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "../components/ui/alert";
type FormValues = {
  name: string;
  category: string;
  city: string;
  state: string;
  website: string;
  phone: string;
  email: string;
  address: string;
};
export default function Leads({ analysis = false }: { analysis?: boolean }) {
  const [params, setParams] = useSearchParams(),
    [category, setCategory] = useState(""),
    [stage, setStage] = useState(""),
    [sort, setSort] = useState("createdAt"),
    [page, setPage] = useState(1),
    [open, setOpen] = useState(false),
    [importOpen, setImportOpen] = useState(false),
    [csv, setCsv] = useState("");
  const q = params.get("q") || "",
    query = new URLSearchParams({ q, sort, page: String(page) });
  if (category) query.set("category", category);
  if (stage) query.set("stage", stage);
  const leads = useQuery({
    queryKey: ["leads", q, category, stage, sort, page],
    queryFn: () =>
      api<{ items: Lead[]; total: number; pageSize: number }>(
        `/leads?${query}`,
      ),
  });
  const form = useForm<FormValues>({
    defaultValues: { category: "Serviços", city: "Palhoça", state: "SC" },
  });
  const save = useAction(() => {
    setOpen(false);
    form.reset();
  });
  const importing = useAction(() => {
    setImportOpen(false);
    setCsv("");
  });
  return (
    <>
      <PageHead
        eyebrow={analysis ? "EVIDÊNCIAS E OPORTUNIDADES" : "BASE COMERCIAL"}
        title={
          analysis
            ? "Análise com inteligência."
            : "Cada empresa, uma possibilidade."
        }
        description={
          analysis
            ? "Selecione uma empresa para auditar o site e interpretar as evidências."
            : "Todas as suas oportunidades, com contexto para a próxima conversa."
        }
        action={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus data-icon="inline-start" />
                Cadastrar empresa
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
              <DialogHeader>
                <DialogTitle>Nova empresa</DialogTitle>
                <DialogDescription>
                  Registre apenas dados empresariais conhecidos e contatos
                  comerciais públicos.
                </DialogDescription>
              </DialogHeader>
              <form
                onSubmit={form.handleSubmit((values) => {
                  const cleaned = Object.fromEntries(
                    Object.entries(values).map(([key, value]) => [
                      key,
                      value || null,
                    ]),
                  );
                  save.mutate({ path: "/leads", body: cleaned });
                })}
              >
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="lead-name">Nome da empresa</FieldLabel>
                    <Input
                      id="lead-name"
                      {...form.register("name", {
                        required: true,
                        minLength: 2,
                      })}
                      required
                    />
                  </Field>
                  <div className="form-grid">
                    {(
                      [
                        "category",
                        "city",
                        "state",
                        "website",
                        "phone",
                        "email",
                        "address",
                      ] as const
                    ).map((key) => (
                      <Field key={key}>
                        <FieldLabel htmlFor={`lead-${key}`}>
                          {
                            {
                              category: "Segmento",
                              city: "Cidade",
                              state: "UF",
                              website: "Site",
                              phone: "Telefone comercial",
                              email: "Email comercial",
                              address: "Endereço",
                            }[key]
                          }
                        </FieldLabel>
                        <Input
                          id={`lead-${key}`}
                          type={
                            key === "email"
                              ? "email"
                              : key === "website"
                                ? "url"
                                : "text"
                          }
                          {...form.register(key)}
                          placeholder={key === "website" ? "https://" : ""}
                        />
                      </Field>
                    ))}
                  </div>
                  {save.error && (
                    <p role="alert" className="error-text">
                      {save.error.message}
                    </p>
                  )}
                  <Button type="submit" disabled={save.isPending}>
                    {save.isPending ? "Salvando…" : "Salvar empresa"}
                  </Button>
                </FieldGroup>
              </form>
            </DialogContent>
          </Dialog>
        }
      />
      {analysis && (
        <Alert className="mb-6">
          <Sparkles />
          <AlertTitle>IA precisa de contexto verificável</AlertTitle>
          <AlertDescription>
            A auditoria técnica funciona sem Gemini. A interpretação com IA
            exige chave e modelo configurados. Campos desconhecidos continuam
            desconhecidos.
          </AlertDescription>
        </Alert>
      )}
      <div className="toolbar">
        <Input
          aria-label="Filtrar empresas"
          placeholder="Buscar por nome, cidade ou tag…"
          value={q}
          onChange={(e) => {
            setParams(e.target.value ? { q: e.target.value } : {});
            setPage(1);
          }}
        />
        <select
          className="native-select max-w-48"
          aria-label="Segmento"
          value={category}
          onChange={(e) => {
            setCategory(e.target.value);
            setPage(1);
          }}
        >
          <option value="">Todos os segmentos</option>
          {segments.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <select
          className="native-select max-w-48"
          aria-label="Etapa"
          value={stage}
          onChange={(e) => {
            setStage(e.target.value);
            setPage(1);
          }}
        >
          <option value="">Todas as etapas</option>
          {stages.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <select
          className="native-select max-w-44"
          aria-label="Ordenação"
          value={sort}
          onChange={(e) => setSort(e.target.value)}
        >
          <option value="createdAt">Mais recentes</option>
          <option value="name">Nome A–Z</option>
          <option value="score">Maior pontuação</option>
        </select>
        <Button variant="outline" asChild>
          <a href={`/api/export/leads?${query}`}>
            <Download />
            Exportar
          </a>
        </Button>
        <Dialog open={importOpen} onOpenChange={setImportOpen}>
          <DialogTrigger asChild>
            <Button variant="outline">
              <Upload />
              Importar
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Importar empresas</DialogTitle>
              <DialogDescription>
                CSV com cabeçalhos name, category, city, state, website, phone,
                email e address. Até 500 registros. Nome obrigatório.
              </DialogDescription>
            </DialogHeader>
            <Field>
              <FieldLabel htmlFor="csv-file">Arquivo CSV</FieldLabel>
              <Input
                id="csv-file"
                type="file"
                accept=".csv,text/csv"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (file && file.size <= 800000) setCsv(await file.text());
                }}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="csv">Conteúdo CSV</FieldLabel>
              <Textarea
                id="csv"
                value={csv}
                onChange={(e) => setCsv(e.target.value)}
                placeholder={"name,category,city\nEmpresa,Serviços,Palhoça"}
              />
            </Field>
            <Button
              disabled={!csv || importing.isPending}
              onClick={() =>
                importing.mutate({ path: "/import/leads", body: { csv } })
              }
            >
              Validar e importar
            </Button>
          </DialogContent>
        </Dialog>
      </div>
      <section className="panel">
        {leads.isPending ? (
          <Loading />
        ) : leads.error ? (
          <Failure error={leads.error} />
        ) : (
          <>
            <div className="panel-head">
              <h2>{leads.data.total} empresas</h2>
              <span className="helper">Dados do seu workspace</span>
            </div>
            <LeadTable leads={leads.data.items} />
            <div className="pagination">
              <Button
                variant="outline"
                disabled={page === 1}
                onClick={() => setPage(page - 1)}
              >
                Anterior
              </Button>
              <span className="helper">Página {page}</span>
              <Button
                variant="outline"
                disabled={page * leads.data.pageSize >= leads.data.total}
                onClick={() => setPage(page + 1)}
              >
                Próxima
              </Button>
            </div>
          </>
        )}
      </section>
    </>
  );
}
