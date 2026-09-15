begin;

create temporary table _rls_results (label text, ok boolean, detail text) on commit drop;

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('11111111-1111-4111-8111-111111111111', 'authenticated', 'authenticated', 'rls-warga-test@example.invalid', 'not-a-password', now(), '{}'::jsonb, jsonb_build_object('full_name', 'RLS Warga Test'), now(), now()),
  ('22222222-2222-4222-8222-222222222222', 'authenticated', 'authenticated', 'rls-pic-test@example.invalid', 'not-a-password', now(), '{}'::jsonb, jsonb_build_object('full_name', 'RLS PIC Test'), now(), now());
update public.users set role = 'WARGA' where id = '11111111-1111-4111-8111-111111111111';
update public.users set role = 'PIC' where id = '22222222-2222-4222-8222-222222222222';
insert into public.sos_events (id, sender_id, category)
values
  ('33333333-3333-4333-8333-333333333333', '11111111-1111-4111-8111-111111111111', 'MEDIS'),
  ('44444444-4444-4444-8444-444444444444', '22222222-2222-4222-8222-222222222222', 'MEDIS');
insert into public.user_devices (id, user_id, fcm_token, device_type)
values ('55555555-5555-4555-8555-555555555555', '22222222-2222-4222-8222-222222222222', 'rollback-device-token', 'PWA');

do $$ declare n integer; begin
  execute 'set local role anon'; select count(*) into n from public.users; reset role;
  insert into _rls_results values ('anonymous cannot read profiles', n = 0, n::text);
exception when others then reset role; insert into _rls_results values ('anonymous cannot read profiles', false, sqlstate); end $$;

do $$ declare own_n integer; other_n integer; event_n integer; device_n integer; begin
  execute 'set local role authenticated'; perform set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
  select count(*) into own_n from public.users where id = '11111111-1111-4111-8111-111111111111';
  select count(*) into other_n from public.users where id = '22222222-2222-4222-8222-222222222222';
  select count(*) into event_n from public.sos_events;
  select count(*) into device_n from public.user_devices where user_id = '22222222-2222-4222-8222-222222222222';
  reset role;
  insert into _rls_results values ('WARGA sees only own profile', own_n = 1 and other_n = 0, own_n || '/' || other_n);
  insert into _rls_results values ('WARGA sees only own SOS events', event_n = 1, event_n::text);
  insert into _rls_results values ('WARGA cannot read another device', device_n = 0, device_n::text);
exception when others then reset role; insert into _rls_results values ('WARGA read isolation', false, sqlstate); end $$;

do $$ declare profile_n integer; event_n integer; device_n integer; begin
  execute 'set local role authenticated'; perform set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);
  select count(*) into profile_n from public.users;
  select count(*) into event_n from public.sos_events;
  select count(*) into device_n from public.user_devices where user_id = '22222222-2222-4222-8222-222222222222';
  reset role;
  insert into _rls_results values ('PIC can read staff-visible profiles/events', profile_n = 2 and event_n = 2, profile_n || '/' || event_n);
  insert into _rls_results values ('device owner can read its device', device_n = 1, device_n::text);
exception when others then reset role; insert into _rls_results values ('PIC staff visibility', false, sqlstate); end $$;

do $$ declare changed integer; begin
  execute 'set local role authenticated'; perform set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
  begin update public.users set role = 'PIC' where id = '11111111-1111-4111-8111-111111111111'; get diagnostics changed = row_count; exception when others then changed = 0; end;
  reset role;
  insert into _rls_results values ('WARGA cannot update its role', changed = 0, changed::text);
exception when others then reset role; insert into _rls_results values ('WARGA cannot update its role', false, sqlstate); end $$;

do $$ begin
  execute 'set local role authenticated'; perform set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
  begin insert into public.sos_events (id, sender_id, category) values ('66666666-6666-4666-8666-666666666666', '11111111-1111-4111-8111-111111111111', 'MEDIS'); insert into _rls_results values ('WARGA cannot insert SOS events', false, 'insert succeeded'); exception when others then reset role; insert into _rls_results values ('WARGA cannot insert SOS events', true, sqlstate); end;
  reset role;
exception when others then reset role; insert into _rls_results values ('WARGA cannot insert SOS events', false, sqlstate); end $$;

select case when ok then 'PASS: ' || label else 'FAIL: ' || label || ' (' || detail || ')' end as result from _rls_results order by label;
rollback;
