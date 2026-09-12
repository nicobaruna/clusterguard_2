# ClusterGuard SOS — UI/UX Design Specification

> **Tujuan dokumen**: Spesifikasi desain yang dapat dibaca dan digenerate oleh AI design agent (mis. Google Stitch, v0, atau tools sejenis). Mendeskripsikan design system, layout tiap layar, komponen, dan state transition untuk 3 platform: PWA Warga, Mobile App PIC, dan PWA Super Admin.

**Prinsip desain utama**: Minimalisme Ekstrem, Kontras Tinggi, Aksesibilitas (target pengguna termasuk lansia dan anak-anak).

---

# 1. Design System

## 1.1 Warna

| Token | Nilai / Deskripsi | Penggunaan |
|---|---|---|
| `color-background` | Putih bersih / off-white | Latar utama, mengurangi silau |
| `color-critical` (🔴 Merah) | Merah solid, tinggi kontras | Kategori **MEDIS** |
| `color-warning` (🟠 Oranye) | Oranye solid | Kategori **BENCANA** (kebakaran, dsb.) |
| `color-security` (🔵 Biru Gelap) | Biru tua/navy | Kategori **KEAMANAN** |

## 1.2 Tipografi

| Elemen | Spesifikasi |
|---|---|
| Font family | Sans-serif tebal dan bulat (rekomendasi: **Inter** atau **Quicksand**) |
| Ukuran teks body | Minimal `16px` |
| Ukuran judul/heading | Minimal `24px` |
| Ketebalan | Bold/Semi-bold untuk elemen aksi dan judul |

## 1.3 Prinsip Komponen

- **Massive touch target**: semua tombol aksi utama berukuran besar (full-width atau minimal 64px tinggi).
- **Ikon eksplisit**: setiap tombol kategori disertai ikon visual besar, tidak hanya teks (mis. ikon ambulans, ikon api, ikon perisai).
- **Kontras tinggi**: kombinasi warna latar terang + warna aksi solid, hindari gradasi tipis atau teks abu-abu muda.
- **Anti false-trigger**: aksi kritis (kirim SOS) tidak boleh berupa single-tap button biasa — wajib pakai mekanisme konfirmasi (slider), lihat §2.2.

## 1.4 Rekomendasi UI Framework (implementasi)

| Platform | Library | Alasan |
|---|---|---|
| PWA (Next.js) — Warga & Admin | **Tailwind CSS + shadcn/ui** | Gratis, ringan, mudah dikustomisasi jadi tombol besar |
| Mobile App (Expo/React Native) — PIC | **React Native Paper** | Desain Material yang rapi out-of-the-box |

---

# 2. Platform: PWA — Warga

Fokus desain: **aksesibilitas maksimal**, alur sesederhana mungkin, tanpa menu yang membingungkan.

## 2.1 Layar: Dashboard Warga (Beranda)

**Route**: `/` (setelah login)

**Layout (top → bottom)**:
1. Header bar: kiri = tombol `[Profil]`, kanan = tombol `[Logout]`
2. Teks sapaan: `"Halo, {full_name} ({house_number})"` — contoh: "Halo, Bpk. Budi (Blok A-12)"
3. Subjudul: `"Ada keadaan darurat?"`
4. 3 kartu tombol besar, full-width, tersusun vertikal, masing-masing berisi ikon besar + label:
   - Kartu 1 — warna `color-critical` (merah), ikon ambulans, label **"MEDIS"**
   - Kartu 2 — warna `color-warning` (oranye), ikon api, label **"BENCANA"**
   - Kartu 3 — warna `color-security` (biru gelap), ikon perisai, label **"KEAMANAN"**

**Wireframe referensi**:
```
+---------------------------------------+
| [Profil]                   [Logout]   |
|                                       |
|    Halo, Bpk. Budi (Blok A-12)        |
|    Ada keadaan darurat?               |
|                                       |
|  +---------------------------------+  |
|  |       (Ikon Ambulans)           |  |
|  |           MEDIS                 |  |
|  +---------------------------------+  |
|                                       |
|  +---------------------------------+  |
|  |         (Ikon Api)              |  |
|  |          BENCANA                |  |
|  +---------------------------------+  |
|                                       |
|  +---------------------------------+  |
|  |        (Ikon Perisai)           |  |
|  |         KEAMANAN                |  |
|  +---------------------------------+  |
+---------------------------------------+
```

**Aksi**: tap salah satu kartu kategori → navigasi ke **Layar Konfirmasi** (§2.2) dengan kategori terpilih dibawa sebagai parameter.

---

## 2.2 Layar: Konfirmasi SOS (Anti Salah Pencet)

**Route**: `/sos/confirm?category={MEDIS|BENCANA|KEAMANAN}`

