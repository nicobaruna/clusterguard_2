'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from './auth-store';
import { createSyncManager } from './sync-manager';
import { supabase } from '../lib/supabase';

const CATEGORIES = [
  { value: 'MEDIS', label: 'MEDIS', color: 'var(--critical)', icon: 'ambulance' },
  { value: 'BENCANA', label: 'BENCANA', color: 'var(--warning)', icon: 'flame' },
  { value: 'KEAMANAN', label: 'KEAMANAN', color: 'var(--security)', icon: 'shield' },
] as const;

function CategoryIcon({ name }: { name: string }) {
  const common = {
    width: '52',
    height: '52',
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: '2',
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': 'true' as const,
  };
  if (name === 'ambulance') {
    return (
      <svg {...common}>
        <rect x="3" y="6" width="13" height="11" rx="2" />
        <path d="M16 9h3l2 2v4h-1" />
        <circle cx="7.5" cy="17.5" r="1.5" />
        <circle cx="15.5" cy="17.5" r="1.5" />
        <path d="M9.5 6V4h3v2" />
        <path d="M8 11h4M10 9v4" />
      </svg>
    );
  }
  if (name === 'flame') {
    return (
      <svg {...common}>
        <path d="M12 3s5 4.5 5 10a5 5 0 0 1-10 0c0-2 1-3.6 2.2-4.8C10 10 12 12 12 12s2-2.5 1-6c-.4-1.4-1-2-1-3z" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  );
}

function Dashboard({ onSignOut }: { onSignOut: () => void }) {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);

  return (
    <main className="dashboard-shell">
      <header className="dash-header">
        <button className="ghost" type="button">Profil</button>
        <button className="ghost" type="button" onClick={onSignOut}>Logout</button>
      </header>
      <section className="dash-hero">
        <h1>Halo, {user?.fullName}{user?.houseNumber ? ` (${user.houseNumber})` : ''}</h1>
        <p className="muted">Ada keadaan darurat?</p>
      </section>
      <section className="category-list" aria-label="Pilih kategori darurat">
        {CATEGORIES.map((category) => (
          <button
            key={category.value}
            className="category-card"
            style={{ background: category.color }}
            onClick={() => router.push(`/sos/confirm?category=${category.value}`)}
          >
            <span className="category-icon"><CategoryIcon name={category.icon} /></span>
            <span className="category-label">{category.label}</span>
          </button>
        ))}
      </section>
    </main>
  );
}

export default function HomePage() {
  const { user, initialize, signIn, signUp, signOut } = useAuthStore();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [identifier, setIdentifier] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [houseNumber, setHouseNumber] = useState('');
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    void initialize().catch(() => setMessage('Sesi tidak dapat dipulihkan. Silakan masuk kembali.'));
  }, [initialize]);

  useEffect(() => {
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
    const manager = createSyncManager({
      send: async (record) => {
        if (!backendUrl || !supabase) throw new Error('SYNC_TRANSPORT_UNAVAILABLE');
        const { data } = await supabase.auth.getSession();
        const accessToken = data.session?.access_token;
        if (!accessToken) return { status: 401 };
        const path = record.entity === 'sos_event' ? '/sos' : `/sync/${record.entity}`;
        const response = await fetch(`${backendUrl}${path}`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'Idempotency-Key': typeof record.payload === 'object' && record.payload !== null && 'idempotencyKey' in record.payload
              ? String(record.payload.idempotencyKey)
              : record.localId,
          },
          body: JSON.stringify(record.payload),
        });
        return { status: response.status };
      },
      onUnauthorized: () => void signOut(),
    });
    manager.start();
    return manager.stop;
  }, [signOut]);

  const submit = async () => {
    setIsSubmitting(true);
    setMessage('');
    try {
      const result = mode === 'login'
        ? await signIn(identifier.trim(), password)
        : await signUp({ phone: phone.trim(), password, fullName: fullName.trim(), houseNumber: houseNumber.trim() });
      setMessage(result ?? 'Berhasil.');
    } catch {
      setMessage('Permintaan gagal. Periksa koneksi dan coba lagi.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (user) {
    return <Dashboard onSignOut={() => void signOut()} />;
  }

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <p className="eyebrow">CLUSTERGUARD SOS</p>
        <h1>Masuk dengan identitas yang tepat.</h1>
        <p className="muted">Warga dan PIC menggunakan nomor HP. Super Admin menggunakan email.</p>
        <div className="tabs" role="tablist">
          <button className={mode === 'login' ? 'active' : ''} onClick={() => setMode('login')}>Masuk</button>
          <button className={mode === 'signup' ? 'active' : ''} onClick={() => setMode('signup')}>Daftar Warga</button>
        </div>
        {mode === 'login' ? (
          <label>Nomor HP atau email Super Admin<input value={identifier} onChange={(event) => setIdentifier(event.target.value)} autoComplete="username" /></label>
        ) : (
          <>
            <label>Nama lengkap<input value={fullName} onChange={(event) => setFullName(event.target.value)} autoComplete="name" /></label>
            <label>Nomor HP<input type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} autoComplete="tel" /></label>
            <label>Nomor rumah<input value={houseNumber} onChange={(event) => setHouseNumber(event.target.value)} /></label>
          </>
        )}
        <label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} /></label>
        <button className="primary" onClick={() => void submit()} disabled={isSubmitting}>{isSubmitting ? 'Memproses...' : mode === 'login' ? 'Masuk' : 'Buat akun'}</button>
        {message && <p role="status" className="message">{message}</p>}
      </section>
    </main>
  );
}