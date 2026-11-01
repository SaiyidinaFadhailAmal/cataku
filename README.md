# Cataku — Catatan Tugas Kuliah

Aplikasi web sederhana untuk mencatat tugas kuliah (tambah, lihat, ubah, hapus, tandai selesai).
Dibuat untuk Tugas Praktikum Individu Komputasi Awan: containerization dengan Docker dan Docker Compose,
lalu deployment ke Azure Virtual Machine.

**Teknologi:** Node.js 22 (Express) · MySQL 8.4 · Docker Compose

## Struktur Project

```
cataku/
├── Dockerfile          # multi-stage build (deps -> runtime), user non-root
├── compose.yaml        # service app + db, network, volume, healthcheck
├── .env.example        # contoh variabel rahasia (salin menjadi .env)
├── .dockerignore
├── .gitignore          # .env tidak ikut di-push
├── package.json
├── package-lock.json
├── server.js           # REST API + healthcheck /health
└── public/             # antarmuka web (HTML, CSS, JS)
```

## Arsitektur

```
Browser --HTTP:80--> [ app (Node.js :3000) ] --network backend (internal)--> [ db (MySQL :3306) ]
                     network: frontend + backend                              network: backend saja
```

- Hanya service `app` yang membuka port ke publik (80 -> 3000).
- Service `db` tidak memiliki bagian `ports`, dan network `backend` bersifat `internal: true`.
- Data MySQL disimpan pada volume `mysql_data`.
- `app` baru dijalankan setelah `db` berstatus *healthy* (`depends_on` + `service_healthy`).
- Kedua service memakai `restart: unless-stopped`.

## Menjalankan di Azure VM

1. Push project ke GitHub (pastikan `.env` tidak ikut), lalu clone di VM:

   ```bash
   git clone https://github.com/<username>/cataku.git
   cd cataku
   ```

2. Buat file `.env` dari contoh, lalu ganti seluruh password:

   ```bash
   cp .env.example .env
   nano .env
   ```

3. Bangun dan jalankan container:

   ```bash
   sudo docker compose up -d --build
   sudo docker compose ps
   ```

4. Buka `http://<IP_PUBLIC_VM>` pada browser.

Pastikan port 80 diizinkan pada Network Security Group VM.

## Skenario Pengujian (bukti untuk laporan)

Ambil screenshot pada setiap langkah. Pastikan nama VM dan IP publik terlihat.

**1. Struktur project, Dockerfile, dan compose.yaml**

```bash
ls -la
cat Dockerfile
cat compose.yaml
```

**2. Status container**

```bash
sudo docker compose ps
```

Kedua service harus berstatus `running` / `healthy`.

**3. Akses aplikasi lewat IP publik**

Buka `http://<IP_PUBLIC_VM>` dan pastikan address bar terlihat jelas.
Cek juga `http://<IP_PUBLIC_VM>/health`, yang harus menampilkan `{"status":"ok","database":"terhubung"}`.

**4. Halaman Overview VM di Azure Portal**

Tampilkan nama VM dan IP publik yang sama dengan screenshot sebelumnya.

**5. Uji persistensi data**

```bash
# 1) tambahkan beberapa tugas melalui browser, lalu screenshot daftar tugas
sudo docker compose down
sudo docker compose ps          # kosong: container sudah dihapus
sudo docker compose up -d
sudo docker compose ps
# 2) refresh browser: data tugas masih ada
```

Jangan gunakan `docker compose down -v`, karena opsi `-v` menghapus volume dan seluruh data.

**6. Uji keamanan network (database tidak terbuka ke luar)**

```bash
# di VM: kolom PORTS service db tidak memuat pemetaan ke host
sudo docker compose ps
sudo docker port cataku-db                 # tidak menghasilkan output
sudo ss -tlnp | grep 3306                  # tidak ada proses yang listen di host
sudo docker network inspect cataku_backend --format '{{.Internal}}'   # true
```

Dari laptop (PowerShell):

```powershell
Test-NetConnection <IP_PUBLIC_VM> -Port 3306   # TcpTestSucceeded : False
```

**7. Uji restart**

Gunakan salah satu cara berikut:

```bash
# cara A: mensimulasikan crash (container dimatikan paksa, lalu dijalankan ulang oleh Docker)
sudo docker kill cataku-app
sleep 10
sudo docker compose ps

# cara B: restart VM
sudo reboot
# tunggu 1-2 menit, SSH kembali, lalu:
sudo docker compose ps
```

Catatan: `docker stop` yang dijalankan manual **tidak** memicu restart otomatis pada
`restart: unless-stopped`, karena Docker menganggapnya penghentian yang disengaja.
Gunakan `docker kill` (simulasi crash) atau restart VM untuk membuktikan kebijakan restart.

## Perintah Berguna

```bash
sudo docker compose logs -f app       # log aplikasi
sudo docker compose logs -f db        # log database
sudo docker compose up -d --build     # build ulang setelah mengubah kode
sudo docker compose down              # hentikan, data tetap aman
```

## Setelah Selesai

Lakukan **Stop (deallocate)** pada VM di Azure Portal agar kredit tidak habis.
