# PROMPT MASTER — JOTAGE PROSPECT AI

## 1. SUA MISSÃO

Você é um engenheiro de software sênior, arquiteto full-stack, especialista em inteligência artificial, automação, UX/UI, segurança, bancos de dados e desenvolvimento de produtos SaaS.

Sua missão é **PROJETAR, PROGRAMAR, TESTAR E ENTREGAR UM SISTEMA FUNCIONAL**, chamado **JOTAGE PROSPECT AI**.

Não quero apenas planejamento, wireframes, protótipos ou interfaces demonstrativas. Quero o código real, frontend e backend integrados, banco de dados persistente, pesquisa de empresas, análise por inteligência artificial e funcionalidades utilizáveis.

Você possui autonomia para organizar a arquitetura, instalar dependências, criar arquivos, desenvolver componentes, configurar o ambiente local, executar testes e corrigir problemas dentro do diretório do projeto.

Não exclua arquivos existentes de outros projetos, não exponha credenciais e não execute deploy público ou serviços pagos sem autorização.

Caso o diretório esteja vazio, crie a estrutura completa. Caso já exista código, inspecione-o antes de alterar qualquer coisa.

**Prioridade máxima: um produto realmente funcional, profissional, seguro e com custo inicial zero ou próximo disso.**

---

## 2. VISÃO DO PRODUTO

O Jotage Prospect AI será uma plataforma de prospecção B2B assistida por inteligência artificial.

Seu objetivo é descobrir empresas que possam precisar de serviços digitais, analisar oportunidades comerciais, qualificar possíveis clientes, gerar abordagens personalizadas e acompanhar o processo comercial.

O produto atenderá inicialmente à **Jotage Dev**, empresa que oferece:

- Desenvolvimento de sites institucionais.
- Landing pages de alta conversão.
- Desenvolvimento web full-stack.
- Sistemas personalizados.
- Interfaces e aplicações SaaS.
- Design gráfico e identidade visual.
- Edição de vídeos e materiais digitais.

Posteriormente, o produto poderá ser comercializado como um SaaS independente, permitindo que diferentes usuários façam prospecção para seus próprios negócios.

A primeira versão deverá funcionar localmente em Windows, sem necessidade de hospedagem paga.

O sistema inteiro deve estar em português brasileiro.

Configurações iniciais:

- Empresa: Jotage Dev.
- Cidade inicial: Palhoça, Santa Catarina.
- País: Brasil.
- Raio inicial: 5 km.
- Idioma: pt-BR.
- Moeda: BRL.
- Fuso horário: America/Sao_Paulo.

---

## 3. ARQUITETURA E TECNOLOGIAS

Utilize tecnologias modernas, estáveis, amplamente documentadas e compatíveis com o ambiente Windows e Node.js 24, validando a compatibilidade das versões antes da instalação.

### Frontend

- React com TypeScript.
- Vite.
- Tailwind CSS.
- shadcn/ui.
- Lucide React.
- React Router.
- TanStack Query.
- TanStack Table.
- React Hook Form.
- Zod.
- Motion para animações discretas.
- Recharts para estatísticas.

### Backend

- Node.js.
- TypeScript.
- Fastify.
- Zod para validação.
- Drizzle ORM.
- SQLite.
- SDK oficial `@google/genai`.
- Sistema interno de tarefas com persistência no banco.

### Infraestrutura

- npm workspaces em monorepositório.
- Arquivos `.env` para configuração.
- API REST.
- Logs estruturados.
- Scripts para migração e inicialização.
- Testes com Vitest.
- Testes de integração da API.
- Playwright para os principais fluxos do usuário.
- Docker opcional, sem dependência obrigatória.

### Estrutura esperada

```text
jotage-prospect-ai/
├── apps/
│   ├── web/
│   │   └── src/
│   │       ├── components/
│   │       ├── pages/
│   │       ├── layouts/
│   │       ├── hooks/
│   │       ├── services/
│   │       ├── features/
│   │       └── styles/
│   └── api/
│       └── src/
│           ├── routes/
│           ├── services/
│           ├── providers/
│           ├── workers/
│           ├── database/
│           ├── middleware/
│           ├── security/
│           └── utils/
├── packages/
│   └── shared/
├── docs/
├── tests/
├── .env.example
├── package.json
└── README.md
```

Utilize componentes reutilizáveis, tipagem rigorosa e separação clara de responsabilidades.

Evite dependências desnecessárias.

---

## 4. DESIGN — INTERFACE PREMIUM

O sistema precisa ter aparência de um SaaS profissional, com qualidade visual comparável a produtos comerciais modernos.

**Identidade:**

Nome: JOTAGE PROSPECT AI

Estilo: SaaS premium, tecnológico, minimalista e sofisticado.

