-- ============================================================
-- LinkedIn native connection
-- ============================================================
create table public.linkedin_connections (
  user_id uuid primary key,
  refresh_token_encrypted text not null,
  access_token text,
  access_token_expires_at timestamptz,
  member_urn text,
  account_email text,
  account_name text,
  scopes text[] not null default '{}',
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.linkedin_connections enable row level security;

create policy "Users select own linkedin connection"
  on public.linkedin_connections for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Admins full access linkedin connections"
  on public.linkedin_connections for all
  to authenticated
  using (public.has_role(auth.uid(), 'admin'::app_role))
  with check (public.has_role(auth.uid(), 'admin'::app_role));

create trigger linkedin_connections_set_updated_at
  before update on public.linkedin_connections
  for each row execute function public.set_updated_at();

-- Public view (no encrypted token)
create or replace view public.linkedin_connections_public
with (security_invoker = true)
as
select
  user_id,
  member_urn,
  account_email,
  account_name,
  scopes,
  connected_at,
  updated_at
from public.linkedin_connections;

-- ============================================================
-- Reddit native connection
-- ============================================================
create table public.reddit_connections (
  user_id uuid primary key,
  refresh_token_encrypted text not null,
  access_token text,
  access_token_expires_at timestamptz,
  reddit_username text,
  default_subreddit text,
  scopes text[] not null default '{}',
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.reddit_connections enable row level security;

create policy "Users select own reddit connection"
  on public.reddit_connections for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users update own reddit connection"
  on public.reddit_connections for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Admins full access reddit connections"
  on public.reddit_connections for all
  to authenticated
  using (public.has_role(auth.uid(), 'admin'::app_role))
  with check (public.has_role(auth.uid(), 'admin'::app_role));

create trigger reddit_connections_set_updated_at
  before update on public.reddit_connections
  for each row execute function public.set_updated_at();

-- Public view (no encrypted token)
create or replace view public.reddit_connections_public
with (security_invoker = true)
as
select
  user_id,
  reddit_username,
  default_subreddit,
  scopes,
  connected_at,
  updated_at
from public.reddit_connections;

-- ============================================================
-- social_content tracking columns
-- ============================================================
alter table public.social_content
  add column linkedin_via text,
  add column linkedin_native_status text,
  add column linkedin_native_post_urn text,
  add column linkedin_native_error_detail text,
  add column reddit_via text,
  add column reddit_native_status text,
  add column reddit_native_post_id text,
  add column reddit_native_error_detail text,
  add column reddit_subreddit text;

-- ============================================================
-- posted_content mirror columns
-- ============================================================
alter table public.posted_content
  add column linkedin_via text,
  add column linkedin_native_status text,
  add column linkedin_native_post_urn text,
  add column linkedin_native_error_detail text,
  add column reddit_via text,
  add column reddit_native_status text,
  add column reddit_native_post_id text,
  add column reddit_native_error_detail text,
  add column reddit_subreddit text;