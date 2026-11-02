# Jotage Prospect AI

Prospecção B2B com React, Fastify, SQLite/Drizzle, pesquisa web via Tavily ou ferramentas Google e análise Gemini. Interface em português, auditoria HTML limitada, CRM e mensagens revisadas individualmente.

**Estado:** MVP local implementado e validado com testes automatizados. Consulte [IMPLEMENTATION_STATUS](docs/IMPLEMENTATION_STATUS.md) para distinguir verificações locais e integrações externas ainda não confirmadas ao vivo. Nenhuma credencial ou banco local é versionado. Nenhum envio automático ou pagamento é implementado.

## Abertura rápida

Após `npm install`, execute `npm run setup` e abra `INICIAR.cmd`. O setup cria o segredo e um administrador local apenas se ainda não existirem, preservando dados e senhas existentes. O acesso inicial fica em `.local/first-access.json`, ignorado pelo Git; `npm run access` o mostra somente no seu terminal. Altere a senha em **Configurações** e remova esse arquivo após guardar o acesso.

No ambiente de entrega, a interface usa `127.0.0.1:5173` e a API usa a porta **3002**, pois a 3001 já estava ocupada. O proxy Vite lê `PORT` e `WEB_PORT` do `.env`. Em instalações novas, o padrão continua sendo 3001/5173.

## Iniciar no Windows

Pré-requisitos: Node.js **24 LTS**, npm e Git. Execute no PowerShell, na raiz do repositório:

```powershell
npm install
if (!(Test-Path .env)) { Copy-Item .env.example .env }
```

Edite `.env` localmente, preenchendo:

- `SESSION_SECRET`: pelo menos 32 caracteres aleatórios. Gere com `node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"` e copie o resultado para o arquivo local.
- `ADMIN_EMAIL`: seu email administrativo.
- `ADMIN_PASSWORD`: senha exclusiva de pelo menos 12 caracteres.
- Mantenha Gemini vazio se quiser começar sem IA.

```powershell
npm run db:migrate
npm run admin:create
npm run dev
```

Abra **http://127.0.0.1:5173**. Use o email e a senha definidos por você. O servidor aceita conexões somente em loopback. Use `127.0.0.1`, não `localhost`, para manter origem e cookies consistentes.

Após criar o administrador, apague `ADMIN_PASSWORD` do `.env`. O banco guarda somente o hash scrypt (N=131072, r=8, p=1), nunca a senha original. Não altere `SESSION_SECRET` sem planejar a reconfiguração das chaves Gemini criptografadas.

No npm 12, se o driver nativo for bloqueado, execute `npm install-scripts approve better-sqlite3` e `npm rebuild better-sqlite3`. As versões com scripts aprovados estão registradas no package.json. Em máquinas sem binário pré-compilado, instale as ferramentas de compilação para Node/Windows.

### Build e execução local sem Vite

```powershell
npm run build
```

Altere `APP_ORIGIN=http://127.0.0.1:3001` no `.env` e execute `npm start`. Abra **http://127.0.0.1:3001**. `NODE_ENV=production` exige HTTPS para os cookies Secure; não o ative em HTTP local. Esta entrega não configura hospedagem pública.

### Demonstração separada

`npm run db:seed` cria três empresas inteiramente fictícias, sem telefones, em outro workspace. Selecione **Demonstração** no cabeçalho. Em Configurações, “Limpar demonstração” exclui somente registros desse workspace. Não existe seed automático de números no dashboard de produção.

## Fluxo de uso

1. Configure seus serviços em **Configurações**.
2. Em **Descobrir empresas**, confirme a cidade, UF, latitude/longitude, raio até 50 km e segmento. A busca usa o provedor escolhido em Configurações; distâncias sem coordenadas confirmadas ficam sujeitas a revisão.
3. Selecione os resultados no histórico. Empresas encontradas são persistidas com origem e data; campos desconhecidos ficam vazios.
4. Abra uma empresa e clique em **Auditar site**. Veja evidências e limitações.
5. Solicite **Analisar com Gemini**, se a integração estiver configurada. Sem ela, use auditoria, pontuação heurística e templates manuais.
6. Crie uma mensagem, edite e aprove uma versão. **Abrir no WhatsApp** exige telefone brasileiro válido e aprovação. O sistema não envia a mensagem.
7. Registre manualmente o contato, mova o card no pipeline e agende acompanhamento.
8. Selecione **Não contatar** para bloquear novas abordagens. A supressão sobrevive à exclusão/reimportação da mesma identidade ou contato.

