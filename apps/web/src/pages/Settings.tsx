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
    [tavilyKey, setTavilyKey] = useState(""),
    [clearTavilyKey, setClearTavilyKey] = useState(false),
    [theme, setTheme] = useState(
      localStorage.getItem("jotage-theme-v1") || "dark",
    );
  const save = useAction<Settings>((value) => {
    setData(value);
    setKey("");
    setTavilyKey("");
    setClearTavilyKey(false);
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
          const {
            aiConfigured: _configured,
            searchConfigured: _searchConfigured,
            ...input
          } = data;
          save.mutate({
            path: "/settings",
            method: "PATCH",
            body: {
              ...input,
              ...(key ? { apiKey: key } : {}),
              ...(tavilyKey.trim() ? { tavilyApiKey: tavilyKey.trim() } : {}),
              ...(clearTavilyKey ? { clearTavilyApiKey: true } : {}),
            },
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
            <p className="text-sm font-medium">Análises e mensagens</p>
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
            {data.model === "gemini-3.8-flash" && (
              <p className="helper">
                O Gemini 3.8 Flash usa raciocínio alto para interpretar as
                evidências e preparar as mensagens.
              </p>
            )}
            <p className="text-sm font-medium">
              Descoberta e pesquisa de contatos
            </p>
            <SelectField
              label="Fonte da pesquisa"
              value={data.searchProvider || "gemini"}
              onChange={(value) =>
                update("searchProvider", value as "gemini" | "tavily")
              }
              options={[
                {
                  value: "tavily",
                  label: "Tavily · plano gratuito (recomendado)",
                },
                { value: "gemini", label: "Ferramentas Google do Gemini" },
              ]}
            />
            {data.searchProvider === "tavily" ? (
              <>
                <p className="helper">
                  O Tavily pesquisa na web; o Gemini organiza e verifica as
                  informações encontradas. Essa opção não usa as ferramentas
                  pagas de Google Search/Maps do Gemini. Links do Google Maps só
                  aparecem quando encontrados nas fontes.
                </p>
                <p className="helper">
                  {data.searchConfigured
                    ? "Chave Tavily configurada."
                    : "Falta configurar a chave Tavily para iniciar pesquisas."}{" "}
                  <a
                    href="https://app.tavily.com"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Obter chave no Tavily ↗
                  </a>
                </p>
                <TextField
                  label="Tavily API key (deixe vazio para preservar)"
                  type="password"
                  value={tavilyKey}
                  onChange={(value) => {
                    setTavilyKey(value);
                    if (value) setClearTavilyKey(false);
                  }}
                />
                <p className="helper">
                  A chave é enviada somente para salvar a integração e fica
                  criptografada no servidor; não é exibida novamente. O plano
                  gratuito oferece 1.000 créditos por mês, sem cartão. O site
                  usa busca básica: 1 crédito por consulta. Uma rodada pode
                  fazer várias consultas para verificar as empresas.{" "}
                  <a
                    href="https://www.tavily.com/pricing"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Conferir o plano gratuito ↗
                  </a>
                </p>
                {data.searchConfigured && (
                  <label className="flex items-start gap-3 text-sm">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={clearTavilyKey}
                      onChange={(event) => {
                        setClearTavilyKey(event.target.checked);
                        if (event.target.checked) setTavilyKey("");
                      }}
                    />
                    <span>
                      Remover a chave Tavily salva ao salvar as configurações
                    </span>
                  </label>
                )}
              </>
            ) : (
              <p className="helper">
                As ferramentas Google dependem do modelo e da quota do seu
                projeto. Um modelo aparecer na lista não garante acesso às
                ferramentas de pesquisa.
              </p>
            )}
            <SelectField
              label="Modelo da pesquisa"
              value={data.researchModel || ""}
              onChange={(v) => update("researchModel", v)}
              options={[
                { value: "", label: "Usar o mesmo modelo de análise" },
                {
                  value: "gemini-2.5-flash",
                  label:
                    "Gemini 2.5 Flash · depende da disponibilidade da conta",
                },
                ...(data.researchModel &&
                data.researchModel !== "gemini-2.5-flash" &&
                !models.some((model) => model.value === data.researchModel)
                  ? [{ value: data.researchModel, label: data.researchModel }]
                  : []),
                ...models.filter((model) => model.value !== "gemini-2.5-flash"),
              ]}
            />
            <TextField
              label="Identificador do modelo de pesquisa"
              value={data.researchModel || ""}
              onChange={(v) =>
                update("researchModel", v.trim().replace(/^models\//, ""))
              }
              placeholder="Vazio para usar o modelo de análise"
            />
            {data.searchProvider === "tavily" ? (
              <p className="helper">
                Com Tavily, o modelo de pesquisa interpreta o material coletado
                sem ativar as ferramentas Google. O Gemini 3.8 Flash pode ser
                usado com raciocínio alto e até 32.768 tokens de saída por
                chamada, conforme a necessidade. A quota do Gemini continua
                separada dos créditos Tavily.
              </p>
            ) : (
              <p className="helper">
                O Gemini 2.5 Flash consulta Google Maps para descobrir empresas
                e usa Google Search em outra etapa para complementar contatos e
                conferir sites. Usa raciocínio dinâmico e até 32.768 tokens de
                saída por chamada, conforme a necessidade. A disponibilidade
                precisa ser confirmada na sua conta; projetos sem acesso podem
                receber erro de modelo indisponível.
              </p>
            )}
            <p className="helper">
              A API gratuita do Gemini 3.8 Flash não inclui pesquisa com Google
              Search ou Google Maps. Com Tavily, a busca vem de outra fonte e o
              3.8 pode interpretar os resultados, respeitando sua quota. Esta
              seleção não ativa faturamento.{" "}
              <a
                href="https://ai.google.dev/gemini-api/docs/pricing"
                target="_blank"
                rel="noreferrer"
              >
                Conferir disponibilidade e quotas oficiais ↗
              </a>
            </p>
            <TextField
              label="Teto diário de chamadas"
              type="number"
              value={String(data.dailyLimit)}
              onChange={(v) => update("dailyLimit", Number(v))}
            />
            <Alert>
              <KeyRound />
              <AlertTitle>Pesquisa conectada à sua conta Gemini</AlertTitle>
              <AlertDescription>
                A descoberta e a pesquisa de contatos precisam da integração.
                Auditoria técnica, CRM e templates manuais continuam disponíveis
                sem ela. As chaves ficam criptografadas no backend. TPM é o
                limite de tokens por minuto, não um saldo: chamadas Gemini,
                ferramentas Google e créditos Tavily têm limites separados.
                Confira as quotas das suas contas antes de iniciar uma rodada.
              </AlertDescription>
            </Alert>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? "Salvando…" : "Salvar integrações e modelos"}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={action.isPending}
              onClick={() => action.mutate({ path: "/settings/test-ai" })}
            >
              Testar modelo de análise salvo (consome 1 chamada)
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
