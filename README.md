# MyMarketing

O MyMarketing é onde organizamos o fluxo de vídeos do YouTube: conectamos o canal, preparamos o vídeo, escolhemos quando e como publicar e acompanhamos os resultados depois.

Hoje o foco está no YouTube. A estrutura já prevê outras plataformas, mas conexão, publicação e analytics estão implementados para YouTube.

## Como está organizado

É um monorepo npm com duas aplicações. `apps/web` é a interface em Next.js e `apps/api` é uma API Express que concentra autenticação, acesso ao Supabase e integração com o Google. O frontend conversa com a API; não acessa o banco diretamente.

Na API, cada domínio fica em `src/modules`: `auth`, `channels`, `videos`, `scheduler` e `analytics`. As páginas do produto ficam em `apps/web/src/app/app`, e os componentes compartilhados em `apps/web/src/components`.

O caminho mais comum é conectar um canal pelo OAuth do Google, enviar o arquivo, preencher os metadados e publicar ou agendar. A API guarda os dados no Supabase e envia o vídeo ao YouTube. Depois da conexão ou de uma publicação, começa uma coleta em segundo plano de vídeos, métricas e comentários.

## Stack

Next.js, React e TypeScript no frontend; Node.js, Express e TypeScript na API; Supabase Auth e PostgreSQL para contas e dados; Google APIs para YouTube; Multer para receber arquivos. CSS, Recharts, date-fns e Lucide cuidam da interface.

## Rodar localmente

Você vai precisar de Node.js, npm e um projeto Supabase. Para conectar o YouTube, também configure um cliente OAuth no Google Cloud Console e habilite YouTube Data API v3 e YouTube Analytics API.

Instale as dependências na raiz:

```bash
npm install
```

No SQL Editor do Supabase, aplique as migrações em ordem: `001_initial_schema.sql`, `002_youtube_tables.sql` e `003_quota_tracking.sql`, dentro de `supabase/migrations`.

Crie `apps/api/.env` usando `apps/api/.env.example` como referência. Preencha `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY`; para YouTube, configure também `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` e `GOOGLE_REDIRECT_URI`. Em desenvolvimento, o callback é `http://localhost:3333/api/channels/youtube/callback`. Gere `ENCRYPTION_KEY` com:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Se a API não estiver em `localhost:3333`, configure `NEXT_PUBLIC_API_URL` em `apps/web/.env.local`. Depois, na raiz:

```bash
npm run dev
```

A interface abre em <http://localhost:3000> e a API em <http://localhost:3333>. O endpoint `/api/health` confirma que a API está de pé. `npm run dev:web` e `npm run dev:api` iniciam cada parte separadamente; `npm run build` e `npm run typecheck` executam nos dois workspaces.

## Algumas decisões práticas

Os arquivos ficam no disco da máquina da API, e os caminhos ficam no banco. Em hospedagens com disco temporário, os uploads podem sumir; armazenamento em nuvem ainda exige adaptar essa parte.

A fila de analytics vive na memória da API. Já o worker de publicação agendada não tem cron embutido: em produção, é preciso configurá-lo para rodar periodicamente.

As páginas principais são `/app`, `/app/canais`, `/app/videos`, `/app/calendario` e `/app/analytics`. Para detalhes das tabelas e do fluxo, veja `supabase/migrations` e `docs/system-flow.md`.