**Tujuan**: mencegah trigger tidak sengaja (mis. anak-anak tidak sengaja memencet).

**Layout**:
1. Judul besar dengan warna sesuai kategori: `"! DARURAT {KATEGORI} !"`
2. Teks konfirmasi: `"Apakah Anda butuh bantuan {jenis} sekarang?"`
3. Komponen **slider horizontal** (drag-to-confirm, mirip "geser untuk matikan" di iPhone): label `"Geser ke Kanan untuk Kirim SOS"`, dengan panah/chevron sebagai indikator arah
4. Tombol teks kecil di bawah: `"Batal / Kembali"`

**Wireframe referensi**:
```
+---------------------------------------+
|                                       |
|          ! DARURAT MEDIS !            |
|                                       |
|  Apakah Anda butuh bantuan medis      |
|  sekarang?                            |
|                                       |
|  [> Geser ke Kanan untuk Kirim SOS >] |
|                                       |
|         (Batal / Kembali)             |
+---------------------------------------+
```

**Perilaku komponen slider**:
- Elemen tidak boleh ter-trigger oleh single tap.
- Trigger hanya terjadi setelah drag mencapai ujung kanan track (threshold ~90% dari lebar track).
- Setelah trigger sukses → kirim request SOS ke backend → navigasi ke **Layar Status** (§2.3).
- Tombol "Batal/Kembali" → kembali ke Dashboard (§2.1) tanpa mengirim apa pun.

---

## 2.3 Layar: Status & Fallback

**Route**: `/sos/status/{event_id}`

Layar ini memiliki **2 state**, bergantung pada respons PIC.

### State A — Menunggu Respons (0–30 detik)

```
+---------------------------------------+
|              (Animasi Radar)          |
|         Mengirim sinyal SOS...        |
|                                       |
|  Status: Menunggu Tanggapan PIC       |
|  Waktu berlalu: 00:25                 |
+---------------------------------------+
```

- Animasi radar/pulse untuk menandakan proses aktif.
- Counter waktu berjalan real-time (`00:00` → `00:30`).
- Status disinkronkan via **Supabase Realtime** — jika `sos_events.status` berubah menjadi `RESOLVED` sebelum 30 detik, tampilkan konfirmasi "PIC telah menanggapi" dan hentikan timer.

### State B — Fallback (setelah 30 detik tanpa respons)

```
+---------------------------------------+
|          KONEKSI PIC GAGAL            |
|                                       |
|  PIC belum merespons. Silakan         |
|  hubungi PIC secara manual:           |
|                                       |
|  [📞 TELEPON PIC 1 (Pak RT)]         |
|  [📞 TELEPON PIC 2 (Satpam)]         |
+---------------------------------------+
```

- Trigger: timer client-side mencapai 30 detik **dan** status masih `PENDING`.
- Setiap tombol adalah link `tel:{nomor_PIC}`, disusun berurutan berdasarkan daftar PIC terdaftar.
- Nama PIC yang ditampilkan (mis. "Pak RT", "Satpam") diambil dari `full_name`/label peran pada tabel `users`.

**State diagram**:
```
[Kirim SOS] → [State A: Menunggu, timer 0–30s]
                     │
        ┌────────────┴────────────┐
        │                         │
 status → RESOLVED          30s tercapai,
 (sebelum 30s)              status masih PENDING
        │                         │
        ▼                         ▼
 [Tampilkan: Ditanggapi]   [State B: Fallback Dialer]
```

---

# 3. Platform: Mobile App — PIC (React Native / Expo)

Fokus desain: **atensi maksimal** — aplikasi berperan seperti alat komunikasi taktis, prioritas utamanya membangunkan/memberi tahu PIC secepat mungkin.

## 3.1 Layar: Panggilan Masuk Darurat (Full-Screen Alert)

**Trigger**: push notification kategori darurat diterima (FCM high-priority) saat ada `sos_events` baru.

**Karakteristik teknis** (lihat juga Backend Design §7, Foreground Service/Alarm-VoIP Push):
- Menggunakan **Full-Screen Intent** (Android) agar layar tertimpa alert meski device terkunci/di-background.
- Latar belakang berkedip warna merah (`color-critical`) selama alert aktif.
- Alarm/sirine berbunyi keras secara persisten hingga direspons.

**Layout**:
1. Latar merah berkedip (animasi flash)
2. Judul besar: `"! DARURAT {KATEGORI} !"`
3. Detail kejadian:
   - `Pengirim: {full_name}`
   - `Lokasi: {house_number}`
   - `Waktu: {created_at, format HH:mm WIB}`
4. Tombol besar full-width di bagian bawah: **"SAYA TANGGAPI"**

