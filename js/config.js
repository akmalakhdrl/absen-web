/**
 * Konfigurasi runtime aplikasi.
 *
 * EDIT FILE INI sebelum deploy frontend ke GitHub Pages:
 * Ganti API_BASE_URL dengan URL backend production Anda
 * (mis. https://absensi-api.up.railway.app atau https://absensi-api.onrender.com).
 *
 * Saat dibiarkan kosong (""), aplikasi akan auto-detect:
 * - Same-origin bila frontend di-serve oleh backend (port 3000 / production hosting)
 * - hostname:3000 saat dibuka via Live Server di LAN
 * - http://localhost:3000 saat file:// (development)
 *
 * Untuk GitHub Pages, WAJIB diisi karena hostname github.io tidak punya backend.
 */
window.APP_CONFIG = {
  // === ISI URL BACKEND PRODUCTION DI SINI ===
  // Contoh:
  //   API_BASE_URL: "https://absensi-api.up.railway.app",
  //   API_BASE_URL: "https://absensi-api.onrender.com",
  // Kosongkan ("") untuk mode development local.
  API_BASE_URL: '',

  // === KONFIGURASI LOKASI GEOLOCATION (GPS) ===
  LOCATION: {
    NAME: 'Jl. Gubernur Mochtar, Tembalang, Kec. Tembalang, Kota Semarang, Jawa Tengah 50275',
    LAT: -7.0498,
    LNG: 110.4375,
    MAX_RADIUS_METERS: 500, // Radius toleransi dalam meter
    ENFORCE_VALIDATION: true, // Set true untuk mengaktifkan validasi lokasi GPS device
  },
};
