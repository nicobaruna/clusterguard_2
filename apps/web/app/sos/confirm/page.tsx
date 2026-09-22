import Link from 'next/link';

const CATEGORIES = ['MEDIS', 'BENCANA', 'KEAMANAN'] as const;

const LABELS: Record<string, string> = {
  MEDIS: 'medis',
  BENCANA: 'untuk bencana',
  KEAMANAN: 'untuk keamanan',
};

export default function SosConfirmPage({ searchParams }: { searchParams: { category?: string } }) {
  const category = searchParams.category;
  const valid = CATEGORIES.includes(category as (typeof CATEGORIES)[number]);

  if (!valid) {
    return (
      <main className="auth-shell">
        <section className="auth-card">
          <p className="eyebrow">CLUSTERGUARD SOS</p>
          <h1>Kategori tidak dikenali.</h1>
          <p className="muted">Kembali ke beranda dan pilih salah satu kategori darurat.</p>
          <Link className="primary-link" href="/">Batal / Kembali</Link>
        </section>
      </main>
    );
  }

  return (
    <main className="auth-shell">
      <section className="auth-card confirm-stub">
        <p className="eyebrow">CLUSTERGUARD SOS</p>
        <h1 className={`confirm-title category-${category?.toLowerCase()}`}>! DARURAT {category} !</h1>
        <p className="muted">Apakah Anda butuh bantuan {LABELS[String(category)]} sekarang?</p>
        <p className="muted placeholder-note">Konfirmasi geser akan tersedia di layar berikutnya.</p>
        <Link className="primary-link" href="/">Batal / Kembali</Link>
      </section>
    </main>
  );
}