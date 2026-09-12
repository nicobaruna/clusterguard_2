# ClusterGuard SOS System — Design Document (Backend + Frontend + Mobile + Database)

> **Tujuan dokumen**: Menjadi referensi teknis yang dapat dibaca dan dieksekusi oleh AI coding agent untuk membangun/memelihara sistem darurat SOS ClusterGuard, mencakup Backend, Frontend (PWA), Mobile App (PIC), dan Database (Supabase/PostgreSQL).

---

# BAGIAN A — BACKEND

## 1. Ringkasan Arsitektur

Backend dirancang dengan model **serverless berbasis Edge computing** untuk memastikan:
- Latensi rendah (dieksekusi di edge, dekat dengan pengguna)
- Biaya operasional Rp0 (memanfaatkan kuota gratis platform)

| Aspek | Pilihan | Alasan |
|---|---|---|
| Runtime / Framework | **Hono.js** di atas **Cloudflare Workers** | Menggantikan NestJS untuk mengeliminasi cold start (0ms boot time via V8 Isolates), kuota gratis memadai |
| Database & Auth | **Supabase** | Data relasional + autentikasi pengguna |
| Push Notification | **Firebase Cloud Messaging (FCM)** | Pengiriman notifikasi darurat ke seluruh PIC terdaftar |

---

## 2. Manajemen Konfigurasi Environment

Dua lapisan konfigurasi dipisahkan berdasarkan tingkat sensitivitas:

### 2.1 `.dev.vars` — Rahasia / Kredensial Sensitif
Berisi parameter yang **tidak boleh** ter-commit ke repository:

```
SUPABASE_URL=
SUPABASE_JWT_SECRET=
FCM_SERVER_KEY=
```

### 2.2 `wrangler.toml` — Konfigurasi Publik
Berisi variabel non-rahasia:

```toml
[vars]
CLUSTER_NAME = ""
FRONTEND_URL = ""
BACKEND_URL = ""
```

**Aturan untuk AI agent**: jangan pernah menulis nilai `.dev.vars` ke dalam `wrangler.toml` atau ke kode sumber yang di-commit.

---

## 3. Keamanan & Validasi API

### 3.1 JWT Middleware
- Memvalidasi token autentikasi Supabase **secara lokal di level Edge**.
- Menggunakan pustaka `hono/jwt`.
- Tujuan: verifikasi token tanpa membebani database pada setiap request (tidak melakukan round-trip ke Supabase Auth API untuk validasi token).

### 3.2 Zod Validator
- Memvalidasi format request body secara ketat.
- Field kategori darurat hanya boleh bernilai salah satu dari enum berikut:

```ts
enum SOSCategory {
  MEDIS = "MEDIS",
  BENCANA = "BENCANA",
  KEAMANAN = "KEAMANAN"
}
```

### 3.3 CORS Restriction
- Akses API dibatasi secara eksklusif ke domain yang terdaftar pada variabel `FRONTEND_URL`.
- Tidak ada wildcard origin (`*`) yang diizinkan di environment produksi.

---

## 4. Logika Bisnis — Controller SOS

Alur eksekusi endpoint SOS (contoh: `POST /sos`):

1. **Autentikasi**: JWT middleware memvalidasi token, mengekstrak identitas pengguna dari payload.
2. **Validasi**: Zod validator memeriksa body request (kategori darurat, dsb).
3. **Pencatatan Database**: Data sinyal darurat disimpan ke tabel Supabase `sos_events`, menggunakan `user_id` dari payload JWT sebagai identitas pelapor.
4. **FCM Broadcast**:
   - Mengambil seluruh device token milik PIC (Person in Charge) yang terdaftar.
   - Mengirim notifikasi prioritas tinggi (high-priority alarm) melalui FCM API.
5. **Non-Blocking Execution**:
   - Proses pengiriman FCM dijalankan via `c.executionCtx.waitUntil()`.
   - Response HTTP ke klien **tidak menunggu** proses broadcast FCM selesai — request dianggap sukses begitu data tersimpan di database.

### Diagram Alur (ringkas)

```
Client → [JWT Middleware] → [Zod Validator] → [Simpan ke sos_events]
                                                     │
                                                     ├─→ Response 200 OK ke client (langsung)
                                                     │
                                                     └─→ waitUntil(): Ambil token PIC → Broadcast via FCM
```

---

## 5. CI/CD Pipeline

- **Tools**: GitHub Actions + `cloudflare/wrangler-action`
- **Secrets yang diperlukan** (disimpan di GitHub Secrets, bukan di kode):
  - `CF_API_TOKEN`
  - `CF_ACCOUNT_ID`
- **Alur**: setiap push/merge yang relevan memicu workflow build → deploy otomatis ke Cloudflare Workers.

