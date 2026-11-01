# Backend na Vercel

A interface e a API são publicadas no mesmo projeto. O banco persistente usa Turso/libSQL; o worker usa Vercel Queues.

Variáveis protegidas necessárias: TURSO_DATABASE_URL, TURSO_AUTH_TOKEN, SESSION_SECRET (32+ caracteres) e ADMIN_PASSWORD (8+ caracteres). O usuário inicial é admin123. O build aplica as migrations e cria o administrador somente se ele não existir. A senha existente nunca é redefinida pelo deploy.

A chave Gemini e o modelo são configurados dentro do sistema em Configurações.

Localmente, o arquivo SQLite original continua sendo usado quando TURSO_DATABASE_URL não está definido. O banco online começa separado; não há cópia automática dos dados locais.

Jobs são persistidos antes de serem publicados no tópico prospect-jobs. Requisições autenticadas republicam jobs pendentes usando chave de idempotência. A função worker reivindica o job em transação e recupera execução expirada após 300 segundos; falhas temporárias têm até três tentativas e quotas pausam a tarefa. Chamadas a provedores externos podem se repetir em caso de interrupção depois da chamada e antes da persistência.

Não coloque banco SQLite, .env, senha ou chave em commits. Mantenha SESSION_SECRET estável para preservar a leitura das chaves Gemini criptografadas.

Pesquisa de contatos: no perfil da empresa, “Pesquisar contatos com Gemini” cria uma tarefa durável usando Google Search. O relatório inclui referências retornadas pelo Gemini e é salvo na tarefa; os campos do lead só mudam após revisão e edição pelo operador. Exige modelo compatível com Google Search e respeita a quota diária de IA.

Prazos: função Vercel 300 s, tarefa 240 s, chamada Gemini 180 s, Overpass 100 s (consulta 90 s), inatividade da auditoria HTTP 30 s. A fila retenta falhas temporárias até três vezes; não há execução infinita.
