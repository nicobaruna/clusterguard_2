import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { z } from 'zod';
import { supabaseAuth, type AuthUser } from './auth';
import {
  findByIdempotencyKey,
  getUserRole,
  insertSosEvent,
  resolveSosEvent,
  type SupabaseBindings,
} from './supabase';
import { broadcastSos } from './fcm';

type Bindings = SupabaseBindings & { FRONTEND_URL?: string; FCM_SERVER_KEY?: string };
const app = new Hono<{ Bindings: Bindings; Variables: { authUser: AuthUser } }>();
const sosBody = z.object({ category: z.enum(['MEDIS', 'BENCANA', 'KEAMANAN']) }).strict();
const idempotencyKey = z.string().uuid();
const userId = z.string().uuid();

app.use('*', cors({ origin: (origin, c) => origin === c.env.FRONTEND_URL ? origin : c.env.FRONTEND_URL ?? 'http://localhost:3000' }));
app.get('/', (c) => c.json({ ok: true, service: 'ClusterGuard API' }));
app.use('/sos', supabaseAuth());
app.use('/sos/*', supabaseAuth());

app.patch('/sos/:id/resolve', async (c) => {
  const eventId = c.req.param('id');
  if (!userId.safeParse(eventId).success) return c.json({ error: 'Invalid SOS event id' }, 400);
  if (!c.env.SUPABASE_URL || !c.env.SUPABASE_SERVICE_ROLE_KEY) return c.json({ error: 'Database is not configured' }, 503);
  const user = c.get('authUser');
  if (!user?.id || !userId.safeParse(user.id).success) return c.json({ error: 'Authenticated user id is invalid' }, 401);

  try {
    const role = await getUserRole(c.env, user.id);
    if (role !== 'PIC' && role !== 'SUPER_ADMIN') return c.json({ error: 'Only PIC or Super Admin can resolve SOS events' }, 403);

    const result = await resolveSosEvent(c.env, { eventId, resolverId: user.id });
    if (!result) return c.json({ error: 'SOS event not found' }, 404);
    const { outcome, event } = result;
    if (outcome === 'already_resolved_by_self') {
      if (event.resolved_by === user.id) return c.json({ ok: true, event, alreadyResolved: true }, 200);
      return c.json({ error: 'SOS event already resolved by another responder' }, 409);
    }
    return c.json({ ok: true, event }, 200);
  } catch (error) {
    console.error(error);
    return c.json({ error: 'Failed to resolve SOS event' }, 502);
  }
});

app.post('/sos', async (c) => {
  const parsed = sosBody.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: 'Invalid SOS body' }, 400);
  const user = c.get('authUser');
  if (!user?.id || !userId.safeParse(user.id).success) return c.json({ error: 'Authenticated user id is invalid' }, 401);
  const key = idempotencyKey.safeParse(c.req.header('Idempotency-Key'));
  if (!key.success) return c.json({ error: 'Invalid Idempotency-Key' }, 400);
  if (!c.env.SUPABASE_URL || !c.env.SUPABASE_SERVICE_ROLE_KEY) return c.json({ error: 'Database is not configured' }, 503);

  try {
    const existing = await findByIdempotencyKey(c.env, key.data);
    const event = existing ?? await insertSosEvent(c.env, { senderId: user.id, category: parsed.data.category, idempotencyKey: key.data });
    if (!existing) {
      c.executionCtx.waitUntil(
        broadcastSos(c.env, event).catch((error) => console.error(error)),
      );
    }
    return c.json({ ok: true, event }, existing ? 200 : 201);
  } catch (error) {
    console.error(error);
    return c.json({ error: 'Failed to persist SOS event' }, 502);
  }
});

export default app;
