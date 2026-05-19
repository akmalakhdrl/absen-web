/**
 * Konfigurasi dan inisialisasi database SQLite.
 *
 * Menggunakan better-sqlite3 (sinkron, performa baik untuk app skala kecil-menengah).
 * Tabel `attendance` dibuat otomatis saat pertama kali dijalankan.
 */

const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

// Tentukan path file db dari env, relatif terhadap folder backend.
const DB_FILE = process.env.DB_FILE || './data/attendance.db';
const dbPath = path.isAbsolute(DB_FILE)
  ? DB_FILE
  : path.join(__dirname, '..', DB_FILE);

// Pastikan folder penyimpanan db tersedia.
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

// Buka koneksi database (file akan dibuat otomatis bila belum ada).
const db = new DatabaseSync(dbPath);

// Aktifkan WAL mode untuk performa concurrent read yang lebih baik.
db.exec('PRAGMA journal_mode = WAL');

/**
 * Skema tabel absensi.
 *
 * Kolom:
 * - id          : Primary key auto increment
 * - name        : Nama lengkap karyawan
 * - employee_id : NIP / ID karyawan
 * - type        : Jenis absensi (masuk / pulang)
 * - note        : Catatan opsional
 * - photo_path  : Path relatif foto pada folder uploads
 * - ip_address  : IP klien saat melakukan absensi
 * - date        : Tanggal absensi (YYYY-MM-DD) untuk memudahkan filter
 * - time        : Jam absensi (HH:mm:ss)
 * - created_at  : Timestamp lengkap (ISO 8601)
 */
db.exec(`
  CREATE TABLE IF NOT EXISTS attendance (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    employee_id TEXT NOT NULL,
    type TEXT NOT NULL,
    note TEXT,
    photo_path TEXT NOT NULL,
    ip_address TEXT,
    date TEXT NOT NULL,
    time TEXT NOT NULL,
    latitude REAL,
    longitude REAL,
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
  );
`);

// Migrasi dinamis jika kolom latitude/longitude belum ada (karena db sudah terbentuk sebelumnya).
try {
  db.exec(`ALTER TABLE attendance ADD COLUMN latitude REAL;`);
} catch (e) {
  // Abaikan error jika kolom sudah ada
}
try {
  db.exec(`ALTER TABLE attendance ADD COLUMN longitude REAL;`);
} catch (e) {
  // Abaikan error jika kolom sudah ada
}

// Index untuk mempercepat query berdasarkan tanggal.
db.exec(`CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance(date);`);

module.exports = db;