---

## 6. Catatan Implementasi untuk AI Agent

- Jangan menambahkan dependency yang membutuhkan Node.js runtime penuh (mis. yang mengandalkan `fs` native) karena target deploy adalah Cloudflare Workers (V8 Isolate, bukan Node.js runtime standar).
- Semua validasi kategori darurat wajib melalui Zod schema sebelum data masuk ke logika bisnis — jangan validasi manual dengan if/else string matching.
- Operasi yang tidak kritis untuk response (seperti broadcast notifikasi) harus selalu dibungkus `waitUntil()`, bukan `await` langsung di jalur utama request.
- Variabel rahasia hanya boleh diakses melalui `c.env` (binding Cloudflare Workers), tidak melalui `process.env`.

---

# BAGIAN B — FRONTEND & MOBILE APP

## 7. Ringkasan Arsitektur FE/Mobile

Dirancang untuk memastikan kemudahan akses, performa instan, dan keandalan operasional, dengan dua platform distribusi berbeda sesuai peran pengguna:

| Platform | Target Pengguna | Teknologi | Alasan |
|---|---|---|---|
| **Next.js PWA** | Warga & Admin | Di-host di **Vercel Edge** dengan **Service Worker** | Antarmuka responsif, tetap dapat diakses offline (cache statis) |
| **React Native / Expo** | Mobile App PIC | Native app | Dibutuhkan khusus untuk menembus restriksi OS lewat **Foreground Services** dan **Alarm/VoIP Push**, memastikan alarm berbunyi persisten di latar belakang |

**Catatan untuk AI agent**: PWA (Next.js) **tidak cukup** untuk perangkat PIC karena keterbatasan background execution di browser/OS — PIC wajib menggunakan native app (React Native/Expo).

---

## 8. Manajemen Konfigurasi Environment (Frontend)

Konfigurasi publik dibaca melalui `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

**Aturan untuk AI agent**: hanya variabel berprefiks `NEXT_PUBLIC_` yang boleh diakses dari sisi client (browser). Kredensial rahasia (service role key, dsb.) tidak boleh pernah ditempatkan di `.env.local` atau bundle client.

---

## 9. Desain UI/UX & Aksesibilitas

### 9.1 Aksesibilitas Ekstrem
Dirancang ramah bagi lansia dan anak-anak:
- **Massive touch targets** — tombol pemicu berukuran besar.
- **Kontras warna tinggi**.
- **Ikon visual yang jelas** (bukan hanya teks).

### 9.2 Pencegahan Salah Tekan (False Alarm Prevention)
- Mekanisme **slider** ("Geser untuk Kirim SOS"), bukan tombol tap biasa.
- Tujuan: menghindari trigger SOS tidak sengaja.

**Aturan untuk AI agent**: setiap tombol pemicu SOS wajib menggunakan komponen slider/gesture-confirm, tidak boleh diganti dengan `onClick` sederhana meski untuk mempercepat development.

---

## 10. State Management & Integrasi Real-Time

### 10.1 Persistent Login
- Menggunakan **Zustand** dengan middleware `persist`.
- Storage: `localStorage` (web/PWA) atau `AsyncStorage` (React Native).
- Sesi login tetap aktif **permanen** sampai pengguna menekan tombol logout secara sadar (tidak ada auto-expire di sisi UI).

### 10.1.1 Requirement: Sesi Login Tetap Bertahan Tanpa Koneksi Internet

**Kebutuhan**: pengguna yang sudah login **tidak boleh** ter-logout atau dihadapkan ke layar login ulang hanya karena perangkat sedang offline (mis. sinyal lemah, mode pesawat, area tanpa internet).

Aturan implementasi:
- **Startup check bersifat lokal, bukan network-dependent**: saat aplikasi dibuka, status "sudah login" ditentukan dari data sesi yang tersimpan di `localStorage`/`AsyncStorage` (via Zustand `persist`) secara **synchronous**, bukan menunggu hasil verifikasi ke Supabase Auth API. UI langsung dirender sebagai "sudah login" jika sesi tersimpan ditemukan, terlepas dari status jaringan.
- **Refresh token bersifat opportunistic**: jika perangkat online, refresh access token (Supabase) dapat dilakukan di background secara silent. Jika perangkat offline, aplikasi tetap memakai token/sesi terakhir yang tersimpan dan **tidak memaksa logout** hanya karena refresh gagal akibat tidak ada jaringan.
- **Logout paksa hanya terjadi pada kondisi definitif**: satu-satunya alasan valid untuk memaksa pengguna login ulang adalah ketika backend secara eksplisit merespons `401 Unauthorized`/token invalid saat perangkat **online** dan benar-benar melakukan request ke API. Kegagalan jaringan (timeout, no connection) **tidak boleh** diperlakukan sama seperti token invalid.
- **Berlaku untuk kedua platform**: aturan ini berlaku sama untuk PWA (Next.js, `localStorage`) maupun Mobile App PIC (React Native, `AsyncStorage`).
- **Batasan wajar**: fitur yang secara inheren butuh koneksi (mis. mengirim sinyal SOS baru, menerima update Realtime) tetap membutuhkan internet saat dieksekusi — requirement ini hanya menjamin *status login* tidak hilang saat offline, bukan menjamin seluruh fitur berfungsi tanpa internet.

**Aturan untuk AI agent**: jangan menambahkan logic yang melakukan `await` ke endpoint verifikasi sesi sebelum merender rute terproteksi (protected route) pada saat aplikasi pertama kali dibuka — gunakan state Zustand yang sudah di-hydrate dari storage lokal sebagai sumber kebenaran awal, verifikasi ke server berjalan di belakang layar tanpa memblokir UI.

### 10.2 Supabase Realtime (WebSocket)
- PWA Warga mendengarkan pembaruan status darurat secara langsung dari database.
- Tidak memerlukan refresh manual — update UI terjadi otomatis saat ada perubahan data di Supabase.

---

## 11. Mekanisme Skenario Gagal (Client-Side Fallback)

Skenario: sinyal SOS terkirim namun tidak kunjung ditanggapi.

1. Sistem mendeteksi tidak ada respons dalam **30 detik**.
2. UI menampilkan **modal interaktif fallback**, berisi daftar tombol panggilan manual.
3. Setiap tombol menggunakan skema `tel:` untuk menghubungi nomor telepon seluler PIC.
4. Nomor PIC dipanggil **secara berurutan** (bukan broadcast serentak), memberi kesempatan pengguna menghubungi satu per satu jika yang pertama tidak diangkat.

```
SOS dikirim → mulai timer 30s
      │
      ├─ direspons dalam 30s → alur normal lanjut
      │
      └─ tidak direspons dalam 30s → tampilkan modal
                                        │
                                        └─ list tombol tel:<nomor_PIC_1>, tel:<nomor_PIC_2>, ...
