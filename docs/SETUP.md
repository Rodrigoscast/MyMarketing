# Setup do MyMarketing

## 1. Instalar dependencias

```bash
npm install
```

## 2. Criar o banco no Supabase

1. Crie um projeto no Supabase.
2. Abra o SQL Editor.
3. Execute o arquivo `supabase/schema.sql`.
4. Copie a URL do projeto e as chaves em Project Settings > API.

## 3. Configurar backend

Crie `apps/api/.env` com:

```bash
PORT=3333
WEB_ORIGIN=http://localhost:3000
SUPABASE_URL=https://seu-projeto.supabase.co
SUPABASE_SERVICE_ROLE_KEY=sua-service-role-key
```

A `SERVICE_ROLE_KEY` deve ficar somente no backend.

## 4. Configurar frontend

Crie `apps/web/.env.local` com:

```bash
NEXT_PUBLIC_API_URL=http://localhost:3333
NEXT_PUBLIC_SUPABASE_URL=https://seu-projeto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sua-anon-key
```

## 5. Rodar localmente

```bash
npm run dev
```

Rotas principais:

- Landing page: `http://localhost:3000`
- Login: `http://localhost:3000/login`
- Cadastro: `http://localhost:3000/cadastro`
- Sistema: `http://localhost:3000/app`

## Observacao sobre integracoes

As tabelas para Google Ads, Meta Ads e contas sociais ja estao preparadas. A primeira versao do backend expoe endpoints base e guarda referencias seguras; os tokens reais devem ser obtidos via OAuth dos provedores e armazenados como referencias criptografadas ou em um cofre de segredos.
