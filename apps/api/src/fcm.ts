import type { SupabaseBindings, SosEvent } from './supabase';

type FcmBindings = SupabaseBindings & { FCM_SERVER_KEY?: string };

function restEndpoint(bindings: SupabaseBindings): string {
  return `${bindings.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/user_devices`;
}

function restHeaders(bindings: SupabaseBindings): HeadersInit {
  return {
    apikey: bindings.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${bindings.SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
  };
}

export async function getPicDeviceTokens(bindings: SupabaseBindings): Promise<string[]> {
  const query = '?select=fcm_token,users!inner(role,is_on_duty)&users.role=eq.PIC&users.is_on_duty=eq.true&device_type=eq.MOBILE';
  const response = await fetch(`${restEndpoint(bindings)}${query}`, { headers: restHeaders(bindings) });
  if (!response.ok) throw new Error(`FCM token lookup failed with ${response.status}`);
  const rows = await response.json() as Array<{ fcm_token?: unknown }>;
  return rows
    .map((row) => row.fcm_token)
    .filter((token): token is string => typeof token === 'string' && token.length > 0);
}

export async function broadcastSos(bindings: FcmBindings, event: SosEvent): Promise<void> {
  if (!bindings.FCM_SERVER_KEY) return;
  const tokens = await getPicDeviceTokens(bindings);
  if (tokens.length === 0) return;

  const response = await fetch('https://fcm.googleapis.com/fcm/send', {
    method: 'POST',
    headers: {
      Authorization: `key=${bindings.FCM_SERVER_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      registration_ids: tokens,
      priority: 'high',
      notification: {
        title: 'SOS ClusterGuard',
        body: `Keadaan darurat ${event.category}`,
        sound: 'default',
      },
      data: { eventId: event.id, category: event.category, status: event.status },
    }),
  });
  if (!response.ok) throw new Error(`FCM broadcast failed with ${response.status}`);
}