```

**Aturan untuk AI agent**: timer 30 detik dan modal fallback adalah logika **client-side**, tidak bergantung pada backend untuk memicu — backend hanya menyediakan status data, deteksi "tidak direspons" dihitung di client berdasarkan state terakhir yang diterima via Supabase Realtime.

---

## 12. Catatan Implementasi Tambahan untuk AI Agent (FE/Mobile)

- Service Worker pada PWA hanya meng-cache aset statis (shell aplikasi), bukan data SOS real-time — data darurat harus selalu fresh dari Supabase, tidak boleh disajikan dari cache basi.
- Untuk React Native/Expo, pastikan konfigurasi Foreground Service dan Alarm/VoIP Push disiapkan secara native (bukan lewat library web-push generik) agar alarm tetap berbunyi saat app di-kill/background pada level OS.
- Jangan menyimpan token/kredensial sensitif di `localStorage`/`AsyncStorage` selain token sesi yang memang didesain untuk persistent login.
- Status login (`isAuthenticated`) wajib bersumber dari state Zustand yang sudah di-hydrate dari storage lokal, bukan dari hasil call API — lihat detail requirement di §10.1.1.

---

# BAGIAN C — DATABASE (Supabase / PostgreSQL)

## 13. Ringkasan Struktur Database

Supabase sudah menyediakan sistem autentikasi bawaan (`auth.users`), sehingga skema `public` hanya perlu berisi tabel-tabel yang **merujuk** ke tabel autentikasi tersebut, bukan menduplikasinya.

Rancangan tabel relasional minimalis namun kokoh untuk sistem SOS ini terdiri dari 3 tabel utama:

1. `users` — data profil (Warga, PIC, Admin)
2. `sos_events` — riwayat/transaksi kejadian darurat
3. `user_devices` — token push notification (FCM)

**Aturan untuk AI agent**: jangan membuat tabel autentikasi baru (mis. `login`, `accounts`) — semua identitas pengguna wajib merujuk ke `auth.users.id` melalui foreign key `id`/`user_id`.

---

## 14. Tabel `users` (Data Pengguna)

Menyimpan profil warga, PIC, dan Admin.

| Kolom | Tipe Data | Deskripsi |
|---|---|---|
| `id` | UUID (PK) | Berelasi langsung dengan `auth.users.id`. |
| `full_name` | VARCHAR | Nama lengkap pengguna. |
| `phone_number` | VARCHAR | Nomor telepon (penting untuk fitur fallback dialer). |
| `house_number` | VARCHAR | Nomor blok atau rumah (contoh: Blok A-12). |
| `role` | ENUM | `'WARGA'`, `'PIC'`, `'SUPER_ADMIN'`. |
| `created_at` | TIMESTAMP | Waktu pengguna didaftarkan. |

```sql
CREATE TYPE user_role AS ENUM ('WARGA', 'PIC', 'SUPER_ADMIN');