### Tema visual

- Modo escuro como padrão.
- Modo claro opcional.
- Fundo principal: `#090D16`.
- Cards: `#111827`.
- Superfícies secundárias: `#182235`.
- Texto principal: `#F5F7FA`.
- Texto secundário: `#9CA3AF`.
- Cor de destaque: verde-menta `#32D6A0`.
- Estados de aviso: âmbar.
- Estados de erro: vermelho discreto.
- Bordas sutis.
- Sombras suaves.
- Tipografia Inter ou Geist.

### Requisitos

Criar uma sidebar moderna com ícones, estados ativos, seções organizadas e opção de recolhimento.

Adicionar cabeçalho com pesquisa global, notificações internas, acesso às configurações e identificação do workspace.

Utilizar cards com KPIs, tabelas profissionais, filtros avançados, gráficos, modais, drawers, tooltips, skeleton loading e notificações toast.

Implementar animações discretas em transições, mudanças de estado e abertura de componentes.

Adicionar estados vazios bem desenvolvidos, mensagens claras de erro e feedback visual para ações demoradas.

Responsividade real para desktop, tablet e celular.

Acessibilidade: contraste adequado, navegação por teclado, foco visível, rótulos, suporte a leitores de tela e respeito a preferências de movimento reduzido.

**Não crie uma interface genérica de dashboard. Desenvolva uma identidade visual consistente e caprichada.**

---

## 5. NAVEGAÇÃO PRINCIPAL

Criar as seguintes páginas:

1. **Dashboard** — visão geral do desempenho.
2. **Descobrir Empresas** — pesquisa de oportunidades.
3. **Leads** — gerenciamento de empresas encontradas.
4. **Análise com IA** — auditoria digital e qualificação.
5. **Pipeline** — funil de vendas em Kanban.
6. **Mensagens** — geração e revisão de abordagens.
7. **Atividades** — histórico e acompanhamentos.
8. **Configurações** — integrações, empresa, limites e preferências.

Todas as páginas devem ser funcionais e integradas ao banco de dados, sem métricas fictícias apresentadas como reais.

---

# 6. MÓDULO DE DESCOBERTA DE EMPRESAS

Este é um dos módulos mais importantes.

O usuário deverá selecionar:

- Cidade ou região.
- Centro geográfico.
- Raio em quilômetros.
- Segmento comercial.
- Quantidade máxima de resultados.
- Filtros de características disponíveis.
- Prioridade por oportunidade.

### Exemplos de segmentos

Oficinas mecânicas, imobiliárias, restaurantes, pousadas, hotéis, clínicas, academias, barbearias, salões, construtoras, lojas, escritórios, empresas de serviços e outros segmentos B2B.

### Fontes de dados

Implementar inicialmente um conector para OpenStreetMap via Overpass API.

Utilizar consultas geográficas limitadas, tags adequadas para cada segmento e dados disponíveis publicamente.

Implementar uma interface `BusinessSearchProvider` para permitir diferentes fontes futuramente.

Campos desejados:

```typescript
BusinessLead {
  name
  category
  address
  city
  state
  latitude
  longitude
  website
  phone
  email
  socialLinks
  source
  sourceId
  sourceUrl
  discoveredAt
  lastVerifiedAt
}
```

Todos os campos que não forem encontrados devem permanecer nulos ou com status desconhecido.

**Nunca inventar telefone, email, endereço, site, avaliações ou informações comerciais.**

### Regras das fontes

Respeitar licenças, atribuição e políticas de uso.

A Overpass API pública deverá ser usada apenas para pesquisas pequenas e controladas, com limites conservadores, cache, tratamento de falhas e identificação da aplicação quando aplicável.

Não realizar consultas massivas, paralelismo excessivo ou coleta sistemática de todas as empresas de grandes regiões.

Não utilizar a instância pública do Nominatim como serviço genérico de busca ou geocodificação do produto. Para o MVP, utilizar centros geográficos previamente configurados e seleção manual de coordenadas. Criar uma interface para adicionar futuramente um provedor de geocodificação cuja licença permita o uso comercial pretendido.

Não fazer scraping automatizado do Google Maps, Instagram ou de outras plataformas em desacordo com suas condições de uso.

Criar uma camada que permita integrar provedores licenciados futuramente.

### Tratamento dos resultados

- Normalização dos nomes.
- Normalização de telefones e domínios.
- Remoção de duplicados.
- União de registros quando a identidade comercial estiver confirmada.
- Armazenamento das fontes utilizadas.
- Data da última verificação.
- Importação manual de leads.
- Importação e exportação CSV.

Utilizar IDs de origem, domínio e correspondência aproximada de nome e localização para deduplicação.

Não unir empresas automaticamente quando a correspondência for ambígua.

