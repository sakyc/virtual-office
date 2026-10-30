# Demo bersama terjadwal

Berbeda dari **Trial pribadi 7 hari** (`/demo`). Trial tetap memakai akun dan
kantor pribadi. Demo terjadwal memakai **satu user internal tanpa password**;
tidak ada email/password bersama yang dibagikan ke calon pelanggan.

## Alur pengguna dan admin

1. Landing → **Jadwalkan demo** → `/scheduled-demo` di domain aplikasi.
2. **Tidak perlu login atau daftar akun.** Isi nama, email kontak, nomor WhatsApp,
   perusahaan, dan kebutuhan. Email kontak tidak dianggap terverifikasi.
3. Usulan jadwal opsional; kosongkan agar admin menentukan. Jika diisi, harus
   mendatang hingga 90 hari ke depan (bukan harus menunggu 90 hari). Kirim OTP WA.
4. OTP benar → status menunggu admin. Tidak otomatis mendapat trial atau saldo.
5. Admin membuka `/admin/demo`, menyetujui waktu mulai/selesai dan saldo kunjungan.
   Durasi 15 menit–4 jam, saldo Rp100–Rp10.000. Jadwal bertabrakan ditolak.
6. Admin memilih **Kirim kode WA**. Pengiriman terpisah agar admin dapat memeriksa
   jadwal dahulu. Kode akses hanya disimpan sebagai HMAC, tidak tampil di UI/log.
7. Buka tautan `/scheduled-demo?booking=...` dari WA, masukkan kode sesuai jadwal,
   tanpa login. Tautan tidak memuat kode rahasia. Bisa dari perangkat berbeda.
   Cookie sesi menjadi akun internal demo. Kode habis setelah satu penukaran.
8. Kantor sudah berisi 6 divisi / 21 agen template. Pengunjung bisa chat, membuat
   tugas, klien, serta mencoba persetujuan/revisi menggunakan model aktif katalog.
9. Setelah waktu berakhir, atau dijeda/diakhiri admin, server menolak akses baru.
   Saldo habis → AI tidak bisa dipakai. Tidak ada top up atau langganan demo.
10. Keluar demo dan login ulang untuk kembali ke akun pribadi. Jika sengaja logout
    sebelum selesai, kode tidak dapat dipakai lagi; hubungi admin. Menutup tab saja
    tidak menghapus cookie, sehingga dapat kembali selama sesi dan jadwal valid.

## Satu akun, data tiap kunjungan terpisah

User internal dibuat satu kali pada penukaran pertama, issuer
`karyora:shared-demo`, subject `singleton`. Tidak ada native credential.
Pengunjung tidak bisa mengganti password/profil, mengundang anggota, membeli
paket, berganti workspace, atau mengakses admin. Firewall default-deny dipasang
sebelum semua handler auth/API. Rute baru tidak otomatis diberikan ke demo.

Setiap kunjungan membuat snapshot organisasi/workspace baru, masih di **database
aplikasi yang sama**, bukan database percobaan. Ini disengaja: menggunakan ulang
workspace yang sama dengan user yang sama dapat membocorkan chat, tugas, atau
saldo. Kantor tampil sama, tetapi isi percobaan dan jatahnya tidak diwariskan.
Keanggotaan dan sesi kunjungan lama dicabut ketika kunjungan berikutnya dimulai.
Data historis tidak dihapus; tetap tersimpan untuk audit. Belum ada retensi atau
penghapusan otomatis. Jangan gunakan data pelanggan asli dalam presentasi.

Kontrol global dan booking dikunci dalam transaksi: penukaran bersamaan tidak
menciptakan dua sesi aktif/dua grant. Jadwal tidak bertabrakan meskipun booking
dijeda. Akhiri booking untuk melepas reservasi jadwal. Sesi terikat ke booking,
workspace, waktu, dan sakelar admin; pemeriksaan dilakukan pada tiap API.
Saldo kunjungan memiliki expiry sama dengan jadwal. Reservasi AI juga memeriksa
akses demo aktif. Pekerjaan yang sudah dikirim ke provider dapat tetap selesai
dan diselesaikan penagihannya; pause tidak membatalkan biaya provider yang sudah
terjadi. Tidak ada pembatalan jarak jauh inferensi yang sudah berjalan.

OTP: 5 menit, maksimal 5 percobaan; jeda kirim minimal 60 detik. Total kirim OTP
dan kode dibatasi 10/24 jam per nomor WA pada demo terjadwal, ditambah limiter IP
dan capability browser/IP. Kode akses 128-bit, terikat booking, berlaku hanya
selama jadwal, maksimal 5 percobaan. Gagal kirim membatalkan hash namun tetap
menghitung budget kirim. Respons gateway sukses berarti diterima gateway,
bukan bukti pesan sudah dibaca/terkirim ke perangkat penerima.

Browser pemohon mendapat cookie acak 256-bit `vo_demo_guest`, HttpOnly,
SameSite=Lax, Secure di production, cakupan `/api/shared-demo`, usia 90 hari.
Database hanya menyimpan SHA-256 cookie, tidak menyimpan nilai mentah. Cookie
ini diperlukan untuk melihat status, mengirim dan memverifikasi OTP; UUID saja
tidak cukup. Jangan hapus cookie saat menunggu persetujuan. Perangkat lain tetap
bisa masuk dengan tautan **dan kode akses** WA setelah admin menyetujui.
Satu nomor WA tidak dapat memiliki beberapa pengajuan pending/jadwal aktif
sekaligus setelah verifikasi. Budget kirim per nomor tetap berlaku lintas browser.
Belum ada CAPTCHA; limiter IP lokal proses dan budget kirim database tetap aktif.

