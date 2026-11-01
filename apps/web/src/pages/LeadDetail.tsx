import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Globe,
  Sparkles,
  MessageSquare,
  Trash2,
  ArrowLeft,
  ShieldCheck,
} from "lucide-react";
import { stages, type Lead, type Audit, type Analysis } from "@jotage/shared";
import { api, useAction, formatDate } from "../lib/api";
import {
  PageHead,
  Loading,
  Failure,
  CompanySymbol,
  TextField,
} from "../components/common";
import { Button } from "../components/ui/button";
import { Textarea } from "../components/ui/textarea";
import { Badge } from "../components/ui/badge";
import { Field, FieldLabel, FieldGroup } from "../components/ui/field";
import { Alert, AlertTitle, AlertDescription } from "../components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "../components/ui/dialog";
import { ContactResearchPanel } from "../components/ContactResearchPanel";
import { Jobs } from "../components/Jobs";
type Detail = {
  research: unknown;
  lead: Lead;
  sources: {
    id: string;
    source: string;
    url: string | null;
    createdAt: string;
  }[];
  audits: { id: string; data: Audit }[];
  analyses: { id: string; data: Analysis }[];
  activities: { id: string; text: string; createdAt: string }[];
};
const auditStatus: Record<Audit["status"], string> = {
  not_informed: "Site não informado",
  inaccessible: "Site inacessível na verificação",
  partial: "Auditoria parcial",
  completed: "HTML auditado",
  unavailable: "Auditoria indisponível",
};
export default function LeadDetail() {
  const { id } = useParams(),
    navigate = useNavigate();
  const data = useQuery({
    queryKey: ["lead", id],
    queryFn: () => api<Detail>(`/leads/${id}`),
  });
  const action = useAction(),
    remove = useAction(() => navigate("/leads"));
  const [note, setNote] = useState(""),
    [task, setTask] = useState(""),
    [due, setDue] = useState(""),
    [editing, setEditing] = useState(false);
  if (data.isPending) return <Loading />;
  if (data.error) return <Failure error={data.error} />;
  const { lead, audits, analyses, sources, activities } = data.data,
    audit = audits[0]?.data,
    analysis = analyses[0]?.data;
  return (
    <>
      <Link to="/leads" className="helper inline-flex items-center gap-2 mb-5">
        <ArrowLeft size={14} />
        Voltar para empresas
      </Link>
      <PageHead
        eyebrow="PERFIL DA EMPRESA"
        title={lead.name}
        description={`${lead.category} · ${lead.city || "Cidade não informada"}`}
        action={
          <Button asChild>
            <Link to={`/mensagens?lead=${id}`}>
              <MessageSquare />
              Preparar abordagem
            </Link>
          </Button>
        }
      />
      <div className="toolbar">
        <Button
          disabled={action.isPending}
          onClick={() => action.mutate({ path: `/leads/${id}/audit` })}
        >
          <Globe />
          Auditar site
        </Button>
        <Button
          variant="outline"
          disabled={action.isPending}
          onClick={() => action.mutate({ path: `/leads/${id}/analyze` })}
        >
          <Sparkles />
          Analisar com Gemini
        </Button>
        <Button
          variant="outline"
          onClick={() => action.mutate({ path: `/leads/${id}/score` })}
        >
          Recalcular pontuação
        </Button>
        <select
          className="native-select max-w-56"
          aria-label="Etapa da empresa"
          value={lead.stage}
          onChange={(e) =>
            action.mutate({
              path: `/leads/${id}/stage`,
              method: "PATCH",
              body: { stage: e.target.value },
            })
          }
        >
          {stages.map((stage) => (
            <option key={stage}>{stage}</option>
          ))}
        </select>
      </div>
      {lead.stage === "Não contatar" && (
        <Alert className="mb-6">
          <ShieldCheck />
          <AlertTitle>Contato suprimido</AlertTitle>
          <AlertDescription>
            Novas mensagens e abertura de contato estão bloqueadas para esta
            empresa.
          </AlertDescription>
        </Alert>
      )}
      <ContactResearchPanel
        leadId={id!}
        result={data.data.research}
        onEdit={() => setEditing(true)}
      />
      <div className="grid-2">
        <div className="stack">
          <section className="panel">
            <div className="panel-head">
              <div className="detail-title">
                <CompanySymbol name={lead.name} />
                <div>
                  <h2>Informações comerciais</h2>
                  <span className="helper">
                    Atualizado em {formatDate(lead.updatedAt)}
                  </span>
                </div>
              </div>
              <Button variant="ghost" onClick={() => setEditing(!editing)}>
                {editing ? "Fechar edição" : "Editar dados"}
              </Button>
            </div>
            {editing ? (
              <EditLead
                key={lead.updatedAt}
                lead={lead}
                onSaved={() => setEditing(false)}
              />
            ) : (
              <dl className="details-grid">
                {[
                  ["Site", lead.website],
                  ["Telefone", lead.phone],
                  ["Email", lead.email],
                  ["Endereço", lead.address],
                  [
                    "Cidade / UF",
                    [lead.city, lead.state].filter(Boolean).join(" / "),
                  ],
                  ["Tags", lead.tags.join(", ")],
                  ["Observações", lead.notes],
                ].map(([label, value]) => (
                  <div className="contents" key={label}>
                    <dt>{label}</dt>
                    <dd>{value || "Não informado"}</dd>
                  </div>
                ))}
              </dl>
            )}
          </section>
          <section className="panel">
            <div className="panel-head">
              <h2>Evidências do site</h2>
              {audit && (
                <Badge variant="secondary">{auditStatus[audit.status]}</Badge>
              )}
            </div>
            {audit ? (
              <div className="stack">
                <p className="helper">
                  Verificação em {formatDate(audit.checkedAt)}
                </p>
                {audit.evidence.map((e) => (
                  <div className="evidence" key={e.key}>
                    <h3>{e.key}</h3>
                    <p>{e.value}</p>
                    <small>{e.sourceUrl}</small>
                  </div>
                ))}
                {audit.status === "completed" && (
                  <dl className="details-grid">
                    <dt>HTTPS</dt>
                    <dd>{audit.https ? "Sim, conexão validada" : "Não"}</dd>
                    <dt>Meta viewport</dt>
                    <dd>{audit.viewport ? "Encontrada" : "Não encontrada"}</dd>
                    <dt>Headings H1</dt>
                    <dd>{audit.headings}</dd>
                    <dt>Links de contato</dt>
                    <dd>{audit.contactLinks}</dd>
                    <dt>Formulários</dt>
                    <dd>{audit.forms}</dd>
                  </dl>
                )}
                <div>
                  <h3>Limitações desta verificação</h3>
                  <ul className="helper list-disc pl-5 mt-2">
                    {audit.limitations.map((l) => (
                      <li key={l}>{l}</li>
                    ))}
                  </ul>
                </div>
              </div>
            ) : (
              <p className="helper">
                Nenhuma auditoria realizada. Audite o site para coletar
                evidências técnicas limitadas à página inicial.
              </p>
            )}
          </section>
          <section className="panel">
            <div className="panel-head">
              <h2>Interpretação com IA</h2>
              <Sparkles size={18} className="muted" />
            </div>
            {analysis ? (
              <div className="stack">
                <p>{analysis.businessSummary}</p>
                {analysis.opportunities.map((o, i) => (
                  <div className="evidence" key={i}>
                    <h3>{o.title}</h3>
                    <p>{o.description}</p>
                    <small>
                      Evidência: {o.evidence} · Confiança: {o.confidence}
                    </small>
                    <small>Serviço sugerido: {o.suggestedService}</small>
                  </div>
                ))}
                <p className="helper">{analysis.limitations.join(" ")}</p>
              </div>
            ) : (
              <p className="helper">
                Nenhuma análise de IA disponível. Configure Gemini e solicite a
                análise após revisar as evidências.
              </p>
            )}
          </section>
          <section className="panel">
            <h2>Histórico da relação</h2>
            {activities.map((a) => (
              <div className="list-row" key={a.id}>
                <div>
                  <p>{a.text}</p>
                  <small>{formatDate(a.createdAt)}</small>
                </div>
              </div>
            ))}
            <form
              className="mt-4"
              onSubmit={(e) => {
                e.preventDefault();
                action.mutate(
                  {
                    path: "/activities",
                    body: { leadId: id, text: note, kind: "note" },
                  },
                  { onSuccess: () => setNote("") },
                );
              }}
            >
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="note">Adicionar uma nota</FieldLabel>
                  <Textarea
                    id="note"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    required
                    minLength={2}
                  />
                </Field>
                <Button
                  type="submit"
                  variant="outline"
                  disabled={action.isPending}
                >
                  Salvar nota
                </Button>
              </FieldGroup>
            </form>
            <Button
              className="mt-4"
              variant="outline"
              disabled={action.isPending || lead.stage === "Não contatar"}
              onClick={() =>
                action.mutate({
                  path: "/activities",
                  body: {
                    leadId: id,
                    text: "Contato realizado e registrado manualmente pelo usuário.",
                    kind: "contact",
                  },
                })
              }
            >
              Registrar contato realizado
            </Button>
          </section>
        </div>
        <aside className="stack">
          <section className="panel">
            <div className="panel-head">
              <h2>Prioridade da oportunidade</h2>
              <ShieldCheck size={18} className="muted" />
            </div>
            <div className="metric-value score">
              {lead.score === null ? "—" : lead.score}
              <span className="text-sm muted">
                {lead.score === null ? "" : " / 100"}
              </span>
            </div>
            <p className="helper">
              {lead.score === null
                ? "Dados insuficientes para classificar."
                : "Heurística de oportunidade; não prevê fechamento."}
            </p>
            {lead.scoreDetail?.factors.map((f) => (
              <div className="list-row" key={f.label}>
                <div>
                  <p>{f.label}</p>
                  <small>{f.evidence}</small>
                </div>
                <span className="helper whitespace-nowrap">
                  {f.points}/{f.max}
                </span>
              </div>
            ))}
          </section>
          <section className="panel">
            <h2>Fontes e origem</h2>
            {sources.map((source) => (
              <div className="list-row" key={source.id}>
                <div>
                  <p>{source.source}</p>
                  <small>{formatDate(source.createdAt)}</small>
                  {source.url && (
                    <a
                      className="helper block"
                      href={source.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Abrir fonte ↗
                    </a>
                  )}
                </div>
              </div>
            ))}
          </section>
          <section className="panel">
            <h2>Próximo acompanhamento</h2>
            <form
              className="mt-4"
              onSubmit={(e) => {
                e.preventDefault();
                action.mutate(
                  {
                    path: "/tasks",
                    body: {
                      leadId: id,
                      title: task,
                      dueAt: new Date(due).toISOString(),
                    },
                  },
                  {
                    onSuccess: () => {
                      setTask("");
                      setDue("");
                    },
                  },
                );
              }}
            >
              <FieldGroup>
                <TextField
                  label="Próxima ação"
                  value={task}
                  onChange={setTask}
                  required
                />
                <TextField
                  label="Data e horário"
                  type="datetime-local"
                  value={due}
                  onChange={setDue}
                  required
                />
                <Button
                  variant="outline"
                  type="submit"
                  disabled={action.isPending}
                >
                  Agendar acompanhamento
                </Button>
              </FieldGroup>
            </form>
          </section>
          <section className="panel">
            <h2 className="mb-3">Tarefas de análise</h2>
            <Jobs targetId={id} />
          </section>
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="ghost">
                <Trash2 />
                Excluir empresa
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Excluir {lead.name}?</DialogTitle>
                <DialogDescription>
                  Os dados, análises, mensagens e atividades desta empresa serão
                  excluídos. A lista de supressão é preservada para respeitar
                  pedidos de não contato.
                </DialogDescription>
              </DialogHeader>
              <Button
                variant="destructive"
                disabled={remove.isPending}
                onClick={() =>
                  remove.mutate({ path: `/leads/${id}`, method: "DELETE" })
                }
              >
                Excluir definitivamente
              </Button>
            </DialogContent>
          </Dialog>
        </aside>
      </div>
    </>
  );
}
function EditLead({ lead, onSaved }: { lead: Lead; onSaved: () => void }) {
  const [values, setValues] = useState({
    name: lead.name,
    category: lead.category,
    city: lead.city || "",
    state: lead.state || "",
    address: lead.address || "",
    website: lead.website || "",
    phone: lead.phone || "",
    email: lead.email || "",
    notes: lead.notes,
    tags: lead.tags.join(", "),
  });
  const save = useAction(onSaved);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate({
          path: `/leads/${lead.id}`,
          method: "PATCH",
          body: {
            ...Object.fromEntries(
              Object.entries(values).map(([k, v]) => [k, v || null]),
            ),
            notes: values.notes,
            tags: values.tags
              .split(",")
              .map((t) => t.trim())
              .filter(Boolean),
          },
        });
      }}
    >
      <FieldGroup>
        {Object.entries(values).map(([key, value]) => (
          <TextField
            key={key}
            label={
              (
                {
                  name: "Nome",
                  category: "Segmento",
                  city: "Cidade",
                  state: "UF",
                  address: "Endereço",
                  website: "Site",
                  phone: "Telefone comercial",
                  email: "Email comercial",
                  notes: "Observações",
                  tags: "Tags separadas por vírgula",
                } as Record<string, string>
              )[key]
            }
            value={value}
            onChange={(v) => setValues({ ...values, [key]: v })}
            required={key === "name" || key === "category"}
          />
        ))}
        <Button disabled={save.isPending}>Salvar alterações</Button>
      </FieldGroup>
    </form>
  );
}
