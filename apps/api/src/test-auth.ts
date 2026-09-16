import { createServer, type Server } from 'node:http';
import { SignJWT, exportJWK, generateKeyPair, type JWTPayload } from 'jose';

type GeneratedPair = Awaited<ReturnType<typeof generateKeyPair>>;

export type TestKeyPair = {
  privateKey: GeneratedPair['privateKey'];
  jwks: { keys: Array<Record<string, unknown>> };
  kid: string;
};

export type MockAuthServer = {
  url: string;
  close: () => Promise<void>;
};

let cached: TestKeyPair | null = null;

/** Generates (once per test run) an ES256 key pair plus a JWKS document for mocking Supabase Auth. */
export async function getTestKeyPair(): Promise<TestKeyPair> {
  if (cached) return cached;
  const kid = 'test-key-id';
  const { publicKey, privateKey } = await generateKeyPair('ES256', { extractable: true });
  const publicJwk = await exportJWK(publicKey);
  const pair: TestKeyPair = {
    privateKey,
    kid,
    jwks: { keys: [{ ...publicJwk, kid, alg: 'ES256', use: 'sig' }] },
  };
  cached = pair;
  return pair;
}

/**
 * Runs a real local HTTP server exposing the test JWKS at
 * `{url}/auth/v1/.well-known/jwks.json` so jose's remote JWKS fetch works
 * against a genuine HTTP endpoint (stubbing global fetch does not intercept jose).
 */
export async function startMockSupabaseAuth(keys: TestKeyPair): Promise<MockAuthServer> {
  const server: Server = createServer((req, res) => {
    if (req.url?.includes('/.well-known/jwks.json')) {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(keys.jwks));
      return;
    }
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'not found' }));
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === 'string') {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    throw new Error('Mock auth server failed to listen');
  }
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))),
  };
}

/** Mints an access token signed by the test ES256 key, shaped like a Supabase access token. */
export async function mintAccessToken(
  keys: TestKeyPair,
  payload: JWTPayload,
  issuer: string,
): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'ES256', kid: keys.kid, typ: 'JWT' })
    .setIssuedAt()
    .setIssuer(issuer)
    .sign(keys.privateKey);
}
