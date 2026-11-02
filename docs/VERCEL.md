# Backend na Vercel

A interface e a API são publicadas no mesmo projeto. O banco persistente usa Turso/libSQL; o worker usa Vercel Queues.

Groq também pode organizar a pesquisa Tavily. A migration `0004_groq_research_key` adiciona uma coluna criptografada independente, preservando dados e as outras integrações. Cadastre uma chave nova em Configurações; `GROQ_API_KEY` é apenas um fallback opcional do servidor. O padrão é `openai/gpt-oss-120b`, com teste JSON sem busca. A integração não muda automaticamente os provedores/modelos existentes, não usa Compound nem ferramentas Groq de busca; o limite externo de chamadas/tokens da conta continua valendo. Validação ao vivo requer uma chave nova cadastrada pelo usuário diretamente no SaaS.

OpenRouter gratuito pode substituir o Gemini apenas na pesquisa. Configure a chave no painel do próprio SaaS; a migration `0003_openrouter_research_key` adiciona armazenamento criptografado independente e preserva as chaves existentes. `OPENROUTER_API_KEY` é um fallback opcional de ambiente. Não é preciso ativar faturamento para o roteador gratuito, e o código rejeita modelos pagos. A validação ao vivo depende da chave e da disponibilidade da conta do usuário.

Variáveis protegidas necessárias: TURSO_DATABASE_URL, TURSO_AUTH_TOKEN, SESSION_SECRET (32+ caracteres) e ADMIN_PASSWORD (8+ caracteres). O usuário inicial é admin123. O build aplica as migrations e cria o administrador somente se ele não existir. A senha existente nunca é redefinida pelo deploy.

As chaves Gemini e Tavily, o provedor de busca e os modelos são configurados dentro do sistema em Configurações. As chaves são criptografadas separadamente e nunca retornadas pela API. O build aplica também a migration da coluna de chave Tavily, preservando as configurações existentes.

Localmente, o arquivo SQLite original continua sendo usado quando TURSO_DATABASE_URL não está definido. O banco online começa separado; não há cópia automática dos dados locais.

Jobs são persistidos antes de serem publicados no tópico prospect-jobs. Requisições autenticadas republicam jobs pendentes usando chave de idempotência. A função worker reivindica o job em transação e recupera execução expirada após 300 segundos; falhas temporárias têm até três tentativas e quotas pausam a tarefa. Chamadas a provedores externos podem se repetir em caso de interrupção depois da chamada e antes da persistência.

Não coloque banco SQLite, .env, senha ou chave em commits. Mantenha SESSION_SECRET estável para preservar a leitura das chaves criptografadas.

Pesquisa de contatos: o perfil da empresa cria uma tarefa durável usando o provedor selecionado. Tavily fornece documentos reais para uma chamada Gemini de texto; o modo Google usa suas ferramentas oficiais. O relatório inclui fontes e é salvo na tarefa; campos não comprovados ficam vazios. Na verificação de sites anterior à revisão, contatos comprovados são preenchidos no cadastro.

Prazos: função Vercel 300 s, tarefa 285 s, chamada Gemini até 270 s, consulta Tavily até 45 s e inatividade da auditoria HTTP 30 s. A verificação de sites persiste etapas entre funções e pode durar até dez minutos, incluindo espera na fila. A fila retenta falhas temporárias até três vezes; não há execução infinita.
