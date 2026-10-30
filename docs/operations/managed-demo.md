# Akun demo yang dikontrol admin

Terpisah dari demo pengunjung/OTP pada `/scheduled-demo`; alur lama tidak diubah. Trial pribadi juga belum diubah.

## Penggunaan

1. Buka `/admin/demo` dengan akun platform admin.
2. Pada **Akun demo · login dengan password**, tentukan nama, email unik, password sesuai kebijakan aplikasi, saldo awal Rp100–Rp100.000, dan alasan. Tidak ada password bawaan/seeder.
3. Akun dibuat dengan 6 divisi dan agen template. Login langsung melalui `/login` biasa, tanpa OTP/jadwal. AI awalnya nonaktif.
4. Aktifkan AI dari halaman admin untuk mengizinkan pemakaian. Biaya model tetap mengikuti tarif dinamis dan token aktual. Saldo habis tetap menolak AI.
5. Nonaktifkan AI: pengguna tetap dapat login, membuka kantor dan riwayat; chat, tugas AI baru, dan revisi AI ditolak server-side. Permintaan provider yang sudah berjalan dapat selesai dan tetap ditagihkan. Toggle tidak menambah saldo.
6. Nonaktifkan login: akun ditangguhkan dan semua sesi dicabut. Aktifkan lagi untuk mengizinkan login baru.
7. Ganti password: password di-hash, tidak bisa dibaca ulang, sesi lama dicabut. Tidak ada password dinamis otomatis.

Kredensial dibagikan admin sendiri secara aman; WA tidak diperlukan untuk akun ini. Karena satu akun, seluruh pengguna berbagi data, riwayat, dan saldo. Tidak ada antrean atau pembatasan satu pemakai pada akun password ini. Jangan gunakan data sensitif. Akun demo tidak boleh membeli paket, mengundang anggota, mengubah profil/password sendiri, berpindah workspace, atau masuk admin. Tindakan admin dicatat tanpa password. Penambahan saldo bila dibutuhkan menggunakan penyesuaian saldo admin yang sudah ada, tidak melalui toggle AI.

### Menyusun kantor presentasi

Akun demo dapat menambah divisi, menambah/edit agen, dan menghapus divisi/agen dari kantor melalui `/dashboard/team`, termasuk ketika AI nonaktif. Batas tetap 6 divisi aktif dan 4 agen per divisi. Karena awalnya sudah berisi 6 divisi, hapus salah satu sebelum menambah divisi pengganti. Penghapusan memakai arsip di database yang sama agar riwayat tugas/pemakaian tetap utuh; divisi beserta agennya hilang dari kantor aktif dan slot bisa dipakai kembali. Ini tidak membuka pembelian, undangan, admin, atau AI yang dinonaktifkan. Demo pengunjung/OTP lama tetap tidak dapat mengelola tim.

Template tugas demo dapat dibuat, diedit, disalin dari struktur bawaan, dan diarsipkan tanpa memanggil AI. Tombol **Gunakan template** membuka `/dashboard/jobs` dengan form template terpilih. Tugas juga bisa dibuat dari panel agen di kantor. Pengiriman tugas/revisi tetap ditolak saat AI dimatikan atau saldo tidak cukup. Halaman Anggota tersedia hanya baca untuk demo; tidak membuka undangan atau perubahan role/PIC.

## Deploy (satu database yang sama)

Backup database terlebih dahulu; jalankan dari repo sebagai `vetencode`. Upgrade hanya menerima history 001–021 lengkap atau 001–022 lengkap, dan menolak tabel 022 parsial. Jangan drop tabel atau mengulang DDL secara buta.

```bash
node scripts/upgrade-deployment-managed-demo.mjs --apply --confirm-production --database vetencode_karyora --backup-confirmed
node scripts/upgrade-deployment-managed-demo.mjs --validate --confirm-production --database vetencode_karyora
npm run build
pm2 restart deploy/ecosystem.config.cjs --update-env
pm2 save
```

Tidak ada env/API key demo baru. `ANTHROPIC_API_KEY` dan katalog model aktif aplikasi tetap dipakai. Migration 022 wajib dipasang sebelum menjalankan kode baru. Migration lama tidak diubah.

## Pemeriksaan

- Buat akun, login ketika AI nonaktif: dashboard/6 divisi/riwayat terbuka; chat/tugas/revisi ditolak tanpa panggilan provider.
- Aktifkan AI: permintaan berhasil bila provider/model/saldo tersedia; biaya aktual memotong saldo.
- Matikan AI ketika sesi masih terbuka: permintaan berikutnya ditolak tanpa logout; saldo dan riwayat tetap.
- Ganti password: password lama/sesi lama tidak berlaku; login baru memakai password baru.
- Matikan login: sesi dicabut dan login ditolak; akun personal lain tidak terpengaruh.
- Coba endpoint pembelian, undangan, profil, admin, dan ganti workspace dari demo: ditolak.
- Demo pengunjung lama dan akun personal berbayar tetap berfungsi.

Pengujian otomatis memakai mock DB/provider, tidak mengirim WA atau membuat panggilan AI berbayar. Uji integrasi database/VPS tetap dilakukan setelah deploy.

## Template per divisi

- Form tugas di kantor/dashboard hanya menampilkan template divisi agen dan template umum. Pilih agen terlebih dahulu; mengganti divisi agen melepas pilihan template yang tidak cocok, tanpa menghapus judul/instruksi.
- Template bawaan mengikuti jenis divisi asal (`workspace_divisions.template_id`), bukan nama divisi yang bisa berubah. Divisi custom tanpa jenis bawaan memakai tugas bebas, template umum, atau template custom yang ditugaskan ke divisi tersebut.
- Di Template Tugas, owner/admin dapat memfilter divisi dan memilih beberapa divisi pada editor template custom. Pilihan kosong berarti umum. Template lama tanpa pengaturan tetap umum.
- Pilihan disimpan sebagai `divisionIds` di JSON `workspace_task_templates.definition`. Tidak memerlukan migration baru. Server memvalidasi divisi aktif dalam workspace saat menyimpan, serta kecocokan template/agen sebelum membuat tugas.
