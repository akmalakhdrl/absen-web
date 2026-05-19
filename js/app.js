/**
 * Logika halaman absensi (index.html).
 *
 * Tanggung jawab:
 * - Mengaktifkan kamera dan menampilkan preview realtime
 * - Mengambil foto, kompres, dan simpan ke variabel untuk dikirim
 * - Menampilkan tanggal/jam berjalan
 * - Cek status WiFi (lewat /api/health + /api/attendance HEAD-like via OPTIONS)
 * - Submit form ke /api/attendance dengan multipart/form-data
 * - Menampilkan loading state, validasi, dan toast notifikasi
 */

(function () {
  'use strict';

  // ------------------------------- State -------------------------------
  const state = {
    stream: null,
    capturedBlob: null,
  };

  // ------------------------------- Refs --------------------------------
  const $ = (sel) => document.querySelector(sel);
  const video = $('#video');
  const canvas = $('#canvas');
  const preview = $('#preview');
  const cameraOverlay = $('#cameraOverlay');
  const cameraStatus = $('#cameraStatus');
  const wifiStatus = $('#wifiStatus');

  const btnCapture = $('#btnCapture');
  const btnRetake = $('#btnRetake');
  const btnSubmit = $('#btnSubmit');

  const form = $('#attendanceForm');
  const currentDateEl = $('#currentDate');
  const currentTimeEl = $('#currentTime');
  const yearEl = $('#year');
  const toastEl = $('#toast');

  // ------------------------------- Utils -------------------------------
  function showToast(message, variant = 'info', duration = 3500) {
    toastEl.textContent = message;
    toastEl.className = 'toast show ' + variant;
    clearTimeout(showToast._timer);
    showToast._timer = setTimeout(() => {
      toastEl.className = 'toast';
    }, duration);
  }

  function pad(n) {
    return String(n).padStart(2, '0');
  }

  function updateClock() {
    const now = new Date();
    const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const time = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
    currentDateEl.textContent = date;
    currentTimeEl.textContent = time;
  }

  function setBadge(el, text, variant) {
    el.textContent = text;
    el.className = 'badge ' + (variant ? 'badge-' + variant : 'badge-muted');
  }

  // ----------------------------- Camera --------------------------------
  async function initCamera() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setBadge(cameraStatus, 'Tidak didukung', 'danger');
      cameraOverlay.querySelector('p').textContent =
        'Browser tidak mendukung akses kamera.';
      cameraOverlay.querySelector('.spinner').hidden = true;
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user',
        },
        audio: false,
      });
      state.stream = stream;
      video.srcObject = stream;

      await new Promise((resolve) => {
        if (video.readyState >= 2) return resolve();
        video.onloadedmetadata = () => resolve();
      });

      cameraOverlay.classList.add('hidden');
      btnCapture.disabled = false;
      setBadge(cameraStatus, 'Kamera aktif', 'success');
    } catch (err) {
      console.error('[camera] error:', err);
      setBadge(cameraStatus, 'Akses ditolak', 'danger');
      cameraOverlay.querySelector('p').textContent =
        'Tidak dapat mengakses kamera. Pastikan izin kamera diberikan.';
      cameraOverlay.querySelector('.spinner').hidden = true;
    }
  }

  function capturePhoto() {
    if (!video.videoWidth || !video.videoHeight) {
      showToast('Kamera belum siap', 'error');
      return;
    }

    const w = video.videoWidth;
    const h = video.videoHeight;
    canvas.width = w;
    canvas.height = h;

    const ctx = canvas.getContext('2d');
    // Mirror agar hasil capture sesuai dengan preview (yang ter-mirror).
    ctx.save();
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, w, h);
    ctx.restore();

    canvas.toBlob(
      (blob) => {
        if (!blob) {
          showToast('Gagal mengambil foto', 'error');
          return;
        }
        state.capturedBlob = blob;

        const url = URL.createObjectURL(blob);
        preview.src = url;
        preview.hidden = false;
        video.hidden = true;

        btnCapture.hidden = true;
        btnRetake.hidden = false;
        setBadge(cameraStatus, 'Foto siap', 'success');
      },
      'image/jpeg',
      0.85
    );
  }

  function retakePhoto() {
    if (preview.src) URL.revokeObjectURL(preview.src);
    preview.removeAttribute('src');
    preview.hidden = true;
    video.hidden = false;

    btnCapture.hidden = false;
    btnRetake.hidden = true;
    state.capturedBlob = null;
    setBadge(cameraStatus, 'Kamera aktif', 'success');
  }

  // ------------------------------ WiFi check ---------------------------
  async function checkWifi() {
    setBadge(wifiStatus, 'Cek jaringan...', 'muted');
    try {
      // Endpoint health tidak dilindungi wifiValidator, gunakan untuk cek server.
      // Lalu kita coba GET /api/attendance (terbuka) untuk cek koneksi umum.
      const res = await fetch('/api/health');
      if (res.ok) {
        // Cek validasi WiFi dengan request OPTIONS preflight (akan gagal 403 bila WiFi tidak diizinkan).
        const probe = await fetch('/api/attendance', {
          method: 'POST',
          headers: { 'X-Probe': '1' },
        });
        if (probe.status === 403) {
          setBadge(wifiStatus, 'WiFi tidak terdaftar', 'danger');
          return;
        }
        setBadge(wifiStatus, 'Jaringan OK', 'success');
      } else {
        setBadge(wifiStatus, 'Server bermasalah', 'warning');
      }
    } catch (err) {
      setBadge(wifiStatus, 'Tidak terhubung', 'danger');
    }
  }

  // ------------------------------ Validation ---------------------------
  function clearErrors() {
    document.querySelectorAll('.form-group').forEach((g) => g.classList.remove('invalid'));
    document.querySelectorAll('.error-text').forEach((e) => (e.textContent = ''));
  }

  function setError(fieldName, message) {
    const input = document.querySelector(`[name="${fieldName}"]`);
    if (input) input.closest('.form-group')?.classList.add('invalid');
    const errEl = document.querySelector(`[data-error-for="${fieldName}"]`);
    if (errEl) errEl.textContent = message;
  }

  function validateForm(values) {
    let valid = true;
    if (!values.name || !values.name.trim()) {
      setError('name', 'Nama wajib diisi');
      valid = false;
    }
    if (!values.employee_id || !values.employee_id.trim()) {
      setError('employee_id', 'NIP/ID wajib diisi');
      valid = false;
    }
    if (!values.type) {
      setError('type', 'Pilih jenis absensi');
      valid = false;
    }
    if (!state.capturedBlob) {
      showToast('Ambil foto terlebih dahulu', 'warning');
      valid = false;
    }
    return valid;
  }

  // ------------------------------ Submit -------------------------------
  function setSubmitLoading(loading) {
    btnSubmit.disabled = loading;
    btnSubmit.classList.toggle('is-loading', loading);
    const spinner = btnSubmit.querySelector('.btn-spinner');
    const label = btnSubmit.querySelector('.btn-label');
    if (spinner) spinner.hidden = !loading;
    if (label) label.textContent = loading ? 'Mengirim...' : 'Submit Absensi';
  }

  async function handleSubmit(e) {
    e.preventDefault();
    clearErrors();

    const values = {
      name: form.name.value,
      employee_id: form.employee_id.value,
      type: form.type.value,
      note: form.note.value,
    };

    if (!validateForm(values)) return;

    const fd = new FormData();
    fd.append('name', values.name.trim());
    fd.append('employee_id', values.employee_id.trim());
    fd.append('type', values.type);
    if (values.note) fd.append('note', values.note.trim());
    fd.append('photo', state.capturedBlob, `absensi-${Date.now()}.jpg`);

    setSubmitLoading(true);
    try {
      const res = await fetch('/api/attendance', {
        method: 'POST',
        body: fd,
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.success) {
        const msg = data?.message || 'Gagal mengirim absensi';
        showToast(msg, 'error', 4500);
        return;
      }

      showToast('Absensi berhasil disimpan', 'success');
      form.reset();
      retakePhoto();
    } catch (err) {
      console.error('[submit] error:', err);
      showToast('Tidak dapat terhubung ke server', 'error');
    } finally {
      setSubmitLoading(false);
    }
  }

  // ------------------------------ Init ---------------------------------
  function init() {
    yearEl.textContent = new Date().getFullYear();
    updateClock();
    setInterval(updateClock, 1000);

    btnCapture.addEventListener('click', capturePhoto);
    btnRetake.addEventListener('click', retakePhoto);
    form.addEventListener('submit', handleSubmit);

    // Bersihkan stream saat tab ditutup.
    window.addEventListener('beforeunload', () => {
      if (state.stream) {
        state.stream.getTracks().forEach((t) => t.stop());
      }
    });

    initCamera();
    checkWifi();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
