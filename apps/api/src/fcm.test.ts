import { afterEach, describe, expect, it, vi } from 'vitest';
import { broadcastSos, getPicDeviceTokens } from './fcm';

const bindings = { SUPABASE_URL: 'https://supabase.test', SUPABASE_SERVICE_ROLE_KEY: 'service-role-test', FCM_SERVER_KEY: 'fcm-test-key' };
const event = { id: 'event-1', sender_id: '11111111-1111-4111-8111-111111111111', category: 'MEDIS' as const, status: 'PENDING' as const, resolved_by: null, resolved_at: null, client_idempotency_key: null, created_at: new Date().toISOString() };

afterEach(() => vi.unstubAllGlobals());

describe('FCM broadcast', () => {
  it('filters tokens through PIC, on-duty, mobile device lookup', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify([{ fcm_token: 'pic-token' }, { fcm_token: '' }, { fcm_token: null }]), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(getPicDeviceTokens(bindings)).resolves.toEqual(['pic-token']);
    const requestUrl = String((fetchMock.mock.calls as unknown[][])[0][0]);
    expect(requestUrl).toContain('users.role=eq.PIC');
    expect(requestUrl).toContain('users.is_on_duty=eq.true');
    expect(requestUrl).toContain('device_type=eq.MOBILE');
  });

  it('broadcasts once to valid tokens and surfaces FCM failure', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify([{ fcm_token: 'pic-token' }]), { status: 200 }))
      .mockResolvedValueOnce(new Response('{}', { status: 500 }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(broadcastSos(bindings, event)).rejects.toThrow('FCM broadcast failed');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const request = fetchMock.mock.calls[1][1] as RequestInit;
    expect(String(request.body)).toContain('pic-token');
    expect(String((request.headers as Record<string, string>).Authorization)).toBe('key=fcm-test-key');
  });

  it('does not call FCM when no key or no valid tokens exist', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await broadcastSos({ ...bindings, FCM_SERVER_KEY: undefined }, event);
    expect(fetchMock).not.toHaveBeenCalled();
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }));
    await broadcastSos(bindings, event);
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
