-- Одним запросом вставляет уведомление всем активным пользователям (без N батчей через REST).

alter table public.app_notifications
  add column if not exists sender_id uuid references public.app_users(id) on delete set null,
  add column if not exists sender_label text;

create or replace function public.broadcast_app_notification(
  p_title text,
  p_body text default '',
  p_href text default null,
  p_sender_id uuid default null,
  p_sender_label text default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_count integer;
begin
  insert into public.app_notifications (user_id, kind, title, body, href, sender_id, sender_label)
  select
    u.id,
    'admin_broadcast',
    btrim(p_title),
    coalesce(btrim(p_body), ''),
    nullif(btrim(p_href), ''),
    p_sender_id,
    nullif(btrim(p_sender_label), '')
  from public.app_users u
  where u.status = 'active';

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

revoke all on function public.broadcast_app_notification(text, text, text, uuid, text) from public;
