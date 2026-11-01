'use strict';

const express = require('express');
const mysql = require('mysql2/promise');
const path = require('path');

const PORT = Number(process.env.PORT || 3000);

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'db',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  waitForConnections: true,
  connectionLimit: 10,
  charset: 'utf8mb4',
  dateStrings: true,
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Menunggu database siap, lalu memastikan tabel tersedia.
async function initDatabase() {
  const maxRetry = Number(process.env.DB_WAIT_RETRIES || 30);
  const interval = Number(process.env.DB_WAIT_INTERVAL || 2000);

  for (let attempt = 1; attempt <= maxRetry; attempt++) {
    try {
      await pool.query('SELECT 1');
      break;
    } catch (err) {
      console.log(`[db] belum siap (${attempt}/${maxRetry}): ${err.code || err.message}`);
      if (attempt === maxRetry) throw err;
      await sleep(interval);
    }
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS tugas (
      id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      judul VARCHAR(150) NOT NULL,
      mata_kuliah VARCHAR(100) NOT NULL,
      deadline DATE NOT NULL,
      selesai TINYINT(1) NOT NULL DEFAULT 0,
      dibuat_pada TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  console.log('[db] terhubung, tabel tugas siap');
}

// Validasi input; mengembalikan { data } atau { error }.
function validasi(body) {
  const judul = String(body.judul ?? '').trim();
  const mataKuliah = String(body.mata_kuliah ?? '').trim();
  const deadline = String(body.deadline ?? '').trim();

  if (!judul || judul.length > 150) return { error: 'Judul wajib diisi (maks. 150 karakter).' };
  if (!mataKuliah || mataKuliah.length > 100) return { error: 'Mata kuliah wajib diisi (maks. 100 karakter).' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(deadline) || Number.isNaN(Date.parse(deadline))) {
    return { error: 'Deadline harus berformat YYYY-MM-DD.' };
  }
  return { data: { judul, mataKuliah, deadline, selesai: body.selesai ? 1 : 0 } };
}

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '10kb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Healthcheck: memastikan aplikasi dan koneksi database sehat.
app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', database: 'terhubung' });
  } catch (err) {
    res.status(503).json({ status: 'error', database: 'terputus' });
  }
});

app.get('/api/tugas', async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, judul, mata_kuliah, deadline, selesai FROM tugas ORDER BY selesai ASC, deadline ASC, id DESC'
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

app.post('/api/tugas', async (req, res, next) => {
  const { data, error } = validasi(req.body || {});
  if (error) return res.status(400).json({ error });
  try {
    const [hasil] = await pool.execute(
      'INSERT INTO tugas (judul, mata_kuliah, deadline, selesai) VALUES (?, ?, ?, ?)',
      [data.judul, data.mataKuliah, data.deadline, data.selesai]
    );
    res.status(201).json({ id: hasil.insertId });
  } catch (err) {
    next(err);
  }
});

app.put('/api/tugas/:id', async (req, res, next) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'ID tidak valid.' });
  const { data, error } = validasi(req.body || {});
  if (error) return res.status(400).json({ error });
  try {
    const [hasil] = await pool.execute(
      'UPDATE tugas SET judul = ?, mata_kuliah = ?, deadline = ?, selesai = ? WHERE id = ?',
      [data.judul, data.mataKuliah, data.deadline, data.selesai, id]
    );
    if (hasil.affectedRows === 0) return res.status(404).json({ error: 'Data tidak ditemukan.' });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

app.delete('/api/tugas/:id', async (req, res, next) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'ID tidak valid.' });
  try {
    const [hasil] = await pool.execute('DELETE FROM tugas WHERE id = ?', [id]);
    if (hasil.affectedRows === 0) return res.status(404).json({ error: 'Data tidak ditemukan.' });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

app.use((err, req, res, next) => {
  console.error('[error]', err.message);
  res.status(500).json({ error: 'Terjadi kesalahan pada server.' });
});

let server;

async function main() {
  await initDatabase();
  server = app.listen(PORT, '0.0.0.0', () => console.log(`[app] berjalan pada port ${PORT}`));
}

// Penghentian bertahap agar `docker stop` tidak menunggu sampai timeout.
async function shutdown(signal) {
  console.log(`[app] menerima ${signal}, menutup layanan`);
  if (server) await new Promise((resolve) => server.close(resolve));
  await pool.end().catch(() => {});
  process.exit(0);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

main().catch((err) => {
  console.error('[fatal]', err.message);
  process.exit(1);
});
