import { describe, expect, it } from 'vitest';
import { sign } from 'hono/jwt';
import app from './index';

describe('ClusterGuard API', () => {
  it('reports service health', async () => {
    const response = await app.request('/', undefined, { FRONTEND_URL: 'http://localhost:3000', SUPABASE_JWT_SECRET: 'test-secret' });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, service: 'ClusterGuard API' });
  });

  it('rejects invalid SOS categories before authentication work', async () => {
    const response = await app.request('/sos', { method: 'POST', body: JSON.stringify({ category: 'INVALID' }) }, { FRONTEND_URL: 'http://localhost:3000', SUPABASE_JWT_SECRET: 'test-secret' });
    expect(response.status).toBe(401);
  });

  it('derives the SOS sender from the verified JWT subject', async () => {
    const token = await sign({ sub: 'sender-from-jwt' }, 'test-secret');
    const response = await app.request('/sos', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ category: 'MEDIS', sender_id: 'spoofed-client-id' }),
    }, { FRONTEND_URL: 'http://localhost:3000', SUPABASE_JWT_SECRET: 'test-secret' });
    expect(response.status).toBe(201);
    const payload = await response.json() as { event: { sender_id: string } };
    expect(payload.event.sender_id).toBe('sender-from-jwt');
  });
});
