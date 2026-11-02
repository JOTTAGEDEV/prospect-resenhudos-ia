import { contactResearchSchema } from "@jotage/shared";
import { Search } from "lucide-react";
import { useAction } from "../lib/api";
import { Button } from "./ui/button";
import { ResearchReport } from "./ResearchReport";

export function ContactResearchPanel({
  leadId,
  result,
  onEdit,
}: {
  leadId: string;
  result: unknown;
  onEdit: () => void;
}) {
  const action = useAction();
  const parsed = contactResearchSchema.safeParse(result);
  const report = parsed.success ? parsed.data : null;
  return (
    <section className="panel mb-6">
      <h2>Encontre os contatos que faltam</h2>
      <p className="helper mt-2 mb-4">
        A fonte definida em Configurações pesquisa na web e o Gemini confere
        site, endereço, telefone e email comercial desta empresa. Links do
        Google Maps aparecem quando encontrados nas fontes. A pesquisa consome a
        quota da fonte e do Gemini separadamente. Confira a identidade e as
        fontes antes de salvar os dados.
      </p>
      <Button
        variant="outline"
        disabled={action.isPending}
        onClick={() => action.mutate({ path: `/leads/${leadId}/research` })}
      >
        <Search />
        {action.isPending
          ? "Agendando pesquisa…"
          : "Pesquisar contatos na web"}
      </Button>
      <p className="helper mt-2">
        Acompanhe na Central de tarefas. Você pode sair da página enquanto a
        pesquisa continua.
      </p>
      {report && (
        <div className="mt-5 space-y-4">
          <h3>Resultado da pesquisa — confira antes de usar</h3>
          <ResearchReport report={report} />
          <Button variant="outline" onClick={onEdit}>
            Editar dados da empresa
          </Button>
        </div>
      )}
    </section>
  );
}
