/**
 * Entry point server Express.
 *
 * - Memuat env dari backend/.env
 * - Setup middleware global (CORS, JSON parser, trust proxy)
 * - Serve frontend statis dari folder ../frontend
 * - Serve folder uploads sebagai static (untuk preview foto)
 * - Mount API routes di /api
 * - Health check di /api/health
 * - Error handler global
 */

const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const attendanceRoutes = require('./routes/attendanceRoutes');
const { uploadPath } = require('./middleware/uploadHandler');

const app = express();
const PORT = parseInt(process.env.PORT, 10) || 3000;

// Trust proxy agar req.ip mengikuti X-Forwarded-For (Railway, Vercel, dsb).
app.set('trust proxy', true);

// Middleware global.
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Serve foto upload secara statis pada /uploads/<filename>.
app.use('/uploads', express.static(uploadPath));

// Serve frontend statis.
const frontendDir = path.join(__dirname, '..', 'frontend');
if (fs.existsSync(frontendDir)) {
  app.use(express.static(frontendDir));
}

// API routes.
app.use('/api', attendanceRoutes);

// Health check.
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// Fallback ke index.html untuk root.
app.get('/', (req, res, next) => {
  const indexFile = path.join(frontendDir, 'index.html');
  if (fs.existsSync(indexFile)) {
    return res.sendFile(indexFile);
  }
  next();
});

// 404 handler.
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'NOT_FOUND',
    message: `Route ${req.method} ${req.originalUrl} tidak ditemukan`,
  });
});

// Global error handler.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[GlobalErrorHandler]', err);
  res.status(500).json({
    success: false,
    error: 'SERVER_ERROR',
    message: 'Terjadi kesalahan pada server',
  });
});

app.listen(PORT, () => {
  console.log('==============================================');
  console.log(' Sistem Absensi - Server Started');
  console.log('==============================================');
  console.log(` Local       : http://localhost:${PORT}`);
  console.log(` Upload dir  : ${uploadPath}`);
  console.log(` Enforce WiFi: ${process.env.ENFORCE_WIFI_VALIDATION || 'true'}`);
  console.log(` Allowed IP  : ${process.env.ALLOWED_IP_PREFIXES || '(none)'}`);
  console.log('==============================================');
});
