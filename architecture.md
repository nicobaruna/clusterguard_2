# ClusterGuard SOS — System Architecture

> **Tujuan dokumen**: Gambaran arsitektur tingkat sistem (system-level) yang dapat dibaca dan dieksekusi oleh AI coding agent. Dokumen ini adalah **peta utama** yang menghubungkan detail teknis di dokumen lain (Backend Design, UI/UX Design Spec) ke dalam satu kerangka stack yang koheren.

---

## 1. Ringkasan Keputusan Arsitektur

Kebutuhan utama sistem: **performa tinggi tanpa delay** (sistem darurat, latensi = risiko). Stack berikut dipilih karena memenuhi kebutuhan tersebut dengan **biaya infrastruktur Rp0**:

| # | Komponen | Teknologi | Peran |
|---|---|---|---|
| 1 | Database & Auth | **Supabase (PostgreSQL)** | Data relasional + autentikasi pengguna |
| 2 | Backend (API) | **Hono.js** di **Cloudflare Workers** | Logika bisnis, validasi, notifikasi Firebase |
| 3 | Frontend Warga & Admin | **Next.js (PWA)** di **Vercel** | Antarmuka warga dan admin |
| 4 | Mobile PIC | **React Native / Expo** | Menahan background service, membunyikan alarm |

**Keputusan kunci — Backend**: Hono.js di Cloudflare Workers **menggantikan NestJS**. Alasan: performa level enterprise (respons instan, 0ms cold start via V8 Isolates) dengan biaya Rp0, dibanding NestJS yang lebih berat untuk dijalankan di edge/serverless dengan kuota gratis.

---

## 2. Diagram Arsitektur Sistem

```
                         ┌───────────────────────────┐
                         │        SUPABASE           │
                         │  (PostgreSQL + Auth)      │
                         │                           │
                         │  - auth.users             │
                         │  - public.users           │
                         │  - public.sos_events      │
                         │  - public.user_devices    │
                         └────────────┬──────────────┘
                                      │
                     ┌────────────────┼────────────────────┐
                     │ SQL/Auth       │ SQL/Auth           │ Realtime (WebSocket)
                     │                │                    │
          ┌──────────▼──────────┐     │          ┌─────────▼──────────┐
          │  BACKEND API        │     │          │  FRONTEND PWA       │
          │  Hono.js            │◀────┘          │  Next.js on Vercel  │
          │  @ Cloudflare       │                 │  (Warga & Admin)    │
          │  Workers            │────────────────▶│                     │
          │                     │   REST API      └─────────────────────┘
          │  - JWT Middleware   │
          │  - Zod Validator    │
          │  - CORS Restriction │
          └──────────┬──────────┘
                      │ FCM API (waitUntil, non-blocking)
                      ▼
          ┌─────────────────────┐
          │  Firebase Cloud     │
          │  Messaging (FCM)    │
          └──────────┬──────────┘
                      │ Push Notification (high-priority)
                      ▼
          ┌─────────────────────┐
          │  MOBILE APP PIC     │
          │  React Native/Expo  │
          │                     │
          │  - Foreground Svc   │
          │  - Alarm/VoIP Push  │
          │  - Full-Screen Intent│
          └─────────────────────┘
```

---

## 3. Peta Komponen ke Dokumen Detail

Dokumen ini adalah ringkasan level sistem. Detail implementasi tiap komponen didokumentasikan terpisah:

| Komponen | Dokumen Rujukan |
|---|---|
| Backend API (Hono.js/Cloudflare Workers) — env config, JWT, Zod, controller SOS, CI/CD | `clusterguard-backend-design.md` — Bagian A |
| Frontend PWA & Mobile App — env config, state management, realtime, fallback dialer | `clusterguard-backend-design.md` — Bagian B |
| Database (Supabase/PostgreSQL) — skema tabel, RLS, relasi | `clusterguard-backend-design.md` — Bagian C |
| UI/UX — wireframe, design system, alur layar | `clusterguard-design.md` |

**Aturan untuk AI agent**: dokumen ini menentukan *stack dan pembagian tanggung jawab antar komponen*; dokumen-dokumen di atas menentukan *cara implementasi di dalam masing-masing komponen*. Jika ada konflik pemilihan teknologi, dokumen ini adalah sumber kebenaran (source of truth) tertinggi untuk keputusan stack.

