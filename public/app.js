'use strict';

const form = document.getElementById('form-tugas');
const daftar = document.getElementById('daftar');
const pesan = document.getElementById('pesan');
const kosong = document.getElementById('kosong');
const jumlah = document.getElementById('jumlah');
const judulForm = document.getElementById('judul-form');
const btnBatal = document.getElementById('btn-batal');
const ids = ['id', 'judul', 'mata_kuliah', 'deadline'];
const el = Object.fromEntries(ids.map((k) => [k, document.getElementById(k)]));

let data = [];

async function api(url, opsi = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...opsi,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || 'Permintaan gagal.');
  return body;
}

function buatSel(teks, kelas) {
  const td = document.createElement('td');
  td.textContent = teks;
  if (kelas) td.className = kelas;
  return td;
}

function buatTombol(label, kelas, handler) {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = label;
  b.className = `kecil ${kelas}`.trim();
  b.addEventListener('click', handler);
  return b;
}

function render() {
  daftar.replaceChildren();
  kosong.hidden = data.length > 0;
  jumlah.textContent = data.length ? `(${data.length})` : '';

  data.forEach((t) => {
    const tr = document.createElement('tr');
    if (t.selesai) tr.className = 'selesai';

    const status = document.createElement('td');
    const cek = document.createElement('input');
    cek.type = 'checkbox';
    cek.checked = Boolean(t.selesai);
    cek.title = 'Tandai selesai';
    cek.addEventListener('change', () => ubahStatus(t, cek.checked));
    status.appendChild(cek);

    const aksi = document.createElement('td');
    aksi.className = 'aksi-sel';
    aksi.append(
      buatTombol('Ubah', 'sekunder', () => mulaiUbah(t)),
      buatTombol('Hapus', 'bahaya', () => hapus(t))
    );

    tr.append(status, buatSel(t.judul, 'judul'), buatSel(t.mata_kuliah), buatSel(t.deadline), aksi);
    daftar.appendChild(tr);
  });
}

async function muat() {
  try {
    data = await api('/api/tugas');
    render();
  } catch (err) {
    pesan.textContent = err.message;
  }
}

function reset() {
  form.reset();
  el.id.value = '';
  judulForm.textContent = 'Tambah Tugas';
  btnBatal.hidden = true;
}

function mulaiUbah(t) {
  el.id.value = t.id;
  el.judul.value = t.judul;
  el.mata_kuliah.value = t.mata_kuliah;
  el.deadline.value = t.deadline;
  judulForm.textContent = 'Ubah Tugas';
  btnBatal.hidden = false;
  el.judul.focus();
}

async function ubahStatus(t, selesai) {
  try {
    await api(`/api/tugas/${t.id}`, { method: 'PUT', body: JSON.stringify({ ...t, selesai }) });
    await muat();
  } catch (err) {
    pesan.textContent = err.message;
  }
}

async function hapus(t) {
  if (!confirm(`Hapus tugas "${t.judul}"?`)) return;
  try {
    await api(`/api/tugas/${t.id}`, { method: 'DELETE' });
    await muat();
  } catch (err) {
    pesan.textContent = err.message;
  }
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  pesan.textContent = '';
  const payload = {
    judul: el.judul.value,
    mata_kuliah: el.mata_kuliah.value,
    deadline: el.deadline.value,
  };
  const id = el.id.value;
  try {
    if (id) {
      const lama = data.find((x) => String(x.id) === id);
      await api(`/api/tugas/${id}`, { method: 'PUT', body: JSON.stringify({ ...payload, selesai: lama ? lama.selesai : 0 }) });
    } else {
      await api('/api/tugas', { method: 'POST', body: JSON.stringify(payload) });
    }
    reset();
    await muat();
  } catch (err) {
    pesan.textContent = err.message;
  }
});

btnBatal.addEventListener('click', reset);
muat();
