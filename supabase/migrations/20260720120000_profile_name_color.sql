alter table public.app_users
  add column if not exists profile_name_color text;

comment on column public.app_users.profile_name_color is
  'Preset id for profile name color (solid or animated gradient). Null = default theme color.';
