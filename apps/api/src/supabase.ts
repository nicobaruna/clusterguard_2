export type SupabaseBindings = {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
};

export type SosEvent = {
  id: string;
  sender_id: string;
  category: 'MEDIS' | 'BENCANA' | 'KEAMANAN';
  status: 'PENDING' | 'RESOLVED';
  resolved_by: string | null;
  resolved_at: string | null;
  client_idempotency_key: string | null;
  created_at: string;
};

function headers(bindings: SupabaseBindings): HeadersInit {
  return {
    apikey: bindings.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${bindings.SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
  };
}

function endpoint(bindings: SupabaseBindings): string {
  return `${bindings.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/sos_events`;
}

export async function findByIdempotencyKey(
  bindings: SupabaseBindings,
  key: string,
): Promise<SosEvent | null> {
  const response = await fetch(`${endpoint(bindings)}?client_idempotency_key=eq.${encodeURIComponent(key)}&select=*`, {
    headers: headers(bindings),
  });
  if (!response.ok) throw new Error(`Supabase lookup failed with ${response.status}`);
  const rows = await response.json() as SosEvent[];
  return rows[0] ?? null;
}

export async function insertSosEvent(
  bindings: SupabaseBindings,
  input: { senderId: string; category: SosEvent['category']; idempotencyKey: string },
): Promise<SosEvent> {
  const response = await fetch(endpoint(bindings), {
    method: 'POST',
    headers: { ...headers(bindings), Prefer: 'return=representation,resolution=ignore-duplicates' },
    body: JSON.stringify({
      sender_id: input.senderId,
      category: input.category,
      client_idempotency_key: input.idempotencyKey,
    }),
  });
  if (!response.ok) {
    if (response.status === 409) {
      const existing = await findByIdempotencyKey(bindings, input.idempotencyKey);
      if (existing) return existing;
    }
    throw new Error(`Supabase insert failed with ${response.status}`);
  }
  const rows = await response.json() as SosEvent[];
  if (!rows[0]) {
    const existing = await findByIdempotencyKey(bindings, input.idempotencyKey);
    if (!existing) throw new Error('Supabase insert returned no event');
    return existing;
  }
  return rows[0];
}

export type UserRole = 'WARGA' | 'PIC' | 'SUPER_ADMIN';

/** Reads the application role for a user id via service-role REST (bypasses RLS). */
export async function getUserRole(bindings: SupabaseBindings, userId: string): Promise<UserRole | null> {
  const url = `${bindings.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/users?id=eq.${encodeURIComponent(userId)}&select=role`;
  const response = await fetch(url, { headers: headers(bindings) });
  if (!response.ok) throw new Error(`Supabase role lookup failed with ${response.status}`);
  const rows = await response.json() as Array<{ role: UserRole }>;
  return rows[0]?.role ?? null;
}

export type ResolveOutcome = { outcome: 'resolved' | 'already_resolved_by_self'; event: SosEvent };

/**
 * Conditionally resolves a PENDING event so concurrent resolvers cannot double-apply.
 * Returns null when the event does not exist, and the existing row when it is
 * already RESOLVED (caller decides whether the same resolver retries or it is a conflict).
 */
export async function resolveSosEvent(
  bindings: SupabaseBindings,
  input: { eventId: string; resolverId: string },
): Promise<ResolveOutcome | null> {
  const now = new Date().toISOString();
  const url = `${bindings.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/sos_events?id=eq.${encodeURIComponent(input.eventId)}&status=eq.PENDING`;
  const response = await fetch(url, {
    method: 'PATCH',
    headers: { ...headers(bindings), Prefer: 'return=representation' },
    body: JSON.stringify({ status: 'RESOLVED', resolved_by: input.resolverId, resolved_at: now }),
  });
  if (!response.ok) throw new Error(`Supabase resolve failed with ${response.status}`);
  const rows = await response.json() as SosEvent[];
  if (rows[0]) return { outcome: 'resolved', event: rows[0] };
  const existing = await findSosEventById(bindings, input.eventId);
  if (!existing) return null;
  return { outcome: 'already_resolved_by_self', event: existing };
}

export async function findSosEventById(bindings: SupabaseBindings, eventId: string): Promise<SosEvent | null> {
  const url = `${endpoint(bindings)}?id=eq.${encodeURIComponent(eventId)}&select=*`;
  const response = await fetch(url, { headers: headers(bindings) });
  if (!response.ok) throw new Error(`Supabase lookup failed with ${response.status}`);
  const rows = await response.json() as SosEvent[];
  return rows[0] ?? null;
}
