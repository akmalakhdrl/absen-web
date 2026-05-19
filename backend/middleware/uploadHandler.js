/**
 * Konfigurasi multer untuk upload foto absensi.
 *
 * - Foto disimpan ke folder uploads/ (otomatis dibuat bila belum ada).
 * - Nama file dibuat unik: <timestamp>-<random>.<ext>
 * - Hanya menerima file gambar (jpeg/png/webp).
 * - Ukuran maksimum diatur lewat env MAX_UPLOAD_SIZE (default 5 MB).
 */

const path = require('path');
const fs = require('fs');
const multer = require('multer');

const UPLOAD_DIR = process.env.UPLOAD_DIR || './uploads';
const MAX_UPLOAD_SIZE = parseInt(process.env.MAX_UPLOAD_SIZE, 10) || 5 * 1024 * 1024;

// Resolve path absolut relatif terhadap folder backend.
const uploadPath = path.isAbsolute(UPLOAD_DIR)
  ? UPLOAD_DIR
  : path.join(__dirname, '..', UPLOAD_DIR);

// Buat folder uploads otomatis bila belum ada.
if (!fs.existsSync(uploadPath)) {
  fs.mkdirSync(uploadPath, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase() || '.jpg';
    const safeExt = ['.jpg', '.jpeg', '.png', '.webp'].includes(ext) ? ext : '.jpg';
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}${safeExt}`;
    cb(null, unique);
  },
});

// Filter hanya menerima file image.
function fileFilter(req, file, cb) {
  const allowed = ['image/jpeg', 'image/png', 'image/webp'];
  if (allowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('INVALID_FILE_TYPE'));
  }
}

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_UPLOAD_SIZE },
});

module.exports = {
  upload,
  uploadPath,
};
