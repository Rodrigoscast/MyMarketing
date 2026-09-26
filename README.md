# MyMarketing

O MyMarketing organiza o fluxo de vídeos do YouTube: conecta canais, guarda os arquivos e metadados, agenda publicações e reúne métricas e comentários. A integração funcional hoje é com o YouTube; outras plataformas ainda não têm o fluxo completo de publicação.

## Como funciona

O projeto tem duas partes: a interface Next.js (`apps/web`) e a API Express (`apps/api`). O navegador conversa com a API, que valida a sessão e a organização do usuário antes de acessar o Supabase ou os serviços do Google.

Depois de conectar um canal pelo OAuth, dá para enviar um vídeo, escolher a privacidade e publicar na hora ou agendar. **Com a API ligada, a fila de agendamentos é verificada ao iniciar e depois a cada minuto.** Quando chega o horário, o worker envia o vídeo ao YouTube. Se a API estiver desligada, a publicação fica aguardando até ela voltar.

Após conectar um canal ou publicar, a API também inicia uma coleta de analytics em segundo plano. Ela sincroniza o catálogo do canal e busca métricas e comentários.

## Estrutura

```text
.
├── apps/
│   ├── api/
│   │   └── src/
│   │       ├── jobs/             # Jobs de analytics em segundo plano
│   │       ├── lib/              # Supabase, criptografia e tratamento de erros
│   │       ├── modules/
│   │       │   ├── analytics/    # Métricas, comentários e quota
│   │       │   ├── auth/         # Cadastro, login e validação da sessão
│   │       │   ├── channels/     # OAuth e sincronização do YouTube
│   │       │   ├── scheduler/    # Fila e worker de publicação
│   │       │   └── videos/       # Upload, metadados e publicação
│   │       ├── routers/          # Rotas da API
│   │       └── server.ts         # Inicialização da API e do scheduler
│   └── web/
│       └── src/
│           ├── app/              # Páginas e rotas do Next.js
│           ├── components/       # Componentes compartilhados
│           └── lib/              # Cliente da API e sessão local
├── docs/                         # Requisitos e fluxo do sistema
├── supabase/
│   ├── migrations/               # Migrações SQL, em ordem numérica
│   └── schema.sql                # Schema base
├── package.json                  # Workspaces e comandos do projeto
└── README.md
```

## Tecnologias

| Parte | Tecnologias |
| --- | --- |
| Interface | Next.js, React, TypeScript, CSS, Lucide |
| Gráficos e datas | Recharts, date-fns |
| API | Node.js, Express, TypeScript, Zod |
| Dados e autenticação | Supabase Auth, PostgreSQL |
| YouTube | Google OAuth, YouTube Data API v3, YouTube Analytics API v2 |

## Rodar localmente

Você vai precisar de Node.js, npm e um projeto Supabase. Para conectar um canal, configure também um cliente OAuth no Google Cloud Console e habilite as APIs do YouTube Data e Analytics.

Instale as dependências na raiz:

```bash
npm install
```

No SQL Editor do Supabase, execute as migrações em ordem: `001_initial_schema.sql`, `002_youtube_tables.sql` e `003_quota_tracking.sql`, todas em `supabase/migrations`.

Crie `apps/api/.env` a partir de `apps/api/.env.example`. Preencha `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY`. Para a conexão do YouTube, configure `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` e `GOOGLE_REDIRECT_URI`. O callback local é `http://localhost:3333/api/channels/youtube/callback`; cadastre essa URL também no Google Cloud Console. Gere `ENCRYPTION_KEY` com:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Se a API usar outro endereço, defina `NEXT_PUBLIC_API_URL` em `apps/web/.env.local`. Inicie os dois serviços pela raiz:

```bash
npm run dev
```

A interface fica em <http://localhost:3000>; a API, em <http://localhost:3333>. `/api/health` verifica se a API está ativa. Para rodar uma parte isoladamente, use `npm run dev:web` ou `npm run dev:api`. Também estão disponíveis `npm run build` e `npm run typecheck`.

## Telas

| Rota | O que tem |
| --- | --- |
| `/app` | Painel da organização |
| `/app/canais` | Canais conectados |
| `/app/videos` | Biblioteca e publicação |
| `/app/calendario` | Agenda editorial |
| `/app/analytics` | Métricas e comentários |

## Notas de operação

Os vídeos são gravados no disco da máquina da API; os caminhos e metadados ficam no Supabase. Em hospedagens com disco temporário, os arquivos podem ser perdidos. Usar armazenamento em nuvem exige adaptar essa parte.

O scheduler roda dentro do processo da API, sem serviço externo. Isso funciona enquanto a API está ligada; a verificação tem intervalo de até um minuto. O estado dos jobs de analytics também fica em memória e é perdido se o processo reiniciar.

Para mais detalhes, consulte `docs/system-flow.md` e os arquivos em `supabase/migrations`.
