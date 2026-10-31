import { useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Copy, ExternalLink, MessageSquare, Sparkles } from "lucide-react";
import { toast } from "sonner";
import type { Lead } from "@jotage/shared";
import { api, useAction, formatDate } from "../lib/api";
import { PageHead, SelectField, Failure, NoData } from "../components/common";
import { Button } from "../components/ui/button";
import { Textarea } from "../components/ui/textarea";
import { Field, FieldLabel, FieldGroup } from "../components/ui/field";
import { Alert, AlertTitle, AlertDescription } from "../components/ui/alert";
type Message = {
  id: string;
  leadId: string;
  text: string;
  style: string;
  method: string;
  approved: boolean;
  createdAt: string;
};
export default function Messages() {
  const [params, setParams] = useSearchParams(),
    id = params.get("lead") || "";
  const [style, setStyle] = useState("Consultivo"),
    [method, setMethod] = useState("template"),
    [maxLength, setMaxLength] = useState("450"),
    [selected, setSelected] = useState<Message | null>(null);
  const leads = useQuery({
    queryKey: ["lead-options"],
    queryFn: () => api<{ items: Lead[] }>("/leads?pageSize=100"),
  });
  const messages = useQuery({
    queryKey: ["messages", id],
    queryFn: () => api<Message[]>(`/leads/${id}/messages`),
    enabled: !!id,
  });
  const action = useAction<Message>((m) => setSelected(m));
  const lead = leads.data?.items.find((l) => l.id === id);
  return (
    <>
      <PageHead
        eyebrow="ABORDAGENS COM CONTEXTO"
        title="Converse com propósito."
        description="Prepare, revise e aprove cada mensagem. O envio continua nas suas mãos."
      />
      <div className="grid-2">
        <section className="stack">
          <div className="panel">
            <FieldGroup>
              <SelectField
                label="Empresa"
                value={id}
                onChange={(v) => {
                  setParams({ lead: v });
                  setSelected(null);
                }}
                options={[
                  { value: "", label: "Selecione uma empresa" },
                  ...(leads.data?.items || []).map((l) => ({
                    value: l.id,
                    label: l.name,
                  })),
                ]}
              />
              <div className="form-grid">
                <SelectField
                  label="Estilo"
                  value={style}
                  onChange={setStyle}
                  options={["Direto", "Consultivo", "Profissional"].map(
                    (v) => ({ value: v, label: v }),
                  )}
                />
                <SelectField
                  label="Método"
                  value={method}
                  onChange={setMethod}
                  options={[
                    { value: "template", label: "Template manual · sem IA" },
                    { value: "gemini", label: "Gemini · usa quota da API" },
                  ]}
                />
                <SelectField
                  label="Comprimento máximo"
                  value={maxLength}
                  onChange={setMaxLength}
                  options={[200, 300, 450].map((v) => ({
                    value: String(v),
                    label: `${v} caracteres`,
                  }))}
                />
              </div>
              <Button
                disabled={
                  !id || action.isPending || lead?.stage === "Não contatar"
                }
                onClick={() =>
                  action.mutate({
                    path: `/leads/${id}/messages`,
                    body: { style, method, maxLength: Number(maxLength) },
                  })
                }
              >
                {method === "gemini" ? <Sparkles /> : <MessageSquare />}
                {action.isPending ? "Preparando…" : "Criar rascunho"}
              </Button>
            </FieldGroup>
          </div>
          {selected ? (
            <Editor
              key={selected.id}
              message={selected}
              onSaved={setSelected}
            />
          ) : (
            <div className="panel">
              <NoData
                title="Uma boa conversa começa com revisão."
                description="Selecione a empresa e crie um rascunho. Nenhuma mensagem será enviada automaticamente."
              />
            </div>
          )}
        </section>
        <aside className="stack">
          <Alert>
            <MessageSquare />
            <AlertTitle>Contato individual e revisado</AlertTitle>
            <AlertDescription>
              O WhatsApp abrirá com o texto preenchido após sua aprovação.
              Revise o número e envie manualmente. Contatos suprimidos são
              bloqueados.
            </AlertDescription>
          </Alert>
          {lead && (
            <div className="panel">
              <h2>{lead.name}</h2>
              <p className="helper mt-2">
                {lead.category} · {lead.stage}
              </p>
              <Link className="helper" to={`/leads/${id}`}>
                Revisar evidências da empresa ↗
              </Link>
            </div>
          )}
          <div className="panel">
            <h2>Histórico de versões</h2>
            {messages.error ? (
              <Failure error={messages.error} />
            ) : messages.data?.length ? (
              messages.data.map((m) => (
                <button
                  className="list-row w-full text-left"
                  key={m.id}
                  onClick={() => setSelected(m)}
                >
                  <div>
                    <p>{m.text.slice(0, 85)}…</p>
                    <small>
                      {formatDate(m.createdAt)} ·{" "}
                      {m.method === "template" ? "Template manual" : "Gemini"} ·{" "}
                      {m.approved ? "Aprovada" : "Rascunho"}
                    </small>
                  </div>
                </button>
              ))
            ) : (
              <p className="helper mt-4">
                Nenhum rascunho salvo para esta empresa.
              </p>
            )}
          </div>
        </aside>
      </div>
    </>
  );
}
function Editor({
  message,
  onSaved,
}: {
  message: Message;
  onSaved: (m: Message) => void;
}) {
  const [text, setText] = useState(message.text),
    save = useAction<Message>(onSaved),
    open = useAction<{ url: string }>((result) => {
      window.location.assign(result.url);
    });
  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Revisar abordagem</h2>
        <span className="helper">{text.length} caracteres</span>
      </div>
      <Field>
        <FieldLabel htmlFor="message">Mensagem comercial</FieldLabel>
        <Textarea
          id="message"
          className="message-editor"
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={1500}
        />
      </Field>
      <div className="toolbar mt-4">
        <Button
          variant="outline"
          onClick={() =>
            save.mutate({
              path: `/messages/${message.id}`,
              method: "PATCH",
              body: { text, approved: false },
            })
          }
          disabled={save.isPending || !text}
        >
          Salvar versão
        </Button>
        <Button
          variant="outline"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(text);
              toast.success("Mensagem copiada");
            } catch {
              toast.error(
                "Não foi possível copiar. Selecione o texto manualmente.",
              );
            }
          }}
        >
          <Copy />
          Copiar
        </Button>
        <Button
          onClick={() =>
            save.mutate({
              path: `/messages/${message.id}`,
              method: "PATCH",
              body: { text, approved: true },
            })
          }
          disabled={save.isPending || !text}
        >
          Aprovar esta versão
        </Button>
      </div>
      <Button
        variant="outline"
        disabled={!message.approved || text !== message.text || open.isPending}
        onClick={() =>
          open.mutate({ path: `/messages/${message.id}/whatsapp` })
        }
      >
        <ExternalLink />
        Abrir no WhatsApp
      </Button>
      <p className="helper mt-3">
        Aprovar não registra um contato. Registre o contato realizado no perfil
        da empresa.
      </p>
    </section>
  );
}
