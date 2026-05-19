/**
 * Logika halaman data absensi (data.html).
 *
 * Tanggung jawab:
 * - Memuat data dari /api/attendance
 * - Menampilkan dalam tabel dengan thumbnail foto
 * - Filter pencarian (nama / NIP / jenis)
 * - Modal preview foto saat thumbnail diklik
 * - Refresh manual
 */

(function () {
  'use strict';

  // ------------------------------- State -------------------------------
  const state = {
    rows: [],
    filtered: [],
    searchTerm: '',
  };

  // ------------------------------- Refs --------------------------------
  const $ = (sel) => document.querySelector(sel);
  const tableBody = $('#tableBody');
  const totalCount = $('#totalCount');
  const searchInput = $('#searchInput');
  const btnRefresh = $('#btnRefresh');
  const photoModal = $('#photoModal');
  const modalImage = $('#modalImage');
  const yearEl = $('#year');

  // ------------------------------- Utils -------------------------------
  function escapeHtml(text) {
    if (text == null) return '';
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function setLoading() {
    tableBody.innerHTML =
      '<tr><td colspan="8" class="loading-cell">Memuat...</td></tr>';
  }

  function setEmpty(message) {
    tableBody.innerHTML = `<tr><td colspan="8" class="empty-cell">${escapeHtml(
      message
    )}</td></tr>`;
  }

  function render() {
    if (state.filtered.length === 0) {
      setEmpty(
        state.rows.length === 0
          ? 'Belum ada data absensi'
          : 'Tidak ada hasil yang cocok'
      );
      return;
    }

    const html = state.filtered
      .map((row, idx) => {
        const typeClass = row.type === 'masuk' ? 'masuk' : 'pulang';
        return `
          <tr>
            <td>${idx + 1}</td>
            <td>
              <img class="thumb" src="${escapeHtml(row.photo_url)}"
                alt="Foto ${escapeHtml(row.name)}"
                data-photo="${escapeHtml(row.photo_url)}" />
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

    // Pasang event listener thumbnail (delegasi).
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
    render();
  }

  // ------------------------------- Fetch -------------------------------
  async function loadData() {
    setLoading();
    totalCount.textContent = 'Memuat data...';
    try {
      const res = await fetch('/api/attendance');
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data?.message || 'Gagal memuat data');
      }
      state.rows = data.data || [];
      applyFilter();
    } catch (err) {
      console.error('[loadData] error:', err);
      setEmpty('Gagal memuat data: ' + err.message);
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

  // ------------------------------- Init --------------------------------
  function init() {
    yearEl.textContent = new Date().getFullYear();

    btnRefresh.addEventListener('click', loadData);

    let searchTimer;
    searchInput.addEventListener('input', (e) => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        state.searchTerm = e.target.value;
        applyFilter();
      }, 200);
    });

    // Tutup modal saat klik backdrop / tombol close / tekan Esc.
    photoModal.addEventListener('click', (e) => {
      if (e.target.dataset && 'closeModal' in e.target.dataset) {
        closeModal();
      }
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !photoModal.hidden) closeModal();
    });

    loadData();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
