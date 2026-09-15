import { afterEach, describe, expect, it, vi } from 'vitest';
import { sign } from 'hono/jwt';
import app from './index';

const bindings = {
  FRONTEND_URL: 'http://localhost:3000',
  SUPABASE_JWT_SECRET: 'test-secret',
  SUPABASE_URL: 'https://supabase.test',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-test',
};
const key = '11111111-1111-4111-8111-111111111111';
const executionContext = (waitUntil = vi.fn()) => ({
  waitUntil,
  passThroughOnException: vi.fn(),
  props: {},
});

afterEach(() => vi.unstubAllGlobals());

describe('ClusterGuard API', () => {
  it('reports service health', async () => {
    const response = await app.request('/', undefined, bindings);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, service: 'ClusterGuard API' });
  });

  it('rejects invalid categories and idempotency keys', async () => {
    const response = await app.request('/sos', {
      method: 'POST',
      headers: { Authorization: `Bearer ${await sign({ sub: 'sender' }, 'test-secret')}` },
      body: JSON.stringify({ category: 'INVALID' }),
    }, bindings);
    expect(response.status).toBe(400);
  });

  it('rejects unknown SOS body fields', async () => {
    const response = await app.request('/sos', {
      method: 'POST',
      headers: { Authorization: `Bearer ${await sign({ sub: '11111111-1111-4111-8111-111111111111' }, 'test-secret')}`, 'Idempotency-Key': key },
      body: JSON.stringify({ category: 'MEDIS', sender_id: 'spoofed' }),
    }, bindings);
    expect(response.status).toBe(400);
  });

  it('rejects a JWT with an invalid sender subject', async () => {
    const response = await app.request('/sos', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${await sign({ sub: 'not-a-uuid' }, 'test-secret')}`,
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
        Authorization: `Bearer ${await sign({ sub: '11111111-1111-4111-8111-111111111111' }, 'test-secret')}`,
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
      headers: { Authorization: `Bearer ${await sign({ sub: '11111111-1111-4111-8111-111111111111' }, 'test-secret')}`, 'Idempotency-Key': key },
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
      headers: { Authorization: `Bearer ${await sign({ sub: '11111111-1111-4111-8111-111111111111' }, 'test-secret')}`, 'Idempotency-Key': key },
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
      headers: { Authorization: `Bearer ${await sign({ sub: '11111111-1111-4111-8111-111111111111' }, 'test-secret')}`, 'Idempotency-Key': '33333333-3333-4333-8333-333333333333' },
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
      headers: { Authorization: `Bearer ${await sign({ sub: '22222222-2222-4222-8222-222222222222' }, 'test-secret')}`, 'Idempotency-Key': key },
      body: JSON.stringify({ category: 'MEDIS' }),
    }, bindings, executionContext(waitUntil));
    expect(response.status).toBe(201);
    const payload = await response.json() as { event: { id: string } };
    expect(payload.event.id).toBe('raced');
  });
});
