# Product Requirements Document (PRD) — Sistem SOS Warga Cluster

> **Tujuan dokumen**: Versi Markdown dari PRD asli, distrukturkan agar mudah dibaca dan dieksekusi oleh AI coding agent. Dilengkapi task list implementasi berurutan prioritas di bagian akhir.

**Tanggal**: September 2026
**Nama Produk**: Aplikasi Darurat SOS Warga Cluster

---

## 1. Informasi Umum

**Tujuan Produk**: Menyediakan platform komunikasi darurat yang responsif, andal, dan bebas biaya operasional infrastruktur (Rp0) bagi warga perumahan untuk meminta bantuan instan kepada tim PIC (Person in Charge).

---

## 2. Peran Pengguna (User Roles)

| Role | Deskripsi & Hak Akses |
|---|---|
| **Warga** | Pengguna standar. Dapat menekan tombol SOS (Medis, Bencana, Keamanan). Menerima notifikasi 1x bunyi jika ada warga lain menekan SOS. |
| **PIC** | Responden darurat. Menerima notifikasi SOS persisten (alarm terus-menerus di perangkat mobile). Dapat mengubah status SOS menjadi "Ditanggapi". Dapat menggunakan fitur SOS seperti Warga. |
| **Super Admin** | Administrator sistem. Memiliki seluruh akses Warga dan PIC, ditambah fitur manajemen data pengguna dan pendaftaran warga. |

**Catatan untuk AI agent**: hierarki akses bersifat kumulatif — PIC mewarisi seluruh kapabilitas Warga, dan Super Admin mewarisi seluruh kapabilitas PIC + Warga. Implementasi role-check (mis. RLS policy, middleware) harus merefleksikan pewarisan ini, bukan role yang saling eksklusif.

---

## 3. Functional Requirements (FR)

### FR-1: Modul SOS Utama
- Sistem menyediakan **3 kategori darurat**: Medis, Bencana, Keamanan.

### FR-2: Notifikasi & Alarm

| Penerima | Perilaku Notifikasi |
|---|---|
| **PIC** | Menerima push notification yang memicu **alarm persisten** (menyala terus-menerus di background) hingga tombol "Ditanggapi" ditekan — baik dari layar notifikasi maupun di dalam aplikasi. |
| **Warga** | Menerima notifikasi standar, **berbunyi 1x**, sebagai informasi bahwa ada status darurat aktif di area cluster. |

### FR-3: Pendaftaran & Autentikasi
- Warga dapat melakukan **registrasi mandiri**, atau **didaftarkan oleh Super Admin**.
- Data wajib direkam saat registrasi: `Nama`, `Nomor Telepon`, `Nomor Rumah`, `Password`.
- Sistem memberlakukan **Persistent Login**: pengguna tetap dalam kondisi login sampai tombol logout ditekan secara sadar.

### FR-4: Sistem Multi-Broadcast
- Setiap 1 sinyal SOS yang ditekan **didistribusikan secara bersamaan** ke seluruh PIC yang terdaftar (broadcast, bukan round-robin/antrian).

---

## 4. Non-Functional Requirements (NFR)

### NFR-1: Keandalan (Reliability)
- Aplikasi **wajib tidak pernah gagal** menampilkan notifikasi SOS.
- Target arsitektur harus **menghilangkan potensi cold start**.

### NFR-2: Anggaran (Budget Constraint)
- Infrastruktur backend, database, dan frontend **wajib** dirancang menggunakan layanan Free Tier yang memadai sehingga biaya operasional adalah **Rp0/bulan**.

### NFR-3: Aksesibilitas UI/UX
- Antarmuka harus sangat responsif dan mudah digunakan oleh pengguna rentan (**lansia dan anak-anak**).
- Pendekatan: tombol pemicu raksasa dengan **konfirmasi geser/tahan** (bukan single-tap).

### NFR-4: Distribusi Platform
| Target Pengguna | Bentuk Distribusi |
|---|---|
| Warga & Admin | **Progressive Web App (PWA)** |
| PIC | **Aplikasi Mobile** (Native/Cross-platform) — wajib native untuk menembus restriksi baterai OS |

---

## 5. Arsitektur Sistem & Tech Stack Terpilih

