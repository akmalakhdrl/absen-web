/**
 * Routing API absensi.
 *
 * Base path: /api
 */

const express = require('express');
const router = express.Router();

const wifiValidator = require('../middleware/wifiValidator');
const adminValidator = require('../middleware/adminValidator');
const { upload } = require('../middleware/uploadHandler');
const controller = require('../controllers/attendanceController');

/**
 * Wrapper khusus untuk endpoint upload agar error multer
 * (mis. file terlalu besar / tipe tidak valid) di-handle dengan response JSON.
 */
function uploadSinglePhoto(req, res, next) {
  const handler = upload.single('photo');
  handler(req, res, (err) => {
    if (!err) return next();

    let message = 'Gagal mengunggah foto';
    let status = 400;

    if (err.code === 'LIMIT_FILE_SIZE') {
      message = 'Ukuran foto melebihi batas maksimum';
    } else if (err.message === 'INVALID_FILE_TYPE') {
      message = 'Format foto tidak didukung (gunakan JPG, PNG, atau WEBP)';
    } else {
      console.error('[upload] error:', err);
      status = 500;
      message = 'Terjadi kesalahan saat memproses upload';
    }

    return res.status(status).json({
      success: false,
      error: 'UPLOAD_ERROR',
      message,
    });
  });
}

// GET /api/network-check -> cek apakah jaringan klien diizinkan (tanpa upload)
// Endpoint ringan ini menggantikan probe POST yang sebelumnya membebani multer.
router.get('/network-check', wifiValidator(), (req, res) => {
  res.json({
    success: true,
    message: 'Jaringan diizinkan',
    detectedIp: req.clientIp || req.ip || null,
  });
});

// POST /api/attendance  -> submit absensi (cek WiFi -> upload -> simpan)
router.post(
  '/attendance',
  wifiValidator(),
  uploadSinglePhoto,
  controller.submitAttendance
);

// GET /api/attendance         -> ambil seluruh data absensi
router.get('/attendance', adminValidator(), controller.getAttendance);

// GET /api/attendance/export  -> download file Excel
router.get('/attendance/export', adminValidator(), controller.exportExcel);

module.exports = router;