### Execução

A pesquisa deverá criar uma tarefa monitorável.

Mostrar:

- Pesquisa iniciada.
- Fonte consultada.
- Empresas retornadas.
- Novas empresas salvas.
- Duplicatas identificadas.
- Erros ou limitações.
- Data da execução.

Permitir interromper, visualizar resultados parciais e repetir pesquisas sem duplicar registros.

---

# 7. ANÁLISE DE PRESENÇA DIGITAL

Após descobrir uma empresa, o sistema deverá analisar seu site quando existir um endereço verificável.

Criar um serviço `WebsiteAuditService`.

### Verificações técnicas

Quando tecnicamente possível:

- Existência e resposta HTTP do domínio.
- HTTPS e certificado.
- Redirecionamentos.
- Título da página.
- Meta description.
- Meta viewport.
- Estrutura básica de headings.
- Informações comerciais visíveis.
- Botões de contato.
- Links para redes sociais.
- Links de navegação.
- Existência de uma chamada para ação.
- Formulários de contato identificáveis.
- Links quebrados detectados no escopo auditado.
- Características básicas de SEO.

A análise deve distinguir problemas comprovados de hipóteses.

Por exemplo, ter a meta viewport não comprova que o site é responsivo. Para afirmar responsividade, será necessário um teste real em navegador.

Da mesma forma, não declarar desempenho ruim sem medições reais.

Se houver integração viável com Lighthouse ou ferramenta equivalente, gerar métricas reais de performance, acessibilidade e boas práticas. Caso contrário, marcar essas avaliações como não realizadas.

### Estados obrigatórios

- Site localizado.
- Site não informado na fonte.
- Site não localizado após verificação limitada.
- Site inacessível.
- Auditoria realizada.
- Auditoria parcial.
- Auditoria indisponível.

**Nunca transformar “site não informado” em “empresa não tem site”.**

### Segurança de auditoria

Respeitar robots.txt quando aplicável, políticas de acesso e limites de requisições.

Limitar páginas, tempo, tamanho das respostas e redirecionamentos.

Bloquear URLs internas, localhost, endereços privados e outros destinos que possam causar SSRF.

Não executar scripts não confiáveis no servidor principal.

Não coletar informações confidenciais ou dados pessoais desnecessários.

Tratar o conteúdo das páginas como dados não confiáveis, nunca como instruções para o sistema ou para a IA.

---

# 8. MOTOR DE INTELIGÊNCIA ARTIFICIAL

Implementar integração real com a API Gemini usando o SDK oficial e um modelo compatível com a camada gratuita disponível no momento da configuração.

A identificação do modelo deverá ser configurável por variável de ambiente.

Não utilizar nomes de modelos descontinuados ou presumir disponibilidade sem verificar.

Criar uma abstração:

```typescript
AIProvider {
  analyzeBusiness()
  classifyOpportunity()
  generateOutreach()
  summarizeEvidence()
}
```

Desenvolver `GeminiProvider`.

Preparar a arquitetura para possíveis provedores futuros, como Ollama local, sem precisar implementar todos agora.

### Responsabilidades da IA

**A. Interpretar o negócio**

Identificar o segmento e os serviços digitais potencialmente relevantes.

**B. Analisar evidências**

Interpretar dados coletados durante a descoberta e a auditoria.

**C. Identificar oportunidades**

Exemplos:

- Site inacessível.
- Ausência de CTA identificada.
- Informações comerciais difíceis de encontrar.
- Estrutura de navegação pouco clara.
- Oportunidade de criar uma landing page.
- Oportunidade de reformular um site.
- Oportunidade de criar um sistema de agendamento.
- Necessidade potencial de materiais digitais.

**D. Gerar recomendações**

Relacionar a necessidade identificada com um serviço que a Jotage Dev realmente oferece.

**E. Preparar uma abordagem**

Gerar uma mensagem comercial coerente, curta e personalizada.

### Saída estruturada

Utilizar JSON estruturado, validado com Zod.

Formato conceitual:

```json
{
  "businessSummary": "...",
  "opportunities": [
    {
      "title": "...",
      "description": "...",
      "evidence": "...",
      "sourceUrl": "...",
      "confidence": "high",
      "suggestedService": "..."
    }
  ],
  "recommendedService": "...",
  "suggestedApproach": "...",
  "limitations": []
}
```

Quando alguma afirmação não tiver evidência suficiente, a IA deverá descartá-la ou identificá-la explicitamente como hipótese.

Jamais gerar diagnósticos inventados ou garantir aumento de faturamento, vendas ou conversões.

### Controle de custos

