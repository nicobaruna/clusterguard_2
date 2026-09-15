create or replace function public.current_user_role()
returns public.user_role
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select u.role from public.users as u where u.id = auth.uid()
$$;

revoke all on function public.current_user_role() from public;
grant execute on function public.current_user_role() to authenticated;

revoke insert, update, delete on public.sos_events from anon, authenticated;

create index if not exists sos_events_sender_id_idx on public.sos_events(sender_id);
create index if not exists user_devices_user_id_idx on public.user_devices(user_id);

drop policy if exists users_self_select on public.users;
drop policy if exists users_staff_select on public.users;
drop policy if exists users_self_update on public.users;
create policy users_self_or_staff_select on public.users
  for select to authenticated
  using (
    id = auth.uid()
    or public.current_user_role() in ('PIC', 'SUPER_ADMIN')
  );
create policy users_self_update on public.users
  for update to authenticated
  using (id = auth.uid())
  with check (
    id = auth.uid()
    and role = public.current_user_role()
  );

drop policy if exists events_self_or_staff_select on public.sos_events;
create policy events_self_or_staff_select on public.sos_events
  for select to authenticated
  using (
    sender_id = auth.uid()
    or public.current_user_role() in ('PIC', 'SUPER_ADMIN')
  );

drop policy if exists devices_self_manage on public.user_devices;
create policy devices_self_select on public.user_devices
  for select to authenticated
  using (user_id = auth.uid());
create policy devices_self_insert on public.user_devices
  for insert to authenticated
  with check (user_id = auth.uid());
create policy devices_self_update on public.user_devices
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
create policy devices_self_delete on public.user_devices
  for delete to authenticated
  using (user_id = auth.uid());
