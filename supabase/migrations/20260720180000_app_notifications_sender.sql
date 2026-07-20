alter table public.app_notifications
  add column if not exists sender_id uuid references public.app_users(id) on delete set null,
  add column if not exists sender_label text;