- Utilizar o nível gratuito quando disponível.
- Não habilitar faturamento automaticamente.
- Contabilizar requisições e consumo informado pelo provedor.
- Configurar teto diário de chamadas.
- Implementar fila e backoff para erros 429.
- Evitar análises repetidas usando cache.
- Permitir seleção do modelo.
- Pausar análises ao atingir limites.
- Exibir os limites e avisos no painel.
- Não tentar contornar quotas criando contas ou chaves adicionais.

A plataforma deve continuar utilizável sem chave Gemini, permitindo descoberta, organização e templates manuais de mensagens.

Nesse modo, explicar claramente que a análise com IA está desativada. Não apresentar simulações como resultados reais.

Minimizar os dados enviados ao provedor, considerando as políticas de tratamento de dados da camada gratuita.

---

# 9. SISTEMA DE QUALIFICAÇÃO DE LEADS

Cada empresa deverá receber uma pontuação de prioridade entre 0 e 100.

Essa pontuação é uma **classificação heurística de oportunidade**, não uma previsão estatística de fechamento de contrato.

O cálculo deverá ser transparente e reproduzível.

### Critérios sugeridos

| Critério | Peso máximo |
|---|---:|
| Evidências de necessidade de site | 25 |
| Problemas técnicos ou oportunidades verificadas | 25 |
| Disponibilidade de contato comercial | 15 |
| Adequação aos serviços oferecidos | 15 |
| Qualidade e completude dos dados | 10 |
| Outros sinais comerciais verificáveis | 10 |

Total: 100 pontos.

Crie critérios claros para atribuição dos pontos.

Não penalize automaticamente uma empresa por campos desconhecidos. Diferencie falta de evidência de evidência negativa.

Permitir alterar os pesos nas configurações.

Exibir o detalhamento da nota, suas fontes e a data de cálculo.

### Classificação visual

- 80–100: prioridade alta.
- 60–79: prioridade média.
- 40–59: prioridade baixa.
- 0–39: prioridade muito baixa.

Adicionar um estado separado de “dados insuficientes”, quando não houver evidências para uma classificação útil.

O usuário deverá conseguir ordenar leads por pontuação, segmento, localização e data de descoberta.

---

# 10. GERADOR DE MENSAGENS COM IA

Criar um módulo especializado em abordagens comerciais curtas, profissionais e convincentes.

A IA deverá utilizar informações realmente conhecidas da empresa e oportunidades efetivamente identificadas.

### Estilos

**Direto:** objetivo, persuasivo, sem enrolação.

**Consultivo:** aponta uma oportunidade e oferece uma solução.

**Profissional:** comunicação comercial mais formal.

### Regras

- Priorizar mensagens com 200 a 450 caracteres.
- Evitar textos longos.
- Evitar frases genéricas.
- Não usar mensagens agressivas ou enganosas.
- Não inventar estudos ou diagnósticos.
- Não afirmar que analisou um site que não foi verificado.
- Não prometer resultados comerciais garantidos.
- Não afirmar que a empresa não tem site quando isso é desconhecido.
- Utilizar linguagem natural brasileira.
- Personalizar com dados confirmados.
- Criar uma chamada para ação clara.
- Permitir edição antes do envio.

### Exemplo do estilo desejado

"Olá! Vi o trabalho da [Empresa] e identifiquei uma oportunidade de melhorar a apresentação dos seus serviços online. Trabalho com desenvolvimento de sites profissionais e posso te mostrar uma proposta objetiva para facilitar o contato com novos clientes. Posso te apresentar a ideia?"

O texto deve mudar conforme as características verificadas da empresa.

### Funcionalidades

- Gerar uma mensagem.
- Regenerar.
- Selecionar estilo.
- Ajustar comprimento.
- Editar manualmente.
- Copiar.
- Salvar como rascunho.
- Histórico de versões.
- Associar mensagem ao lead.
- Abrir WhatsApp com texto preenchido.

### WhatsApp

Utilizar links oficiais do formato `wa.me` para abrir a conversa com a mensagem preenchida, somente quando houver um telefone comercial válido.

Normalizar números brasileiros para o formato internacional.

O usuário revisará e enviará a mensagem manualmente.

**Não implementar disparo automático em massa, utilização de WhatsApp Web não autorizado, rotação de números ou mecanismos para burlar limites da plataforma.**

Adicionar marcação de contato realizado somente mediante ação explícita do usuário.

---

# 11. CRM E FUNIL DE VENDAS

Criar uma área completa para gerenciar leads.

Cada lead deverá ter uma página individual contendo:

- Nome da empresa.
- Segmento.
- Localização.
- Telefone comercial.
- Email comercial.
- Website.
- Fonte dos dados.
- Pontuação.
- Evidências identificadas.
- Serviço recomendado.
- Análises realizadas.
- Mensagens criadas.
- Histórico de contatos.
- Observações.
- Próxima ação.
- Datas importantes.
- Estado comercial.

