import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { jwt } from 'hono/jwt';
import { z } from 'zod';

type Bindings = { SUPABASE_JWT_SECRET: string; FRONTEND_URL?: string };
const app = new Hono<{ Bindings: Bindings }>();
const category = z.enum(['MEDIS', 'BENCANA', 'KEAMANAN']);
app.use('*', cors({ origin: (origin, c) => origin === c.env.FRONTEND_URL ? origin : c.env.FRONTEND_URL ?? 'http://localhost:3000' }));
app.get('/', (c) => c.json({ ok: true, service: 'ClusterGuard API' }));
app.use('/sos/*', (c, next) => jwt({ secret: c.env.SUPABASE_JWT_SECRET, alg: 'HS256' })(c, next));
app.post('/sos', async (c) => { const body = await c.req.json().catch(() => ({})); const parsed = category.safeParse(body.category); if (!parsed.success) return c.json({ error: 'Invalid category' }, 400); const user = c.get('jwtPayload') as { sub?: string }; if (!user.sub) return c.json({ error: 'Authenticated user id is missing' }, 401); return c.json({ ok: true, event: { category: parsed.data, sender_id: user.sub, status: 'PENDING' } }, 201); });
export default app;
