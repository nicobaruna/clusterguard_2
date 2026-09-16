import { afterEach, beforeAll, afterAll, describe, expect, it, vi } from 'vitest';
import app from './index';
import { verifySupabaseJwt } from './auth';
import { getTestKeyPair, mintAccessToken, startMockSupabaseAuth, type MockAuthServer, type TestKeyPair } from './test-auth';

const bindings = {
  FRONTEND_URL: 'http://localhost:3000',
  SUPABASE_URL: 'https://supabase.test',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-test',
};
const key = '11111111-1111-4111-8111-111111111111';
const executionContext = (waitUntil = vi.fn()) => ({
  waitUntil,
  passThroughOnException: vi.fn(),
  props: {},
});

let keys: TestKeyPair;
let mockAuth: MockAuthServer;
let ISSUER: string;
const accessToken = (sub: string) => mintAccessToken(keys, { sub }, ISSUER);

beforeAll(async () => {
  keys = await getTestKeyPair();
  // Run a real local JWKS server and warm the auth cache once, so per-test fetch
  // mocks only ever see Supabase REST calls (jose ignores fetch stubs).
  mockAuth = await startMockSupabaseAuth(keys);
  ISSUER = `${mockAuth.url}/auth/v1`;
  bindings.SUPABASE_URL = mockAuth.url;
  const probe = await mintAccessToken(keys, { sub: '11111111-1111-4111-8111-111111111111' }, ISSUER);
  const verified = await verifySupabaseJwt(probe, bindings);
  expect(verified?.id).toBe('11111111-1111-4111-8111-111111111111');
}, 30000);

afterAll(async () => {
  await mockAuth?.close();
});

afterEach(() => vi.unstubAllGlobals());