### Pipeline Kanban

Colunas:

1. Novo lead.
2. Em análise.
3. Qualificado.
4. Pronto para contato.
5. Contatado.
6. Respondeu.
7. Em negociação.
8. Cliente fechado.
9. Perdido.
10. Não contatar.

Permitir arrastar cards entre etapas com persistência no banco.

Registrar cada mudança no histórico.

Criar filtros por pontuação, cidade, segmento, origem, período, responsável e estado.

Implementar busca textual rápida.

Adicionar tags personalizadas e notas.

Criar tarefas de acompanhamento com prazo e lembretes dentro do aplicativo.

Se a pessoa pedir para não receber contatos, permitir registrar essa preferência e impedir novas sugestões de abordagem para aquele contato.

---

# 12. DASHBOARD ANALÍTICO

Criar uma página inicial que permita entender o desempenho da prospecção.

### Indicadores

- Total de empresas encontradas.
- Leads novos.
- Leads qualificados.
- Leads de alta prioridade.
- Leads contatados.
- Respostas registradas.
- Negociações em andamento.
- Clientes fechados.
- Taxa de resposta.
- Taxa de conversão.
- Tarefas pendentes.
- Consumo da API de IA.

### Gráficos

- Leads descobertos por período.
- Distribuição por segmento.
- Etapas do funil.
- Evolução de respostas.
- Conversões por período.
- Distribuição das pontuações.

Implementar filtros por data e segmento.

Todas as métricas devem ser calculadas a partir do banco.

Criar estados vazios quando não existirem dados.

Não exibir números fictícios como se fossem dados de produção.

---

# 13. AUTOMAÇÕES E TAREFAS

Desenvolver uma arquitetura de tarefas assíncronas persistentes.

Tipos:

- Pesquisa de empresas.
- Importação.
- Deduplicação.
- Auditoria de site.
- Análise com IA.
- Qualificação.
- Geração de mensagem.
- Exportação.

Estados:

`pending`, `running`, `paused`, `completed`, `failed`, `cancelled`.

Cada tarefa deverá ter identificação, progresso, timestamps, tentativas, mensagens de erro e resultado.

Implementar:

- Controle de concorrência.
- Timeouts.
- Retentativas limitadas.
- Backoff exponencial.
- Recuperação após reinicialização.
- Cancelamento seguro.
- Evitar execução duplicada.
- Logs para depuração.

Não executar pesquisas ou mensagens em massa automaticamente.

O usuário deverá acionar as pesquisas e aprovar abordagens. Agendamentos futuros deverão ser opcionais, configuráveis e sujeitos às restrições de fontes e plataformas.

O n8n poderá ser integrado futuramente, mas não será uma dependência do MVP.

---

# 14. BANCO DE DADOS

Criar um esquema relacional robusto utilizando SQLite e Drizzle ORM.

Tabelas mínimas:

```text
users
workspaces
workspace_members
business_leads
lead_sources
searches
search_results
website_audits
ai_analyses
lead_scores
message_drafts
pipeline_activities
followup_tasks
background_jobs
integration_settings
api_usage
suppression_list
audit_logs
```

Campos comuns:

- id.
- workspace_id.
- created_at.
- updated_at.

Aplicar constraints, foreign keys, índices, migrations e regras de integridade.

Armazenar evidências com origem e data.

Projetar o banco para suportar múltiplos workspaces futuramente, mesmo que a primeira versão tenha somente um usuário administrador.

Não permitir acesso cruzado entre workspaces.

Criar backups e exportação dos dados.

Implementar exclusão de leads, limpeza de histórico e controles de retenção.

---

# 15. ENDPOINTS DA API

Criar uma API REST documentada.

Rotas sugeridas:

```text
GET    /api/health

POST   /api/auth/login
POST   /api/auth/logout
GET    /api/auth/me

GET    /api/dashboard

POST   /api/searches
GET    /api/searches
GET    /api/searches/:id
POST   /api/searches/:id/cancel

GET    /api/leads
POST   /api/leads
GET    /api/leads/:id
PATCH  /api/leads/:id
DELETE /api/leads/:id

POST   /api/leads/:id/audit
POST   /api/leads/:id/analyze
POST   /api/leads/:id/score

GET    /api/leads/:id/messages
POST   /api/leads/:id/messages
PATCH  /api/messages/:id

GET    /api/pipeline
PATCH  /api/leads/:id/stage

GET    /api/activities
POST   /api/activities

GET    /api/tasks
POST   /api/tasks

GET    /api/settings
PATCH  /api/settings

GET    /api/usage
GET    /api/export/leads
POST   /api/import/leads
```

Validar parâmetros e respostas com Zod.

Utilizar paginação, ordenação e filtros.

