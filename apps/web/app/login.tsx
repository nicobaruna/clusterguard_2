'use client';

import { useState } from 'react';
import { useAuthStore } from './auth-store';

export function LoginScreen() {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('budi@example.com');
  const [password, setPassword] = useState('password123');
  const [fullName, setFullName] = useState('Bpk. Budi');
  const [houseNumber, setHouseNumber] = useState('Blok A-12');
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { signIn, signUp } = useAuthStore();

  const handleSubmit = async () => {
    setMessage('');
    setIsSubmitting(true);

    if (mode === 'login') {
      const result = await signIn(email, password);
      setMessage(result.ok ? 'Login berhasil.' : result.message || 'Login gagal.');
      setIsSubmitting(false);
      return;
    }

    const result = await signUp({
      email,
      password,
      full_name: fullName,
      house_number: houseNumber,
      role: 'WARGA',
    });

    setMessage(result.ok ? 'Registrasi berhasil.' : result.message || 'Registrasi gagal.');
  setIsSubmitting(false);
  };

  return (
    <div className="auth-card">
      <div className="segmented-control">
        <button className={mode === 'login' ? 'active' : ''} onClick={() => setMode('login')}>Login</button>
        <button className={mode === 'signup' ? 'active' : ''} onClick={() => setMode('signup')}>Daftar</button>
      </div>

      {mode === 'signup' && (
        <label>
          Nama Lengkap
          <input value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </label>
      )}

      {mode === 'signup' && (
        <label>
          Nomor Rumah
          <input value={houseNumber} onChange={(e) => setHouseNumber(e.target.value)} />
        </label>
      )}

      <label>
        Email
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>

      <label>
        Password
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
      </label>

      {message && <p className="auth-message">{message}</p>}

      <button className="primary-button" onClick={() => void handleSubmit()} disabled={isSubmitting}>
        {isSubmitting ? 'Memproses...' : mode === 'login' ? 'Masuk' : 'Buat Akun'}
      </button>
    </div>
  );
}
