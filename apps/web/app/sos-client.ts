import { supabase } from '../lib/supabase';
import { enqueueOfflineRecord } from './offline-store';

type SosCategory = 'MEDIS' | 'BENCANA' | 'KEAMANAN';

export async function submitSos(category: SosCategory, backendUrl: string): Promise<'sent' | 'queued' | 'unauthorized' | 'failed'> {
  const { data } = await supabase?.auth.getSession() ?? { data: { session: null } };
  const accessToken = data.session?.access_token;
  if (!accessToken) return 'unauthorized';

  const localId = crypto.randomUUID();
  const payload = { category, idempotencyKey: localId };
  try {
    const response = await fetch(`${backendUrl}/sos`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': localId,
      },
      body: JSON.stringify(payload),
    });
    if (response.status === 401) return 'unauthorized';
    if (!response.ok) {
      if (response.status >= 500) {
        enqueueOfflineRecord('sos_event', payload);
        return 'queued';
      }
      return 'failed';
    }
    return 'sent';
  } catch {
    enqueueOfflineRecord('sos_event', payload);
    return 'queued';
  }
}
