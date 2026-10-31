import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api, useAction, formatDate } from "../lib/api";
import { PageHead, Failure, NoData, Loading } from "../components/common";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Jobs } from "../components/Jobs";
type Task = {
  id: string;
  leadId: string;
  title: string;
  dueAt: string;
  done: boolean;
};
export default function Activities() {
  const tasks = useQuery({
      queryKey: ["tasks"],
      queryFn: () => api<Task[]>("/tasks"),
    }),
    activities = useQuery({
      queryKey: ["activities"],
      queryFn: () =>
        api<{ id: string; leadId: string; text: string; createdAt: string }[]>(
          "/activities",
        ),
    });
  const action = useAction();
  return (
    <>
      <PageHead
        eyebrow="ACOMPANHAMENTO"
        title="Nenhuma boa conversa esquecida."
        description="Próximas ações, tarefas de processamento e o histórico do seu trabalho."
      />
      <div className="grid-2">
        <section className="panel">
          <h2 className="mb-4">Próximos acompanhamentos</h2>
          {tasks.isPending ? (
            <Loading />
          ) : tasks.error ? (
            <Failure error={tasks.error} />
          ) : tasks.data.length ? (
            tasks.data.map((t) => (
              <div className="list-row" key={t.id}>
                <div>
                  <Link to={`/leads/${t.leadId}`}>
                    <strong>{t.title}</strong>
                  </Link>
                  <p className="helper">{formatDate(t.dueAt)}</p>
                  <Badge variant="secondary">
                    {t.done
                      ? "Concluído"
                      : Date.parse(t.dueAt) < Date.now()
                        ? "Prazo atingido"
                        : "Agendado"}
                  </Badge>
                </div>
                <Button
                  variant="outline"
                  disabled={action.isPending}
                  onClick={() =>
                    action.mutate({
                      path: `/tasks/${t.id}`,
                      method: "PATCH",
                      body: { done: !t.done },
                    })
                  }
                >
                  {t.done ? "Reabrir" : "Concluir"}
                </Button>
              </div>
            ))
          ) : (
            <NoData
              title="Tudo em dia por aqui."
              description="Agende o próximo acompanhamento no perfil de uma empresa."
            />
          )}
        </section>
        <section className="panel">
          <h2 className="mb-4">Processamento em segundo plano</h2>
          <Jobs />
        </section>
      </div>
      <section className="panel mt-6">
        <h2>Histórico de atividades</h2>
        {activities.error ? (
          <Failure error={activities.error} />
        ) : activities.data?.length ? (
          activities.data.map((a) => (
            <Link to={`/leads/${a.leadId}`} className="list-row" key={a.id}>
              <p>{a.text}</p>
              <small>{formatDate(a.createdAt)}</small>
            </Link>
          ))
        ) : (
          <p className="helper mt-4">
            Suas notas, contatos e mudanças de etapa serão registrados aqui.
          </p>
        )}
      </section>
    </>
  );
}
