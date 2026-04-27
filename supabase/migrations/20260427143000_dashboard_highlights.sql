create table if not exists public.dashboard_events (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_dashboard_events_kind_created_desc
  on public.dashboard_events(kind, created_at desc);

create table if not exists public.dashboard_reactions (
  id uuid primary key default gen_random_uuid(),
  card_key text not null,
  emoji text not null,
  user_id uuid not null references public.app_users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(card_key, emoji, user_id)
);

create index if not exists idx_dashboard_reactions_card_emoji
  on public.dashboard_reactions(card_key, emoji);

alter table public.dashboard_events enable row level security;
alter table public.dashboard_reactions enable row level security;

drop policy if exists "events_admin_read" on public.dashboard_events;
create policy "events_admin_read"
on public.dashboard_events
for select
to authenticated
using (public.is_admin());

drop policy if exists "events_admin_write" on public.dashboard_events;
create policy "events_admin_write"
on public.dashboard_events
for insert
to authenticated
with check (public.is_admin());

drop policy if exists "reactions_read_authenticated" on public.dashboard_reactions;
create policy "reactions_read_authenticated"
on public.dashboard_reactions
for select
to authenticated
using (true);

drop policy if exists "reactions_insert_authenticated" on public.dashboard_reactions;
create policy "reactions_insert_authenticated"
on public.dashboard_reactions
for insert
to authenticated
with check (auth.uid() is not null);

drop policy if exists "reactions_delete_own" on public.dashboard_reactions;
create policy "reactions_delete_own"
on public.dashboard_reactions
for delete
to authenticated
using (user_id in (select id from public.app_users where auth_user_id = auth.uid()));
