import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { type Lead, stages } from "@jotage/shared";
import { api, useAction } from "../lib/api";
import {
  PageHead,
  Loading,
  Failure,
  CompanySymbol,
} from "../components/common";
import { Input } from "../components/ui/input";
export default function Pipeline() {
  const [q, setQ] = useState("");
  const data = useQuery({
    queryKey: ["pipeline", q],
    queryFn: () =>
      api<{ stage: string; leads: Lead[] }[]>(
        `/pipeline?q=${encodeURIComponent(q)}`,
      ),
  });
  const action = useAction();
  const move = (id: string, stage: string) =>
    action.mutate({
      path: `/leads/${id}/stage`,
      method: "PATCH",
      body: { stage },
    });
  return (
    <>
      <PageHead
        eyebrow="FUNIL COMERCIAL"
        title="Relacionamentos em movimento."
        description="Arraste uma empresa para avançar. Pelo teclado, use o seletor de etapa de cada card."
      />
      <div className="toolbar">
        <Input
          aria-label="Filtrar pipeline"
          placeholder="Buscar empresa…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      {data.isPending ? (
        <Loading />
      ) : data.error ? (
        <Failure error={data.error} />
      ) : (
        <div className="kanban">
          {data.data.map((column) => (
            <section
              className="kanban-column"
              key={column.stage}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const id = e.dataTransfer.getData("text/plain");
                if (id) move(id, column.stage);
              }}
            >
              <div className="flex justify-between items-center">
                <h2 className="text-sm">{column.stage}</h2>
                <span className="helper">{column.leads.length}</span>
              </div>
              {column.leads.map((lead) => (
                <article
                  className="kanban-card"
                  key={lead.id}
                  draggable={!action.isPending}
                  onDragStart={(e) =>
                    e.dataTransfer.setData("text/plain", lead.id)
                  }
                >
                  <Link className="company-cell" to={`/leads/${lead.id}`}>
                    <CompanySymbol name={lead.name} />
                    <strong className="text-xs">{lead.name}</strong>
                  </Link>
                  <p className="helper mt-3">{lead.category}</p>
                  <p className="helper">
                    {lead.score === null
                      ? "Evidências a verificar"
                      : `${lead.score}/100 · oportunidade`}
                  </p>
                  <select
                    className="native-select"
                    aria-label={`Etapa de ${lead.name}`}
                    value={lead.stage}
                    disabled={action.isPending}
                    onChange={(e) => move(lead.id, e.target.value)}
                  >
                    {stages.map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </article>
              ))}
              {!column.leads.length && (
                <p className="helper mt-6">Nenhuma empresa nesta etapa.</p>
              )}
            </section>
          ))}
        </div>
      )}
    </>
  );
}
