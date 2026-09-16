import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SignJWT, generateKeyPair } from 'jose';
import { getRemoteJwks, resetJwksCacheForTests, supabaseAuth } from './auth';
import { getTestKeyPair, mintAccessToken, startMockSupabaseAuth, type MockAuthServer } from './test-auth';

let mockAuth: MockAuthServer;
let issuer: string;

beforeEach(async () => {
  resetJwksCacheForTests();
  const keys = await getTestKeyPair();
  mockAuth = await startMockSupabaseAuth(keys);
  issuer = `${mockAuth.url}/auth/v1`;
});

describe('supabaseAuth middleware (ES256 via JWKS)', () => {
  it('accepts a valid ES256 access token and exposes the auth user', async () => {
    const keys = await getTestKeyPair();
    const token = await mintAccessToken(keys, { sub: '11111111-1111-4111-8111-111111111111', role: 'authenticated' }, issuer);
    const store = new Map<string, unknown>();
    const c = {
      env: { SUPABASE_URL: mockAuth.url },
      req: { header: (name: string) => (name.toLowerCase() === 'authorization' ? `Bearer ${token}` : undefined) },
      set: (key: string, value: unknown) => store.set(key, value),
      json: (body: unknown, status: number) => new Response(JSON.stringify(body), { status }),
    } as never;
    let nextCalled = false;
    await supabaseAuth()(c, async () => { nextCalled = true; });
    expect(nextCalled).toBe(true);
    expect(store.get('authUser')).toEqual({ id: '11111111-1111-4111-8111-111111111111', role: 'authenticated' });
  });

  it('rejects a request without a bearer token', async () => {
    const c = {
      env: { SUPABASE_URL: mockAuth.url },
      req: { header: () => undefined },
      json: (body: unknown, status: number) => new Response(JSON.stringify(body), { status }),
    } as never;
    const response = (await supabaseAuth()(c, async () => { throw new Error('next must not run'); })) as Response;
    expect(response.status).toBe(401);
  });

  it('rejects a token signed by an unknown key', async () => {
    const rogue = await generateKeyPair('ES256', { extractable: true });
    const token = await new SignJWT({ sub: '11111111-1111-4111-8111-111111111111' })
      .setProtectedHeader({ alg: 'ES256', kid: 'rogue-key', typ: 'JWT' })
      .setIssuedAt()
      .setIssuer(issuer)
      .sign(rogue.privateKey);
    const c = {
      env: { SUPABASE_URL: mockAuth.url },
      req: { header: (name: string) => (name.toLowerCase() === 'authorization' ? `Bearer ${token}` : undefined) },
      json: (body: unknown, status: number) => new Response(JSON.stringify(body), { status }),
    } as never;
    const response = (await supabaseAuth()(c, async () => { throw new Error('next must not run'); })) as Response;
    expect(response.status).toBe(401);
  });

  it('rejects an expired token', async () => {
    const keys = await getTestKeyPair();
    const token = await mintAccessToken(keys, { sub: '11111111-1111-4111-8111-111111111111', exp: Math.floor(Date.now() / 1000) - 10 }, issuer);
    const c = {
      env: { SUPABASE_URL: mockAuth.url },
      req: { header: (name: string) => (name.toLowerCase() === 'authorization' ? `Bearer ${token}` : undefined) },
      json: (body: unknown, status: number) => new Response(JSON.stringify(body), { status }),
    } as never;
    const response = (await supabaseAuth()(c, async () => { throw new Error('next must not run'); })) as Response;
    expect(response.status).toBe(401);
  });

  it('caches the JWKS per origin within the TTL window', () => {
    const first = getRemoteJwks('https://host-a.example.test');
    const second = getRemoteJwks('https://host-a.example.test');
    expect(second).toBe(first);
    const otherHost = getRemoteJwks('https://host-b.example.test');
    expect(otherHost).not.toBe(first);
  });
});
