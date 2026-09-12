import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { verify } from 'hono/jwt';
import { z } from 'zod';
import { createSosEvent, isFallbackRequired, parseSosCategory } from './sos';

type Bindings = {
  SUPABASE_JWT_SECRET?: string;
  FRONTEND_URL?: string;
  CLUSTER_NAME?: string;
  BACKEND_URL?: string;
};

type JwtUser = {
  sub?: string;
  role?: string;
  email?: string;
};

const app = new Hono<{ Bindings: Bindings; Variables: { user: JwtUser } }>();

const sosCategorySchema = z.enum(['MEDIS', 'BENCANA', 'KEAMANAN']);

const requireAuth = async (c: any, next: () => Promise<void>) => {
  const authHeader = c.req.header('Authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const secret = c.env?.SUPABASE_JWT_SECRET;
  if (!secret) {
    return c.json({ error: 'JWT secret not configured' }, 500);
  }

  try {
    const payload = await verify(token, secret, 'HS256');
    c.set('user', payload as JwtUser);
    await next();
  } catch {
    return c.json({ error: 'Invalid token' }, 401);
  }
};

app.use('*', logger());
app.use(
  '*',
  cors({
    origin: (origin) => {
      const allowed = ['http://localhost:3000'];
      return allowed.includes(origin || '') ? origin : 'http://localhost:3000';
    },
    allowMethods: ['GET', 'POST', 'PATCH', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
  }),
);

app.get('/', (c) => c.json({ ok: true, service: c.env?.CLUSTER_NAME ?? 'ClusterGuard API' }));

app.use('/sos/*', requireAuth);

app.post('/sos', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const parsed = sosCategorySchema.safeParse(body.category);

  if (!parsed.success) {
    return c.json({ error: 'Invalid category' }, 400);
  }

  const user = c.get('user') as JwtUser | undefined;
  const category = parseSosCategory(parsed.data);
  const event = createSosEvent(category, user?.sub ?? 'demo-user');

  c.executionCtx.waitUntil(
    Promise.resolve().then(() => {
      console.log('FCM broadcast stub for:', event.category, 'user:', user?.sub ?? 'demo-user');
    }),
  );

  return c.json({
    ok: true,
    event: {
      id: event.id,
      category: event.category,
      status: event.status,
      created_at: new Date(event.createdAt).toISOString(),
      sender: event.senderId,
      fallbackRequired: isFallbackRequired(event, event.createdAt),
    },
  });
});

app.patch('/sos/:id/resolve', async (c) => {
  const id = c.req.param('id');
  const user = c.get('user') as JwtUser | undefined;
  return c.json({ ok: true, id, status: 'RESOLVED', resolved_by: user?.sub ?? 'demo-user' });
});

export default app;