CREATE TABLE public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name VARCHAR NOT NULL,
  phone_number VARCHAR NOT NULL,
  house_number VARCHAR,
  role user_role NOT NULL DEFAULT 'WARGA',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
```

---

## 15. Tabel `sos_events` (Riwayat Darurat)

Tabel transaksi utama yang mencatat setiap kali tombol SOS ditekan.

| Kolom | Tipe Data | Deskripsi |
|---|---|---|
| `id` | UUID (PK) | ID unik kejadian darurat. |
| `sender_id` | UUID (FK) | Berelasi ke `users.id` (warga/PIC yang menekan tombol). |
| `category` | ENUM | `'MEDIS'`, `'BENCANA'`, `'KEAMANAN'`. |
| `status` | ENUM | `'PENDING'`, `'RESOLVED'`. |
| `resolved_by` | UUID (FK) | Berelasi ke `users.id` (PIC yang menanggapi). Nullable. |
| `resolved_at` | TIMESTAMP | Waktu PIC menekan tombol "Ditanggapi". Nullable. |
| `created_at` | TIMESTAMP | Waktu sinyal SOS pertama kali dikirim. |

```sql
CREATE TYPE sos_category AS ENUM ('MEDIS', 'BENCANA', 'KEAMANAN');
CREATE TYPE sos_status AS ENUM ('PENDING', 'RESOLVED');

CREATE TABLE public.sos_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id UUID NOT NULL REFERENCES public.users(id),
  category sos_category NOT NULL,
  status sos_status NOT NULL DEFAULT 'PENDING',
  resolved_by UUID REFERENCES public.users(id),
  resolved_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
```

**Catatan untuk AI agent**: field `category` di tabel ini harus selaras dengan enum `SOSCategory` pada Zod validator backend (lihat Bagian A, §3.2) — kedua sisi wajib menggunakan set nilai yang identik (`MEDIS`, `BENCANA`, `KEAMANAN`).

---

## 16. Tabel `user_devices` (Token Push Notification)

Untuk mengirim alarm melalui FCM, Device Token dari perangkat yang digunakan PIC maupun Warga wajib disimpan.

| Kolom | Tipe Data | Deskripsi |
|---|---|---|
| `id` | UUID (PK) | ID unik record perangkat. |
| `user_id` | UUID (FK) | Berelasi ke `users.id`. |
| `fcm_token` | TEXT | Token FCM yang di-generate oleh perangkat/browser. |
| `device_type` | VARCHAR | Identifikasi platform (`'PWA'` atau `'MOBILE'`). |
| `updated_at` | TIMESTAMP | Kapan terakhir kali token diperbarui (token bisa kadaluarsa). |

```sql
CREATE TABLE public.user_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  fcm_token TEXT NOT NULL,
  device_type VARCHAR NOT NULL CHECK (device_type IN ('PWA', 'MOBILE')),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
```

---

## 17. Relasi Antar Tabel (Ringkasan)

```
auth.users (Supabase built-in)
      │ 1:1
      ▼
public.users ──┬── 1:N ──▶ public.sos_events (sender_id)
               │                    │
               │                    └── FK opsional ─▶ public.users (resolved_by)
               │
               └── 1:N ──▶ public.user_devices (user_id)
```

## 18. Catatan Implementasi Database untuk AI Agent

- Aktifkan **Row Level Security (RLS)** pada ketiga tabel `public` — jangan biarkan tabel terbuka tanpa policy, karena semua akses dari client (PWA/Mobile) menggunakan `anon key` + JWT pengguna.
- `sos_events.sender_id`, saat dicatat oleh backend, wajib diisi dari `user_id` hasil ekstraksi JWT (lihat Bagian A, §4 poin 3) — bukan dari field yang dikirim client, untuk mencegah spoofing identitas pengirim.
- Saat FCM broadcast (Bagian A, §4 poin 4), query token diambil dari `user_devices` dengan filter `role = 'PIC'` pada tabel `users` yang di-join, bukan mengirim ke seluruh `user_devices` tanpa filter role.
- `fcm_token` bersifat dapat berubah/kadaluarsa — implementasikan upsert (`ON CONFLICT` pada `user_id` + `device_type`, atau `fcm_token` unik) saat token baru diterima dari client, bukan selalu insert baris baru.