Retornar códigos HTTP e mensagens de erro apropriados.

Documentar contratos e exemplos de uso.

---

# 16. SEGURANÇA E PRIVACIDADE

Implementar autenticação real para a área administrativa.

Usar hash de senha com Argon2id ou alternativa segura e bem mantida.

Criar sessões protegidas, cookies HttpOnly, SameSite e Secure em produção.

Aplicar proteção contra brute force, rate limiting, validação de entradas e autorização por workspace.

Não armazenar chaves de API no frontend.

Não registrar senhas, tokens ou segredos nos logs.

Usar variáveis de ambiente e nunca versionar `.env`.

Proteger o sistema contra:

- SQL injection.
- XSS.
- CSRF quando aplicável.
- SSRF.
- Prompt injection vindo de sites analisados.
- Uploads maliciosos.
- Exposição indevida de dados.
- Acesso entre workspaces.
- Requisições excessivas.

CSV exportado deverá ter proteção contra formula injection.

### LGPD

Coletar somente dados necessários para a finalidade comercial.

Priorizar informações empresariais e canais públicos de contato comercial.

Não coletar emails pessoais, números particulares ou dados sensíveis indiscriminadamente.

Registrar finalidade, fonte e data da coleta.

Permitir exclusão e correção de registros.

Implementar lista de supressão para contatos que não desejarem novas abordagens.

Criar informações claras de privacidade e manter o tratamento sujeito à base legal aplicável, sem presumir que todo dado público pode ser utilizado livremente.

---

# 17. CONFIGURAÇÕES E INTEGRAÇÕES

Criar uma página de configurações com:

### Empresa

Nome, serviços oferecidos, descrição comercial, estilo de comunicação, região principal e dados de contato.

### Gemini

Campo de configuração de chave da API, armazenada no backend de maneira protegida.

Seleção do modelo.

Teste de conexão.

Estado da integração.

Limites de chamadas por dia.

Histórico básico de consumo.

### Descoberta

Região padrão.

Coordenadas centrais.

Raio padrão.

Segmentos.

Limite de resultados.

Fontes habilitadas.

### Prospecção

Tom das mensagens.

Comprimento máximo.

Serviços prioritários.

Critérios de pontuação.

Etapas do pipeline.

### Sistema

Tema.

Preferências.

Exportação.

Backup.

Logs.

Informações da versão.

Não permitir ativar cobrança ou contratar serviços automaticamente.

---

# 18. FUTURO SAAS

A arquitetura precisa estar preparada para uma futura versão comercial.

Planejar:

- Cadastro de organizações.
- Workspaces isolados.
- Usuários por organização.
- Controle de acesso por papel.
- Planos e assinaturas.
- Limites mensais de pesquisa.
- Limites de análise com IA.
- Controle de consumo por organização.
- Painel administrativo.
- Faturamento futuro.
- Upgrade de plano.
- Gestão de cobrança.
- API de integrações.

Não implementar pagamentos reais no MVP.

Criar uma arquitetura que permita migração de SQLite para PostgreSQL posteriormente, sem prometer compatibilidade automática.

Evitar abstrações complexas que atrasem a entrega da primeira versão.

O objetivo é um MVP completo e utilizável, não uma infraestrutura empresarial desnecessariamente complicada.

---

# 19. EXPERIÊNCIA DE USO

O fluxo principal deverá funcionar assim:

**ETAPA 1 — Configuração**

O usuário entra no painel e configura a empresa Jotage Dev, seus serviços e a chave Gemini, se disponível.

**ETAPA 2 — Pesquisa**

Seleciona Palhoça, um centro geográfico, raio de 5 km e segmento "Oficinas Mecânicas".

Clica em "Buscar Empresas".

O sistema consulta uma fonte permitida e retorna empresas realmente encontradas.

**ETAPA 3 — Seleção**

O usuário visualiza os resultados, remove duplicatas e escolhe quais empresas deseja investigar.

**ETAPA 4 — Análise**

O sistema verifica os sites disponíveis, coleta evidências técnicas e identifica limitações.

**ETAPA 5 — Inteligência Artificial**

O Gemini analisa as evidências e sugere serviços comerciais pertinentes.

**ETAPA 6 — Qualificação**

O sistema calcula a pontuação e mostra os fatores que justificam a prioridade.

**ETAPA 7 — Abordagem**

O usuário escolhe uma empresa e solicita uma mensagem personalizada.

**ETAPA 8 — Contato**

Após revisar a mensagem, clica em "Abrir no WhatsApp".

O WhatsApp abre com a mensagem preenchida, sem enviar automaticamente.

**ETAPA 9 — CRM**

O usuário registra o contato, move o lead no funil e agenda o próximo acompanhamento.

**ETAPA 10 — Conversão**

