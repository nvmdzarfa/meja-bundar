<img src="assets/icon.svg" width="64" height="64" alt="Meja Bundar">

# Meja Bundar

Workspace grup chat multi-AI dalam satu meja: **1 Pemilik** berdiskusi, menugaskan, dan mengarahkan **7 kursi AI spesialis** sekaligus — mendukung `@mention`, diskusi bergilir, *task pipeline* 6 tahap, pembuatan gambar, serta mode Relay.

## Kursi AI

| Kursi | Kode | Peran | Fokus |
| --- | --- | --- | --- |
| **Muse** | `—` | Admin dan Integrasi | Koordinasi grup, rangkuman akhir pipeline (`Hasil Akhir - Integrasi`), dan progres tugas |
| **Opus** | `M10` | Perencana | Memecah instruksi menjadi langkah kerja bertahap, prioritas, dan risiko |
| **Plamo** | `M01` | Pelaksana | Menyusun eksekusi teknis konkret, draf konten, atau artefak kerja |
| **GLM** | `M02` | Peninjau | Audit kualitas sesuai *Level Review* (`Longgar`, `Santai`, `Sedang`, `Ketat`) |
| **Argon** | `M03` | Visual | Arahan visual dan pembuatan gambar langsung ke ruang chat |
| **Deepseek** | `M04` | Penasihat | Perspektif alternatif, pro-kontra, dan pertimbangan strategis |
| **Fable** | `M05` | Analis Data | Pembacaan pola, metrik, asumsi kuantitatif, dan perbandingan logis |

## Mode Interaksi

- **Obrolan Normal / Diskusi Bergilir:** Jika **Diskusi Bergilir** aktif, semua kursi yang terkonfigurasi menanggapi pesan secara berurutan; jika nonaktif, **Muse** yang menjawab.
- **Panggil Spesifik (`@mention`):** Gunakan `@Opus`, `@Plamo`, `@GLM`, `@Argon`, `@Deepseek`, `@Fable`, atau `@Muse` untuk memanggil satu kursi saja.
- **Pipeline 6 Tahap (`Tugas: ...`):** Menjalankan alur terstruktur `Opus → Plamo → GLM → Argon → Fable → Muse` secara berurutan.
- **Buat Gambar (`Gambar: ...`):** Meminta kursi **Argon** menghasilkan gambar nyata (lewat model gambar Gemini atau Gateway).
- **Pantau Status (`Tanya Progres`):** Menampilkan ringkasan status per tahap dari pipeline tugas terakhir.

## Sumber Model & Keamanan

Setiap kursi dapat dihubungkan langsung ke model AI nyata melalui panel **Pengaturan** di aplikasi:
- **Gemini (Google AI Studio)** — mengambil daftar model langsung dari Gemini API.
- **API Gateway (OpenAI-compatible)** — kompatibel dengan endpoint `/v1/models`, `/v1/chat/completions`, dan `/v1/images/generations`.
- **Mode Relay (Muse):** Menghubungkan **Muse** ke agen eksternal melalui kode pairing 8 karakter (berlaku 30 menit, dapat dipakai berulang selama aktif).

API key disimpan di server/storage dan selalu dimasking saat dikirim ke frontend.

## Menjalankan Secara Lokal

Prasyarat: **Node.js 20+**

```bash
npm install
npm run dev
```

Buka [http://localhost:3000](http://localhost:3000), masuk ke `/chat`, lalu klik ikon **Pengaturan** untuk mengisi API key Gemini atau API Gateway dan memilih model untuk tiap kursi.

Perintah lain:

```bash
npm test          # Jalankan unit test (Vitest)
npx tsc --noEmit  # Cek tipe TypeScript
npm run build     # Build produksi Next.js
```

## Deploy ke Vercel

Aplikasi mendukung tiga mode penyimpanan otomatis di [`src/lib/store.ts`](src/lib/store.ts):
1. **`local`** — saat dijalankan lokal, data disimpan di `data/meja-bundar.json` dan gambar di `data/generated/`.
2. **`redis` (disarankan di Vercel)** — aktif otomatis jika `UPSTASH_REDIS_REST_URL` & `UPSTASH_REDIS_REST_TOKEN` (atau `KV_REST_API_URL` & `KV_REST_API_TOKEN`) diset. Riwayat chat, pengaturan, dan gambar tersimpan persisten.
3. **`ephemeral`** — fallback otomatis ke `/tmp` dan inline data-URL gambar jika deploy di Vercel tanpa Redis.

### Langkah Deploy

1. Push repository ini ke GitHub (disarankan `Private`).
2. Import project di **Vercel**.
3. *(Opsional, disarankan)* Tambahkan integrasi **Upstash for Redis** dari tab **Storage / Marketplace** Vercel agar penyimpanan persisten aktif otomatis.
4. *(Opsional)* Atur environment variable awal mengacu ke [`.env.example`](.env.example):
   - `GEMINI_API_KEY`
   - `GATEWAY_BASE_URL` & `GATEWAY_API_KEY`
   - `MEJA_BUNDAR_OWNER_NAME` (default: `Pemilik`)
5. Deploy — konfigurasi model per kursi juga bisa diatur kapan saja lewat UI **Pengaturan**.

## Tech Stack

- **Framework:** Next.js 15 (App Router), React 19, TypeScript
- **Styling:** Tailwind CSS
- **Testing:** Vitest
