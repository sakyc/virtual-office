# Alur aplikasi yang terpasang

Pemeriksaan lokal: 26 Oktober 2026. Ini catatan kemampuan nyata, bukan klaim siap produksi.

## Pengguna dan tugas

1. Landing `/` → daftar/login → onboarding organisasi dan workspace. Pengguna, organisasi, workspace, dan membership terpisah; satu organisasi dapat memiliki banyak pengguna.
2. `/dashboard/billing`: lihat paket, langganan, dan saldo. Aktivasi langganan/top-up saat ini dilakukan admin, bukan checkout pembayaran otomatis.
3. `/dashboard/team`: buat divisi dan agen sendiri atau gunakan struktur template. Kantor `/dashboard/office` mempertahankan Three.js dan menampilkan tim workspace; ruangan lain tidak otomatis diisi agen.
4. `/dashboard/templates`: simpan template tugas workspace. Template merupakan formulir dan instruksi yang dapat dipakai berulang, bukan sebuah tugas yang langsung berjalan.
5. `/dashboard/jobs` → Perintah baru: pilih agen aktif, tugas bebas/template, judul, input, klien opsional, dan model aktif. Panel Perintah pada agen kantor memakai komponen formulir yang sama. Klien hanya konteks brand/pelanggan, bukan syarat membuat tugas.
6. Hasil masuk `/dashboard/board` sebagai draft. Setujui untuk menerima, tolak dengan alasan, atau minta revisi. Revisi menyimpan versi sebelumnya dan memakai saldo AI. Persetujuan tidak berarti konten dikirim ke WhatsApp/email atau dipublikasikan.
7. Chat pribadi terpisah dari tugas Board: percakapan tersimpan per pengguna, workspace dan agen. Riwayat chat bukan sumber hak akses tenant.

## Batas paket, saldo dan izin

- Katalog database adalah sumber harga/benefit, ditampilkan pada landing dan dashboard. Admin dapat mengubah harga, saldo bulanan, jumlah divisi, anggota manusia, publikasi paket, dan benefit WhatsApp. Custom memakai penawaran dan batas eksplisit, bukan akses tanpa batas.
- Batas divisi dan anggota dihitung seluruh organisasi, bukan dikali per workspace. Maksimal empat agen per divisi; scene saat ini maksimal delapan divisi. Anggota manusia berbeda dari agen AI.
- Pemakaian AI memerlukan langganan aktif, model aktif dengan tarif, dan saldo yang cukup. Saldo rupiah dipakai untuk chat, tugas, dan revisi; bukan batas lima jam/mingguan.
- Reservasi saldo adalah penahanan sementara untuk membatasi biaya maksimum sebelum provider dipanggil. Penyelesaian menggunakan token aktual dan tarif/kurs/markup yang dicatat. Pemakaian yang belum pasti akibat gangguan perlu rekonsiliasi; jangan mengembalikan saldo sembarangan karena provider mungkin telah memprosesnya.
- Owner/admin workspace mengelola tim/template/anggota dan dapat membuat tugas. Member dapat membuat tugas/chat hanya dengan agen yang ditugaskan langsung atau melalui divisi. Persetujuan, penolakan, dan revisi untuk member hanya jika ditunjuk sebagai PIC divisi; owner/admin tetap dapat meninjau. Viewer tidak boleh menulis. Platform admin tidak otomatis mendapat akses isi customer.
- Identitas dan scope berasal dari sesi server. Agen/template/klien diperiksa terhadap workspace aktif. API pembuatan tugas baru menolak executor roster statis; record lama tanpa ownership tetap tidak dapat diakses.
- Request key mencegah pengiriman ulang identik menjadwalkan dua tugas. Snapshot agen/template/model disimpan pada job; perubahan template berikutnya tidak mengubah instruksi tugas yang sudah dikirim.
- Kegagalan tugas baru menyimpan kode alasan aman pada kolom jobs.error yang sudah ada: kurs, saldo, langganan, model, akses, provider, format/output, atau penyimpanan/biaya yang belum pasti. API mengubah kode whitelist menjadi pesan untuk daftar Perintah dan riwayat agen kantor; tidak mengirim exception, SQL, prompt, atau kredensial. Kegagalan lama yang hanya menyimpan pesan umum tetap ditandai penyebab tidak tercatat. Tidak ada retry AI otomatis atau perubahan saldo sebagai bagian perbaikan pesan.

## Admin

`/admin`: ringkasan. `/admin/users`: pengguna. `/admin/organizations`: organisasi/membership. `/admin/subscriptions`: operasi langganan/saldo. `/admin/billing`: editor satu paket sekaligus. `/admin/models`: model, tarif dan status aktif. `/admin/audit`: log perubahan. Operasi sensitif memakai alasan dan kontrol akses server; paket aktif mempertahankan snapshot lama.

Halaman klien dan anggota menggunakan shell dashboard dan data scoped. `/dashboard/workers` kompatibel dengan halaman tim sebenarnya, bukan daftar orang contoh. Navigasi admin pada mobile menggunakan pilihan halaman, tidak memerlukan sidebar horizontal panjang.

## Verifikasi dan batasan nyata

- Build Vite dan seluruh unit/integration test dijalankan; lihat laporan akhir untuk jumlah aktual.
- `node scripts/verify-workspace-tasks-local.mjs --confirm-non-production`: MySQL lokal `virtual_office`, fixture dalam transaksi lalu rollback, tidak membuat database lain atau memanggil provider berbayar. Mencakup idempotensi, Board, approve/reject/revisi, isolasi tenant dan pencabutan sesi. Schema valid tanpa differences.
- Migration 015 memperlebar jobs/items.agent_id untuk UUID agen dan menambah nullable jobs.request_key + unique key. Tidak mengisi ownership lama. Backup sebelum pemasangan: `D:/VetendCode/database-backups/virtual-office-before-015-LLL76R/before-015.sql`. Perbandingan dump memverifikasi row lama tetap sama; restore backup belum direhearsal.
- UI diuji dengan fixture HTTP memori berlabel QA: tugas bebas/template → daftar tugas → Board/persetujuan, anggota, admin desktop/mobile, dan scene kantor. Fixture bukan hasil AI sungguhan. Eksekusi tugas memakai provider berbayar belum diuji pada sesi pengerjaan ini.
- Hasil tugas baru berupa satu draft terstruktur (beberapa ide dapat berada dalam satu draft), bukan selalu banyak kartu seperti executor lama. Total invoice/rekap bawaan tetap diproses deterministik oleh server; output AI tetap perlu diperiksa.
- Undangan anggota mandiri tersedia melalui `/dashboard/members`: tautan sekali pakai, 72 jam, terikat email akun yang menerima. Pengiriman tautan masih manual; tidak ada email otomatis. Penugasan dan PIC disimpan server, bukan klaim dari browser. Lihat `tenant-members.md`.
- Belum operasional: checkout/webhook pembayaran otomatis, bot dan persetujuan WhatsApp, verifikasi nomor WhatsApp, workflow builder. Benefit WhatsApp di paket bukan bukti layanan pengiriman aktif.
- Runner tugas masih in-process, bukan durable queue. Restart server saat tugas berjalan dapat meninggalkan status generating; jangan otomatis replay tugas berbayar. Periksa status provider/billing sebelum pemulihan manual.

Jalankan aplikasi dengan `npm run dev`. Tidak ada migration otomatis saat startup.