| Komponen | Teknologi | Alasan Pemilihan & Fungsi |
|---|---|---|
| Database & Auth | **Supabase** | PostgreSQL relasional, realtime trigger (WebSockets), dan layanan Autentikasi komprehensif dalam limit Free Tier yang tinggi. |
| Backend (API) | **Hono.js + Cloudflare Workers** | Menghilangkan cold start (0ms boot time via V8 Isolates). Ringan, cepat, TypeScript, kuota gratis 100.000 requests/hari. |
| Frontend (Warga) | **Next.js (Vercel)** | PWA optimal, responsif, di-host langsung di jaringan Vercel Edge. |
| Mobile App (PIC) | **React Native (Expo)** | Dibutuhkan untuk konfigurasi Foreground Services (Android) atau VoIP Push/Critical Alerts (iOS) agar alarm berjalan persisten. |
| Notification Engine | **Firebase Cloud Messaging (FCM)** | Solusi 100% gratis untuk distribusi notifikasi ke perangkat mobile dan PWA. |

> Lihat detail teknis lengkap tiap komponen di: `architecture.md`, `clusterguard-backend-design.md`, `clusterguard-design.md`.

---

## 6. Flow Alternatif & Skenario Gagal (Fallback Strategy)

**Konteks**: mengakomodasi kebutuhan "menelepon otomatis" tanpa menghabiskan budget API pihak ketiga (mis. Twilio) → solusi: **Client-Side Dialer Fallback**.

### Alur Kerja Fallback

1. Warga menekan SOS → PWA mengirim `POST` request ke Hono API.
2. Kondisi trigger fallback (salah satu terpenuhi):
   - Hono API timeout/error, **ATAU**
   - Status SOS di Supabase **tidak berubah menjadi "Ditanggapi" dalam 30 detik**.
3. PWA Warga memunculkan **modal peringatan skala penuh**.
4. Modal menampilkan tombol aksi: `"Koneksi Gagal/Tidak Ada Respons. Klik untuk Telepon PIC 1"`.
5. Browser memanggil protokol `tel://[No_Telp_PIC_1]`.
6. Jika panggilan ditutup oleh Warga (PIC tidak menjawab) → antarmuka **secara dinamis** menampilkan tombol lanjutan untuk menghubungi PIC 2, dan seterusnya (berurutan, satu per satu).

```
Kirim SOS ──▶ POST /sos
                 │
     ┌───────────┴────────────┐
     │ Timeout/Error API      │ Tidak timeout, tunggu 30s
     ▼                        ▼
Fallback langsung      status == "Ditanggapi"? ──▶ Ya ──▶ Selesai (normal)
     │                        │
     │                        Tidak (30s habis)
     ▼                        ▼
     └────────────────▶ Modal Fallback Penuh
                              │
                    Tombol: Telepon PIC 1 (tel://)
                              │
                  PIC 1 tidak menjawab (call ditutup)
                              │
                              ▼
                    Tombol: Telepon PIC 2 (tel://)
                              │
                             ...
```

**Aturan untuk AI agent**: trigger fallback punya **dua kondisi OR**, bukan hanya timeout status Realtime — implementasi harus menangani baik kegagalan HTTP request awal (`POST /sos` gagal/timeout) maupun kegagalan menerima update status dalam 30 detik setelah request berhasil.

---

## 7. Task List Implementasi (Berdasarkan Prioritas)

> Urutan berikut merepresentasikan dependency teknis: task berprioritas lebih tinggi wajib selesai lebih dulu karena task di bawahnya bergantung padanya.

### P0 — Fondasi (Blocker untuk semua fitur lain)
1. **Setup Supabase project**: buat schema `public.users`, `public.sos_events`, `public.user_devices` + enum (`user_role`, `sos_category`, `sos_status`) sesuai `clusterguard-backend-design.md` Bagian C.
2. **Aktifkan Row Level Security (RLS)** di ketiga tabel sebelum tabel diakses oleh client mana pun.
3. **Setup Cloudflare Workers project** dengan Hono.js — konfigurasi `.dev.vars` dan `wrangler.toml` sesuai Bagian A §2.
4. **Setup Firebase project** untuk FCM (server key, project credentials).

