import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, ShieldCheck, KeyRound } from "lucide-react";
import { toast } from "sonner";
import type { Settings } from "@jotage/shared";
import { api, useAction } from "../lib/api";
import {
  PageHead,
  TextField,
  SelectField,
  Loading,
  Failure,
} from "../components/common";
import { Button } from "../components/ui/button";
import { FieldGroup } from "../components/ui/field";
import { FormError } from "../components/FormError";
import { Alert, AlertTitle, AlertDescription } from "../components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "../components/ui/dialog";
export default function SettingsPage() {
  const query = useQuery({
    queryKey: ["settings"],
    queryFn: () => api<Settings>("/settings"),
  });
  return (
    <>
      <PageHead
        eyebrow="PREFERÊNCIAS E INTEGRAÇÕES"
        title="Um workspace com a sua identidade."
        description="Configure a empresa, as fontes e os limites antes de começar a prospectar."
      />
      {query.isPending ? (
        <Loading />
      ) : query.error ? (
        <Failure error={query.error} />
      ) : (
        <SettingsForm initial={query.data} />
      )}
    </>
  );
}
function SettingsForm({ initial }: { initial: Settings }) {
  const [models, setModels] = useState<{ value: string; label: string }[]>([]);
  const loadModels = useAction<{ models: { value: string; label: string }[] }>(
    (result) => {
      setModels(result.models);
      toast.success(
        result.models.length
          ? "Modelos carregados. Escolha abaixo e salve."
          : "Nenhum modelo de texto encontrado. Você pode colar o identificador.",
      );
    },
  );
  const [data, setData] = useState(initial),
    [key, setKey] = useState(""),
    [theme, setTheme] = useState(
      localStorage.getItem("jotage-theme-v1") || "dark",
    );
  const save = useAction<Settings>((value) => {
    setData(value);
    setKey("");
    toast.success("Configurações salvas");
  });
  const action = useAction(() => toast.success("Operação concluída"));
  const update = <K extends keyof Settings>(field: K, value: Settings[K]) =>
    setData((d) => ({ ...d, [field]: value }));
  return (
    <div className="stack settings-section">
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          const { aiConfigured: _configured, ...input } = data;
          save.mutate({
            path: "/settings",
            method: "PATCH",
            body: { ...input, ...(key ? { apiKey: key } : {}) },
          });
        }}
      >
        <FormError error={save.error} />
        <section className="panel">
          <div className="panel-head">
            <h2>Identidade comercial</h2>
            <ShieldCheck size={18} className="muted" />
          </div>
          <FieldGroup>
            <TextField
              label="Nome da empresa"
              value={data.company}
              onChange={(v) => update("company", v)}
              required
            />
            <TextField
              label="Descrição comercial"
              value={data.description}
              onChange={(v) => update("description", v)}
            />
            <TextField
              label="Serviços oferecidos"
              value={data.services}
              onChange={(v) => update("services", v)}
              required
            />
            <SelectField
              label="Tom padrão"
              value={data.tone}
              onChange={(v) => update("tone", v as Settings["tone"])}
              options={["Direto", "Consultivo", "Profissional"].map((v) => ({
                value: v,
                label: v,
              }))}
            />
          </FieldGroup>
        </section>
        <section className="panel">
          <div className="panel-head">
            <h2>Inteligência artificial · Gemini</h2>
            <span className="helper">
              {data.aiConfigured
                ? "Chave configurada"
                : "Sem chave configurada"}
            </span>
          </div>
          <FieldGroup>
            <p className="helper">
              Cole sua chave, carregue os modelos e selecione o que deseja usar.
              Tudo é configurado aqui, sem editar arquivos.
            </p>
            <TextField
              label="Chave da API (deixe vazio para preservar)"
              value={key}
              onChange={setKey}
              type="password"
            />
            <Button
              type="button"
              variant="outline"
              disabled={
                loadModels.isPending || (!key.trim() && !data.aiConfigured)
              }
              onClick={() =>
                loadModels.mutate({
                  path: "/settings/models",
                  body: key.trim() ? { apiKey: key.trim() } : {},
                })
              }
            >
              {loadModels.isPending
                ? "Carregando modelos…"
                : "Carregar modelos da minha conta"}
            </Button>
            <FormError error={loadModels.error} />
            <SelectField
              label="Selecionar modelo"
              value={data.model}
              onChange={(v) => update("model", v)}
              options={[
                { value: "", label: "Selecione um modelo" },
                ...(data.model &&
                !models.some((model) => model.value === data.model)
                  ? [{ value: data.model, label: data.model }]
                  : []),
                ...models,
              ]}
            />
            <TextField
              label="Ou cole o identificador do modelo"
              value={data.model}
              onChange={(v) =>
                update("model", v.trim().replace(/^models\//, ""))
              }
              placeholder="Identificador do modelo no Google AI Studio"
            />
            <TextField
              label="Teto diário de chamadas"
              type="number"
              value={String(data.dailyLimit)}
              onChange={(v) => update("dailyLimit", Number(v))}
            />
            {data.model === "gemini-3.8-flash" && (
              <p className="helper">
                Pesquisa aprofundada: raciocínio alto e até 32.768 tokens de
                saída por chamada de pesquisa. O modelo usa o necessário, sem
                gastar todo o limite obrigatoriamente. Google Search e Google
                Maps ajudam a localizar e conferir empresas e contatos.
              </p>
            )}
            <Alert>
              <KeyRound />
              <AlertTitle>Pesquisa conectada à sua conta Gemini</AlertTitle>
              <AlertDescription>
                A descoberta e a pesquisa de contatos precisam da integração.
                Auditoria técnica, CRM e templates manuais continuam disponíveis
                sem ela. A chave fica criptografada no backend. TPM é o limite
                de tokens por minuto, não um saldo: chamadas e buscas do Google
                têm quotas próprias. Confira os limites da sua conta no Google
                AI Studio.
              </AlertDescription>
            </Alert>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? "Salvando…" : "Salvar chave e modelo"}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={action.isPending}
              onClick={() => action.mutate({ path: "/settings/test-ai" })}
            >
              Testar configuração salva (consome 1 chamada)
            </Button>
          </FieldGroup>
        </section>
        <section className="panel">
          <h2 className="mb-5">Região e descoberta</h2>
          <div className="form-grid">
            <TextField
              label="Cidade padrão"
              value={data.city}
              onChange={(v) => update("city", v)}
            />
            <TextField
              label="Raio padrão em km (até 50)"
              value={String(data.radiusKm)}
              onChange={(v) => update("radiusKm", Number(v))}
            />
            <TextField
              label="Latitude"
              value={String(data.latitude)}
              onChange={(v) => update("latitude", Number(v))}
            />
            <TextField
              label="Longitude"
              value={String(data.longitude)}
              onChange={(v) => update("longitude", Number(v))}
            />
          </div>
        </section>
        <section className="panel">
          <h2 className="mb-2">Pesos da qualificação</h2>
          <p className="helper mb-5">
            A soma deve ser 100. Alterações são aplicadas quando você recalcular
            o lead.
          </p>
          <div className="form-grid">
            {Object.entries(data.weights).map(([k, v]) => (
              <TextField
                key={k}
                label={
                  (
                    {
                      need: "Necessidade de site",
                      technical: "Problemas técnicos",
                      contact: "Contato comercial",
                      fit: "Adequação",
                      quality: "Qualidade dos dados",
                      signals: "Sinais comerciais",
                    } as Record<string, string>
                  )[k]
                }
                type="number"
                value={String(v)}
                onChange={(value) =>
                  update("weights", { ...data.weights, [k]: Number(value) })
                }
              />
            ))}
          </div>
        </section>
        <Button type="submit" disabled={save.isPending}>
          {save.isPending ? "Salvando…" : "Salvar configurações"}
        </Button>
      </form>
      <PasswordForm />
      <section className="panel">
        <h2 className="mb-5">Sistema e dados</h2>
        <SelectField
          label="Aparência"
          value={theme}
          onChange={(value) => {
            setTheme(value);
            document.documentElement.dataset.theme = value;
            localStorage.setItem("jotage-theme-v1", value);
          }}
          options={[
            { value: "dark", label: "Escuro" },
            { value: "light", label: "Claro" },
          ]}
        />
        <div className="toolbar mt-5">
          <Button variant="outline" asChild>
            <a href="/api/export/leads">
              <Download />
              Exportar CSV
            </a>
          </Button>
          <Button variant="outline" asChild>
            <a href="/api/backup">
              <Download />
              Backup do workspace
            </a>
          </Button>
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline">Limpar demonstração</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Limpar empresas demonstrativas?</DialogTitle>
                <DialogDescription>
                  A operação funciona somente no workspace de demonstração
                  selecionado e exclui os registros fictícios.
                </DialogDescription>
              </DialogHeader>
              <Button
                variant="destructive"
                onClick={() =>
                  action.mutate({ path: "/demo", method: "DELETE" })
                }
              >
                Limpar demonstração
              </Button>
            </DialogContent>
          </Dialog>
        </div>
        <p className="helper">
          Privacidade: registre apenas dados empresariais necessários. Preserve
          a origem e a finalidade, revise a base legal aplicável e respeite
          pedidos de não contato. Exclusão e correção estão disponíveis no
          perfil da empresa.
        </p>
      </section>
    </div>
  );
}
function PasswordForm() {
  const [currentPassword, setCurrent] = useState(""),
    [newPassword, setNew] = useState("");
  const action = useAction(() => {
    setCurrent("");
    setNew("");
    toast.success("Senha alterada; outras sessões foram encerradas.");
  });
  return (
    <form
      className="panel"
      onSubmit={(e) => {
        e.preventDefault();
        action.mutate({
          path: "/auth/password",
          body: { currentPassword, newPassword },
        });
      }}
    >
      <h2 className="mb-5">Senha de acesso</h2>
      <FieldGroup>
        <FormError error={action.error} />
        <TextField
          label="Senha atual"
          type="password"
          value={currentPassword}
          onChange={setCurrent}
          required
        />
        <TextField
          label="Nova senha (mínimo 12 caracteres)"
          type="password"
          value={newPassword}
          onChange={setNew}
          required
        />
        <Button variant="outline" disabled={action.isPending}>
          Alterar senha
        </Button>
      </FieldGroup>
    </form>
  );
}