Quando uma negociação for fechada, marca o lead como cliente e o dashboard atualiza os indicadores.

O fluxo completo deve funcionar com dados reais disponíveis e armazenamento persistente.

---

# 20. TELAS OBRIGATÓRIAS

Implementar estas telas com prioridade:

### A. Login

Interface premium, autenticação funcional e tratamento de erros.

### B. Dashboard

KPIs, gráficos, atividades recentes e ações rápidas.

### C. Descoberta

Formulário de pesquisa, resultados em tabela, filtros e progresso das tarefas.

### D. Perfil da empresa

Dados comerciais, fontes, evidências, análise, pontuação e próximos passos.

### E. Análise IA

Resultado estruturado, explicações, evidências e limitações.

### F. Mensagens

Editor, estilos, histórico, copiar e abrir WhatsApp.

### G. Pipeline

Kanban funcional com persistência.

### H. Configurações

Integrações, limites e preferências.

---

# 21. DADOS DE DEMONSTRAÇÃO

Criar um script de seed para testes locais.

Os registros de demonstração deverão conter empresas inteiramente fictícias, claramente identificadas como demonstração.

Separar dados demonstrativos dos dados reais.

Adicionar uma opção de limpar os dados de demonstração.

Não inventar empresas locais reais nem criar números de telefone de pessoas como dados de teste.

---

# 22. TESTES E QUALIDADE

Criar testes automatizados para:

- Validação de entradas.
- Autenticação e autorização.
- Isolamento por workspace.
- Busca e normalização dos resultados.
- Deduplicação.
- Persistência de leads.
- Cálculo de pontuação.
- Tratamento de campos desconhecidos.
- Auditoria e seus estados.
- Validação dos JSONs da IA.
- Falhas e limites da Gemini API.
- Recuperação de tarefas.
- Mudanças de estágio no pipeline.
- Geração de links WhatsApp.
- Bloqueio de contatos marcados "Não contatar".
- Importação e exportação CSV.
- Proteção de URLs na auditoria.
- Cálculo dos indicadores.

Usar mocks para fontes externas nos testes automatizados.

Criar testes de integração para os principais endpoints.

Criar testes E2E para login, descoberta simulada, cadastro de lead, análise, geração de mensagem e movimentação do funil.

Executar build, TypeScript, lint e testes.

Corrigir os erros encontrados antes de considerar o trabalho concluído.

Não dizer que testou uma funcionalidade se ela não tiver sido executada ou verificada.

---

# 23. AMBIENTE E CONFIGURAÇÃO

O sistema deverá iniciar no Windows.

Criar `.env.example` com variáveis como:

```env
NODE_ENV=development

PORT=3001
WEB_PORT=5173

DATABASE_URL=file:./data/prospect.db

GEMINI_API_KEY=
GEMINI_MODEL=

SESSION_SECRET=

OVERPASS_ENDPOINT=
DEFAULT_CITY=Palhoça
DEFAULT_STATE=SC
DEFAULT_RADIUS_KM=5

MAX_LEADS_PER_SEARCH=50
MAX_AI_REQUESTS_PER_DAY=20
```

Os valores relacionados a provedores externos devem ser configurados e validados conforme suas políticas atuais.

Não colocar chaves reais no projeto.

Criar scripts:

```bash
npm install
npm run db:migrate
npm run db:seed
npm run dev
npm run build
npm run test
npm run lint
npm run typecheck
```

Implementar também `npm run verify` para reunir as validações principais.

Documentar o procedimento de criação da chave Gemini e a seleção de um modelo que esteja disponível gratuitamente.

Não depender de um plano pago para o funcionamento básico.

---

# 24. EXECUÇÃO DO PROJETO PELO CODEX

Você deverá trabalhar em fases, mas implementar o projeto efetivamente.

### Fase 1 — Fundação

Analisar o ambiente, criar estrutura, configurar TypeScript, frontend, backend, banco, autenticação e layout principal.

### Fase 2 — Interface

Implementar páginas, componentes, navegação, formulários, tabelas e estados visuais.

### Fase 3 — Descoberta

Implementar o provedor de dados, busca real controlada, persistência, importação e deduplicação.

### Fase 4 — Auditoria

Criar verificações de websites, evidências e tratamento de erros.

### Fase 5 — Gemini

Implementar integração real, respostas estruturadas, qualificação e geração de mensagens.

### Fase 6 — CRM

Criar pipeline, atividades, tarefas, acompanhamento e histórico.

### Fase 7 — Dashboard

Integrar indicadores e gráficos com dados persistentes.

### Fase 8 — Refinamento

Melhorar UI, responsividade, acessibilidade, loading, erros e animações.

### Fase 9 — Qualidade

