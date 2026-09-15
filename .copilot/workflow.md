# ClusterGuard — Development Workflow (AI Agent Process)

> **Tujuan dokumen**: Standard Operating Procedure (SOP) yang wajib diikuti AI coding agent untuk **setiap task** dalam proyek ini (lihat `product-prd.md` §7 untuk daftar task). Dokumen ini mendefinisikan urutan langkah, gerbang persetujuan (approval gate), quality gate, dan aturan loop-back jika ada langkah yang gagal.

**Prinsip utama**: tidak ada task yang boleh masuk ke tahap eksekusi tanpa persetujuan eksplisit dari pengguna, dan tidak ada task yang boleh dianggap selesai tanpa lolos seluruh quality gate (lint, security, performance).

---

## 1. Diagram Alur Keseluruhan

```
┌─────────────────────┐
│ 1. Buat Perencanaan │
│    Task             │
└──────────┬──────────┘
           ▼
┌─────────────────────┐
│ 2. Ajukan Persetujuan│
│    ke User           │
└──────────┬──────────┘
           │
   ┌───────┴───────┐
   │ Disetujui?     │
   └───────┬───────┘
     Tidak │ Ya
     ▼     │
┌─────────────────────┐   │
│ Tanya: apa yang     │   │
│ harus diperbaiki    │   │
└──────────┬──────────┘   │
           │ (kembali ke  │
           │  langkah 1)  │
           └──────────────┘
                          ▼
                ┌─────────────────────┐
                │ 3. Kerjakan Task    │
                └──────────┬──────────┘
                           ▼
                ┌─────────────────────┐
                │ 4. Buat/Update      │
                │    Unit Test        │
                └──────────┬──────────┘
                           ▼
                ┌─────────────────────┐
                │ 5. Update Migration │
                │    Script (jika perlu)│
                └──────────┬──────────┘
                           ▼
                ┌─────────────────────┐
                │ 6. Scan Linting     │
                └──────────┬──────────┘
                           ▼
                ┌─────────────────────┐
                │ 7. Scan Keamanan    │
                │    Kode              │
                └──────────┬──────────┘
                           ▼
                ┌─────────────────────┐
                │ 8. Scan Performa:   │
                │    memori, efisiensi│
                │    kode, efisiensi  │
                │    sesi DB           │
                └──────────┬──────────┘
                           ▼
                   ┌───────────────┐
                   │ 6,7,8 Pass?   │
                   └───────┬───────┘
                Tidak      │      Ya
                 ▼         │
     ┌─────────────────────┐│
     │ 9. Tulis temuan ke  ││
     │    issue.log,        ││
     │    HENTIKAN proses,  ││
     │    perbaiki           ││
     └──────────┬───────────┘│
                │ (kembali ke │
                │  langkah 3) │
                └─────────────┘
                           ▼
                ┌─────────────────────┐
                │ 10. Commit (pesan   │
                │     deskriptif) +  │
                │     Push ke GitHub  │
                └──────────┬──────────┘
                           ▼
                ┌─────────────────────┐
                │ 11. Laporkan setiap │
                │     tahapan ke user │
                └──────────┬──────────┘
                           ▼
                ┌─────────────────────┐
                │ 12. Update task.log │
                └─────────────────────┘
```

---

## 2. Langkah Detail

### Langkah 1 — Buat Perencanaan Task
- Ambil satu task dari `product-prd.md` §7 (Task List) sesuai urutan prioritas (P0 → P6).
- Susun rencana singkat sebelum menulis kode apa pun, mencakup minimal:
  - Ruang lingkup perubahan (file/komponen apa yang akan disentuh).
  - Pendekatan teknis yang akan dipakai (rujuk dokumen teknis relevan: `architecture.md`, `clusterguard-backend-design.md`, `clusterguard-design.md`).
  - Dampak terhadap komponen lain (jika ada).
  - Perkiraan kebutuhan unit test dan migration script.
- **Aturan untuk AI agent**: jangan menulis/mengubah kode produksi pada langkah ini — langkah ini murni perencanaan tekstual.

### Langkah 2 — Ajukan Persetujuan ke User
- Sampaikan rencana dari Langkah 1 ke pengguna secara eksplisit dan tunggu keputusan: **disetujui** atau **tidak disetujui**.
- **Jika tidak disetujui**:
  - Tanyakan secara spesifik apa yang perlu diperbaiki dari rencana tersebut.
  - Kembali ke **Langkah 1** dengan menyesuaikan rencana berdasarkan masukan.
- **Jika disetujui**: lanjut ke Langkah 3.
- **Aturan untuk AI agent**: jangan melompati gerbang ini dengan asumsi "pasti disetujui" — persetujuan eksplisit wajib diperoleh sebelum eksekusi, walau rencana tampak sederhana atau task sudah pernah disetujui polanya sebelumnya.

### Langkah 3 — Kerjakan Task
- Eksekusi implementasi sesuai rencana yang **sudah disetujui** pada Langkah 2.
- Jika selama eksekusi ditemukan penyimpangan signifikan dari rencana awal (mis. pendekatan teknis ternyata tidak memungkinkan), hentikan dan kembali ke Langkah 1 untuk merevisi rencana — jangan melanjutkan implementasi di luar rencana yang disetujui tanpa approval ulang.

### Langkah 4 — Buat atau Update Unit Test
- Setiap perubahan kode fungsional wajib disertai unit test yang relevan (baru atau update dari test yang sudah ada).
- Cakupan minimal: skenario normal (happy path) dan minimal satu skenario gagal/edge case yang relevan dengan task.

