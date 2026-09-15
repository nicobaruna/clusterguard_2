import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  new URL('../../../supabase/migrations/20260915000100_add_sos_idempotency.sql', import.meta.url),
  'utf8',
);

describe('offline SOS idempotency migration contract', () => {
  it('adds a nullable client idempotency key for retry-safe writes', () => {
    expect(migration).toContain('add column if not exists client_idempotency_key uuid');
    expect(migration).toContain('where client_idempotency_key is not null');
  });
});
