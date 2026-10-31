import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
} from "recharts";
import {
  Search,
  ArrowUpRight,
  Building2,
  MessageSquare,
  Target,
  Handshake,
  TrendingUp,
  Radar,
} from "lucide-react";
import { segments, type Lead } from "@jotage/shared";
import { api, formatDate } from "../lib/api";
import { PageHead, Loading, Failure } from "../components/common";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { LeadTable } from "../components/LeadTable";
type DashboardData = {
  total: number;
  counts: Record<string, number>;
  highPriority: number;
  contacted: number;
  responded: number;
  responseRate: number;
  conversionRate: number;
  pendingTasks: number;
  aiCalls: number;
  byDay: { name: string; value: number }[];
  byCategory: { name: string; value: number }[];
  scoreDistribution: { name: string; value: number }[];
  responsesByDay: { name: string; value: number }[];
  conversionsByDay: { name: string; value: number }[];
};
export default function Dashboard() {
  const [category, setCategory] = useState(""),
    [from, setFrom] = useState(""),
    [to, setTo] = useState("");
  const params = new URLSearchParams();
  if (category) params.set("category", category);
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  const data = useQuery({
    queryKey: ["dashboard", category, from, to],
    queryFn: () => api<DashboardData>(`/dashboard?${params}`),
  });
  const leads = useQuery({
    queryKey: ["recent-leads", category, from, to],
    queryFn: () => api<{ items: Lead[] }>(`/leads?pageSize=5&${params}`),
  });
  const activities = useQuery({
    queryKey: ["activities"],
    queryFn: () =>
      api<{ id: string; text: string; createdAt: string; leadId: string }[]>(
        "/activities",
      ),
  });
  if (data.isPending) return <Loading />;
  if (data.error)
    return <Failure error={data.error} retry={() => void data.refetch()} />;
  const d = data.data;
  return (
    <>
      <PageHead
        eyebrow="VISÃO GERAL"
        title="Seu próximo cliente começa aqui."
        description="Da descoberta à conversa certa. Acompanhe o que faz seu negócio avançar."
        action={
          <Button asChild>
            <Link to="/descobrir">
              <Search data-icon="inline-start" />
              Descobrir empresas
            </Link>
          </Button>
        }
      />
      <div className="toolbar">
        <select
          className="native-select max-w-56"
          aria-label="Filtrar segmento"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          <option value="">Todos os segmentos</option>
          {segments.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <Input
          type="date"
          aria-label="Data inicial"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
        />
        <Input
          type="date"
          aria-label="Data final"
          value={to}
          onChange={(e) => setTo(e.target.value)}
        />
      </div>
      <div className="metrics">
        {[
          [
            "Empresas no radar",
            d.total,
            Building2,
            "Leads do período selecionado",
          ],
          [
            "Prontas para qualificar",
            d.counts["Novo lead"],
            Target,
            "Novas oportunidades",
          ],
          [
            "Conversas iniciadas",
            d.contacted,
            MessageSquare,
            `${d.responseRate.toFixed(1)}% de resposta`,
          ],
          [
            "Clientes conquistados",
            d.counts["Cliente fechado"],
            Handshake,
            `${d.conversionRate.toFixed(1)}% de conversão`,
          ],
        ].map(([label, value, Icon, note]) => {
          const MetricIcon = Icon as typeof Building2;
          return (
            <div className="metric" key={String(label)}>
              <div className="metric-label">
                {String(label)}
                <MetricIcon />
              </div>
              <div className="metric-value">{String(value)}</div>
              <div className="metric-note">{String(note)}</div>
            </div>
          );
        })}
      </div>
      <div className="opportunity-strip">
        <div>
          <h2>
            {d.total
              ? "Transforme contexto em uma boa conversa."
              : "Seu radar está pronto para a primeira descoberta."}
          </h2>
          <div className="step-line">
            <b>01 Descobrir</b>
            <span>→</span>
            <span>02 Verificar evidências</span>
            <span>→</span>
            <span>03 Conversar</span>
            <span>→</span>
            <span>04 Acompanhar</span>
          </div>
        </div>
        <Button variant="outline" asChild>
          <Link to={d.total ? "/leads" : "/descobrir"}>
            {d.total ? "Explorar leads" : "Começar pesquisa"}
            <ArrowUpRight data-icon="inline-end" />
          </Link>
        </Button>
      </div>
      <div className="grid-2">
        <section className="panel">
          <div className="panel-head">
            <div>
              <h2>Evolução da descoberta</h2>
              <p className="helper">Empresas adicionadas ao seu workspace</p>
            </div>
            <TrendingUp size={18} className="muted" />
          </div>
          {d.byDay.length ? (
            <div className="chart">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={d.byDay}>
                  <XAxis
                    dataKey="name"
                    tick={{ fill: "#9ca3af", fontSize: 10 }}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fill: "#9ca3af", fontSize: 10 }}
                    width={28}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "var(--card)",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="value"
                    name="Empresas"
                    stroke="#32d6a0"
                    fill="#32d6a0"
                    fillOpacity={0.1}
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="empty-chart">
              <Radar />
              <h3>As próximas oportunidades estão lá fora.</h3>
              <p>
                Sua evolução aparecerá aqui depois de cadastrar ou descobrir
                empresas.
              </p>
            </div>
          )}
        </section>
        <section className="panel">
          <div className="panel-head">
            <div>
              <h2>Seu funil, em perspectiva</h2>
              <p className="helper">Etapas com leads no período</p>
            </div>
            <Link className="helper" to="/pipeline">
              Ver pipeline ↗
            </Link>
          </div>
          {d.total ? (
            Object.entries(d.counts)
              .filter(([, value]) => value > 0)
              .map(([stage, value]) => (
                <div key={stage} className="list-row">
                  <span>{stage}</span>
                  <strong>{value}</strong>
                </div>
              ))
          ) : (
            <div className="empty-chart">
              <Target />
              <h3>Uma etapa de cada vez.</h3>
              <p>
                Organize suas empresas no pipeline para acompanhar as
                negociações.
              </p>
            </div>
          )}
        </section>
      </div>
      <div className="grid-2 mt-6">
        <section className="panel">
          <div className="panel-head">
            <div>
              <h2>Oportunidades recentes</h2>
              <p className="helper">
                Fontes preservadas, próximos passos claros
              </p>
            </div>
            <Link className="helper" to="/leads">
              Todos os leads ↗
            </Link>
          </div>
          {leads.error ? (
            <Failure error={leads.error} />
          ) : leads.isPending ? (
            <Loading />
          ) : (
            <LeadTable leads={leads.data.items} />
          )}
        </section>
        <section className="panel">
          <div className="panel-head">
            <h2>Últimos movimentos</h2>
            <Link className="helper" to="/atividades">
              Ver todos ↗
            </Link>
          </div>
          {activities.error ? (
            <Failure error={activities.error} />
          ) : activities.data?.length ? (
            activities.data.slice(0, 5).map((a) => (
              <Link to={`/leads/${a.leadId}`} key={a.id} className="list-row">
                <div>
                  <p>{a.text}</p>
                  <small>{formatDate(a.createdAt)}</small>
                </div>
              </Link>
            ))
          ) : (
            <div className="empty-chart">
              <MessageSquare />
              <h3>O histórico começa com uma ação.</h3>
              <p>Notas, contatos e mudanças de etapa aparecem aqui.</p>
            </div>
          )}
          <div className="list-row">
            <span className="helper">Acompanhamentos pendentes</span>
            <strong>{d.pendingTasks}</strong>
          </div>
          <div className="list-row">
            <span className="helper">Chamadas de IA no workspace</span>
            <strong>{d.aiCalls}</strong>
          </div>
        </section>
      </div>
      {d.total > 0 && (
        <div className="grid-2 mt-6">
          <section className="panel">
            <h2>Segmentos encontrados</h2>
            <div className="chart">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={d.byCategory}>
                  <XAxis
                    dataKey="name"
                    tick={{ fill: "#9ca3af", fontSize: 10 }}
                  />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Bar
                    dataKey="value"
                    name="Empresas"
                    fill="#32d6a0"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>
          <section className="panel">
            <h2>Qualificação por evidências</h2>
            {d.scoreDistribution.map((item) => (
              <div key={item.name} className="list-row">
                <span>{item.name}</span>
                <strong>{item.value}</strong>
              </div>
            ))}
          </section>
        </div>
      )}
      {d.total > 0 && (
        <div className="grid-2 mt-6">
          {[
            { title: "Respostas ao longo do tempo", data: d.responsesByDay },
            { title: "Conversões por período", data: d.conversionsByDay },
          ].map((series) => (
            <section className="panel" key={series.title}>
              <h2>{series.title}</h2>
              <p className="helper">Primeira passagem registrada por empresa</p>
              {series.data.length ? (
                <div className="chart">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={series.data}>
                      <XAxis
                        dataKey="name"
                        tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
                      />
                      <YAxis allowDecimals={false} />
                      <Tooltip
                        contentStyle={{
                          background: "var(--card)",
                          border: "1px solid var(--border)",
                        }}
                      />
                      <Bar
                        name="Empresas"
                        dataKey="value"
                        fill="var(--primary)"
                        radius={[4, 4, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <p className="helper mt-5">Ainda não há eventos registrados.</p>
              )}
            </section>
          ))}
        </div>
      )}
    </>
  );
}
