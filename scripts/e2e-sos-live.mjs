// One-off live E2E: proves a real Supabase session token now passes the backend.
// Cleans up every artifact it creates. Values are never printed.
import fs from 'node:fs';

const env = fs.readFileSync('.env.local', 'utf8');
const get = (k) => {
  const raw = (env.match(new RegExp('^' + k + '=(.*)$', 'm')) || [])[1]?.trim() ?? null;
  if (raw && raw.length >= 2 && ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'")))) return raw.slice(1, -1);
  return raw;
};
const SUPABASE_URL = get('NEXT_PUBLIC_SUPABASE_URL');
const ANON = get('NEXT_PUBLIC_SUPABASE_ANON_KEY');
const SERVICE = get('SUPABASE_SERVICE_ROLE_KEY');
const BACKEND = 'http://localhost:8787';
const stamp = Date.now();
const email = `e2e-${stamp}@example.test`; // disposable, never used again
const password = `Tmp-${stamp}-Xy!`;
const idem = crypto.randomUUID();
const admin = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' };

let userId = null;
let eventId = null;
let ok = true;
const log = (name, pass, detail = '') => { console.log(`${pass ? 'PASS' : 'FAIL'} ${name}${detail ? ' - ' + detail : ''}`); if (!pass) ok = false; };

try {
  // 1) Create a temporary confirmed user via the admin API (phone provider is disabled on this project)
  const signupRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: { ...admin },
    body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { full_name: 'E2E Temp', house_number: 'E2E-1' } }),
  });
  const signupBody = await signupRes.json().catch(() => ({}));
  if (signupRes.ok && signupBody.id) {
    userId = signupBody.id;
    log('create user temporer (admin API)', true, `id=${userId.slice(0, 8)}...`);
  } else {
    log('create user temporer (admin API)', false, `${signupRes.status} ${JSON.stringify(signupBody).slice(0, 160)}`);
  }

  // 2) Login -> access token (the same kind the browser holds)
  const loginRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const loginBody = await loginRes.json().catch(() => ({}));
  const accessToken = loginBody.access_token;
  log('login password grant', loginRes.ok && !!accessToken, loginRes.ok ? `token len=${accessToken?.length}` : `${loginRes.status} ${JSON.stringify(loginBody).slice(0, 160)}`);

  // 3) Ensure public.users profile exists (signup trigger should do it; insert if missing)
  if (userId) {
    const profRes = await fetch(`${SUPABASE_URL}/rest/v1/users?id=eq.${userId}`, { headers: admin });
    const prof = await profRes.json();
    if (Array.isArray(prof) && prof.length === 0) {
      await fetch(`${SUPABASE_URL}/rest/v1/users`, {
        method: 'POST',
        headers: { ...admin, Prefer: 'return=minimal' },
        body: JSON.stringify({ id: userId, full_name: 'E2E Temp', phone_number: '', email, role: 'WARGA' }),
      });
    }
  }

  // 4) POST /sos with the real token -> expect 201
  const sosRes = await fetch(`${BACKEND}/sos`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json', 'Idempotency-Key': idem },
    body: JSON.stringify({ category: 'MEDIS' }),
  });
  const sosBody = await sosRes.json().catch(() => ({}));
  eventId = sosBody?.event?.id ?? null;
  log('POST /sos (201)', sosRes.status === 201, `status=${sosRes.status} eventId=${eventId ?? sosBody?.error}`);

  // 5) Idempotent retry with the same key -> expect 200, same event id
  const retryRes = await fetch(`${BACKEND}/sos`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json', 'Idempotency-Key': idem },
    body: JSON.stringify({ category: 'MEDIS' }),
  });
  const retryBody = await retryRes.json().catch(() => ({}));
  log('idempotent retry (200, event sama)', retryRes.status === 200 && retryBody?.event?.id === eventId, `status=${retryRes.status}`);

  // 6) Token tanpa signature valid -> 401 (bukan 5xx)
  const badRes = await fetch(`${BACKEND}/sos`, {
    method: 'POST',
    headers: { Authorization: 'Bearer a.eyJzdWIiOiJ4In0.bad', 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() },
    body: JSON.stringify({ category: 'MEDIS' }),
  });
  log('token sampah ditolak 401', badRes.status === 401, `status=${badRes.status}`);

  if (eventId && userId) {
    const resolveUrl = `${BACKEND}/sos/${eventId}/resolve`;

    // 7) Warga mencoba resolve -> 403
    const wargaResolve = await fetch(resolveUrl, { method: 'PATCH', headers: { Authorization: `Bearer ${accessToken}` } });
    log('Warga ditolak 403 saat resolve', wargaResolve.status === 403, `status=${wargaResolve.status}`);

    // 8) Promosikan user temporer menjadi PIC via admin REST
    const promoteRes = await fetch(`${SUPABASE_URL}/rest/v1/users?id=eq.${userId}`, {
      method: 'PATCH',
      headers: { ...admin, Prefer: 'return=minimal' },
      body: JSON.stringify({ role: 'PIC' }),
    });
    log('promosi user ke PIC (admin REST)', promoteRes.ok, `status=${promoteRes.status}`);

    // 9) PIC resolve event yang tidak ada -> 404
    const missingRes = await fetch(`${BACKEND}/sos/${crypto.randomUUID()}/resolve`, { method: 'PATCH', headers: { Authorization: `Bearer ${accessToken}` } });
    log('resolve event tidak ada -> 404', missingRes.status === 404, `status=${missingRes.status}`);

    // 10) PIC resolve event nyata -> 200 + resolved_by terisi
    const resolveRes = await fetch(resolveUrl, { method: 'PATCH', headers: { Authorization: `Bearer ${accessToken}` } });
    const resolveBody = await resolveRes.json().catch(() => ({}));
    log('PATCH /sos/:id/resolve (200)', resolveRes.status === 200 && resolveBody?.event?.resolved_by === userId, `status=${resolveRes.status} resolved_by=${resolveBody?.event?.resolved_by?.slice(0, 8) ?? resolveBody?.error}`);

    // 11) Retry resolve oleh PIC yang sama -> 200 idempoten
    const againRes = await fetch(resolveUrl, { method: 'PATCH', headers: { Authorization: `Bearer ${accessToken}` } });
    const againBody = await againRes.json().catch(() => ({}));
    log('retry resolve idempoten (200)', againRes.status === 200 && againBody?.alreadyResolved === true, `status=${againRes.status} alreadyResolved=${againBody?.alreadyResolved}`);

    // 12) Token sampah pada endpoint resolve -> 401
    const badResolve = await fetch(resolveUrl, { method: 'PATCH', headers: { Authorization: 'Bearer a.eyJzdWIiOiJ4In0.bad' } });
    log('token sampah ditolak 401 di resolve', badResolve.status === 401, `status=${badResolve.status}`);
  }
} catch (e) {
  log('unexpected', false, e.message);
} finally {
  // 7) Cleanup: sos_event, profile, auth user
  if (eventId) await fetch(`${SUPABASE_URL}/rest/v1/sos_events?id=eq.${eventId}`, { method: 'DELETE', headers: admin });
  if (userId) {
    await fetch(`${SUPABASE_URL}/rest/v1/users?id=eq.${userId}`, { method: 'DELETE', headers: admin });
    const del = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, { method: 'DELETE', headers: admin });
    log('cleanup user temporer', del.ok || del.status === 404, `status=${del.status}`);
  }
  console.log(ok ? 'HASIL: SEMUA PASS' : 'HASIL: ADA KEGAGALAN');
  process.exit(ok ? 0 : 1);
}
