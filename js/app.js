/**
 * Logika Sistem Absensi Single Page Application (SPA).
 *
 * Tanggung jawab:
 * - Manajemen tab (Absen & Data)
 * - Kontrol kamera (WebRTC) & capture foto
 * - Validasi form & submit absensi ke Firestore
 * - Upload foto ke Firebase Storage
 * - Riwayat data absensi, pencarian/filter
 * - Modal preview foto & clock realtime
 */

import { db, storage } from './firebase.js';
import {
  collection,
  addDoc,
  serverTimestamp,
  getDocs,
  query,
  orderBy,
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';
import {
  ref,
  uploadBytes,
  getDownloadURL,
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-storage.js';

(function () {
  'use strict';

  const attendanceCollection = collection(db, 'attendance');

  // Peringatan kamera tidak akan jalan bila bukan HTTPS / localhost.
  const isSecureContext =
    window.isSecureContext ||
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1';
  if (!isSecureContext) {
    console.warn(
      '[config] Konteks tidak aman (bukan HTTPS / localhost). ' +
      'Akses kamera kemungkinan akan ditolak browser.'
    );
  }

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

  // ------------------------------ Status -------------------------------
  function updateFirebaseStatus() {
    if (!wifiStatus) return;
    if (navigator.onLine) {
      setBadge(wifiStatus, 'Firebase siap', 'success');
    } else {
      setBadge(wifiStatus, 'Offline', 'danger');
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
    if (!values.kelas || !values.kelas.trim()) {
      setError('kelas', 'Kelas wajib diisi');
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
      kelas: form.kelas.value,
    };

    if (!validateForm(values)) return;

    setSubmitLoading(true);
    try {
      const fileName = `attendance/${Date.now()}-${Math.round(Math.random() * 1e9)}.jpg`;
      const storageRef = ref(storage, fileName);
      await uploadBytes(storageRef, state.capturedBlob, {
        contentType: 'image/jpeg',
      });
      const photoUrl = await getDownloadURL(storageRef);

      await addDoc(attendanceCollection, {
        name: values.name.trim(),
        kelas: values.kelas.trim(),
        timestamp: serverTimestamp(),
        fotoUrl: photoUrl,
      });

      showToast('Absensi berhasil disimpan', 'success');
      form.reset();
      retakePhoto();
      if (state.activeTab === 'data') {
        loadData();
      }
    } catch (err) {
      console.error('[submit] firebase error:', err);
      showToast('Gagal menyimpan absensi: ' + err.message, 'error', 5500);
    } finally {
      setSubmitLoading(false);
    }
  }

  function setLoadingTable() {
    tableBody.innerHTML =
      '<tr><td colspan="6" class="loading-cell">Memuat...</td></tr>';
  }

  function setEmptyTable(message) {
    tableBody.innerHTML = `<tr><td colspan="6" class="empty-cell">${escapeHtml(
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
        const absolutePhotoUrl = row.fotoUrl || '';
        return `
          <tr>
            <td>${idx + 1}</td>
            <td>
              <img class="thumb" src="${escapeHtml(absolutePhotoUrl)}"
                alt="Foto ${escapeHtml(row.name)}"
                data-photo="${escapeHtml(absolutePhotoUrl)}" />
            </td>
            <td>${escapeHtml(row.name)}</td>
            <td>${escapeHtml(row.kelas)}</td>
            <td>${escapeHtml(row.date)}</td>
            <td>${escapeHtml(row.time)}</td>
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
          (row.kelas || '').toLowerCase().includes(q) ||
          (row.date || '').toLowerCase().includes(q)
        );
      });
    }
    totalCount.textContent = `Menampilkan ${state.filtered.length} dari ${state.rows.length} data`;
    renderTable();
  }

  async function loadData() {
    setLoadingTable();
    totalCount.textContent = 'Memuat data...';
    try {
      const q = query(attendanceCollection, orderBy('timestamp', 'desc'));
      const snapshot = await getDocs(q);
      state.rows = snapshot.docs.map((doc) => {
        const data = doc.data();
        const ts = data.timestamp && data.timestamp.toDate ? data.timestamp.toDate() : null;
        const date = ts
          ? `${ts.getFullYear()}-${pad(ts.getMonth() + 1)}-${pad(ts.getDate())}`
          : '-';
        const time = ts
          ? `${pad(ts.getHours())}:${pad(ts.getMinutes())}:${pad(ts.getSeconds())}`
          : '-';
        return {
          id: doc.id,
          name: data.name || '-',
          kelas: data.kelas || '-',
          fotoUrl: data.fotoUrl || '',
          date,
          time,
        };
      });
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
    updateFirebaseStatus();
    window.addEventListener('online', updateFirebaseStatus);
    window.addEventListener('offline', updateFirebaseStatus);
  }

  document.addEventListener('DOMContentLoaded', init);
})();