---

## 4. Alur Data End-to-End (Skenario SOS)

1. **Warga** menekan tombol kategori SOS di **PWA (Next.js/Vercel)** → konfirmasi via slider.
2. PWA mengirim `POST` request ke **Backend API (Hono.js/Cloudflare Workers)**, disertai JWT dari sesi Supabase Auth.
3. Backend memvalidasi JWT (edge-local, `hono/jwt`) dan body request (Zod) → menyimpan record ke `public.sos_events` di **Supabase**.
4. Backend merespons `200 OK` ke PWA **segera** (tidak menunggu langkah berikut).
5. Secara paralel (`c.executionCtx.waitUntil()`), Backend mengambil daftar FCM token milik PIC dari `public.user_devices` → mengirim push notification prioritas tinggi via **FCM**.
6. **Mobile App PIC** menerima push → memicu **Full-Screen Intent** + alarm/sirine lokal (native, tidak bergantung koneksi realtime).
7. PWA Warga memantau status kejadian secara langsung via **Supabase Realtime (WebSocket)** — tanpa polling/refresh manual.
8. PIC menekan "SAYA TANGGAPI" di Mobile App → update `status = RESOLVED` langsung ke Supabase.
9. Perubahan status tersebut diterima PWA Warga secara realtime → UI berubah dari "Menunggu" ke "Ditanggapi".
10. **Fallback**: jika 30 detik berlalu tanpa perubahan status (client-side timer di PWA), PWA menampilkan modal panggilan manual (`tel:`) ke nomor PIC.

---

## 5. Batasan & Prinsip Desain Arsitektur

- **Non-blocking oleh desain**: setiap operasi yang tidak kritis untuk konfirmasi ke pengguna (broadcast notifikasi) tidak boleh menghambat response time endpoint utama — wajib dijalankan asinkron di background (`waitUntil()`), bukan diawait di jalur request.
- **Stateless backend**: Cloudflare Workers tidak menyimpan state di memory antar-request; seluruh state persisten ada di Supabase. Ini konsisten dengan model edge/serverless (setiap request bisa dieksekusi di isolate/lokasi berbeda).
- **Zero server-managed session**: autentikasi divalidasi via JWT stateless di edge, backend tidak menyimpan session store sendiri — session lifecycle sepenuhnya dikelola Supabase Auth + persistent login di sisi client (Zustand `persist`).
- **Redundansi notifikasi melalui dua jalur**: sistem tidak bergantung 100% pada FCM untuk keandalan — jalur kedua (Supabase Realtime ke PWA + fallback dialer manual) berfungsi sebagai pengaman jika push notification gagal/telat.
- **Biaya Rp0 sebagai batasan desain, bukan sekadar preferensi**: setiap keputusan teknologi (Cloudflare Workers vs NestJS/VPS, Supabase vs self-hosted DB, Vercel PWA) mempertimbangkan kuota gratis platform sebagai syarat, bukan opsional — AI agent tidak boleh menambahkan komponen berbayar (mis. dedicated server, managed Redis berbayar) tanpa persetujuan eksplisit.

---

## 6. Catatan Implementasi untuk AI Agent

- Jangan mengganti Backend API kembali ke NestJS atau framework Node.js penuh — keputusan Hono.js + Cloudflare Workers bersifat final berdasarkan kebutuhan performa (0ms cold start) dan biaya (Rp0).
- Semua komunikasi Frontend PWA ke Backend API wajib melalui domain `BACKEND_URL` (Cloudflare Workers), bukan langsung ke Supabase untuk operasi tulis (`sos_events`) — akses langsung ke Supabase dari client hanya untuk operasi baca via Realtime subscription dan Supabase Auth.
- Mobile App PIC tidak boleh bergantung sepenuhnya pada koneksi jaringan real-time saat menerima alarm — mekanisme native (Foreground Service, Full-Screen Intent) harus tetap berfungsi meski app dalam kondisi killed/background, sesuai batasan platform OS.
- Saat menambahkan environment/service baru, tempatkan sesuai lapisan yang sudah ditentukan (lihat §1) — jangan menduplikasi tanggung jawab antar komponen (mis. jangan menaruh logika validasi bisnis di Frontend jika seharusnya di Backend).
