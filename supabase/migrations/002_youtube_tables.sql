-- Migração 002: Tabelas específicas do YouTube
-- Adiciona tabelas para vídeos, métricas e comentários do YouTube

-- Tipo de status do vídeo no YouTube
do $$
begin
  create type public.youtube_video_status as enum ('draft', 'scheduled', 'publishing', 'published', 'failed', 'cancelled');
exception when duplicate_object then null;
end $$;

-- Vídeos do YouTube (detalhes específicos da plataforma)
create table if not exists public.youtube_videos (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  social_account_id uuid not null references public.social_accounts(id) on delete cascade,
  asset_id uuid references public.content_assets(id) on delete set null,
  scheduled_post_id uuid references public.scheduled_posts(id) on delete set null,

  -- Metadados do vídeo
  title text not null,
  description text not null default '',
  tags text[] not null default '{}',
  category_id text not null default '22', -- People & Blogs
  privacy_status text not null default 'private', -- private, unlisted, public
  publish_at timestamptz, -- agendamento nativo do YouTube
  made_for_kids boolean not null default false,
  license text not null default 'youtube', -- youtube, creativeCommon
  language text not null default 'pt',
  recording_date timestamptz,
  location_lat numeric(9, 6),
  location_lng numeric(9, 6),
  playlist_id text,
  thumbnail_path text, -- caminho local do thumbnail

  -- Status e IDs do YouTube
  status public.youtube_video_status not null default 'draft',
  youtube_video_id text, -- ID do vídeo no YouTube (após publicação)
  youtube_error text, -- mensagem de erro se falhou

  -- Timestamps
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Snapshots de métricas de vídeo (histórico temporal)
create table if not exists public.video_metrics_snapshots (
  id uuid primary key default gen_random_uuid(),
  youtube_video_id uuid not null references public.youtube_videos(id) on delete cascade,

  -- Métricas básicas (YouTube Data API)
  views bigint not null default 0,
  likes bigint not null default 0,
  dislikes bigint not null default 0, -- YouTube escondeu, mas mantemos para histórico
  comments bigint not null default 0,
  shares bigint not null default 0,
  favorites bigint not null default 0,

  -- Métricas de retenção (YouTube Analytics API)
  watch_time_min bigint not null default 0, -- minutos assistidos
  avg_view_duration numeric(10, 2), -- segundos
  avg_percentage_viewed numeric(5, 2), -- porcentagem
  subscribers_gained int not null default 0,
  subscribers_lost int not null default 0,

  -- Fontes de tráfego (JSON)
  traffic_sources jsonb,
  geography jsonb,
  device_types jsonb,

  captured_at timestamptz not null default now(),
  source text not null default 'api', -- 'api', 'manual', 'estimated'

  unique (youtube_video_id, captured_at)
);

-- Comentários do vídeo
create table if not exists public.video_comments (
  id uuid primary key default gen_random_uuid(),
  youtube_video_id uuid not null references public.youtube_videos(id) on delete cascade,

  -- Dados do comentário
  provider_comment_id text not null, -- ID do YouTube
  author_channel_id text,
  author_name text not null,
  author_avatar_url text,
  text text not null,
  like_count int not null default 0,
  reply_count int not null default 0,
  is_reply boolean not null default false,
  parent_comment_id uuid references public.video_comments(id) on delete cascade,

  -- Status
  can_reply boolean not null default true,
  is_public boolean not null default true,
  moderation_status text, -- heldForReview, published, rejected

  published_at timestamptz not null,
  updated_at timestamptz,
  fetched_at timestamptz not null default now(),

  unique (youtube_video_id, provider_comment_id)
);

-- Trigger updated_at para youtube_videos
drop trigger if exists youtube_videos_set_updated_at on public.youtube_videos;
create trigger youtube_videos_set_updated_at
before update on public.youtube_videos
for each row execute function public.set_updated_at();

-- Índices
create index if not exists idx_youtube_videos_org_status on public.youtube_videos(organization_id, status);
create index if not exists idx_youtube_videos_org_publish on public.youtube_videos(organization_id, publish_at);
create index if not exists idx_youtube_videos_social_account on public.youtube_videos(social_account_id);
create index if not exists idx_youtube_videos_scheduled_post on public.youtube_videos(scheduled_post_id);
create index if not exists idx_youtube_videos_youtube_id on public.youtube_videos(youtube_video_id);

create index if not exists idx_metrics_snapshots_video_time on public.video_metrics_snapshots(youtube_video_id, captured_at);
create index if not exists idx_metrics_snapshots_captured on public.video_metrics_snapshots(captured_at);

create index if not exists idx_video_comments_video on public.video_comments(youtube_video_id);
create index if not exists idx_video_comments_published on public.video_comments(published_at);
create index if not exists idx_video_comments_parent on public.video_comments(parent_comment_id);

-- RLS para youtube_videos
alter table public.youtube_videos enable row level security;

drop policy if exists "members manage youtube videos" on public.youtube_videos;
create policy "members manage youtube videos"
on public.youtube_videos for all
to authenticated
using (public.is_org_member(organization_id))
with check (public.is_org_member(organization_id));

-- RLS para video_metrics_snapshots
alter table public.video_metrics_snapshots enable row level security;

drop policy if exists "members read video metrics" on public.video_metrics_snapshots;
create policy "members read video metrics"
on public.video_metrics_snapshots for select
to authenticated
using (
  exists (
    select 1
    from public.youtube_videos v
    where v.id = video_metrics_snapshots.youtube_video_id
      and public.is_org_member(v.organization_id)
  )
);

drop policy if exists "service role manage video metrics" on public.video_metrics_snapshots;
create policy "service role manage video metrics"
on public.video_metrics_snapshots for all
to service_role
using (true)
with check (true);

-- RLS para video_comments
alter table public.video_comments enable row level security;

drop policy if exists "members read video comments" on public.video_comments;
create policy "members read video comments"
on public.video_comments for select
to authenticated
using (
  exists (
    select 1
    from public.youtube_videos v
    where v.id = video_comments.youtube_video_id
      and public.is_org_member(v.organization_id)
  )
);

drop policy if exists "service role manage video comments" on public.video_comments;
create policy "service role manage video comments"
on public.video_comments for all
to service_role
using (true)
with check (true);