**Wireframe referensi**:
```
+---------------------------------------+
|  [Latar Merah Berkedip & Suara Sirine]|
|                                       |
|          ! DARURAT MEDIS !            |
|                                       |
|   Pengirim : Bpk. Budi                |
|   Lokasi   : Blok A-12                |
|   Waktu    : 21:05 WIB                |
|                                       |
|                                       |
|   +-------------------------------+   |
|   |       SAYA TANGGAPI           |   |
|   +-------------------------------+   |
|                                       |
+---------------------------------------+
```

**Aksi**: tap "SAYA TANGGAPI" → update `sos_events.status = RESOLVED`, `resolved_by = {pic_user_id}`, `resolved_at = now()` → hentikan alarm/sirine → tutup full-screen alert → kembali ke Dashboard PIC (§3.2).

---

## 3.2 Layar: Dashboard PIC (Kondisi Normal)

**Route**: home screen aplikasi PIC saat tidak ada alarm aktif.

**Layout**:
1. Toggle status di bagian atas: `"Status: Aktif Bertugas"` (on/off switch)
2. Daftar riwayat darurat hari ini (list, terbaru di atas), format per baris: `{HH:mm}: {kategori} ({lokasi}) - {status}`
3. Tombol besar di bagian bawah: **"SAYA BUTUH BANTUAN (SOS)"** — untuk kondisi PIC sendiri yang membutuhkan bantuan.

**Wireframe referensi**:
```
+---------------------------------------+
|  [Status: Aktif Bertugas (Toggle)]    |
|                                       |
|  Riwayat Darurat Hari Ini:            |
|  - 21:05: Medis (Blok A-12) - Selesai |
|  - 08:30: Keamanan (Blok C-4) - Selesai
|                                       |
|  +---------------------------------+  |
|  |    SAYA BUTUH BANTUAN (SOS)     |  |
|  +---------------------------------+  |
+---------------------------------------+
```

**Catatan**: tombol "SAYA BUTUH BANTUAN (SOS)" pada dashboard PIC memicu alur yang sama seperti tombol kategori di Dashboard Warga (§2.1) — PIC juga berperan sebagai pengirim (`sender_id`) dalam skenario ini.

---

# 4. Platform: PWA — Super Admin

Fokus desain: **manajemen data**, menggunakan pola dashboard berbasis tabel standar (bukan aksesibilitas ekstrem seperti Warga/PIC, karena pengguna adalah admin/operator).

## 4.1 Navigasi

Menu kiri (desktop) / bawah (mobile), berisi:
- Dashboard
- Data Warga
- Data PIC
- Riwayat SOS
- Pengaturan

## 4.2 Layar: Data Warga

**Layout**:
- Tabel dengan kolom: `Nama | No HP | Blok/Rumah | Aksi (Edit/Hapus)`
- Tombol besar di bagian atas tabel: **"+ Tambah Warga Baru"**

## 4.3 Fitur Spesial

- **Unduh Laporan Bulanan**: admin dapat mengekspor laporan seluruh kejadian SOS dalam periode tertentu (siapa yang menekan SOS, kategori, waktu, status) untuk keperluan review keamanan RT/RW.

---

# 5. Ringkasan Alur Antar Layar (Cross-Platform)

```
[PWA Warga]                         [Mobile PIC]                    [PWA Admin]
Dashboard (§2.1)                                                    Dashboard/Tabel (§4)
   │ tap kategori
   ▼
Konfirmasi/Slider (§2.2)
   │ geser sukses
   ▼
Status: Menunggu (§2.3 State A) ──────▶ Full-Screen Alert (§3.1)
   │                                        │ tap "SAYA TANGGAPI"
   │◀─── status RESOLVED (Realtime) ────────┘
   ▼                                        ▼
Ditanggapi (state akhir)               Dashboard PIC (§3.2)
   │
   │ (jika 30s tanpa respons)
   ▼
Fallback Dialer (§2.3 State B)
```

---

## 6. Catatan untuk AI Design Agent

- Semua tombol kategori SOS (MEDIS/BENCANA/KEAMANAN) harus konsisten menggunakan pasangan warna + ikon yang sama di **setiap** platform (Warga, PIC, Admin) agar pengenalan visual instan tidak butuh membaca teks.
- Prioritaskan ukuran komponen interaktif (tombol, slider, toggle) di atas kepadatan informasi — ini adalah aplikasi darurat, bukan aplikasi produktivitas.
- Layar Full-Screen Alert (§3.1) dan Layar Konfirmasi (§2.2) adalah dua layar dengan tingkat urgensi visual tertinggi di seluruh sistem — desain harus jelas berbeda secara visual dari layar-layar biasa (dashboard, tabel admin, dsb).
- Untuk generate mockup otomatis, gunakan wireframe ASCII pada tiap layar sebagai referensi struktur/hierarki elemen, bukan sebagai representasi piksel-perfect.
