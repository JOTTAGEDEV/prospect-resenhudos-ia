# Estado da implementação — 02/11/2026

## Implementado

- [x] Monorepositório npm, React/TypeScript/Vite e Fastify.
- [x] SQLite/Drizzle, 19 tabelas, migration, foreign keys compostas e índices.
- [x] Administrador local, senha scrypt, sessões HttpOnly, proteção de origem, rate limiting e troca de senha.
- [x] Workspaces isolados; seed fictício separado, sem contatos reais.
- [x] Cadastro, edição, exclusão, notas, tags, busca, filtros, ordenação e paginação de leads.
- [x] Pesquisa Tavily + Gemini ou ferramentas Google, com fontes verificadas; Overpass preservado apenas como adaptador de compatibilidade.
- [x] Chave Tavily configurável na interface e criptografada separadamente, sem retorno do segredo ao navegador.
- [x] Raio de até 50 km, verificação de sites antes da revisão e etapas persistentes com janela de dez minutos.
- [x] Usuário e nome de exibição editáveis; limpeza explícita de leads e históricos preserva configurações, chaves e quota.
- [x] Importação CSV atômica e exportação com proteção contra fórmulas.
- [x] Auditoria de HTML inicial, robots.txt, limites, validação de IP público e DNS fixado ao socket.
- [x] Gemini com SDK oficial, modelo configurável, chave criptografada, JSON/Zod, teto diário e consumo.
- [x] Score heurístico explicável, pesos configuráveis e estado de evidência insuficiente.
- [x] Templates sem IA, geração Gemini, edição versionada, aprovação e link WhatsApp sem envio automático.
- [x] Supressão de contatos preservada após exclusão/reimportação da identidade conhecida.
- [x] Kanban arrastável e alternativa por seleção, histórico e acompanhamentos.
- [x] Dashboard calculado do banco, gráficos e distribuição de scores.
- [x] Fila persistente de pesquisa/auditoria/análise IA; cancelamento, pausa por quota, retentativas e recuperação.
- [x] Login, dashboard, descoberta, leads/perfil, análise, pipeline, mensagens, atividades e configurações.
- [x] Tema escuro/claro, layout responsivo, foco visível, labels, estados vazios, erros e recuperação React.
- [x] Backup JSON do workspace, exclusão de leads e endpoint de limpeza de histórico.
- [x] README Windows, contratos REST, setup preservando dados e comando de abertura local.

## Verificações executadas

- [x] TypeScript, ESLint, **116 testes Vitest** e builds web/API passaram. A integração Tavily é coberta por testes de transporte, validação de trechos reais, identidade, contatos e separação das ferramentas Google.
- [x] `npm run test:e2e`: fluxo integrado Chromium passou, com banco e servidor exclusivos de teste.
- [x] E2E: login → descoberta mockada → auditoria mockada → IA mockada → mensagem → aprovação → pipeline → reload → cadastro manual → configurações.
- [x] E2E: salvar chave Tavily fictícia, recarregar sem expor o segredo, preservar com campo vazio e remover explicitamente.
- [x] E2E: sem erros JavaScript ou overflow nos tamanhos móveis/tablet testados; modo reduced-motion.
- [x] Axe no dashboard com dados, temas escuro/claro: nenhuma violação nas regras WCAG 2 A/AA e 2.1 AA executadas. Não equivale a certificação de todas as telas.
- [x] Login e dashboard também executados no ambiente real `http://127.0.0.1:5173`, com banco persistente e sem mocks.
- [x] Reabertura do SQLite preserva leads, verificada por teste automatizado.
- [x] `npm audit --omit=dev`: nenhuma vulnerabilidade conhecida reportada na última execução.
- [x] Auditoria real de example.com: concluída, HTTP 200, título Example Domain.
- [x] Setup repetido preserva usuários e senhas existentes.

## Dependências externas não confirmadas

- [ ] Pesquisa Tavily + Gemini ao vivo completa: chave Tavily cadastrada e fontes retornadas. O 3.1 respondeu, mas a primeira resposta não comprovou identidade/localidade suficientes; o 3.8 retornou HTTP 503. A pesquisa solicita conteúdo completo das páginas e JSON por instrução, com contrato e citações validados no backend. Falhas de evidência informam contagens de rejeição sem expor dados pessoais.
- [x] Disponibilidade Google investigada: a chave recusou a geração do Gemini 2.5 com 404; as ferramentas Search/Maps do 3.8 não estão incluídas na camada gratuita. Não atribuímos essa recusa ao esgotamento das 20 chamadas diárias.
- [ ] Pesquisa Overpass ao vivo concluída: tentativas anteriores tiveram timeout; esse adaptador não é mais a fonte padrão.
- [ ] WhatsApp externo: link e bloqueios testados; nenhum contato real aberto ou enviado.

## Limites explícitos desta versão

- Auditoria restrita ao HTML inicial, sem Lighthouse, execução de scripts remotos, performance, responsividade visual ou varredura de links quebrados. A interface declara as limitações.
- Importação/exportação pequenas, pontuação e mensagens são endpoints síncronos limitados; não têm todos os jobs assíncronos descritos no prompt amplo. A fila cobre pesquisa/auditoria/análise.
- Localmente, execute uma instância da API por banco. Na Vercel, as funções usam Turso e Vercel Queues, com entrega pelo menos uma vez; chamadas externas podem se repetir após interrupções. Consulte `VERCEL.md`.
- Etapas do pipeline são fixas. Não há interface de gestão de equipes, responsáveis ou cadastro público.
- Pesquisa requer coordenadas, sem geocodificação. Correspondências ambíguas não são mescladas automaticamente.
- Sem restauração de JSON pela interface; backup integral de SQLite e restauração manual documentados.
- Sem pagamentos, disparos ou agendamentos automáticos de prospecção.
- A pesquisa externa Tavily permanece pendente até uma execução real com a chave cadastrada. A presença de uma chave salva não prova validade ou disponibilidade de quota.

## Repositório e acesso

Commits incrementais enviados a main conforme autorização. `.env`, SQLite e `.local` são ignorados. Consulte o acesso inicial com `npm run access` e altere a senha em Configurações.
