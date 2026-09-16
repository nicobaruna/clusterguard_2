import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

function loadEnv() {
  const values = {};
  for (const rawLine of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
    const line = rawLine.replace(/^\s*#\s*/, '').trim();
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    values[match[1]] = value;
  }
  return values;
}

const env = loadEnv();
const email = env.SUPER_ADMIN_EMAIL;
const password = env.SUPER_ADMIN_PASSWORD;
if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY || !email || !password) {
  throw new Error('Missing Supabase or Super Admin configuration in .env.local');
}

const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
let user = null;
for (let page = 1; !user && page <= 20; page += 1) {
  const result = await admin.auth.admin.listUsers({ page, perPage: 100 });
  if (result.error) throw result.error;
  user = result.data.users.find((candidate) => candidate.email?.toLowerCase() === email.toLowerCase()) ?? null;
  if (result.data.users.length < 100) break;
}

if (user) {
  const result = await admin.auth.admin.updateUserById(user.id, {
    password,
    email_confirm: true,
    user_metadata: { ...user.user_metadata, full_name: 'Super Admin', role: 'SUPER_ADMIN' },
  });
  if (result.error) throw result.error;
} else {
  const result = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: 'Super Admin', role: 'SUPER_ADMIN' },
  });
  if (result.error || !result.data.user) throw result.error ?? new Error('Auth user was not created');
  user = result.data.user;
}

const profile = await admin.from('users').upsert({ id: user.id, full_name: 'Super Admin', role: 'SUPER_ADMIN' }, { onConflict: 'id' });
if (profile.error) throw profile.error;

console.log('SUPER_ADMIN_SEED=PASS');
console.log(`USER_STATUS=${user ? 'READY' : 'CREATED'}`);
