import React, { lazy, Suspense, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  BrowserRouter,
  Routes,
  Route,
  NavLink,
  Navigate,
  Outlet,
  useNavigate,
} from "react-router-dom";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { Toaster } from "sonner";
import {
  Radar,
  LayoutDashboard,
  Search,
  Building2,
  Sparkles,
  Kanban,
  MessageSquare,
  CalendarClock,
  Settings,
  PanelLeftClose,
  PanelLeftOpen,
  LogOut,
  ShieldCheck,
  ArrowRight,
  Bell,
} from "lucide-react";
import { MotionConfig } from "motion/react";
import { api, queryClient, useAction, ApiError } from "./lib/api";
import { Loading, Failure } from "./components/common";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { Field, FieldLabel, FieldGroup } from "./components/ui/field";
import "./styles.css";
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Leads = lazy(() => import("./pages/Leads"));
const Discovery = lazy(() => import("./pages/Discovery"));
const LeadDetail = lazy(() => import("./pages/LeadDetail"));
const Pipeline = lazy(() => import("./pages/Pipeline"));
const Messages = lazy(() => import("./pages/Messages"));
const Activities = lazy(() => import("./pages/Activities"));
const SettingsPage = lazy(() => import("./pages/Settings"));
type Me = {
  email: string;
  workspaceId: string;
  workspaces: { id: string; name: string; demo: boolean }[];
};
function Brand() {
  return (
    <div className="brand">
      <span className="brand-mark">
        <Radar size={22} />
      </span>
      <div>
        <div className="brand-name">JOTAGE</div>
        <div className="brand-sub">PROSPECT AI</div>
      </div>
    </div>
  );
}
function Login() {
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState("");
  const navigate = useNavigate();
  const login = useAction(() => navigate("/"));
  return (
    <div className="login-page">
      <section className="login-story">
        <Brand />
        <div>
          <div className="eyebrow mb-5">
            INTELIGÊNCIA COMERCIAL · JOTAGE DEV
          </div>
          <h1>
            Boas conexões
            <br />
            começam com
            <br />
            <em>boas oportunidades.</em>
          </h1>
          <p>
            Descubra empresas, entenda o que elas precisam e transforme pesquisa
            em conversas relevantes.
          </p>
        </div>
        <div className="login-proof">
          <div>
            <Search />
            <p>Descoberta local</p>
          </div>
          <div>
            <ShieldCheck />
            <p>Evidências verificáveis</p>
          </div>
          <div>
            <Kanban />
            <p>Relacionamentos organizados</p>
          </div>
        </div>
      </section>
      <section className="login-form">
        <div>
          <div className="eyebrow mb-3">SEU ESPAÇO DE TRABALHO</div>
          <h2>Bem-vindo de volta.</h2>
          <p className="muted mt-2">
            Entre para continuar sua próxima oportunidade.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              login.mutate({ path: "/auth/login", body: { email, password } });
            }}
          >
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="email">Email</FieldLabel>
                <Input
                  id="email"
                  type="email"
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="voce@empresa.com.br"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="password">Senha</FieldLabel>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </Field>
              {login.error && (
                <p className="error-text" role="alert">
                  {login.error.message}
                </p>
              )}
              <Button type="submit" disabled={login.isPending}>
                {login.isPending ? "Entrando…" : "Entrar no workspace"}
                <ArrowRight data-icon="inline-end" />
              </Button>
            </FieldGroup>
          </form>
          <p className="login-note">
            Acesso administrativo local. Crie seu usuário pelo comando{" "}
            <code>npm run admin:create</code>, conforme o README.
          </p>
        </div>
      </section>
    </div>
  );
}
const navigation = [
  ["/", "Dashboard", LayoutDashboard],
  ["/descobrir", "Descobrir empresas", Search],
  ["/leads", "Leads", Building2],
  ["/analise", "Análise com IA", Sparkles],
  ["/pipeline", "Pipeline", Kanban],
  ["/mensagens", "Mensagens", MessageSquare],
  ["/atividades", "Atividades", CalendarClock],
  ["/configuracoes", "Configurações", Settings],
] as const;
function Layout() {
  const me = useQuery({ queryKey: ["me"], queryFn: () => api<Me>("/auth/me") });
  const [collapsed, setCollapsed] = useState(false),
    [search, setSearch] = useState("");
  const navigate = useNavigate();
  const logout = useAction(() => {
    queryClient.clear();
    navigate("/login");
  });
  const workspace = useAction(() => {
    queryClient.clear();
    location.reload();
  });
  const tasks = useQuery({
    queryKey: ["tasks"],
    queryFn: () => api<{ done: boolean; dueAt: string }[]>("/tasks"),
    enabled: !!me.data,
  });
  if (me.isPending)
    return (
      <main className="main">
        <Loading />
      </main>
    );
  if (me.error instanceof ApiError && me.error.status === 401)
    return <Navigate to="/login" replace />;
  if (me.error)
    return <Failure error={me.error} retry={() => void me.refetch()} />;
  const selected = me.data!.workspaces.find(
      (w) => w.id === me.data!.workspaceId,
    ),
    pending =
      tasks.data?.filter((t) => !t.done && Date.parse(t.dueAt) <= Date.now())
        .length || 0;
  return (
    <div className={`shell ${collapsed ? "collapsed" : ""}`}>
      <a className="skip-link" href="#main">
        Pular para o conteúdo
      </a>
      <aside className="sidebar">
        {collapsed ? (
          <span className="brand-mark">
            <Radar />
          </span>
        ) : (
          <Brand />
        )}
        <nav aria-label="Navegação principal">
          {!collapsed && <div className="nav-label">WORKSPACE</div>}
          {navigation.map(([path, label, Icon]) => (
            <NavLink
              end={path === "/"}
              to={path}
              key={path}
              className={({ isActive }) =>
                `nav-item ${isActive ? "active" : ""}`
              }
              title={label}
              aria-label={label}
            >
              <Icon />
              {!collapsed && <span>{label}</span>}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-foot">
          <div className="flex items-center gap-3">
            <span className="avatar">JD</span>
            {!collapsed && (
              <div>
                <strong className="text-xs">Jotage Dev</strong>
                <div className="helper">Administrador</div>
              </div>
            )}
          </div>
          <Button
            variant="ghost"
            className="mt-3"
            aria-label="Sair"
            onClick={() => logout.mutate({ path: "/auth/logout" })}
          >
            <LogOut />
            {!collapsed && "Sair"}
          </Button>
        </div>
        <Button
          className="collapse-button"
          variant="ghost"
          aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
          onClick={() => setCollapsed(!collapsed)}
        >
          {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
        </Button>
      </aside>
      <div>
        {selected?.demo && (
          <div className="demo-banner">
            Workspace de demonstração — empresas inteiramente fictícias,
            separado dos seus leads reais.
          </div>
        )}
        <header className="topbar">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              navigate(`/leads?q=${encodeURIComponent(search)}`);
            }}
          >
            <Search size={17} />
            <input
              aria-label="Buscar empresas"
              placeholder="Buscar empresas no workspace…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </form>
          <div className="topbar-right">
            <select
              aria-label="Workspace"
              className="workspace-select"
              value={me.data!.workspaceId}
              onChange={(e) =>
                workspace.mutate({
                  path: "/auth/workspace",
                  body: { workspaceId: e.target.value },
                })
              }
            >
              {me.data!.workspaces.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
            <Button
              variant="ghost"
              size="icon"
              aria-label={`${pending} acompanhamentos vencidos`}
              onClick={() => navigate("/atividades")}
            >
              <Bell />
              {pending > 0 && <span>{pending}</span>}
            </Button>
            <span className="avatar" title={me.data!.email}>
              JD
            </span>
          </div>
        </header>
        <main className="main" id="main">
          <Suspense fallback={<Loading />}>
            <Outlet />
          </Suspense>
          <footer className="footer-note">
            <span>Jotage Prospect AI · relações construídas com contexto.</span>
            <span>Ambiente local · v0.1</span>
          </footer>
        </main>
      </div>
    </div>
  );
}
function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <MotionConfig reducedMotion="user">
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route element={<Layout />}>
              <Route index element={<Dashboard />} />
              <Route path="descobrir" element={<Discovery />} />
              <Route path="leads" element={<Leads />} />
              <Route path="leads/:id" element={<LeadDetail />} />
              <Route path="analise" element={<Leads analysis />} />
              <Route path="pipeline" element={<Pipeline />} />
              <Route path="mensagens" element={<Messages />} />
              <Route path="atividades" element={<Activities />} />
              <Route path="configuracoes" element={<SettingsPage />} />
              <Route path="*" element={<Navigate to="/" />} />
            </Route>
          </Routes>
          <Toaster richColors position="bottom-right" />
        </BrowserRouter>
      </MotionConfig>
    </QueryClientProvider>
  );
}
document.documentElement.dataset.theme = localStorage.getItem('jotage-theme-v1') || 'dark';
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
