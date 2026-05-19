/**
 * Controller untuk fitur absensi.
 *
 * Menangani:
 * - submitAttendance : menerima data form + foto, validasi, simpan ke DB
 * - getAttendance    : mengambil seluruh data absensi
 * - exportExcel      : export data absensi ke file .xlsx
 */

const path = require('path');
const fs = require('fs');
const ExcelJS = require('exceljs');
const db = require('../config/database');

/**
 * Hapus file foto dengan aman (digunakan saat validasi gagal setelah upload).
 */
function safeUnlink(filePath) {
  if (!filePath) return;
  fs.unlink(filePath, () => {
    // Abaikan error penghapusan; file mungkin sudah tidak ada.
  });
}

/**
 * POST /api/attendance
 *
 * Body (multipart/form-data):
 * - name        (required)
 * - employee_id (required)
 * - type        (required: "masuk" | "pulang")
 * - note        (optional)
 * - photo       (file, required)
 */
exports.submitAttendance = (req, res) => {
  const photoFile = req.file;

  try {
    const { name, employee_id, type, note, latitude, longitude } = req.body || {};

    // Validasi field wajib.
    const errors = [];
    if (!name || !name.trim()) errors.push('Nama wajib diisi');
    if (!employee_id || !employee_id.trim()) errors.push('NIP/ID wajib diisi');
    if (!type || !['masuk', 'pulang'].includes(String(type).toLowerCase())) {
      errors.push('Jenis absensi harus "masuk" atau "pulang"');
    }
    if (!photoFile) errors.push('Foto wajah wajib diambil');

    if (errors.length > 0) {
      // Bila ada file ter-upload tapi validasi gagal, hapus file tersebut.
      if (photoFile?.path) safeUnlink(photoFile.path);
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: errors.join('. '),
      });
    }

    // Bentuk timestamp lokal.
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const time = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
    const createdAt = `${date} ${time}`;

    // Path foto disimpan relatif (filename saja) agar mudah di-serve via /uploads/<file>.
    const photoFilename = path.basename(photoFile.path);

    const stmt = db.prepare(`
      INSERT INTO attendance
        (name, employee_id, type, note, photo_path, ip_address, date, time, latitude, longitude, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const info = stmt.run(
      name.trim(),
      employee_id.trim(),
      String(type).toLowerCase(),
      note ? note.trim() : null,
      photoFilename,
      req.clientIp || req.ip || null,
      date,
      time,
      latitude ? parseFloat(latitude) : null,
      longitude ? parseFloat(longitude) : null,
      createdAt
    );

    return res.status(201).json({
      success: true,
      message: 'Absensi berhasil disimpan',
      data: {
        id: info.lastInsertRowid,
        name: name.trim(),
        employee_id: employee_id.trim(),
        type: String(type).toLowerCase(),
        note: note ? note.trim() : null,
        photo_url: `/uploads/${photoFilename}`,
        date,
        time,
        created_at: createdAt,
      },
    });
  } catch (err) {
    if (photoFile?.path) safeUnlink(photoFile.path);
    console.error('[submitAttendance] error:', err);
    return res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: 'Terjadi kesalahan saat menyimpan absensi',
    });
  }
};

/**
 * GET /api/attendance
 *
 * Mengembalikan seluruh data absensi (urut terbaru).
 */
exports.getAttendance = (req, res) => {
  try {
    const rows = db
      .prepare(
        `SELECT id, name, employee_id, type, note, photo_path,
                ip_address, date, time, latitude, longitude, created_at
         FROM attendance
         ORDER BY id DESC`
      )
      .all();

    const data = rows.map((row) => ({
      ...row,
      photo_url: `/uploads/${row.photo_path}`,
    }));

    return res.json({
      success: true,
      count: data.length,
      data,
    });
  } catch (err) {
    console.error('[getAttendance] error:', err);
    return res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: 'Gagal mengambil data absensi',
    });
  }
};

/**
 * GET /api/attendance/export
 *
 * Membuat dan mengirim file Excel berisi data absensi.
 */
exports.exportExcel = async (req, res) => {
  try {
    const rows = db
      .prepare(
        `SELECT id, name, employee_id, type, note, ip_address, date, time, latitude, longitude, created_at
         FROM attendance
         ORDER BY id ASC`
      )
      .all();

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Sistem Absensi';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('Absensi', {
      properties: { defaultRowHeight: 20 },
    });

    sheet.columns = [
      { header: 'No', key: 'no', width: 6 },
      { header: 'Nama', key: 'name', width: 25 },
      { header: 'NIP / ID', key: 'employee_id', width: 18 },
      { header: 'Jenis', key: 'type', width: 10 },
      { header: 'Tanggal', key: 'date', width: 14 },
      { header: 'Jam', key: 'time', width: 12 },
      { header: 'IP Address', key: 'ip_address', width: 18 },
      { header: 'Latitude', key: 'latitude', width: 15 },
      { header: 'Longitude', key: 'longitude', width: 15 },
      { header: 'Catatan', key: 'note', width: 30 },
      { header: 'Dibuat Pada', key: 'created_at', width: 22 },
    ];

    // Style header.
    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
    headerRow.eachCell((cell) => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF2563EB' },
      };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFCCCCCC' } },
        left: { style: 'thin', color: { argb: 'FFCCCCCC' } },
        bottom: { style: 'thin', color: { argb: 'FFCCCCCC' } },
        right: { style: 'thin', color: { argb: 'FFCCCCCC' } },
      };
    });

    rows.forEach((row, idx) => {
      sheet.addRow({
        no: idx + 1,
        name: row.name,
        employee_id: row.employee_id,
        type: row.type,
        date: row.date,
        time: row.time,
        ip_address: row.ip_address || '-',
        latitude: row.latitude || '-',
        longitude: row.longitude || '-',
        note: row.note || '-',
        created_at: row.created_at,
      });
    });

    // Border tipis pada seluruh baris data.
    for (let r = 2; r <= sheet.rowCount; r++) {
      sheet.getRow(r).eachCell((cell) => {
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
          left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
          bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
          right: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        };
      });
    }

    const filename = `absensi-${new Date().toISOString().slice(0, 10)}.xlsx`;
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('[exportExcel] error:', err);
    return res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: 'Gagal membuat file Excel',
    });
  }
};
