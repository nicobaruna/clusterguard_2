export type SupabaseBindings = {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
};

export type SosEvent = {
  id: string;
  sender_id: string;
  category: 'MEDIS' | 'BENCANA' | 'KEAMANAN';
  status: 'PENDING' | 'RESOLVED';
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