describe('ClusterGuard API', () => {
  it('reports service health', async () => {
    const response = await app.request('/', undefined, bindings);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, service: 'ClusterGuard API' });
  });

  it('rejects unauthenticated SOS requests', async () => {
    const response = await app.request('/sos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key },
      body: JSON.stringify({ category: 'MEDIS' }),
    }, bindings);
    expect(response.status).toBe(401);
  });

  it('rejects invalid categories and idempotency keys', async () => {
    const response = await app.request('/sos', {
      method: 'POST',
      headers: { Authorization: `Bearer ${await accessToken('sender')}` },
      body: JSON.stringify({ category: 'INVALID' }),
    }, bindings);
    expect(response.status).toBe(400);
  });

  it('rejects unknown SOS body fields', async () => {
    const response = await app.request('/sos', {
      method: 'POST',
      headers: { Authorization: `Bearer ${await accessToken('11111111-1111-4111-8111-111111111111')}`, 'Idempotency-Key': key },
      body: JSON.stringify({ category: 'MEDIS', sender_id: 'spoofed' }),
    }, bindings);
    expect(response.status).toBe(400);
  });

  it('rejects a JWT with an invalid sender subject', async () => {
    const response = await app.request('/sos', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${await accessToken('not-a-uuid')}`,
        'Idempotency-Key': key,
      },
      body: JSON.stringify({ category: 'MEDIS' }),
    }, bindings);
    expect(response.status).toBe(401);
  });

  it('persists an SOS using the JWT sender and idempotency key', async () => {
    const calls: Request[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push(new Request(input, init));
      if (calls.length === 1) return new Response(JSON.stringify([]), { status: 200 });
      return new Response(JSON.stringify([{ id: 'event-1', sender_id: '11111111-1111-4111-8111-111111111111', category: 'MEDIS', status: 'PENDING' }]), { status: 201 });
    }));
    const waitUntil = vi.fn();
    const response = await app.request('/sos', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${await accessToken('11111111-1111-4111-8111-111111111111')}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': key,
      },
      body: JSON.stringify({ category: 'MEDIS' }),
    }, bindings, executionContext(waitUntil));
    expect(response.status).toBe(201);
    const payload = await response.json() as { event: { sender_id: string } };
    expect(payload.event.sender_id).toBe('11111111-1111-4111-8111-111111111111');
    expect(calls[1].headers.get('Authorization')).toContain('Bearer service-role-test');
    expect(calls[1].headers.get('Prefer')).toContain('resolution=ignore-duplicates');
    expect(waitUntil).toHaveBeenCalledOnce();
  });

  it('returns an existing event without inserting on an idempotent retry', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify([{ id: 'existing', sender_id: 'original', category: 'MEDIS', status: 'PENDING' }]), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const response = await app.request('/sos', {
      method: 'POST',
      headers: { Authorization: `Bearer ${await accessToken('11111111-1111-4111-8111-111111111111')}`, 'Idempotency-Key': key },
      body: JSON.stringify({ category: 'MEDIS' }),
    }, bindings);
    expect(response.status).toBe(200);
    const payload = await response.json() as { event: { id: string } };
    expect(payload.event.id).toBe('existing');
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('does not broadcast an idempotent retry', async () => {
    const waitUntil = vi.fn();
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify([{ id: 'existing', sender_id: 'original', category: 'MEDIS', status: 'PENDING' }]), { status: 200 })));
    const response = await app.request('/sos', {
      method: 'POST',
      headers: { Authorization: `Bearer ${await accessToken('11111111-1111-4111-8111-111111111111')}`, 'Idempotency-Key': key },
      body: JSON.stringify({ category: 'MEDIS' }),
    }, bindings, executionContext(waitUntil));
    expect(response.status).toBe(200);
    expect(waitUntil).not.toHaveBeenCalled();
  });

  it('returns SOS success even when asynchronous FCM delivery fails', async () => {
    const waitUntil = vi.fn((task: Promise<unknown>) => { void task; });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([{ id: 'event-fcm', sender_id: '11111111-1111-4111-8111-111111111111', category: 'MEDIS', status: 'PENDING' }]), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([{ fcm_token: 'pic-token' }]), { status: 200 }))
      .mockResolvedValueOnce(new Response('{}', { status: 500 }));
    vi.stubGlobal('fetch', fetchMock);
    const response = await app.request('/sos', {
      method: 'POST',
      headers: { Authorization: `Bearer ${await accessToken('11111111-1111-4111-8111-111111111111')}`, 'Idempotency-Key': '33333333-3333-4333-8333-333333333333' },
      body: JSON.stringify({ category: 'MEDIS' }),
    }, { ...bindings, FCM_SERVER_KEY: 'fcm-test-key' }, executionContext(waitUntil));
    expect(response.status).toBe(201);
    expect(waitUntil).toHaveBeenCalledOnce();
  });

  it('recovers an existing event when a concurrent insert returns conflict', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }))
      .mockResolvedValueOnce(new Response('{}', { status: 409 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([{ id: 'raced', sender_id: 'original', category: 'MEDIS', status: 'PENDING' }]), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const waitUntil = vi.fn();
    const response = await app.request('/sos', {
      method: 'POST',
      headers: { Authorization: `Bearer ${await accessToken('22222222-2222-4222-8222-222222222222')}`, 'Idempotency-Key': key },
      body: JSON.stringify({ category: 'MEDIS' }),
    }, bindings, executionContext(waitUntil));
    expect(response.status).toBe(201);
    const payload = await response.json() as { event: { id: string } };
    expect(payload.event.id).toBe('raced');
  });
});

describe('PATCH /sos/:id/resolve', () => {
  const picId = '22222222-2222-4222-8222-222222222222';
  const otherPicId = '33333333-3333-4333-8333-333333333333';
  const eventId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const resolveUrl = `/sos/${eventId}/resolve`;

  const resolvedRow = (resolvedBy: string) => ({
    id: eventId,
    sender_id: '11111111-1111-4111-8111-111111111111',
    category: 'MEDIS',
    status: 'RESOLVED',
    resolved_by: resolvedBy,
    resolved_at: '2026-09-16T10:00:00.000Z',
  });

  it('rejects unauthenticated resolve requests', async () => {
    const response = await app.request(resolveUrl, { method: 'PATCH' }, bindings);
    expect(response.status).toBe(401);
  });

  it('rejects a malformed event id', async () => {
    const response = await app.request('/sos/not-a-uuid/resolve', {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${await accessToken(picId)}` },
    }, bindings);
    expect(response.status).toBe(400);
  });

  it('rejects Warga users with 403', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify([{ role: 'WARGA' }]), { status: 200 })));
    const response = await app.request(resolveUrl, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${await accessToken(picId)}` },
    }, bindings);
    expect(response.status).toBe(403);
  });

  it('returns 503 when the database is not configured', async () => {
    const response = await app.request(resolveUrl, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${await accessToken(picId)}` },
    }, { ...bindings, SUPABASE_SERVICE_ROLE_KEY: '' });
    expect(response.status).toBe(503);
  });

  it('resolves a pending event as PIC', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify([{ role: 'PIC' }]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([resolvedRow(picId)]), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const response = await app.request(resolveUrl, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${await accessToken(picId)}` },
    }, bindings);
    expect(response.status).toBe(200);
    const payload = await response.json() as { ok: boolean; event: { resolved_by: string; resolved_at: string } };
    expect(payload.ok).toBe(true);
    expect(payload.event.resolved_by).toBe(picId);
    expect(payload.event.resolved_at).toBeTruthy();
    expect(String(fetchMock.mock.calls[1][0])).toContain(`id=eq.${eventId}`);
    expect(String(fetchMock.mock.calls[1][0])).toContain('status=eq.PENDING');
  });

  it('allows a Super Admin to resolve as well', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify([{ role: 'SUPER_ADMIN' }]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([resolvedRow(picId)]), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const response = await app.request(resolveUrl, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${await accessToken(picId)}` },
    }, bindings);
    expect(response.status).toBe(200);
  });

  it('returns 404 when the event does not exist', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify([{ role: 'PIC' }]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const response = await app.request(resolveUrl, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${await accessToken(picId)}` },
    }, bindings);
    expect(response.status).toBe(404);
  });

  it('treats a retry by the same resolver as idempotent success', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify([{ role: 'PIC' }]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([resolvedRow(picId)]), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const response = await app.request(resolveUrl, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${await accessToken(picId)}` },
    }, bindings);
    expect(response.status).toBe(200);
    const payload = await response.json() as { alreadyResolved: boolean };
    expect(payload.alreadyResolved).toBe(true);
  });

  it('conflicts when another responder already resolved the event', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify([{ role: 'PIC' }]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([resolvedRow(otherPicId)]), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const response = await app.request(resolveUrl, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${await accessToken(picId)}` },
    }, bindings);
    expect(response.status).toBe(409);
  });

  it('maps database failures to 502', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 500 })));
    const response = await app.request(resolveUrl, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${await accessToken(picId)}` },
    }, bindings);
    expect(response.status).toBe(502);
  });
});
