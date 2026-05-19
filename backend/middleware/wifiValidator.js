/**
 * Middleware validasi WiFi/jaringan lokal.
 *
 * Mengizinkan request hanya jika IP klien diawali oleh salah satu
 * prefix di ALLOWED_IP_PREFIXES (env). Berguna untuk membatasi absensi
 * agar hanya dapat dilakukan ketika user terhubung ke WiFi tertentu.
 *
 * Catatan: jika aplikasi berada di belakang reverse proxy / load balancer,
 * pastikan Express trust proxy diaktifkan agar IP yang dievaluasi adalah
 * IP asli klien dari header X-Forwarded-For.
 */

/**
 * Normalisasi IP klien:
 * - Hilangkan prefix IPv4-mapped IPv6 ("::ffff:")
 * - Localhost IPv6 "::1" tetap dipertahankan untuk pencocokan eksplisit
 */
function normalizeIp(ip) {
  if (!ip) return '';
  if (ip.startsWith('::ffff:')) return ip.substring(7);
  return ip;
}

/**
 * Cek apakah IP klien diizinkan berdasarkan daftar prefix.
 */
function isAllowedIp(clientIp, allowedPrefixes) {
  if (!clientIp) return false;

  // Localhost selalu diizinkan untuk memudahkan testing dev.
  const localhostList = ['127.0.0.1', '::1', 'localhost'];
  if (localhostList.includes(clientIp)) return true;

  // Jika allowedPrefixes kosong, izinkan seluruh IP private/WiFi lokal secara otomatis.
  // Ini mencakup 192.168.x.x, 10.x.x.x, dan 172.16.x.x s/d 172.31.x.x.
  const isPrivate =
    clientIp.startsWith('192.168.') ||
    clientIp.startsWith('10.') ||
    clientIp.startsWith('172.'); // standard local private subnet

  if (allowedPrefixes.length === 0) {
    return isPrivate;
  }

  // Jika ada allowedPrefixes yang didefinisikan, lakukan pencocokan range.
  return allowedPrefixes.some((prefix) => {
    const trimmed = prefix.trim();
    if (!trimmed) return false;
    return clientIp.startsWith(trimmed);
  });
}

/**
 * Express middleware factory.
 *
 * Membaca konfigurasi dari env setiap kali middleware diinisialisasi
 * sehingga perubahan .env yang di-reload (mis. via nodemon restart)
 * akan langsung diterapkan.
 */
function wifiValidator() {
  const enforce =
    (process.env.ENFORCE_WIFI_VALIDATION || 'true').toLowerCase() === 'true';

  const allowedPrefixes = (process.env.ALLOWED_IP_PREFIXES || '')
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);

  return function (req, res, next) {
    // Bila validasi dimatikan, langsung lewatkan.
    if (!enforce) return next();

    const rawIp =
      req.ip ||
      req.connection?.remoteAddress ||
      req.socket?.remoteAddress ||
      '';
    const clientIp = normalizeIp(rawIp);

    // Simpan IP yang sudah dinormalisasi agar controller dapat memakainya.
    req.clientIp = clientIp;

    if (isAllowedIp(clientIp, allowedPrefixes)) {
      return next();
    }

    return res.status(403).json({
      success: false,
      error: 'WIFI_NOT_ALLOWED',
      message:
        'Absensi hanya dapat dilakukan dari jaringan WiFi yang terdaftar. ' +
        'Pastikan Anda terhubung ke WiFi kantor.',
      detectedIp: clientIp,
    });
  };
}

module.exports = wifiValidator;
module.exports.normalizeIp = normalizeIp;
module.exports.isAllowedIp = isAllowedIp;
