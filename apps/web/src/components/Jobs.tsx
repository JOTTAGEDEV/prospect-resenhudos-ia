import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, useAction, formatDate } from "../lib/api";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Failure } from "./common";
export type Job = {
  id: string;
  kind: string;
  targetId: string;
  status: string;
  progress: number;
  error: string | null;
  createdAt: string;
  result: unknown;
};
const statusLabels: Record<string, string> = {
  pending: "Na fila",
  running: "Em execução",
  paused: "Pausada",
  completed: "Concluída",
  failed: "Falhou",
  cancelled: "Cancelada",
};
export function Jobs({ targetId }: { targetId?: string }) {
  const query = useQuery({
    queryKey: ["jobs"],
    queryFn: () => api<Job[]>("/jobs"),
    refetchInterval: 2000,
  });
  const action = useAction(),
    client = useQueryClient();
  const signature = query.data?.map((j) => `${j.id}:${j.status}`).join("|");
  useEffect(() => {
    void client.invalidateQueries({
      predicate: (q) => q.queryKey[0] !== "jobs",
    });
  }, [signature, client]);
  if (query.error) return <Failure error={query.error} />;
  const list =
    query.data
      ?.filter((j) => !targetId || j.targetId === targetId)
      .slice(0, 8) || [];
  if (!list.length) return <p className="helper">Nenhuma tarefa iniciada.</p>;
  return (
    <div>
      {list.map((job) => (
        <div className="list-row" key={job.id}>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3">
              <strong className="text-xs">
                {{
                  search: "Pesquisa de empresas",
                  audit: "Auditoria do site",
                  analyze: "Análise Gemini",
                }[job.kind] || job.kind}
              </strong>
              <Badge variant="secondary">
                {statusLabels[job.status] || job.status}
              </Badge>
            </div>
            <small>{formatDate(job.createdAt)}</small>
            {job.status === "running" && (
              <progress
                aria-label="Progresso da tarefa"
                value={job.progress}
                max={100}
              />
            )}{" "}
            {job.error && <p className="error-text mt-2">{job.error}</p>}
          </div>
          {["pending", "running", "paused"].includes(job.status) && (
            <Button
              variant="ghost"
              size="sm"
              disabled={action.isPending}
              onClick={() => action.mutate({ path: `/jobs/${job.id}/cancel` })}
            >
              Cancelar
            </Button>
          )}
          {["paused", "failed"].includes(job.status) && (
            <Button
              variant="outline"
              size="sm"
              disabled={action.isPending}
              onClick={() => action.mutate({ path: `/jobs/${job.id}/resume` })}
            >
              Retomar
            </Button>
          )}
        </div>
      ))}
    </div>
  );
}
