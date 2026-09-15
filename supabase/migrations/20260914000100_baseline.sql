create extension if not exists pgcrypto;

do $$ begin create type public.user_role as enum ('WARGA','PIC','SUPER_ADMIN'); exception when duplicate_object then null; end $$;
do $$ begin create type public.sos_category as enum ('MEDIS','BENCANA','KEAMANAN'); exception when duplicate_object then null; end $$;
do $$ begin create type public.sos_status as enum ('PENDING','RESOLVED'); exception when duplicate_object then null; end $$;

create table public.users (id uuid primary key references auth.users(id) on delete cascade, full_name varchar(160) not null, phone_number varchar(32), house_number varchar(80), role public.user_role not null default 'WARGA', is_on_duty boolean not null default false, created_at timestamptz not null default now());
create table public.sos_events (id uuid primary key default gen_random_uuid(), sender_id uuid not null references public.users(id), category public.sos_category not null, status public.sos_status not null default 'PENDING', resolved_by uuid references public.users(id), resolved_at timestamptz, created_at timestamptz not null default now());
create table public.user_devices (id uuid primary key default gen_random_uuid(), user_id uuid not null references public.users(id) on delete cascade, fcm_token text not null, device_type varchar(16) not null check (device_type in ('PWA','MOBILE')), updated_at timestamptz not null default now(), unique(user_id, device_type));
create index sos_events_status_created_idx on public.sos_events(status, created_at desc);

alter table public.users enable row level security;
alter table public.sos_events enable row level security;
alter table public.user_devices enable row level security;
create policy users_self_select on public.users for select to authenticated using (auth.uid() = id);
create policy events_self_or_staff_select on public.sos_events for select to authenticated using (sender_id = auth.uid() or exists (select 1 from public.users where id = auth.uid() and role in ('PIC','SUPER_ADMIN')));
create policy devices_self_manage on public.user_devices for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create or replace function public.handle_new_auth_user() returns trigger language plpgsql security definer set search_path = public as $$ begin insert into public.users (id, full_name, phone_number, house_number) values (new.id, coalesce(new.raw_user_meta_data->>'full_name','Pengguna'), new.phone, new.raw_user_meta_data->>'house_number'); return new; end; $$;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_auth_user();