### P1 — Autentikasi & Identitas
5. **Implementasi registrasi & login** (Supabase Auth) — mandiri oleh Warga, dan oleh Super Admin (FR-3).
6. **JWT Middleware** di Backend (`hono/jwt`) untuk validasi token Supabase secara edge-local (Bagian A §3.1).
7. **Persistent Login (offline-first)** di sisi client — Zustand `persist`, dengan requirement login tetap bertahan tanpa internet (lihat `clusterguard-backend-design.md` §10.1.1).

### P2 — Core Backend: Modul SOS
8. **Zod Validator** untuk kategori darurat (`MEDIS`, `BENCANA`, `KEAMANAN`) (Bagian A §3.2).
9. **Endpoint `POST /sos`**: pencatatan ke `sos_events` dengan `sender_id` dari JWT payload (Bagian A §4).
10. **FCM Broadcast (Multi-Broadcast, FR-4)**: ambil seluruh token PIC dari `user_devices`, kirim serentak, dibungkus `c.executionCtx.waitUntil()` agar non-blocking.
11. **Endpoint update status** (`PATCH /sos/:id/resolve` atau setara): PIC menandai "Ditanggapi" → update `status`, `resolved_by`, `resolved_at`.
12. **CORS restriction** ke `FRONTEND_URL` (Bagian A §3.3).

### P3 — Frontend PWA (Warga & Admin)
13. **Dashboard Warga** — 3 tombol kategori besar (lihat `clusterguard-design.md` §2.1).
14. **Layar Konfirmasi (slider "Geser untuk Kirim SOS")** — anti false-trigger (§2.2).
15. **Layar Status real-time** via Supabase Realtime subscription (§2.3 State A).
16. **Notifikasi 1x bunyi untuk Warga lain** (FR-2) saat ada SOS baru di cluster.
17. **Client-Side Dialer Fallback** — timer 30 detik + modal + tombol `tel:` berurutan (Bagian 6 di atas).
18. **Panel Super Admin**: tabel Data Warga (CRUD), Data PIC, Riwayat SOS, unduh laporan bulanan (`clusterguard-design.md` §4).

### P4 — Mobile App PIC
19. **Setup React Native/Expo project** + integrasi FCM untuk penerimaan push.
20. **Full-Screen Intent + alarm persisten** (Android) dan VoIP Push/Critical Alerts (iOS) agar notifikasi PIC tidak bisa diabaikan (NFR-4, `clusterguard-design.md` §3.1).
21. **Tombol "SAYA TANGGAPI"** — memanggil endpoint resolve dari task #11, menghentikan alarm lokal.
22. **Dashboard PIC**: toggle status aktif bertugas, riwayat hari ini, tombol SOS mandiri (§3.2).

### P5 — CI/CD & Operasional
23. **GitHub Actions + `cloudflare/wrangler-action`** untuk build & deploy otomatis Backend (Bagian A §5), dengan secrets `CF_API_TOKEN` dan `CF_ACCOUNT_ID`.
24. **Deploy Frontend PWA ke Vercel** (build otomatis dari branch utama).
25. **Build & submit Mobile App** (Expo build/EAS) ke distribusi internal atau store.

### P6 — Pengujian & Penyempurnaan
26. **Uji end-to-end skenario darurat**: dari tap tombol Warga → broadcast FCM → respons PIC → update realtime → (jika perlu) fallback dialer.
27. **Uji reliability NFR-1**: pastikan tidak ada skenario di mana notifikasi SOS gagal tampil tanpa fallback.
28. **Review biaya (NFR-2)**: pastikan seluruh service masih dalam batas Free Tier setelah beban penggunaan riil.

---

## 8. Referensi Silang Dokumen

| Dokumen | Isi |
|---|---|
| `architecture.md` | Peta arsitektur sistem level tinggi, diagram, alur data end-to-end |
| `clusterguard-backend-design.md` | Detail Backend (Bagian A), Frontend/Mobile (Bagian B), Database (Bagian C) |
| `clusterguard-design.md` | Wireframe & design system UI/UX seluruh platform |
| `product-prd.md` (dokumen ini) | Requirement produk (FR/NFR) + task list prioritas |
