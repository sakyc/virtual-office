# Anggota tenant, penugasan AI, dan PIC

Halaman: `/dashboard/members` → **Organisasi → Anggota & akses**. Admin Platform tetap terpisah; role platform tidak memberikan akses isi tenant.

## Penggunaan

1. Owner/admin tenant memilih **Undang anggota**, email, role, serta divisi/agen untuk member.
2. Salin tautan yang ditampilkan sekali, lalu kirim secara pribadi kepada penerima. Layanan email belum diintegrasikan. Tautan berlaku 72 jam dan bisa dicabut dari daftar undangan.
3. Penerima membuka `/join#token=...`. Login/daftar menggunakan email penerima di tab baru, lalu kembali ke tautan dan memilih **Terima undangan**. Tidak perlu membuat organisasi baru. Login di tab baru tidak mengubah akun yang sedang login tanpa autentikasi nyata.
4. Undangan hanya menyimpan SHA-256 token hash. Token mentah tidak tersimpan dalam tabel/audit dan fragment URL tidak dikirim dalam URL HTTP/referrer. Jangan membagikan tautan di tempat publik.
5. Server memeriksa email akun, sesi, keanggotaan pemberi undangan yang masih aktif, expiry, sekali pakai, scope, dan kapasitas paket saat penerimaan. Undangan tidak memesan kursi. Akun dengan membership aktif tidak bisa memakai undangan untuk mengganti role yang sudah ada.

## Role dan batasan

- Owner: mengelola workspace termasuk admin; tidak bisa diturunkan/dicabut melalui halaman anggota.
- Admin workspace: mengelola member/viewer; tidak boleh mengangkat atau mengubah admin/owner. Tidak bisa mengubah akses sendiri.
- Member: chat/tugas memakai agen yang ditugaskan langsung atau seluruh divisi, termasuk agen baru di divisi tersebut. Tanpa penugasan tidak bisa memakai AI. Board/data workspace dibaca bersama; penugasan **bukan** isolasi konten antaranggota dalam workspace yang sama. Riwayat chat tetap pribadi per user.
- Viewer: hanya baca, tanpa chat, pembuatan tugas, atau review.
- Kursi dihitung sebagai akun manusia unik dalam organisasi, bukan jumlah agen AI. Keanggotaan yang sama di beberapa workspace tidak boleh mengonsumsi kursi tambahan saat menerima undangan.
- Perubahan role/penugasan menggunakan versi optimistic; perubahan bersamaan menghasilkan 409. Pencabutan tidak menghapus akun, chat, tugas, atau hasil kerja; gate dan worker memeriksa ulang hak akses yang tersimpan.

## PIC persetujuan

Owner/admin menetapkan satu PIC per divisi. Member yang menjadi PIC wajib ditugaskan ke seluruh divisi. Tugas mengambil divisi dari agen dan resource tersimpan, bukan `userId`, `workspaceId`, atau `role` dari client.

Board memiliki tab **Perlu saya tinjau**. Detail menampilkan PIC dan hak review dari server. Member non-PIC ditolak saat approve/reject/revise, termasuk request langsung. Owner/admin dapat meninjau sebagai jalur eskalasi. Tanpa PIC, hanya owner/admin yang meninjau. Perubahan PIC berlaku juga untuk draft yang sudah ada, bukan snapshot PIC per tugas. Jika divisi/agen diarsipkan, akses member ditutup dan owner/admin dapat menangani hasil lama. Pengurangan role/penugasan membersihkan PIC yang tidak lagi valid.

Notifikasi tugas nantinya ditujukan ke nomor pembuat tugas; pemberitahuan persetujuan dapat ditujukan ke PIC. Belum ada dispatch notifikasi, bot WhatsApp, atau tindakan approve lewat WhatsApp dalam implementasi ini.

## Nomor WhatsApp

Pendaftaran native mewajibkan nomor telepon format internasional atau format lokal Indonesia. `0812...`/`62812...` dinormalisasi menjadi `+62812...`, validasi yang sama di browser dan server. Disimpan pada identitas `users`, bukan organisasi. `whatsapp_verified_at` tetap NULL: format valid bukan bukti kepemilikan atau bahwa nomor terdaftar di WhatsApp. Nomor tidak ditampilkan pada direktori anggota. Akun lama tetap NULL, tanpa backfill atau kewajiban mengisi saat login. Penyuntingan nomor akun lama dan verifikasi/delivery WhatsApp masih terpisah dari pekerjaan ini.

## Schema dan verifikasi

Migration `016_tenant_members`: dua kolom WhatsApp nullable, versi membership, assignment divisi/agen, PIC divisi, undangan hash-only, audit keanggotaan, composite FK scope agen. Tidak mengubah data resource lama dan tidak berjalan otomatis saat startup.

- `npm run test:members`: offline unit/HTTP/regression.
- `npm run test:members:local`: target `virtual_office` loopback:3306, Laragon yang diverifikasi; fixture dalam transaksi + savepoint lalu rollback. Tidak membuat database lain, tidak mengirim WA/email, dan tidak memanggil provider berbayar. Memerlukan deklarasi non-production yang sama dengan tooling migration.
- `node scripts/apply-tenant-members-local.mjs --confirm-non-production`: operasi lokal eksplisit, hanya jika pending tepat 016. Memverifikasi schema/history, membuat backup, memeriksa fingerprint kolom lama, menerapkan migration, memvalidasi FK/index/kolom dan rerun kosong. Bukan perintah startup/deployment produksi.

Backup sebelum pemasangan lokal: `D:/VetendCode/database-backups/virtual-office-before-016-lwH9Vy/before-016.sql`, SHA-256 `5436d1a8544d5a8d068cbf8996d9936c0a82dfdfe547d884ebc645807325fa1d`. Restore backup belum direhearsal. Row data sebelum/sesudah pemasangan dan rollback fixture diverifikasi tetap sama; auto-increment counters dapat maju setelah pengujian rollback.