### Langkah 5 — Update Migration Script (jika perlu)
- Jika task menyentuh skema database (`public.users`, `public.sos_events`, `public.user_devices`, atau tabel baru), buat/update migration script yang sesuai.
- Jika task tidak menyentuh skema database, langkah ini dilewati (bukan dihilangkan dari laporan — tetap dicatat sebagai "tidak berlaku untuk task ini" pada Langkah 11).

### Langkah 6 — Scan Linting Code
- Jalankan linter sesuai konfigurasi proyek (mis. ESLint untuk TypeScript/Hono.js/Next.js/React Native).
- Catat hasil: pass atau ada temuan (dengan detail file, baris, aturan yang dilanggar).

### Langkah 7 — Scan Keamanan Kode
- Periksa potensi kerentanan keamanan pada kode yang diubah, termasuk namun tidak terbatas pada:
  - Kebocoran kredensial/rahasia (hardcoded secret, salah taruh di kode publik alih-alih `.dev.vars`).
  - Validasi input yang tidak memadai (celah bagi kategori/field di luar enum yang diizinkan).
  - Akses tanpa otorisasi (bypass JWT middleware, bypass RLS).
- Catat hasil: pass atau ada temuan.

### Langkah 8 — Scan Performa Kode
- Evaluasi hal berikut pada kode yang diubah:
  - **Penggunaan memori**: potensi memory leak atau alokasi berlebihan, khususnya penting untuk lingkungan edge (Cloudflare Workers) dengan batasan resource.
  - **Efisiensi kode**: kompleksitas yang tidak perlu, operasi berulang yang bisa disederhanakan.
  - **Efisiensi sesi DB**: jumlah query per request, potensi N+1 query, penggunaan koneksi/sesi Supabase yang tidak efisien (mis. tidak menutup koneksi, query berulang yang seharusnya bisa digabung).
- Catat hasil: pass atau ada temuan.

### Langkah 9 — Penanganan Jika Langkah 6/7/8 Tidak Pass
- Jika **salah satu saja** dari Langkah 6, 7, atau 8 tidak pass:
  1. Tuliskan seluruh temuan (linting, keamanan, performa) ke file **`issue.log`** — format harus mencantumkan: tanggal/waktu, task terkait, kategori (Lint/Security/Performance), detail temuan, lokasi (file:baris).
  2. **Hentikan proses** — jangan lanjut ke Langkah 10.
  3. Perbaiki kode berdasarkan catatan di `issue.log`.
  4. Kembali ke **Langkah 3** (kerjakan ulang bagian yang relevan), lalu ulangi Langkah 4–8.
- Siklus ini berulang sampai Langkah 6, 7, dan 8 **semuanya pass** dalam satu iterasi yang sama.

### Langkah 10 — Commit & Push
- Hanya dilakukan setelah Langkah 6, 7, dan 8 **semuanya pass**, migration yang diperlukan sudah diterapkan dan diverifikasi, serta Langkah 12 siap diperbarui.
- Commit message wajib deskriptif dan mengikuti standar umum pengembangan aplikasi, contoh format (Conventional Commits):
  ```
  feat(sos): tambah endpoint POST /sos dengan validasi kategori darurat
  fix(auth): perbaiki bug JWT middleware tidak menolak token kedaluwarsa
  test(sos): tambah unit test untuk fallback dialer 30 detik
  ```
- Setelah commit berhasil, **wajib push ke branch aktif di GitHub**. Push tidak lagi opsional setelah seluruh tahapan task dan quality gate selesai.
- Jika push gagal karena autentikasi, remote, branch protection, konflik, atau masalah jaringan, catat error sanitized di `issue.log`, laporkan ke user, dan jangan menganggap task selesai.
- Jangan memakai `git push --force` atau mengubah history remote tanpa persetujuan eksplisit tambahan dari user.

### Langkah 11 — Laporkan Setiap Tahapan
- Setiap kali satu langkah (1–10) selesai dijalankan, laporkan hasilnya ke pengguna secara ringkas: langkah keberapa, hasil (pass/fail/menunggu approval), dan langkah berikutnya.
- Pelaporan ini berjalan **sepanjang proses**, bukan hanya di akhir — bukan laporan tunggal setelah semua langkah selesai.

### Langkah 12 — Update `task.log`
- Setelah Langkah 10 berhasil commit dan push, tulis/update entri di file **`task.log`** yang mencatat:
  - Nama/ID task (rujuk ke `product-prd.md` §7).
  - Ringkasan apa yang dikerjakan.
  - Status akhir (selesai).
  - Referensi commit (hash atau pesan commit).
  - Tanggal/waktu penyelesaian.

---

## 3. Aturan Loop-Back (Ringkasan)

| Dari Langkah | Kondisi | Kembali ke Langkah |
|---|---|---|
| 2 | User tidak menyetujui rencana | 1 (revisi rencana sesuai masukan) |
| 9 | Salah satu dari Langkah 6/7/8 tidak pass | 3 (perbaiki lalu ulangi 4–8) |

**Aturan untuk AI agent**: kedua loop-back ini adalah satu-satunya jalur mundur yang sah dalam workflow. Jangan melompat maju melewati Langkah 2 (approval) atau Langkah 9 (quality gate) dalam kondisi apa pun, termasuk saat task terasa kecil/trivial atau saat tenggat waktu terasa mendesak.

---

## 4. File Pendukung Workflow

| File | Fungsi | Diisi pada Langkah |
|---|---|---|
| `issue.log` | Mencatat temuan lint/security/performance yang gagal, sebagai dasar perbaikan | Langkah 9 |
| `task.log` | Mencatat riwayat task yang sudah diselesaikan end-to-end | Langkah 12 |

**Aturan untuk AI agent**: kedua file bersifat append-only log — jangan menghapus/menimpa entri task/issue sebelumnya, tambahkan entri baru di bagian bawah dengan timestamp.
