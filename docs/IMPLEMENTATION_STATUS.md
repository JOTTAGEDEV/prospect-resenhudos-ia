# Estado da implementação — 31/10/2026

## Implementado

- [x] Monorepositório npm, React/TypeScript/Vite e Fastify.
- [x] SQLite/Drizzle, 19 tabelas, migration, foreign keys compostas e índices.
- [x] Administrador local, senha scrypt, sessões HttpOnly, proteção de origem, rate limiting e troca de senha.
- [x] Workspaces isolados; seed fictício separado, sem contatos reais.
- [x] Cadastro, edição, exclusão, notas, tags, busca, filtros, ordenação e paginação de leads.
- [x] Conector Overpass, consulta limitada, normalização, fontes, deduplicação conservadora e cache de 24h.
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

- [x] `npm run verify`: TypeScript, ESLint, **52 testes Vitest** e builds web/API passaram.
- [x] `npm run test:e2e`: fluxo integrado Chromium passou, com banco e servidor exclusivos de teste.
- [x] E2E: login → descoberta mockada → auditoria mockada → IA mockada → mensagem → aprovação → pipeline → reload → cadastro manual → configurações.
- [x] E2E: sem erros JavaScript ou overflow nos tamanhos móveis/tablet testados; modo reduced-motion.
- [x] Axe no dashboard com dados, temas escuro/claro: nenhuma violação nas regras WCAG 2 A/AA e 2.1 AA executadas. Não equivale a certificação de todas as telas.
- [x] Login e dashboard também executados no ambiente real `http://127.0.0.1:5173`, com banco persistente e sem mocks.
- [x] Reabertura do SQLite preserva leads, verificada por teste automatizado.
- [x] `npm audit --omit=dev`: nenhuma vulnerabilidade conhecida reportada na última execução.
- [x] Auditoria real de example.com: concluída, HTTP 200, título Example Domain.
- [x] Setup repetido preserva usuários e senhas existentes.

## Dependências externas não confirmadas

- [ ] Gemini ao vivo: falta chave/modelo/quota do usuário. Sucesso, erro, quota, JSON inválido e limite de mensagem foram testados com mocks.
- [ ] Pesquisa Overpass ao vivo concluída: tentativas pequenas em overpass-api.de e Private.coffee tiveram timeout; status da primeira instância respondeu HTTP 406. Conector e persistência testados com mocks, sem inventar resultados reais.
- [ ] WhatsApp externo: link e bloqueios testados; nenhum contato real aberto ou enviado.

## Limites explícitos desta versão

- Auditoria restrita ao HTML inicial, sem Lighthouse, execução de scripts remotos, performance, responsividade visual ou varredura de links quebrados. A interface declara as limitações.
- Importação/exportação pequenas, pontuação e mensagens são endpoints síncronos limitados; não têm todos os jobs assíncronos descritos no prompt amplo. A fila cobre pesquisa/auditoria/análise.
- Execute uma instância da API por banco; a fila não foi preparada para workers distribuídos.
- Etapas do pipeline são fixas. Não há interface de gestão de equipes, responsáveis ou cadastro público.
- Pesquisa requer coordenadas, sem geocodificação. Correspondências ambíguas não são mescladas automaticamente.
- Sem restauração de JSON pela interface; backup integral de SQLite e restauração manual documentados.
- Sem pagamentos, disparos, deploy público ou agendamentos automáticos de prospecção.
- Os critérios externos permanecem pendentes até validar Gemini e Overpass ao vivo.

## Repositório e acesso

Commits incrementais enviados a main conforme autorização. `.env`, SQLite e `.local` são ignorados. Consulte o acesso inicial com `npm run access` e altere a senha em Configurações.
