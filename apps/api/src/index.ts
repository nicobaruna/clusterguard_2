import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { jwt } from 'hono/jwt';
import { z } from 'zod';
import { findByIdempotencyKey, insertSosEvent, type SupabaseBindings } from './supabase';

type Bindings = SupabaseBindings & { SUPABASE_JWT_SECRET: string; FRONTEND_URL?: string };
const app = new Hono<{ Bindings: Bindings }>();
const sosBody = z.object({ category: z.enum(['MEDIS', 'BENCANA', 'KEAMANAN']) }).strict();
const idempotencyKey = z.string().uuid();
const userId = z.string().uuid();

app.use('*', cors({ origin: (origin, c) => origin === c.env.FRONTEND_URL ? origin : c.env.FRONTEND_URL ?? 'http://localhost:3000' }));
app.get('/', (c) => c.json({ ok: true, service: 'ClusterGuard API' }));
app.use('/sos', (c, next) => jwt({ secret: c.env.SUPABASE_JWT_SECRET, alg: 'HS256' })(c, next));
app.use('/sos/*', (c, next) => jwt({ secret: c.env.SUPABASE_JWT_SECRET, alg: 'HS256' })(c, next));

app.post('/sos', async (c) => {
  const parsed = sosBody.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: 'Invalid SOS body' }, 400);
  const user = c.get('jwtPayload') as { sub?: string };
  if (!user.sub || !userId.safeParse(user.sub).success) return c.json({ error: 'Authenticated user id is invalid' }, 401);
  const key = idempotencyKey.safeParse(c.req.header('Idempotency-Key'));
  if (!key.success) return c.json({ error: 'Invalid Idempotency-Key' }, 400);
  if (!c.env.SUPABASE_URL || !c.env.SUPABASE_SERVICE_ROLE_KEY) return c.json({ error: 'Database is not configured' }, 503);

  try {
    const existing = await findByIdempotencyKey(c.env, key.data);
    const event = existing ?? await insertSosEvent(c.env, { senderId: user.sub, category: parsed.data.category, idempotencyKey: key.data });
    return c.json({ ok: true, event }, existing ? 200 : 201);
  } catch (error) {
    console.error(error);
    return c.json({ error: 'Failed to persist SOS event' }, 502);
  }
});

export default app;
