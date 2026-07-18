-- Посещения и суммарное время на сайте (глобально и по пользователям).

alter table public.app_users add column if not exists visit_count bigint not null default 0;
alter table public.app_users add column if not exists active_seconds_total bigint not null default 0;
alter table public.app_users add column if not exists analytics_session_started_at timestamptz;
alter table public.app_users add column if not exists analytics_last_ping_at timestamptz;

comment on column public.app_users.visit_count is 'Число сессий (визитов) пользователя на сайте.';
comment on column public.app_users.active_seconds_total is 'Суммарное активное время пользователя на сайте, секунды.';

-- Базовая оценка: время тестов + ~20 мин на каждый визит (просмотр разделов вне тестов).
update public.app_users u
set
  visit_count = greatest(
    1,
    coalesce((
      select count(*)::bigint
      from public.test_results tr
      where tr.user_id = u.id
    ), 0)
  ),
  active_seconds_total = coalesce((
    select sum(tr.duration_seconds)::bigint
    from public.test_results tr
    where tr.user_id = u.id
      and tr.duration_seconds is not null
      and tr.duration_seconds > 0
  ), 0) + greatest(
    1,
    coalesce((
      select count(*)::bigint
      from public.test_results tr
      where tr.user_id = u.id
    ), 0)
  ) * 1200;

insert into public.site_settings (key, value, updated_at)
select 'site_total_visits', to_jsonb(coalesce(sum(visit_count), 0)), now()
from public.app_users
on conflict (key) do update
set value = excluded.value,
    updated_at = now();

insert into public.site_settings (key, value, updated_at)
select 'site_total_active_seconds', to_jsonb(coalesce(sum(active_seconds_total), 0)), now()
from public.app_users
on conflict (key) do update
set value = excluded.value,
    updated_at = now();

create or replace function public.record_site_analytics(
  p_user_id uuid,
  p_new_session boolean default false,
  p_elapsed_seconds integer default 0
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_elapsed bigint := greatest(0, least(coalesce(p_elapsed_seconds, 0), 600));
  v_visits bigint;
  v_seconds bigint;
begin
  if not exists (select 1 from public.app_users where id = p_user_id) then
    return;
  end if;

  if p_new_session then
    update public.app_users
    set visit_count = coalesce(visit_count, 0) + 1,
        analytics_session_started_at = now(),
        analytics_last_ping_at = now()
    where id = p_user_id;

    select coalesce(sum(visit_count), 0) into v_visits from public.app_users;
    insert into public.site_settings (key, value, updated_at)
    values ('site_total_visits', to_jsonb(v_visits), now())
    on conflict (key) do update
    set value = excluded.value,
        updated_at = now();
  end if;

  if v_elapsed > 0 then
    update public.app_users
    set active_seconds_total = coalesce(active_seconds_total, 0) + v_elapsed,
        analytics_last_ping_at = now()
    where id = p_user_id;

    select coalesce(sum(active_seconds_total), 0) into v_seconds from public.app_users;
    insert into public.site_settings (key, value, updated_at)
    values ('site_total_active_seconds', to_jsonb(v_seconds), now())
    on conflict (key) do update
    set value = excluded.value,
        updated_at = now();
  end if;
end;
$$;

revoke all on function public.record_site_analytics(uuid, boolean, integer) from public;
