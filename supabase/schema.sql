create extension if not exists pgcrypto;

do $$
begin
  create type public.member_role as enum ('owner', 'admin', 'editor', 'viewer');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.post_status as enum ('draft', 'scheduled', 'publishing', 'published', 'failed', 'cancelled');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.media_type as enum ('video', 'image', 'text');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.connection_status as enum ('pending', 'connected', 'expired', 'disabled');
exception when duplicate_object then null;
end $$;

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  plan text not null default 'starter',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.member_role not null default 'editor',
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create table if not exists public.marketing_platforms (
  id text primary key,
  display_name text not null,
  category text not null check (category in ('social', 'ads')),
  icon_name text not null,
  active boolean not null default true
);

insert into public.marketing_platforms (id, display_name, category, icon_name)
values
  ('linkedin', 'LinkedIn', 'social', 'linkedin'),
  ('facebook', 'Facebook', 'social', 'facebook'),
  ('instagram', 'Instagram', 'social', 'instagram'),
  ('tiktok', 'TikTok', 'social', 'play'),
  ('youtube', 'YouTube', 'social', 'youtube'),
  ('google_ads', 'Google Ads', 'ads', 'megaphone'),
  ('meta_ads', 'Meta Ads', 'ads', 'megaphone')
on conflict (id) do update set
  display_name = excluded.display_name,
  category = excluded.category,
  icon_name = excluded.icon_name,
  active = true;

create table if not exists public.brand_settings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique references public.organizations(id) on delete cascade,
  timezone text not null default 'America/Sao_Paulo',
  locale text not null default 'pt-BR',
  brand_voice text not null default 'Elegante e direto',
  default_hashtags text[] not null default '{}',
  approval_required boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.social_accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  platform_id text not null references public.marketing_platforms(id),
  account_name text not null,
  provider_account_id text not null,
  token_reference text,
  status public.connection_status not null default 'pending',
  connected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, platform_id, provider_account_id)
);

create table if not exists public.content_assets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  uploaded_by uuid references auth.users(id) on delete set null,
  storage_path text not null,
  file_name text not null,
  mime_type text not null,
  size_bytes bigint,
  created_at timestamptz not null default now()
);

create table if not exists public.scheduled_posts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  author_id uuid references auth.users(id) on delete set null,
  asset_id uuid references public.content_assets(id) on delete set null,
  title text not null,
  caption text not null,
  media_url text,
  media_type public.media_type not null default 'text',
  status public.post_status not null default 'draft',
  scheduled_for timestamptz not null,
  timezone text not null default 'America/Sao_Paulo',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.scheduled_post_targets (
  id uuid primary key default gen_random_uuid(),
  scheduled_post_id uuid not null references public.scheduled_posts(id) on delete cascade,
  platform_id text not null references public.marketing_platforms(id),
  social_account_id uuid references public.social_accounts(id) on delete set null,
  platform_status text not null default 'queued',
  provider_post_id text,
  published_at timestamptz,
  error_message text,
  created_at timestamptz not null default now(),
  unique (scheduled_post_id, platform_id)
);

create table if not exists public.ad_connections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  platform_id text not null references public.marketing_platforms(id),
  account_name text not null,
  provider_account_id text not null,
  token_reference text,
  status public.connection_status not null default 'pending',
  connected_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, platform_id, provider_account_id)
);

create table if not exists public.ad_campaigns (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  ad_connection_id uuid not null references public.ad_connections(id) on delete cascade,
  provider_campaign_id text not null,
  name text not null,
  objective text,
  status text not null default 'active',
  started_at date,
  ended_at date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (ad_connection_id, provider_campaign_id)
);

create table if not exists public.ad_metrics_daily (
  id uuid primary key default gen_random_uuid(),
  ad_campaign_id uuid not null references public.ad_campaigns(id) on delete cascade,
  day date not null,
  spend numeric(14, 2) not null default 0,
  revenue numeric(14, 2) not null default 0,
  impressions integer not null default 0,
  views integer not null default 0,
  clicks integer not null default 0,
  conversions integer not null default 0,
  created_at timestamptz not null default now(),
  unique (ad_campaign_id, day)
);

create index if not exists idx_members_user on public.organization_members(user_id);
create index if not exists idx_scheduled_posts_org_time on public.scheduled_posts(organization_id, scheduled_for);
create index if not exists idx_targets_post on public.scheduled_post_targets(scheduled_post_id);
create index if not exists idx_ad_campaigns_org on public.ad_campaigns(organization_id);
create index if not exists idx_ad_metrics_campaign_day on public.ad_metrics_daily(ad_campaign_id, day);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists organizations_set_updated_at on public.organizations;
create trigger organizations_set_updated_at
before update on public.organizations
for each row execute function public.set_updated_at();

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists brand_settings_set_updated_at on public.brand_settings;
create trigger brand_settings_set_updated_at
before update on public.brand_settings
for each row execute function public.set_updated_at();

