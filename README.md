# Sistem Absensi Modern

Website absensi modern dengan fitur foto wajah via kamera, validasi WiFi berdasarkan IP jaringan lokal, penyimpanan data ke database SQLite (native `node:sqlite`), dan export data ke Excel (.xlsx).

## Fitur Utama

- Form absensi dengan validasi (nama, NIP/ID, jenis absensi)
- Pengambilan foto wajah real-time dari kamera (WebRTC)
- Validasi WiFi/jaringan lokal berdasarkan IP pada middleware backend
- Penyimpanan data ke SQLite (modul native bawaan Node.js, tanpa kompilasi C++)
- Penyimpanan foto ke folder `uploads/` (dibuat otomatis)
- Export data absensi ke file Excel (`.xlsx`) menggunakan ExcelJS
- Timestamp otomatis (tanggal & jam) saat submit
- Halaman data dilindungi password admin
- Tampilan responsive, tema biru putih, card layout, animasi hover, loading state
- Auto-detect IP LAN saat startup, listen di `0.0.0.0` untuk akses dari HP

## Struktur Project

```
absensi-web/
├── index.html                      # Frontend SPA (tab Absen & Data)
├── css/style.css
├── js/
│   ├── config.js                   # Konfigurasi API_BASE_URL production
│   └── app.js                      # Logika aplikasi
├── backend/
│   ├── config/database.js          # Inisialisasi node:sqlite
│   ├── controllers/attendanceController.js
│   ├── middleware/
│   │   ├── wifiValidator.js
│   │   ├── adminValidator.js
│   │   └── uploadHandler.js
│   ├── routes/attendanceRoutes.js
│   ├── uploads/                    # Otomatis dibuat
│   ├── data/                       # SQLite db file
│   ├── server.js
│   ├── package.json
│   └── .env.example
├── package.json                    # Root scripts
├── render.yaml                     # Deploy config Render
├── railway.json                    # Deploy config Railway
├── vercel.json                     # Deploy config Vercel (kurang ideal: ephemeral)
├── .gitignore
└── README.md
```

## Persyaratan

- **Node.js 22.5.0+** (wajib untuk modul native `node:sqlite`)
- Browser modern dengan dukungan `getUserMedia` (Chrome, Edge, Firefox)
- Akses **HTTPS** atau `localhost` agar kamera dapat diaktifkan

## Menjalankan Lokal

```bash
git clone https://github.com/<username>/<repo>.git
cd <repo>
npm install                           # auto-install backend dependencies
cp backend/.env.example backend/.env  # atau salin manual di Windows
npm run dev                           # mode development (nodemon)
# atau
npm start                             # mode produksi
```

Server akan tampil di terminal:

```
==============================================
 Sistem Absensi - Server Started
==============================================
 Local       : http://localhost:3000
 Network     : http://192.168.18.180:3000   <- buka dari HP
==============================================
```

Buka `http://localhost:3000` di browser PC, atau alamat `Network` dari HP yang terhubung WiFi yang sama.

## Konfigurasi `.env`

```ini
PORT=3000
ALLOWED_IP_PREFIXES=                  # kosong = otomatis terima semua private LAN
ENFORCE_WIFI_VALIDATION=true
DB_FILE=./data/attendance.db
UPLOAD_DIR=./uploads
MAX_UPLOAD_SIZE=5242880
ADMIN_PASSWORD=admin123               # password halaman Data
```

`ALLOWED_IP_PREFIXES` kosong = WiFi validator otomatis mengizinkan semua subnet privat (`192.168.x`, `10.x`, `172.16-31.x`) plus localhost. Isi koma-separator untuk membatasi (mis. `192.168.18.,10.0.0.`).

## API Endpoints

| Method | Endpoint                | Auth   | Deskripsi                                          |
| ------ | ----------------------- | ------ | -------------------------------------------------- |
| GET    | `/api/health`           | -      | Health check                                       |
| GET    | `/api/network-check`    | WiFi   | Verifikasi IP klien diizinkan                      |
| POST   | `/api/attendance`       | WiFi   | Submit absensi (multipart, field `photo`)          |
| GET    | `/api/attendance`       | Admin  | Daftar data absensi (header `X-Admin-Password`)    |
| GET    | `/api/attendance/export`| Admin  | Download Excel (query `?password=xxx`)             |

