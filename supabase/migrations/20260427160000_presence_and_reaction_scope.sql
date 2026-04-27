alter table if exists public.app_users add column if not exists can_view_online boolean not null default false;
alter table if exists public.app_users add column if not exists is_online boolean not null default false;
alter table if exists public.app_users add column if not exists last_seen_at timestamptz;

alter table if exists public.dashboard_reactions add column if not exists scope_key text not null default '';

create index if not exists idx_app_users_online on public.app_users(is_online, status);
create index if not exists idx_dashboard_reactions_scope on public.dashboard_reactions(scope_key, card_key, emoji);
