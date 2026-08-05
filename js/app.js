/**
 * Logika Sistem Absensi Single Page Application (SPA).
 *
 * Tanggung jawab:
 * - Manajemen tab (Absen & Data)
 * - Kontrol kamera (WebRTC) & capture foto
 * - Validasi form & submit absensi ke Firestore
 * - Simpan foto base64 ke Firestore
 * - Riwayat data absensi, pencarian/filter
 * - Modal preview foto & clock realtime
 */

import { auth, db } from './firebase.js';
import {
  collection,
  addDoc,
  deleteDoc,
  doc,
  serverTimestamp,
  getDocs,
  query,
  orderBy,
  limit,
  startAfter,
  writeBatch,
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';
import {
  browserLocalPersistence,
  onAuthStateChanged,
  setPersistence,
  signInAnonymously,
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';

(function () {
  'use strict';

  const attendanceCollection = collection(db, 'attendance');
  const ADMIN_PASSWORD = 'admin 123';
  let authReadyPromise = null;

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
    userLocation: {
      lat: null,
      lng: null,
      distanceMeters: null,
      isValid: false,
      error: null,
      checking: false,
    },
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
  const locationStatus = $('#locationStatus');
  const locationNotice = $('#locationNotice');
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
  const btnDeleteAll = $('#btnDeleteAll');

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

  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('Gagal membaca foto'));
      reader.readAsDataURL(blob);
    });
  }

  function downscaleDataUrl(dataUrl, maxWidth = 160, quality = 0.5) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxWidth / img.width);
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        const ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        resolve(c.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => reject(new Error('Gagal memproses foto'));
      img.src = dataUrl;
    });
  }

  function downloadBuffer(buffer, fileName) {
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
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

    const maxWidth = 640;
    const rawWidth = video.videoWidth;
    const rawHeight = video.videoHeight;
    const scale = Math.min(1, maxWidth / rawWidth);
    const w = Math.round(rawWidth * scale);
    const h = Math.round(rawHeight * scale);
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
      0.65
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

  // ---------------------------- Geolocation ----------------------------
  function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3; // Radius bumi (meter)
    const radLat1 = (lat1 * Math.PI) / 180;
    const radLat2 = (lat2 * Math.PI) / 180;
    const deltaLat = ((lat2 - lat1) * Math.PI) / 180;
    const deltaLon = ((lon2 - lon1) * Math.PI) / 180;

    const a =
      Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
      Math.cos(radLat1) *
        Math.cos(radLat2) *
        Math.sin(deltaLon / 2) *
        Math.sin(deltaLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return Math.round(R * c);
  }

  function checkLocation() {
    const locConfig = window.APP_CONFIG?.LOCATION;
    if (!locConfig || !locConfig.ENFORCE_VALIDATION) {
      state.userLocation.isValid = true;
      if (locationStatus) setBadge(locationStatus, 'Lokasi: Bebas', 'muted');
      if (locationNotice) {
        locationNotice.style.background = 'var(--color-bg)';
        locationNotice.style.color = 'var(--color-text)';
        locationNotice.innerHTML = '📍 Validasi lokasi dinonaktifkan.';
      }
      return Promise.resolve(true);
    }

    if (!navigator.geolocation) {
      state.userLocation.isValid = false;
      state.userLocation.error = 'Browser tidak mendukung GPS';
      if (locationStatus) setBadge(locationStatus, 'GPS tak didukung', 'danger');
      if (locationNotice) {
        locationNotice.style.background = 'var(--color-danger-bg)';
        locationNotice.style.color = 'var(--color-danger)';
        locationNotice.innerHTML = '❌ Browser Anda tidak mendukung Geolocation GPS.';
      }
      return Promise.resolve(false);
    }

    state.userLocation.checking = true;
    if (locationStatus) setBadge(locationStatus, 'Cek lokasi GPS...', 'warning');

    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          const distance = calculateDistance(lat, lng, locConfig.LAT, locConfig.LNG);
          const isValid = distance <= locConfig.MAX_RADIUS_METERS;

          state.userLocation = {
            lat,
            lng,
            distanceMeters: distance,
            isValid,
            error: null,
            checking: false,
          };

          if (isValid) {
            if (locationStatus) setBadge(locationStatus, 'Lokasi Valid', 'success');
            if (locationNotice) {
              locationNotice.style.background = 'var(--color-success-bg)';
              locationNotice.style.color = 'var(--color-success)';
              locationNotice.innerHTML = `✓ Lokasi Valid (Jarak: <strong>${distance} m</strong> dari ${locConfig.NAME})`;
            }
          } else {
            if (locationStatus) setBadge(locationStatus, `Di Luar Area (${distance}m)`, 'danger');
            if (locationNotice) {
              locationNotice.style.background = 'var(--color-danger-bg)';
              locationNotice.style.color = 'var(--color-danger)';
              const distanceStr = distance >= 1000 ? `${(distance / 1000).toFixed(2)} km` : `${distance} meter`;
              locationNotice.innerHTML = `✕ Anda di luar lokasi resmi (Jarak: <strong>${distanceStr}</strong> dari ${locConfig.NAME}). Radius maks: ${locConfig.MAX_RADIUS_METERS}m.`;
            }
          }
          resolve(isValid);
        },
        (err) => {
          console.warn('[geolocation] error:', err);
          let errMsg = 'Akses lokasi ditolak / gagal';
          if (err.code === err.PERMISSION_DENIED) {
            errMsg = 'Izin lokasi GPS ditolak browser';
          } else if (err.code === err.POSITION_UNAVAILABLE) {
            errMsg = 'Sinyal GPS tidak tersedia';
          } else if (err.code === err.TIMEOUT) {
            errMsg = 'Waktu minta lokasi habis';
          }

          state.userLocation = {
            lat: null,
            lng: null,
            distanceMeters: null,
            isValid: false,
            error: errMsg,
            checking: false,
          };

          if (locationStatus) setBadge(locationStatus, 'GPS Ditolak', 'danger');
          if (locationNotice) {
            locationNotice.style.background = 'var(--color-danger-bg)';
            locationNotice.style.color = 'var(--color-danger)';
            locationNotice.innerHTML = `⚠️ <strong>${errMsg}</strong>. Aktifkan GPS dan izinkan akses lokasi pada browser HP/PC Anda.`;
          }
          resolve(false);
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0,
        }
      );
    });
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
    if (!values.status || !values.status.trim()) {
      setError('status', 'Pilih jenis absensi');
      valid = false;
    }
    if (!state.capturedBlob) {
      showToast('Ambil foto terlebih dahulu', 'warning');
      valid = false;
    }

    const locConfig = window.APP_CONFIG?.LOCATION;
    if (locConfig && locConfig.ENFORCE_VALIDATION && !state.userLocation.isValid) {
      const errMsg = state.userLocation.error
        ? `Absensi ditolak: ${state.userLocation.error}`
        : `Absensi ditolak: Anda berada di luar area resmi (${locConfig.NAME})`;
      showToast(errMsg, 'error', 5000);
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

  function waitForAuthUser(timeoutMs = 5000) {
    return new Promise((resolve, reject) => {
      let resolved = false;
      const timer = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          unsubscribe();
          reject(new Error('Auth wait timeout - user did not authenticate'));
        }
      }, timeoutMs);

      const unsubscribe = onAuthStateChanged(auth, (user) => {
        if (!resolved) {
          if (user) {
            resolved = true;
            clearTimeout(timer);
            unsubscribe();
            resolve(user);
          }
        }
      });
    });
  }

  async function waitForAuthReady(timeoutMs = 5000) {
    if (typeof auth.authStateReady === 'function') {
      try {
        await Promise.race([
          auth.authStateReady(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('authStateReady timeout')), timeoutMs))
        ]);
        return;
      } catch (err) {
        console.warn('[auth] authStateReady failed, falling back to onAuthStateChanged:', err);
      }
    }
    await waitForAuthUser(timeoutMs);
  }

  async function ensureFirebaseAuth(retryCount = 0) {
    if (!authReadyPromise || retryCount > 0) {
      authReadyPromise = (async () => {
        try {
          await setPersistence(auth, browserLocalPersistence);
        } catch (err) {
          console.warn('[auth] persistence failed:', err);
        }

        if (!auth.currentUser) {
          try {
            await signInAnonymously(auth);
          } catch (err) {
            console.error('[auth] anonymous sign-in failed:', err?.code, err?.message);
            if (err?.code === 'auth/operation-not-allowed') {
              throw new Error('Anonymous Auth belum aktif di Firebase Console. Aktifkan terlebih dahulu.');
            }
            throw err;
          }
        }

        try {
          await waitForAuthReady(5000);
        } catch (err) {
          console.error('[auth] auth ready timeout:', err);
          if (retryCount < 1) {
            console.info('[auth] retrying auth...');
            authReadyPromise = null;
            return ensureFirebaseAuth(retryCount + 1);
          }
          throw err;
        }

        if (!auth.currentUser) {
          throw new Error(
            'Firebase Auth belum menghasilkan user anonim. Cek Anonymous sign-in dan Authorized domains di Firebase Console.'
          );
        }

        console.info('[auth] current user:', auth.currentUser?.uid || '(none)');

        return auth.currentUser;
      })();
    }

    return authReadyPromise;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    clearErrors();

    const values = {
      name: form.name.value,
      status: form.status.value,
    };

    if (!validateForm(values)) return;

    setSubmitLoading(true);
    try {
      await ensureFirebaseAuth();
      if (!auth.currentUser) {
        throw new Error('Firebase Auth belum login. Cek Anonymous sign-in di Firebase Console.');
      }
      const photoBase64 = await blobToDataUrl(state.capturedBlob);

      await addDoc(attendanceCollection, {
        name: values.name.trim(),
        status: values.status.trim(),
        timestamp: serverTimestamp(),
        photoBase64,
        location: {
          latitude: state.userLocation.lat,
          longitude: state.userLocation.lng,
          distanceMeters: state.userLocation.distanceMeters,
          targetName: window.APP_CONFIG?.LOCATION?.NAME || 'Jl. Gubernur Mochtar, Tembalang',
          validated: state.userLocation.isValid,
        },
      });

      showToast('Absensi berhasil disimpan', 'success');
      form.reset();
      retakePhoto();
      if (state.activeTab === 'data') {
        loadData();
      }
    } catch (err) {
      console.error('[submit] firebase error:', err);
      if (err?.code === 'auth/operation-not-allowed') {
        showToast(
          'Firebase Anonymous Auth belum aktif. Aktifkan Authentication > Sign-in method > Anonymous.',
          'error',
          7000
        );
      } else if (String(err?.message || '').includes('Firebase Auth belum login')) {
        showToast(
          'Login anonim belum berhasil. Cek Authentication > Anonymous lalu reload halaman.',
          'error',
          7000
        );
      } else if (String(err?.message || '').includes('Missing or insufficient permissions')) {
        showToast(
          'Firestore menolak akses. Cek rules dan pastikan Anonymous Auth sudah login.',
          'error',
          7000
        );
      } else {
        showToast('Gagal menyimpan absensi: ' + err.message, 'error', 5500);
      }
    } finally {
      setSubmitLoading(false);
    }
  }

  function setLoadingTable() {
    tableBody.innerHTML =
      '<tr><td colspan="7" class="loading-cell">Memuat...</td></tr>';
  }

  function setEmptyTable(message) {
    tableBody.innerHTML = `<tr><td colspan="7" class="empty-cell">${escapeHtml(
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
        const absolutePhotoUrl = row.photoBase64 || '';
        return `
          <tr>
            <td>${idx + 1}</td>
            <td>
              <img class="thumb" src="${escapeHtml(absolutePhotoUrl)}"
                alt="Foto ${escapeHtml(row.name)}"
                data-photo="${escapeHtml(absolutePhotoUrl)}" />
            </td>
            <td>${escapeHtml(row.name)}</td>
            <td>${escapeHtml(row.status)}</td>
            <td>${escapeHtml(row.date)}</td>
            <td>${escapeHtml(row.time)}</td>
            <td>
              <button type="button" class="btn btn-secondary btn-delete" data-id="${escapeHtml(
                row.id
              )}">Hapus</button>
            </td>
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

  async function deleteRowById(id) {
    if (!ensureAdminAccess()) return;
    if (!id) return;
    if (!confirm('Hapus data ini?')) return;
    try {
      await ensureFirebaseAuth();
      await deleteDoc(doc(db, 'attendance', id));
      showToast('Data berhasil dihapus', 'success');
      loadData();
    } catch (err) {
      console.error('[delete] error:', err);
      showToast('Gagal menghapus data: ' + err.message, 'error', 5500);
    }
  }

  async function deleteAllData() {
    if (!ensureAdminAccess()) return;
    if (!confirm('Hapus SEMUA data absensi? Tindakan ini tidak bisa dibatalkan.')) return;
    setLoadingTable();
    try {
      await ensureFirebaseAuth();
      let lastDoc = null;
      while (true) {
        const q = lastDoc
          ? query(attendanceCollection, orderBy('timestamp', 'desc'), startAfter(lastDoc), limit(450))
          : query(attendanceCollection, orderBy('timestamp', 'desc'), limit(450));
        const snapshot = await getDocs(q);
        if (snapshot.empty) break;
        const batch = writeBatch(db);
        snapshot.docs.forEach((docSnap) => {
          batch.delete(docSnap.ref);
        });
        await batch.commit();
        if (snapshot.size < 450) break;
        lastDoc = snapshot.docs[snapshot.docs.length - 1];
      }
      showToast('Semua data berhasil dihapus', 'success');
      loadData();
    } catch (err) {
      console.error('[deleteAll] error:', err);
      showToast('Gagal menghapus semua data: ' + err.message, 'error', 5500);
      loadData();
    }
  }

  async function exportToExcel() {
    if (!ensureAdminAccess()) return;
    if (!window.ExcelJS) {
      showToast('Library Excel belum siap', 'error');
      return;
    }
    try {
      await ensureFirebaseAuth();
      const workbook = new window.ExcelJS.Workbook();
      const sheet = workbook.addWorksheet('Absensi');
      sheet.columns = [
        { header: 'No', key: 'no', width: 6 },
        { header: 'Nama', key: 'name', width: 22 },
        { header: 'Status', key: 'status', width: 14 },
        { header: 'Tanggal', key: 'date', width: 12 },
        { header: 'Jam', key: 'time', width: 10 },
        { header: 'Foto', key: 'photo', width: 18 },
      ];

      for (let i = 0; i < state.rows.length; i += 1) {
        const row = state.rows[i];
        const rowIndex = i + 2;
        sheet.addRow({
          no: i + 1,
          name: row.name,
          status: row.status,
          date: row.date,
          time: row.time,
          photo: '',
        });
        sheet.getRow(rowIndex).height = 52;

        if (row.photoBase64) {
          const smallPhoto = await downscaleDataUrl(row.photoBase64, 160, 0.5);
          const imageId = workbook.addImage({
            base64: smallPhoto,
            extension: 'jpeg',
          });
          sheet.addImage(imageId, {
            tl: { col: 5.1, row: rowIndex - 1 + 0.15 },
            ext: { width: 96, height: 64 },
          });
        }
      }

      const buffer = await workbook.xlsx.writeBuffer();
      downloadBuffer(buffer, 'absensi.xlsx');
    } catch (err) {
      console.error('[export] error:', err);
      showToast('Gagal export Excel: ' + err.message, 'error', 5500);
    }
  }

  function applyFilter() {
    const q = state.searchTerm.toLowerCase().trim();
    if (!q) {
      state.filtered = state.rows.slice();
    } else {
      state.filtered = state.rows.filter((row) => {
        return (
          (row.name || '').toLowerCase().includes(q) ||
          (row.status || '').toLowerCase().includes(q) ||
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
      await ensureFirebaseAuth();
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
          status: data.status || data.kelas || '-',
          photoBase64: data.photoBase64 || '',
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

  function ensureAdminAccess() {
    let cached = sessionStorage.getItem('admin_password');
    if (!cached) {
      cached = prompt('Masukkan Password Admin:');
      if (cached) sessionStorage.setItem('admin_password', cached);
    }
    if (cached !== ADMIN_PASSWORD) {
      sessionStorage.removeItem('admin_password');
      showToast('Password admin salah', 'error');
      return false;
    }
    return true;
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
      if (!ensureAdminAccess()) return;
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
    if (btnExport) btnExport.addEventListener('click', exportToExcel);
    if (btnDeleteAll) btnDeleteAll.addEventListener('click', deleteAllData);
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
    tableBody.addEventListener('click', (e) => {
      const target = e.target.closest('.btn-delete');
      if (!target) return;
      deleteRowById(target.dataset.id);
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !photoModal.hidden) closeModal();
    });

    // Clean up
    window.addEventListener('beforeunload', () => {
      stopCamera();
    });

    // Jalankan Absen secara default
    ensureFirebaseAuth()
      .catch((err) => {
        console.error('[auth] init failed:', err);
      })
      .finally(() => {
        switchTab('absen');
        updateFirebaseStatus();
      });

    window.addEventListener('online', updateFirebaseStatus);
    window.addEventListener('offline', updateFirebaseStatus);
  }

  document.addEventListener('DOMContentLoaded', init);
})();