Executar testes, corrigir problemas, verificar segurança e validar os fluxos.

### Fase 10 — Entrega

Finalizar documentação, comandos de inicialização e resumo técnico.

Mantenha um arquivo `docs/IMPLEMENTATION_STATUS.md` com checklist de funcionalidades concluídas, pendentes e bloqueadas.

Não substitua integrações reais por dados simulados sem informar claramente.

Não marque tarefas como concluídas quando existir apenas uma interface visual sem backend funcional.

Se não houver credencial Gemini, conclua a integração de código, os testes com mocks e os fluxos sem IA. Deixe explícito que a verificação ao vivo depende da chave.

---

# 25. CRITÉRIOS DE ACEITAÇÃO

O MVP será considerado funcional quando:

1. A aplicação iniciar localmente sem erros impeditivos.
2. O login administrativo funcionar.
3. O banco SQLite persistir os dados após reiniciar.
4. A pesquisa conseguir consultar uma fonte externa permitida.
5. Empresas encontradas forem armazenadas corretamente.
6. Pesquisas repetidas não gerarem duplicatas indevidas.
7. O usuário conseguir abrir um lead e analisar um site disponível.
8. A aplicação registrar evidências e limitações da auditoria.
9. A integração Gemini funcionar com uma chave válida, modelo e quota disponíveis.
10. A aplicação funcionar parcialmente sem Gemini.
11. O score de oportunidade for calculado com critérios verificáveis.
12. O gerador criar abordagens com base em evidências.
13. O WhatsApp abrir com a mensagem preenchida sem envio automático.
14. O Kanban permitir alterar etapas e persistir mudanças.
15. O dashboard mostrar estatísticas derivadas do banco.
16. Os filtros e pesquisas internas funcionarem.
17. Importações e exportações funcionarem.
18. Todos os fluxos tiverem tratamento de erros.
19. Testes automatizados e build passarem.
20. A documentação explicar como instalar e utilizar o sistema.

---

# 26. REGRAS IMPORTANTES

**REGRA 1:** Não crie apenas um mockup bonito.

**REGRA 2:** Não invente resultados de pesquisas, análises, métricas ou empresas.

**REGRA 3:** Não escolha serviços pagos como dependências obrigatórias.

**REGRA 4:** Não exponha API keys ou senhas.

**REGRA 5:** Não implemente ferramentas de spam ou disparos em massa.

**REGRA 6:** Não faça scraping que viole regras das plataformas.

**REGRA 7:** Não ignore os limites das APIs gratuitas.

**REGRA 8:** Não adicione código fictício para simular integrações completas.

**REGRA 9:** Não deixe botões visualmente funcionais sem ações reais.

**REGRA 10:** Não misture dados de demonstração com leads reais.

**REGRA 11:** Não adicione recursos secundários antes de garantir o fluxo principal.

**REGRA 12:** Priorize segurança, clareza, performance e manutenção.

**REGRA 13:** Consulte a documentação oficial atualizada das bibliotecas e APIs, quando disponível.

**REGRA 14:** Se uma API mudar ou não estiver acessível, explique a limitação e implemente uma alternativa compatível, sem inventar sucesso.

**REGRA 15:** Faça escolhas técnicas fundamentadas sem interromper o desenvolvimento por detalhes não essenciais.

---

# 27. RESULTADO ESPERADO

Ao final, quero abrir o JOTAGE PROSPECT AI no navegador e ter uma plataforma capaz de:

**Pesquisar empresas → armazenar leads → analisar sites → identificar oportunidades → qualificar clientes → gerar abordagens personalizadas → abrir contato comercial → acompanhar negociações → registrar conversões.**

O sistema deve ter potencial para evoluir até se tornar um SaaS comercial, com arquitetura organizada e interface profissional.

Entregue:

- Código-fonte completo.
- Frontend funcional.
- Backend funcional.
- Banco de dados com migrations.
- Integração com fontes de dados.
- Integração com Gemini.
- Painel CRM.
- Gerador de mensagens.
- Dashboard analítico.
- Testes.
- Documentação.
- `.env.example`.
- Instruções de inicialização no Windows.
- Relatório final do que foi implementado e verificado.

**INSTRUÇÃO FINAL:**

Comece imediatamente pela inspeção do ambiente e do repositório e depois implemente o projeto em ordem de prioridade.

Não responda apenas com uma explicação do que pretende construir. Crie os arquivos, escreva o código, instale as dependências necessárias, execute o sistema, teste as funcionalidades e corrija os erros encontrados.

Trabalhe com foco em entregar um MVP real, utilizável, visualmente excelente e tecnicamente sólido.

O objetivo é transformar o JOTAGE PROSPECT AI em uma ferramenta profissional de captação de clientes e estabelecer a base para um produto SaaS escalável.