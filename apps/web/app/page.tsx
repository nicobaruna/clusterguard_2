'use client';

import { useEffect, useState } from 'react';
import { useAuthStore } from './auth-store';

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
    return (
      <main className="auth-shell">
        <section className="auth-card">
          <p className="eyebrow">{user.role}</p>
          <h1>Halo, {user.fullName}</h1>
          <p>Akun Anda terhubung dengan autentikasi Supabase.</p>
          <button className="primary" onClick={() => void signOut()}>Keluar</button>
        </section>
      </main>
    );
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
