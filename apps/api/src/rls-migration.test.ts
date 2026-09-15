import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  new URL('../../../supabase/migrations/20260914000200_rls_hardening.sql', import.meta.url),
  'utf8',
);

describe('RLS hardening migration contract', () => {
  it('limits profile reads to the owner or staff roles', () => {
    expect(migration).toContain('users_self_or_staff_select');
    expect(migration).toContain("public.current_user_role() in ('PIC', 'SUPER_ADMIN')");
  });

  it('prevents client-side role escalation during profile updates', () => {
    expect(migration).toContain('users_self_update');
    expect(migration).toContain('role = public.current_user_role()');
    expect(migration).not.toMatch(/create policy .*users.* for all/i);
  });

  it('keeps device token access scoped to the authenticated owner', () => {
    expect(migration).toContain('user_id = auth.uid()');
    expect(migration).toContain('devices_self_delete');
  });

  it('uses a controlled definer path and indexes policy ownership predicates', () => {
    expect(migration).toContain('set search_path = pg_catalog, public');
    expect(migration).toContain('sos_events_sender_id_idx');
    expect(migration).toContain('user_devices_user_id_idx');
  });

  it('explicitly denies direct client writes to SOS events', () => {
    expect(migration).toContain('revoke insert, update, delete on public.sos_events from anon, authenticated');
  });
});
