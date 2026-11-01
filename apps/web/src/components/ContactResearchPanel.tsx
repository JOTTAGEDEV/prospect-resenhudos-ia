import { contactResearchSchema } from "@jotage/shared";
import { Search } from "lucide-react";
import { useAction } from "../lib/api";
import { Button } from "./ui/button";

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
        O Gemini pesquisa no Google por site, telefone e email comercial desta
        empresa. Usa a chave e o modelo das configurações e consome sua quota de
        IA. Confira a empresa e as fontes antes de salvar os dados.
      </p>
      <Button
        variant="outline"
        disabled={action.isPending}
        onClick={() => action.mutate({ path: `/leads/${leadId}/research` })}
      >
        <Search />
        {action.isPending
          ? "Agendando pesquisa…"
          : "Pesquisar contatos com Gemini"}
      </Button>
      <p className="helper mt-2">
        Acompanhe na Central de tarefas. Você pode sair da página enquanto a
        pesquisa continua.
      </p>
      {report && (
        <div className="mt-5 space-y-4">
          <h3>Resultado da pesquisa — confira antes de usar</h3>
          <p className="whitespace-pre-wrap break-words text-sm">
            {report.text}
          </p>
          <ol className="space-y-2">
            {report.sources.map((source, index) => (
              <li
                key={`${index}-${source.url}`}
                className="text-sm break-words"
              >
                <a href={source.url} target="_blank" rel="noreferrer">
                  [{index + 1}] {source.title} ↗
                </a>
              </li>
            ))}
          </ol>
          {report.searchSuggestions && (
            <iframe
              title="Sugestões de pesquisa do Google"
              className="w-full h-40 border-0"
              sandbox="allow-popups allow-popups-to-escape-sandbox"
              referrerPolicy="no-referrer"
              srcDoc={
                "<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; style-src 'unsafe-inline'; img-src https: data:; base-uri 'none'; form-action 'none'\">" +
                report.searchSuggestions
              }
            />
          )}
          <Button variant="outline" onClick={onEdit}>
            Editar dados da empresa
          </Button>
        </div>
      )}
    </section>
  );
}
