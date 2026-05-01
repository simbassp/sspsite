-- Персональные коды регистрации — только role = admin.

drop policy if exists "registration_invites_manage_all" on public.registration_invites;
drop policy if exists "registration_invites_admin_read" on public.registration_invites;
drop policy if exists "registration_invites_admin_write" on public.registration_invites;

create policy "registration_invites_admin_read"
on public.registration_invites
for select
to authenticated
using (public.is_admin());

create policy "registration_invites_admin_write"
on public.registration_invites
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());
