'use client';

import { useEffect, useState } from 'react';
import { LoginScreen } from './login';
import { useAuthStore } from './auth-store';

const categories = [
  { name: 'MEDIS', color: 'critical', icon: '🚑' },
  { name: 'BENCANA', color: 'warning', icon: '🔥' },
  { name: 'KEAMANAN', color: 'security', icon: '🛡️' },
] as const;

export default function HomePage() {
  const { session, isAuthenticated, signOut } = useAuthStore();
  const [selected, setSelected] = useState<string | null>(null);
  const [dragged, setDragged] = useState(false);
  const [sentEvent, setSentEvent] = useState<{ id: string; category: string; status: string } | null>(null);
  const [fallbackTimer, setFallbackTimer] = useState(0);
  const [requestError, setRequestError] = useState('');
  const [isSending, setIsSending] = useState(false);

  useEffect(() => {
    if (!sentEvent) return;

    const interval = window.setInterval(() => {
      setFallbackTimer((current) => current + 1);
    }, 1000);

    const timeout = window.setTimeout(() => {
      setSentEvent((current) => (current ? { ...current, status: 'FALLBACK' } : current));
    }, 30_000);

    return () => {
      window.clearInterval(interval);
      window.clearTimeout(timeout);
    };
  }, [sentEvent]);

  const sendSos = async (category: string) => {
    setIsSending(true);
    setRequestError('');

    try {
      const response = await fetch('http://localhost:8787/sos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category }),
      });

      if (!response.ok) throw new Error('Server SOS belum tersedia.');

      const payload = await response.json();
      const nextEvent = {
        id: payload.event?.id ?? 'demo-event',
        category: payload.event?.category ?? category,
        status: payload.event?.status ?? 'PENDING',
      };

      setSentEvent(nextEvent);
      setFallbackTimer(0);
      setSelected(category);
    } catch {
      setRequestError('SOS belum terkirim. Periksa koneksi dan coba lagi.');
    } finally {
      setIsSending(false);
    }
  };

  const resolveSos = async () => {
    if (!sentEvent) return;

    const response = await fetch(`http://localhost:8787/sos/${sentEvent.id}/resolve`, {
      method: 'PATCH',
    });

    if (response.ok) {
      setSentEvent({ ...sentEvent, status: 'RESOLVED' });
    }
  };

  if (!isAuthenticated || !session) {
    return (
      <main className="page-shell auth-shell">
        <div className="auth-wrapper">
          <LoginScreen />
        </div>
      </main>
    );
  }

  return (
    <main className="page-shell">
      <div className="panel">
        <header className="topbar">
          <button className="ghost">Profil</button>
          <button
            className="ghost"
            onClick={() => void signOut()}
          >
            Logout
          </button>
        </header>

        <h1>Halo, {session.full_name} ({session.house_number ?? 'Blok A-12'})</h1>
        <p className="subtitle">Ada keadaan darurat?</p>

        {!sentEvent && (
          <div className="stack">
            {categories.map(({ name, color, icon }) => (
              <button
                key={name}
                className={`category ${color}`}
                onClick={() => setSelected(name)}
              >
                <span className="icon">{icon}</span>
                <span>{name}</span>
              </button>
            ))}
          </div>
        )}

        {selected && !sentEvent && (
          <div className="confirm-box">
            <h2>! DARURAT {selected} !</h2>
            <p>Apakah Anda butuh bantuan {selected.toLowerCase()} sekarang?</p>
            <div
              className={`slider ${dragged ? 'active' : ''}`}
              role="button"
              tabIndex={0}
              aria-label={`Kirim SOS ${selected}`}
              onPointerDown={() => setDragged(true)}
              onPointerUp={() => {
                setDragged(false);
                if (!isSending) void sendSos(selected);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') void sendSos(selected);
              }}
            >
              <span className="slider-knob">{isSending ? '...' : '→'}</span>
              <span>{isSending ? 'Mengirim SOS...' : 'Geser ke Kanan untuk Kirim SOS'}</span>
            </div>
            {requestError && <p className="error-message" role="alert">{requestError}</p>}
            <button className="link-button" onClick={() => setSelected(null)}>Batal / Kembali</button>
          </div>
        )}

        {sentEvent && (
          <div className="status-box">
            <div className="status-pill">Status: {sentEvent.status}</div>
            <h2>{sentEvent.category}</h2>
            <p>Waktu berlalu: {fallbackTimer}s</p>
            {sentEvent.status === 'PENDING' ? (
              <>
                <p className="status-note">Menunggu respons PIC...</p>
                <button className="primary-button" onClick={() => void resolveSos()}>PIC telah menanggapi</button>
              </>
            ) : (
              <>
                <p className="status-note">PIC telah menanggapi dan situasi aman.</p>
                <button className="primary-button" onClick={() => setSentEvent(null)}>Kembali</button>
              </>
            )}
            {sentEvent.status === 'FALLBACK' && (
              <div className="fallback-box">
                <h3>Koneksi PIC gagal</h3>
                <a href="tel:+6281234567890">📞 Telepon PIC 1</a>
                <a href="tel:+6281987654321">📞 Telepon PIC 2</a>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
