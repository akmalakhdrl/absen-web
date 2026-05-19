/**
 * Logika Sistem Absensi Single Page Application (SPA).
 *
 * Tanggung jawab:
 * - Manajemen tab (Absen & Data)
 * - Autentikasi pop-up admin sederhana untuk akses tab Data
 * - Kontrol Kamera (WebRTC) & Capture foto
 * - Validasi form & submit absensi (multipart/form-data)
 * - Riwayat data absensi, pencarian/filter, & export Excel (ExcelJS)
 * - Modal preview foto & clock realtime
 */

(function () {
  'use strict';

  // ------------------------------- Config ------------------------------
  // Tentukan base URL API secara dinamis agar berjalan mulus di localhost (port 3000),
  // saat dibuka via Live Server (port 5500), maupun saat di-deploy ke production.
  const API_BASE = (window.location.port === '3000' || (window.location.protocol === 'http:' && !window.location.port))
    ? ''
    : 'http://localhost:3000';

  // ------------------------------- State -------------------------------
  const state = {
    activeTab: 'absen', // 'absen' | 'data'
    stream: null,
    capturedBlob: null,
    rows: [],
    filtered: [],
    searchTerm: '',
  };

  // ------------------------------- Refs --------------------------------
  const $ = (sel) => document.querySelector(sel);

  // Nav Tabs
  const tabAbsen = $('#tabAbsen');
  const tabData = $('#tabData');

  // Sections
  const sectionAbsen = $('#sectionAbsen');
  const sectionData = $('#sectionData');

  // Camera Elements
  const video = $('#video');
  const canvas = $('#canvas');
  const preview = $('#preview');
  const cameraOverlay = $('#cameraOverlay');
  const cameraStatus = $('#cameraStatus');
  const wifiStatus = $('#wifiStatus');
  const btnCapture = $('#btnCapture');
  const btnRetake = $('#btnRetake');

  // Form Elements
  const form = $('#attendanceForm');
  const currentDateEl = $('#currentDate');
  const currentTimeEl = $('#currentTime');
  const btnSubmit = $('#btnSubmit');

  // Data/Table Elements
  const tableBody = $('#tableBody');
  const totalCount = $('#totalCount');
  const searchInput = $('#searchInput');
  const btnRefresh = $('#btnRefresh');
  const btnExport = $('#btnExport');

  // Modal Preview
  const photoModal = $('#photoModal');
  const modalImage = $('#modalImage');

  // Global Elements
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
    if (currentDateEl) currentDateEl.textContent = date;
    if (currentTimeEl) currentTimeEl.textContent = time;
  }

  function setBadge(el, text, variant) {
    el.textContent = text;
    el.className = 'badge ' + (variant ? 'badge-' + variant : 'badge-muted');
  }

  function escapeHtml(text) {
    if (text == null) return '';
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // ----------------------------- Camera --------------------------------
  async function initCamera() {
    if (state.stream) return; // Kamera sudah aktif

    // Reset UI camera
    video.hidden = false;
    preview.hidden = true;
    preview.removeAttribute('src');
    btnCapture.hidden = false;
    btnRetake.hidden = true;
    state.capturedBlob = null;

    setBadge(cameraStatus, 'Menyiapkan kamera...', 'muted');
    cameraOverlay.classList.remove('hidden');
    cameraOverlay.querySelector('p').textContent = 'Memuat kamera...';
    const spinner = cameraOverlay.querySelector('.spinner');
    if (spinner) spinner.removeAttribute('hidden');

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setBadge(cameraStatus, 'Tidak didukung', 'danger');
      cameraOverlay.querySelector('p').textContent =
        'Browser tidak mendukung akses kamera.';
      if (spinner) spinner.setAttribute('hidden', 'true');
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
      if (spinner) spinner.setAttribute('hidden', 'true');
    }
  }

  function stopCamera() {
    if (state.stream) {
      state.stream.getTracks().forEach((track) => track.stop());
      state.stream = null;
      video.srcObject = null;
      btnCapture.disabled = true;
      setBadge(cameraStatus, 'Nonaktif', 'muted');
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

  // ------------------------------ WiFi Check ---------------------------
  async function checkWifi() {
    setBadge(wifiStatus, 'Cek jaringan...', 'muted');
    try {
      const res = await fetch(API_BASE + '/api/health');
      if (!res.ok) {
        setBadge(wifiStatus, 'Server bermasalah', 'warning');
        return;
      }

      // Endpoint ringan khusus pengecekan WiFi (GET, tanpa upload).
      const probe = await fetch(API_BASE + '/api/network-check');
      if (probe.status === 403) {
        setBadge(wifiStatus, 'WiFi tidak terdaftar', 'danger');
        return;
      }
      if (!probe.ok) {
        setBadge(wifiStatus, 'Cek jaringan gagal', 'warning');
        return;
      }
      setBadge(wifiStatus, 'Jaringan OK', 'success');
    } catch (err) {
      console.error('[checkWifi] error:', err);
      setBadge(wifiStatus, 'Tidak terhubung', 'danger');
    }
  }

  // ------------------------- Form Validation ---------------------------
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
      const res = await fetch(API_BASE + '/api/attendance', {
        method: 'POST',
        body: fd,
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.success) {
        const msg = data?.message || `Gagal mengirim absensi (HTTP ${res.status})`;
        const detail = data?.detail ? ` — ${data.detail}` : '';
        console.error('[submit] server response error:', res.status, data);
        showToast(msg + detail, 'error', 5500);
        return;
      }

      showToast('Absensi berhasil disimpan', 'success');
      form.reset();
      retakePhoto();
    } catch (err) {
      console.error('[submit] network/parse error:', err);
      showToast('Tidak dapat terhubung ke server: ' + err.message, 'error', 5500);
    } finally {
      setSubmitLoading(false);
    }
  }

  // -------------------------- Admin Auth & Data ------------------------
  function getAdminPassword() {
    let password = sessionStorage.getItem('admin_password');
    if (!password) {
      password = prompt('Masukkan Password Admin untuk melihat data:');
      if (password) {
        sessionStorage.setItem('admin_password', password);
      }
    }
    return password;
  }

  function handleAuthError() {
    sessionStorage.removeItem('admin_password');
    alert('Password admin salah atau tidak sah!');
    loadData();
  }

  function setLoadingTable() {
    tableBody.innerHTML =
      '<tr><td colspan="9" class="loading-cell">Memuat...</td></tr>';
  }

  function setEmptyTable(message) {
    tableBody.innerHTML = `<tr><td colspan="9" class="empty-cell">${escapeHtml(
      message
    )}</td></tr>`;
  }

  function renderTable() {
    if (state.filtered.length === 0) {
      setEmptyTable(
        state.rows.length === 0
          ? 'Belum ada data absensi'
          : 'Tidak ada hasil yang cocok'
      );
      return;
    }

    const html = state.filtered
      .map((row, idx) => {
        const typeClass = row.type === 'masuk' ? 'masuk' : 'pulang';
        const absolutePhotoUrl = row.photo_url.startsWith('http')
          ? row.photo_url
          : (API_BASE + row.photo_url);
        return `
          <tr>
            <td>${idx + 1}</td>
            <td>
              <img class="thumb" src="${escapeHtml(absolutePhotoUrl)}"
                alt="Foto ${escapeHtml(row.name)}"
                data-photo="${escapeHtml(absolutePhotoUrl)}" />
            </td>
            <td>${escapeHtml(row.name)}</td>
            <td>${escapeHtml(row.employee_id)}</td>
            <td><span class="type-badge ${typeClass}">${escapeHtml(row.type)}</span></td>
            <td>${escapeHtml(row.date)}</td>
            <td>${escapeHtml(row.time)}</td>
            <td>${escapeHtml(row.note || '-')}</td>
          </tr>
        `;
      })
      .join('');

    tableBody.innerHTML = html;

    // Pasang click handler modal preview
    tableBody.querySelectorAll('.thumb').forEach((img) => {
      img.addEventListener('click', () => openModal(img.dataset.photo));
    });
  }

  function applyFilter() {
    const q = state.searchTerm.toLowerCase().trim();
    if (!q) {
      state.filtered = state.rows.slice();
    } else {
      state.filtered = state.rows.filter((row) => {
        return (
          (row.name || '').toLowerCase().includes(q) ||
          (row.employee_id || '').toLowerCase().includes(q) ||
          (row.type || '').toLowerCase().includes(q) ||
          (row.date || '').toLowerCase().includes(q)
        );
      });
    }
    totalCount.textContent = `Menampilkan ${state.filtered.length} dari ${state.rows.length} data`;
    renderTable();
  }

  async function loadData() {
    const password = getAdminPassword();
    if (!password) {
      // Jika user cancel password, kembalikan ke tab absen secara paksa
      switchTab('absen');
      return;
    }

    // Pasang token/password di link export Excel
    if (btnExport) {
      btnExport.href = `${API_BASE}/api/attendance/export?password=${encodeURIComponent(password)}`;
    }

    setLoadingTable();
    totalCount.textContent = 'Memuat data...';
    try {
      const res = await fetch(API_BASE + '/api/attendance', {
        headers: {
          'X-Admin-Password': password,
        },
      });

      if (res.status === 401) {
        handleAuthError();
        return;
      }

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data?.message || 'Gagal memuat data');
      }
      state.rows = data.data || [];
      applyFilter();
    } catch (err) {
      console.error('[loadData] error:', err);
      setEmptyTable('Gagal memuat data: ' + err.message);
      totalCount.textContent = 'Gagal memuat data';
    }
  }

  // ------------------------------- Modal -------------------------------
  function openModal(src) {
    modalImage.src = src;
    photoModal.hidden = false;
    document.body.style.overflow = 'hidden';
  }

  function closeModal() {
    photoModal.hidden = true;
    modalImage.removeAttribute('src');
    document.body.style.overflow = '';
  }

  // --------------------------- Tab Navigation --------------------------
  function switchTab(tab) {
    if (tab === 'absen') {
      state.activeTab = 'absen';
      tabAbsen.classList.add('active');
      tabData.classList.remove('active');
      sectionAbsen.hidden = false;
      sectionData.hidden = true;
      initCamera();
    } else if (tab === 'data') {
      // Prompt password dlu sebelum switch tab
      const password = getAdminPassword();
      if (!password) {
        // User menolak input password, batalkan switch tab
        return;
      }
      state.activeTab = 'data';
      tabData.classList.add('active');
      tabAbsen.classList.remove('active');
      sectionAbsen.hidden = true;
      sectionData.hidden = false;
      stopCamera();
      loadData();
    }
  }

  // ------------------------------ Init ---------------------------------
  function init() {
    yearEl.textContent = new Date().getFullYear();
    updateClock();
    setInterval(updateClock, 1000);

    // Event Listeners Tab
    tabAbsen.addEventListener('click', (e) => {
      e.preventDefault();
      switchTab('absen');
    });
    tabData.addEventListener('click', (e) => {
      e.preventDefault();
      switchTab('data');
    });

    // Event Kamera & Form
    btnCapture.addEventListener('click', capturePhoto);
    btnRetake.addEventListener('click', retakePhoto);
    form.addEventListener('submit', handleSubmit);

    // Event Refresh & Cari Data
    btnRefresh.addEventListener('click', loadData);
    let searchTimer;
    searchInput.addEventListener('input', (e) => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        state.searchTerm = e.target.value;
        applyFilter();
      }, 200);
    });

    // Event Modal
    photoModal.addEventListener('click', (e) => {
      if (e.target.dataset && 'closeModal' in e.target.dataset) {
        closeModal();
      }
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !photoModal.hidden) closeModal();
    });

    // Clean up
    window.addEventListener('beforeunload', () => {
      stopCamera();
    });

    // Jalankan Absen secara default
    switchTab('absen');
    checkWifi();
    initGPS();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
