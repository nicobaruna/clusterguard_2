alter table public.sos_events
  add column if not exists client_idempotency_key uuid;

create unique index if not exists sos_events_client_idempotency_key_idx
  on public.sos_events(client_idempotency_key)
  where client_idempotency_key is not null;