Pengajuan lama sebelum 020 tetap tersimpan dan memakai login pemohon. Pemohon
lama yang sudah login melihat pengajuannya pada halaman yang sama, atau memakai
tautan WA `&legacy=1`. Tidak ada migrasi akun pribadi menjadi akun demo.

## Konfigurasi dan deploy

Memerlukan migration 001–019 sudah valid, kemudian **020_guest_scheduled_demo**.
Jangan ubah migration lama. Semua tetap di satu database aplikasi.
Simpan konfigurasi di `.env`, jangan commit nilainya:

```dotenv
SHARED_DEMO_ENABLED=1
BLITZMES_API_KEY=isi_di_server
DEMO_CODE_SECRET=secret_acak_minimal_32_karakter
APP_ORIGIN=https://app.karyora.vetencode.com
```

Gunakan secret/gateway yang sudah dipakai Trial bila sudah tersedia. Mengganti
secret membatalkan semua OTP/kode yang belum ditukar. Feature flag ini terpisah
dari `DEMO_ENABLED` milik Trial pribadi. Sakelar database default **nonaktif**;
setelah konfigurasi dan migration, aktifkan dari `/admin/demo` dengan alasan.

Backup database sebelum upgrade (perintah ini dijalankan root):

```bash
cd /home/vetencode/apps/karyora
install -d -m 700 /root/karyora-db-backups
KARYORA_VISIT_BACKUP=$(mktemp /root/karyora-db-backups/before-guest-demo-XXXXXX.sql)
mariadb-dump --single-transaction --quick --routines --triggers vetencode_karyora > "$KARYORA_VISIT_BACKUP" && test -s "$KARYORA_VISIT_BACKUP"
```

Hanya jika backup sukses, jalankan sebagai user project:

```bash
sudo -iu vetencode
cd /home/vetencode/apps/karyora
git pull --ff-only origin main
npm ci
node scripts/upgrade-deployment-guest-demo.mjs --apply --confirm-production --database vetencode_karyora --backup-confirmed
node scripts/upgrade-deployment-guest-demo.mjs --validate --confirm-production --database vetencode_karyora
npm run build
pm2 restart deploy/ecosystem.config.cjs --update-env
pm2 save
```

Jalankan tiap tahap secara berurutan; **berhenti pada kegagalan**, jangan lanjut
restart jika migration/build gagal. Script hanya menerima target database yang
sama dengan `.env`, memeriksa checksum/history dan schema 001–019, mengunci
migrasi, serta hanya menerapkan 020. Jika 019 belum diterapkan, jalankan upgrade
`upgrade-deployment-shared-demo.mjs` dahulu. Jangan drop tabel atau mencoba ulang DDL parsial.
Script validasi tanpa `--apply` tidak menerapkan migration.

Apache landing perlu tambahan `scheduled-demo` di daftar redirect domain app;
contoh berada pada `deploy/apache/landing-https.conf`. Terapkan hanya perubahan
include yang relevan, cek `httpd -t`, kemudian graceful reload. Jangan menimpa
konfigurasi cPanel generated. Membuka `/scheduled-demo` pada landing seharusnya
302 ke URL yang sama pada `app.karyora.vetencode.com`.

## Pengujian

```bash
npm run test:shared-demo
npm run test:demo
npm run build
```

Tes otomatis memakai gateway dan database mock, tidak mengirim WA, tidak membuka
database development/production, tidak memanggil model berbayar. Pengujian live
MariaDB/WA tetap diperlukan setelah migration dan konfigurasi di server.
Uji manual: buka incognito tanpa login, isi biodata (jadwal boleh kosong), OTP WA,
cek identitas dan verifikasi WA di admin, dua pemohon berbeda, jadwal bertabrakan ditolak,
kode sebelum/sesudah jadwal ditolak, login sesuai jadwal, coba chat/tugas,
pause/resume/end dari admin, dan kunjungan berikutnya tanpa riwayat lama.
Biaya reservasi maksimum model bisa lebih besar dari saldo demo; pilih model
lebih hemat atau anggaran lebih besar jika reservasi ditolak. Harga/model tetap
mengikuti katalog dinamis admin, tidak ada allowlist demo hardcode.
Uji juga buka tautan WA pada browser berbeda: tidak boleh menampilkan biodata
atau status pengajuan, tetapi kode akses valid bisa dipakai saat jadwalnya tiba.

Admin melihat 100 booking terbaru dan 50 audit terbaru, pemohon melihat 20
pengajuan terakhir miliknya. Status `active` tersimpan sebagai riwayat setelah
waktu habis; UI menampilkan **Waktu berakhir** dan akses server tetap tertutup.
Tidak memerlukan cron untuk penutupan akses. Tombol **Muat ulang** memperbarui
monitor; belum ada push real-time ke halaman admin. Token yang ditampilkan adalah
input + output tercatat, biaya adalah hold yang sudah settled; keduanya bisa
terlambat saat request masih berjalan atau usage provider belum terkonfirmasi.
