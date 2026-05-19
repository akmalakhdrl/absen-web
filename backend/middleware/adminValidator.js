/**
 * Middleware untuk memvalidasi akses admin.
 *
 * Memeriksa password admin dari:
 * 1. Header `X-Admin-Password` (untuk request Fetch API)
 * 2. Query parameter `password` (untuk link download Excel <a>)
 *
 * Password dicocokkan dengan ADMIN_PASSWORD di file .env.
 */

function adminValidator() {
  return function (req, res, next) {
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';

    // Ambil password dari header atau query param
    const clientPassword = req.headers['x-admin-password'] || req.query.password;

    if (clientPassword === adminPassword) {
      return next();
    }

    return res.status(401).json({
      success: false,
      error: 'UNAUTHORIZED',
      message: 'Akses ditolak. Silakan masukkan password admin yang benar.',
    });
  };
}

module.exports = adminValidator;