## Gemini e custos

Crie uma chave no [Google AI Studio](https://aistudio.google.com/api-keys), sem habilitar faturamento automaticamente. Consulte [modelos](https://ai.google.dev/gemini-api/docs/models), [preços](https://ai.google.dev/gemini-api/docs/pricing) e [limites](https://ai.google.dev/gemini-api/docs/rate-limits) da sua conta. Disponibilidade gratuita e quota variam: o padrão é `gemini-3.8-flash`, sujeito à disponibilidade para sua chave.

Preencha chave e modelo em Configurações ou `GEMINI_API_KEY`/`GEMINI_MODEL` no `.env`. Chave cadastrada no painel é criptografada com AES-256-GCM no backend e nunca retornada ao navegador. O teste de conexão consome uma chamada. Falhas também entram no teto local diário, calculado no fuso America/Sao_Paulo.

Análises usam [saída JSON estruturada](https://ai.google.dev/gemini-api/docs/structured-output) e validação Zod. Dados recebidos de sites são não confiáveis; a IA não recebe ferramentas de execução. Recomendação gerada por IA continua sujeita à revisão humana, mesmo com validação estrutural.

## Descoberta com Tavily ou Google

Em **Configurações → IA da pesquisa**, é possível escolher **OpenRouter · modelos gratuitos** como alternativa ao Gemini. Cole a chave OpenRouter no campo próprio e salve. O modelo padrão `openrouter/free` escolhe um modelo gratuito disponível; também são aceitos identificadores terminados em `:free`. A integração bloqueia modelos pagos, não ativa ferramentas de busca pagas e impõe preços de entrada/saída/requisição iguais a zero. Modelos gratuitos têm disponibilidade e limites próprios: a [regra atual sem compra de créditos](https://openrouter.ai/collections/free-models) é de 50 chamadas diárias e 20 por minuto, incluindo falhas.

No modo OpenRouter, o Tavily continua buscando as fontes, e a pesquisa não precisa da chave Gemini. Análises e mensagens continuam usando o modelo Gemini configurado. **Testar IA da pesquisa salva** faz apenas uma pequena chamada JSON ao provedor selecionado, sem consultar Tavily nem procurar empresas. A chave OpenRouter é criptografada separadamente; campo vazio preserva e remoção exige a opção explícita. O teto local de chamadas é compartilhado entre os provedores e não substitui seus limites externos.

Para reduzir respostas excessivas, a busca Tavily adapta a quantidade de fontes ao limite da rodada e pede até seis por empresa na verificação individual. O limite de resposta continua em 2 MB. A validação de nomes e localidades tolera diferenças de acento e capitalização nos trechos; citações de contatos e URLs continuam exigindo correspondência exata. Falhas de validação também registram o modelo e os tokens efetivamente informados pelo provedor.

Em **Configurações → Fonte da pesquisa**, selecione **Tavily** e cole sua chave no próprio site. A chave é criptografada separadamente da chave Gemini; deixar o campo vazio preserva a chave salva. O plano gratuito Tavily oferece [1.000 créditos mensais sem cartão](https://www.tavily.com/pricing). A integração usa a [busca básica](https://docs.tavily.com/documentation/api-reference/endpoint/search), de um crédito por consulta, sem ativação automática de planos pagos. Uma consulta vazia, de descoberta ou verificação individual, pode fazer uma segunda consulta mais ampla; erros de chave ou quota não são repetidos. Uma rodada com verificações individuais pode realizar várias consultas.

No modo Tavily, o Gemini organiza os documentos encontrados em uma chamada de texto, sem ferramentas Google pagas. A busca solicita o conteúdo completo das páginas e preserva início e rodapé, limitados a 16 mil caracteres por fonte, para incluir contatos e endereços ausentes dos resumos. Ele recebe resultados reais e deve citar trechos das fontes para nome, localidade e contatos. O backend confere essas referências antes de aceitar os dados. Tavily pesquisa a web; não equivale a uma consulta direta à API Google Maps. Links de Maps só são apresentados quando encontrados nas fontes, e campos não comprovados ficam vazios.

O modo alternativo **Google Search e Maps** permanece disponível para chaves com acesso às ferramentas. As ferramentas do Gemini 3.8 exigem a camada paga, mesmo com tokens de texto gratuitos. Gemini 2.5 depende de disponibilidade efetiva na chave: um modelo listado pode ainda retornar 404 ao gerar conteúdo. No 2.5, descoberta usa Maps e conferência individual usa Search em chamadas separadas; no 3.8 compatível, podem ser combinadas.

Há seleções separadas para análise (`model`) e organização da pesquisa (`researchModel`, vazio acompanha análise). Pesquisas usam até 32.768 tokens de saída e raciocínio ampliado; Gemini 3 usa raciocínio alto. Esse é um teto, não consumo obrigatório. O limite local padrão é de 20 chamadas Gemini por dia e inclui tentativas Gemini que falharam. Falhas ou respostas vazias do Tavily anteriores à chamada Gemini liberam apenas a reserva daquela tentativa; o histórico anterior não é alterado. Créditos Tavily, quotas de tokens e limites Google são independentes.

Nome, localidade, site, telefone e email precisam de fontes verificáveis. No modo Google, são usados os metadados oficiais de grounding. Quando não há coordenadas verificáveis, a pertinência à região é textual e o raio é aproximado; a interface informa essa limitação.

A opção **Verificar sites antes de enviar para revisão** (`excludeWithWebsite: true`) fica ativada por padrão. Empresas com site próprio confirmado saem da rodada; perfis sociais e diretórios não contam como site próprio. Um URL antigo ou bloqueado é pesquisado novamente. Apenas empresas cujo site não foi localizado após a pesquisa entram para revisão, sem garantir inexistência. Contatos comprovados são preenchidos no cadastro. Evidências insuficientes ficam inconclusivas; quota pausa a tarefa e falhas transitórias podem ser tentadas novamente.

O progresso fica persistido entre execuções. A verificação tem uma janela de dez minutos, com etapas de até 270 segundos e margem antes dos 300 segundos da função Vercel. A espera da fila conta para essa janela; pendências ficam inconclusivas ao encerrá-la. Chamadas de pesquisa são espaçadas em quinze segundos. Rodadas com verificação não reutilizam o cache de 24 horas. Novas rodadas podem consumir quota.

Referências: [Google Maps grounding](https://ai.google.dev/gemini-api/docs/generate-content/maps-grounding), [Gemini 3.8 Flash](https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash). O adaptador Overpass permanece apenas para compatibilidade e testes por injeção explícita; não é a fonte padrão do SaaS.

## Testes

```powershell
npm run verify
npx playwright install chromium
npm run test:e2e
```

`verify` executa TypeScript, ESLint, Vitest e builds. E2E usa um servidor exclusivo em `127.0.0.1:3101`, banco temporário e providers explicitamente substituídos por mocks no arquivo de teste. A aplicação normal não possui flag para habilitar resultados fictícios. Faça o build antes de executar E2E.

## Dados, backup e privacidade

- SQLite fica em `data/prospect.db` (WAL, foreign keys e migrations). Não coloque essa pasta no Git.
- Exportação CSV neutraliza fórmulas. Importação é validada antes de persistir e limitada a 500 linhas.
- Backup JSON do workspace exporta dados comerciais e relacionamentos, sem senhas, sessões ou chaves. Para backup integral recuperável, pare a aplicação e copie a pasta `data` junto com o segredo de criptografia para local protegido. Para restaurar, pare a aplicação, preserve uma cópia do estado atual e restaure os arquivos usando a mesma versão do esquema.
- O botão de exclusão do perfil remove o lead e seus registros dependentes. A supressão é preservada para respeitar oposição a novos contatos.
- Use apenas dados empresariais necessários. Documente finalidade e base legal adequada, revise dados de contato antes da abordagem e corrija/exclua registros quando necessário. Dados públicos não são autorização irrestrita de uso.

## Arquitetura

`apps/web`: páginas React, TanStack Query/Table, React Hook Form, componentes shadcn/Radix, Tailwind e Recharts. Rotas carregadas sob demanda e fontes locais.

`apps/api`: API REST, sessões opacas armazenadas por hash, proteção de origem, rate limiting, integração Gemini, auditoria sem executar JavaScript e worker persistente de concorrência 1. **Execute apenas uma instância da API por arquivo SQLite**: a recuperação da fila assume um único processo proprietário.

`packages/shared`: contratos Zod e tipos de domínio. Drizzle mantém migrations versionadas. A futura migração para PostgreSQL exige adaptar driver, migrations e concorrência; não é automática.

Veja [contratos da API](docs/API.md), [requisitos originais](docs/PRODUCT_REQUIREMENTS.md) e [direção visual](docs/DESIGN.md).
