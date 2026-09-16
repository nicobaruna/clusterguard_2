import type { MiddlewareHandler } from 'hono';
import { createRemoteJWKSet, jwtVerify } from 'jose';

export type SupabaseAuthBindings = {
  SUPABASE_URL?: string;
};

const JWKS_CACHE_TTL_MS = 10 * 60 * 1000;
const MIN_REFRESH_INTERVAL_MS = 30 * 1000;

let cachedJwks: ReturnType<typeof createRemoteJWKSet> | null = null;
let cachedHost: string | null = null;
let lastRefreshAt = 0;

/** Test-only seam: drop the cached JWKS between tests. */
export function resetJwksCacheForTests(): void {
  cachedJwks = null;
  cachedHost = null;
  lastRefreshAt = 0;
}

function isStillFresh(): boolean {
  return Date.now() - lastRefreshAt < JWKS_CACHE_TTL_MS;
}

export function getRemoteJwks(supabaseUrl: string): ReturnType<typeof createRemoteJWKSet> {
  const origin = new URL(supabaseUrl).origin;
  if (cachedJwks && cachedHost === origin && isStillFresh()) return cachedJwks;
  const elapsed = lastRefreshAt > 0 ? Date.now() - lastRefreshAt : Number.MAX_SAFE_INTEGER;
  const cooldown = elapsed < MIN_REFRESH_INTERVAL_MS ? MIN_REFRESH_INTERVAL_MS - elapsed : JWKS_CACHE_TTL_MS;
  lastRefreshAt = Date.now();
  cachedHost = origin;
  cachedJwks = createRemoteJWKSet(new URL(`${origin}/auth/v1/.well-known/jwks.json`), {
    cooldownDuration: cooldown,
  });
  return cachedJwks;
}

export type AuthUser = {
  id: string;
  role: string;
};

export async function verifySupabaseJwt(
  token: string,
  bindings: SupabaseAuthBindings,
): Promise<AuthUser | null> {
  if (!bindings.SUPABASE_URL) return null;
  try {
    if (!new URL(bindings.SUPABASE_URL).host) return null;
  } catch {
    return null;
  }
  try {
    const { payload } = await jwtVerify(token, getRemoteJwks(bindings.SUPABASE_URL), {
      algorithms: ['ES256'],
      issuer: `${bindings.SUPABASE_URL.replace(/\/$/, '')}/auth/v1`,
    });
    const sub = typeof payload.sub === 'string' ? payload.sub : null;
    if (!sub) return null;
    const role = typeof payload.role === 'string' ? payload.role : 'authenticated';
    return { id: sub, role };
  } catch {
    return null;
  }
}

/**
 * Verifies a Supabase access token (ES256, asymmetric signing keys) against the
 * project JWKS fetched from Supabase Auth and cached at the edge.
 */
export function supabaseAuth(): MiddlewareHandler {
  return async (c, next) => {
    const authorization = c.req.header('Authorization');
    if (!authorization || !authorization.startsWith('Bearer ')) {
      return c.json({ error: 'Missing bearer token' }, 401);
    }
    const token = authorization.slice('Bearer '.length).trim();
    const user = await verifySupabaseJwt(token, c.env);
    if (!user) return c.json({ error: 'Invalid or expired session token' }, 401);
    c.set('authUser', user);
    await next();
  };
}
