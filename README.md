# Sistem Absensi Modern

Website absensi modern dengan fitur foto wajah via kamera, validasi WiFi berdasarkan IP jaringan lokal, penyimpanan data ke database SQLite, dan export data ke Excel (.xlsx).

## Fitur Utama

- Form absensi dengan validasi (nama, NIP/ID, jenis absensi)
- Pengambilan foto wajah real-time dari kamera (WebRTC)
- Validasi WiFi/jaringan lokal berdasarkan IP pada middleware backend
- Penyimpanan data ke database SQLite
- Penyimpanan foto ke folder `uploads/` (dibuat otomatis)
- Export data absensi ke file Excel (`.xlsx`) menggunakan ExcelJS
- Timestamp otomatis (tanggal dan jam) saat submit
- Tampilan responsive, tema biru putih, card layout, animasi hover, loading state
- Error handling lengkap di sisi server dan client

## Struktur Project

```
absensi-web/
├── backend/
│   ├── config/
│   │   └── database.js            # Inisialisasi SQLite
│   ├── controllers/
│   │   └── attendanceController.js
│   ├── middleware/
│   │   ├── wifiValidator.js       # Validasi IP/jaringan lokal
│   │   └── uploadHandler.js       # Multer config untuk upload foto
│   ├── routes/
│   │   └── attendanceRoutes.js
│   ├── uploads/                   # Otomatis dibuat saat server start
│   ├── data/                      # SQLite db file disimpan di sini
│   ├── server.js
│   ├── package.json
│   └── .env.example
├── frontend/
│   ├── index.html
│   ├── data.html                  # Halaman lihat data absensi
│   ├── css/
│   │   └── style.css
│   ├── js/
│   │   ├── app.js                 # Logika halaman absensi + kamera
│   │   └── data.js                # Logika halaman data
│   └── assets/
├── .gitignore
├── package.json                   # Root package (scripts dev/start)
└── README.md
```

## Persyaratan

- Node.js 18+ (disarankan 20+)
- Browser modern dengan dukungan `getUserMedia` (Chrome, Edge, Firefox)
- Akses HTTPS atau `localhost` agar kamera dapat diaktifkan

## Instalasi

```bash
# Clone repo
git clone https://github.com/<username>/absensi-web.git
cd absensi-web

# Install dependencies backend
cd backend
npm install
cd ..
```

## Menjalankan

Dari folder root:

```bash
# Mode development (otomatis reload)
npm run dev

# Mode produksi
npm start
```

Server berjalan di `http://localhost:3000`.

Frontend di-serve secara statis oleh Express dari folder `frontend/`.

## Konfigurasi WiFi (IP Allowlist)

Validasi WiFi dilakukan dengan mencocokkan IP klien terhadap daftar prefix IP yang diizinkan. Atur di file `backend/.env`:

```
PORT=3000
ALLOWED_IP_PREFIXES=192.168.1.,192.168.0.,10.0.0.,127.0.0.1,::1
DB_FILE=./data/attendance.db
```

- `ALLOWED_IP_PREFIXES`: dipisah koma. Request akan diizinkan bila IP klien di-prefix oleh salah satu nilai.
- Untuk testing lokal, `127.0.0.1` dan `::1` (IPv6 localhost) sudah di-allow secara default.

Salin file contoh:

```bash
cp backend/.env.example backend/.env
```

## API Endpoints

Base URL: `http://localhost:3000/api`

| Method | Endpoint              | Deskripsi                                          |
| ------ | --------------------- | -------------------------------------------------- |
| POST   | `/attendance`         | Submit absensi (multipart/form-data, field `photo`)|
| GET    | `/attendance`         | Ambil seluruh data absensi (JSON)                  |
| GET    | `/attendance/export`  | Download data absensi sebagai file Excel (.xlsx)   |
| GET    | `/health`             | Health check                                       |

### Body POST `/attendance`

Form-data:

- `name` (string, required)
- `employee_id` (string, required)
- `type` (string, required: `masuk` / `pulang`)
- `note` (string, optional)
- `photo` (file, required, image)

## Deploy

### Railway

1. Push repo ke GitHub
2. Buat project baru di Railway, pilih "Deploy from GitHub Repo"
3. Set Root Directory ke `backend` atau biarkan default jika menggunakan root `package.json`
4. Tambahkan environment variables sesuai `backend/.env.example`
5. Railway otomatis menjalankan `npm start`

### Vercel

Untuk Vercel disarankan deploy backend sebagai Node serverless. Catatan:

- SQLite di Vercel bersifat ephemeral, untuk produksi pertimbangkan database eksternal.
- Folder `uploads/` juga ephemeral di Vercel, gunakan storage eksternal (S3, Supabase Storage, dll.) untuk produksi.

Untuk project ini Railway / VPS lebih direkomendasikan.

## Lisensi

MIT