---

## Deploy ke Production

Frontend dan backend **harus dipisah** karena GitHub Pages adalah static hosting (tidak bisa menjalankan Node).

### Opsi 1: GitHub Pages (Frontend) + Render (Backend) — Direkomendasikan

#### A. Deploy backend ke Render

1. Push repo ini ke GitHub
2. Login ke [render.com](https://render.com), pilih **New → Blueprint**
3. Pilih repo Anda, Render akan membaca `render.yaml` otomatis
4. Set environment variable `ADMIN_PASSWORD` dengan nilai pilihan Anda
5. Deploy → Anda akan mendapat URL HTTPS seperti `https://absensi-api.onrender.com`

Folder `backend/data` di-mount ke disk persistent (1 GB) sehingga SQLite tidak hilang saat redeploy.

#### B. Konfigurasi frontend untuk panggil backend production

Edit `js/config.js`:

```js
window.APP_CONFIG = {
  API_BASE_URL: 'https://absensi-api.onrender.com',
};
```

Commit dan push perubahan tersebut.

#### C. Aktifkan GitHub Pages

1. Repo GitHub → **Settings → Pages**
2. Source: **Deploy from a branch**
3. Branch: `main`, Folder: `/ (root)`
4. Save → tunggu 1-2 menit
5. URL frontend: `https://<username>.github.io/<repo>/`

> **Penting**: GitHub Pages adalah HTTPS. Backend Anda **wajib HTTPS** juga (Render & Railway sudah otomatis HTTPS). Backend HTTP akan diblokir browser sebagai mixed content.

### Opsi 2: Railway (Backend)

1. [railway.app](https://railway.app) → **New Project → Deploy from GitHub repo**
2. Railway akan membaca `railway.json` & `package.json` root
3. Tambahkan environment variables (lihat `backend/.env.example`)
4. URL backend: `https://<projectname>.up.railway.app`
5. Edit `js/config.js` dengan URL tersebut, push

> Railway free tier memberikan disk persistent untuk SQLite & uploads.

### Opsi 3: Vercel (Backend) — TIDAK Direkomendasikan

Vercel filesystem **ephemeral**: SQLite database & folder `uploads/` akan reset setiap deploy/cold-start. Hanya cocok untuk demo singkat. Untuk produksi gunakan Render atau Railway.

---

## Troubleshooting

### "Tidak terhubung" / "Failed to fetch"

- **Pastikan backend online**: buka `<API_BASE_URL>/api/health` di browser, harus return JSON
- **Cek `js/config.js`**: `API_BASE_URL` harus diisi URL backend production saat deploy
- **Cek mixed content**: jika frontend HTTPS (GitHub Pages) memanggil backend HTTP → diblokir browser. Backend wajib HTTPS
- **Cek CORS**: backend sudah konfigurasi `cors()` untuk semua origin, allow header `X-Admin-Password`

### "Server bermasalah"

- Backend berjalan tapi `/api/health` return non-2xx. Cek log Render/Railway
- Atau Anda membuka frontend via Live Server (port 5500) tanpa backend lokal di port 3000

### Kamera tidak aktif

- WebRTC butuh **HTTPS atau `localhost`**
- Untuk testing dari HP via IP LAN, gunakan `chrome://flags/#unsafely-treat-insecure-origin-as-secure` atau tunnel `ngrok http 3000`
- Setelah deploy ke GitHub Pages + Render/Railway, semuanya HTTPS sehingga kamera otomatis aktif

### "WiFi tidak terdaftar" (HTTP 403)

- IP klien tidak match `ALLOWED_IP_PREFIXES` di `.env`
- Solusi cepat: kosongkan `ALLOWED_IP_PREFIXES=` (auto-allow semua private LAN)
- Atau tambahkan prefix subnet Anda, mis. `192.168.18.`

### Data hilang setelah redeploy (Render)

- Pastikan blok `disk` di `render.yaml` aktif (mount ke `backend/data`)
- Free tier Render: disk hanya untuk paid plan. Untuk benar-benar persistent, upgrade ke Starter ($7/mo) atau gunakan Railway

## Lisensi

MIT