drop trigger if exists social_accounts_set_updated_at on public.social_accounts;
create trigger social_accounts_set_updated_at
before update on public.social_accounts
for each row execute function public.set_updated_at();

drop trigger if exists scheduled_posts_set_updated_at on public.scheduled_posts;
create trigger scheduled_posts_set_updated_at
before update on public.scheduled_posts
for each row execute function public.set_updated_at();

drop trigger if exists ad_connections_set_updated_at on public.ad_connections;
create trigger ad_connections_set_updated_at
before update on public.ad_connections
for each row execute function public.set_updated_at();

drop trigger if exists ad_campaigns_set_updated_at on public.ad_campaigns;
create trigger ad_campaigns_set_updated_at
before update on public.ad_campaigns
for each row execute function public.set_updated_at();

create or replace function public.is_org_member(org_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_members members
    where members.organization_id = org_id
      and members.user_id = auth.uid()
  );
$$;

alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.organization_members enable row level security;
alter table public.marketing_platforms enable row level security;
alter table public.brand_settings enable row level security;
alter table public.social_accounts enable row level security;
alter table public.content_assets enable row level security;
alter table public.scheduled_posts enable row level security;
alter table public.scheduled_post_targets enable row level security;
alter table public.ad_connections enable row level security;
alter table public.ad_campaigns enable row level security;
alter table public.ad_metrics_daily enable row level security;

drop policy if exists "platforms are readable" on public.marketing_platforms;
create policy "platforms are readable"
on public.marketing_platforms for select
to authenticated
using (active = true);

drop policy if exists "members read organizations" on public.organizations;
create policy "members read organizations"
on public.organizations for select
to authenticated
using (public.is_org_member(id));

drop policy if exists "members update organizations" on public.organizations;
create policy "members update organizations"
on public.organizations for update
to authenticated
using (public.is_org_member(id))
with check (public.is_org_member(id));

drop policy if exists "users read own profile" on public.profiles;
create policy "users read own profile"
on public.profiles for select
to authenticated
using (id = auth.uid());

drop policy if exists "users update own profile" on public.profiles;
create policy "users update own profile"
on public.profiles for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

drop policy if exists "members read memberships" on public.organization_members;
create policy "members read memberships"
on public.organization_members for select
to authenticated
using (public.is_org_member(organization_id));

drop policy if exists "members manage brand settings" on public.brand_settings;
create policy "members manage brand settings"
on public.brand_settings for all
to authenticated
using (public.is_org_member(organization_id))
with check (public.is_org_member(organization_id));

drop policy if exists "members manage social accounts" on public.social_accounts;
create policy "members manage social accounts"
on public.social_accounts for all
to authenticated
using (public.is_org_member(organization_id))
with check (public.is_org_member(organization_id));

drop policy if exists "members manage content assets" on public.content_assets;
create policy "members manage content assets"
on public.content_assets for all
to authenticated
using (public.is_org_member(organization_id))
with check (public.is_org_member(organization_id));

drop policy if exists "members manage scheduled posts" on public.scheduled_posts;
create policy "members manage scheduled posts"
on public.scheduled_posts for all
to authenticated
using (public.is_org_member(organization_id))
with check (public.is_org_member(organization_id));

drop policy if exists "members manage scheduled targets" on public.scheduled_post_targets;
create policy "members manage scheduled targets"
on public.scheduled_post_targets for all
to authenticated
using (
  exists (
    select 1
    from public.scheduled_posts posts
    where posts.id = scheduled_post_targets.scheduled_post_id
      and public.is_org_member(posts.organization_id)
  )
)
with check (
  exists (
    select 1
    from public.scheduled_posts posts
    where posts.id = scheduled_post_targets.scheduled_post_id
      and public.is_org_member(posts.organization_id)
  )
);

drop policy if exists "members manage ad connections" on public.ad_connections;
create policy "members manage ad connections"
on public.ad_connections for all
to authenticated
using (public.is_org_member(organization_id))
with check (public.is_org_member(organization_id));

drop policy if exists "members manage ad campaigns" on public.ad_campaigns;
create policy "members manage ad campaigns"
on public.ad_campaigns for all
to authenticated
using (public.is_org_member(organization_id))
with check (public.is_org_member(organization_id));

drop policy if exists "members read ad metrics" on public.ad_metrics_daily;
create policy "members read ad metrics"
on public.ad_metrics_daily for select
to authenticated
using (
  exists (
    select 1
    from public.ad_campaigns campaigns
    where campaigns.id = ad_metrics_daily.ad_campaign_id
      and public.is_org_member(campaigns.organization_id)
  )
);
