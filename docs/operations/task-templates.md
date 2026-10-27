# Template tugas workspace

- Menu **Kelola → Template Tugas**, route `/dashboard/templates`.
- API `/api/task-templates`: session aktif + membership workspace server-side, tanpa shared-access fallback. Semua query memakai organization/workspace dari sesi; body/query tenant ditolak.
- Owner/admin: buat, edit, arsip. Member/viewer: baca saja. Platform admin bukan bypass akses customer.
- Maksimal 200 template aktif/workspace, 12 kolom input/template. Perubahan memakai versi optimistis; konflik 409 perlu memuat ulang dan membuka editor lagi.
- Template bawaan berasal dari definisi publik `shared/jobs.js`, hanya baca. Salin struktur tidak menyalin prompt privat atau seluruh aturan eksekusi; lengkapi instruksi sendiri. Input khusus pilihan/tanggal/referensi menjadi teks pada salinan custom.
- Arsip menyimpan row di `workspace_task_templates`, menghilangkan dari daftar aktif, tidak menghapus riwayat. Pemulihan arsip belum tersedia di UI.
- Pengelolaan metadata tidak memanggil provider atau membeli paket. Eksekusi melalui `/dashboard/jobs` atau tombol Buat tugas di panel agen kantor, memakai agen workspace, model aktif, gate langganan dan saldo. Snapshot instruksi/input/template disimpan pada job; hasil satu draft masuk Board untuk review/revisi. Total invoice/rekap bawaan tetap dihitung kode server, bukan AI. Tidak menjalankan aksi eksternal otomatis.

## Migration lokal eksplisit

014 hanya menambah tabel; tidak backfill, tidak seed customer, tidak mengubah tugas lama. Tidak berjalan otomatis saat startup.

`node scripts/apply-task-templates-local.mjs --confirm-non-production` memakai guard environment migration yang sudah ada. Script menolak target selain `virtual_office` loopback:3306 pada datadir Laragon yang diverifikasi, memeriksa checksums 001–013, membuat dump unik di `D:/VetendCode/database-backups/`, menerapkan hanya 014, memvalidasi schema dan fingerprint data lama, mengecek rerun kosong, lalu menguji CRUD/FK/isolasi dalam transaksi yang di-rollback. Tidak membuat database tambahan atau memanggil AI. Script ini sekali pakai untuk pemasangan, bukan perintah rutin startup; berhenti jika 014 sudah tercatat. Dump diverifikasi lengkap/hash, restore tidak direhearsal.

Offline: `node --test test/task-templates.test.js`, `npm run build`.

### Hasil pemasangan lokal 2026-10-26

014 diterapkan ke `virtual_office`; schema `valid: true`, differences kosong, checksum valid, rerun tidak menerapkan migration lagi, fingerprint seluruh tabel lama tidak berubah. CRUD/isolasi/versi/PK/FK/arsip diuji di MySQL dengan rollback penuh dan tanpa panggilan AI berbayar. Backup: `D:/VetendCode/database-backups/virtual-office-before-014-jcY9XW/before-014.sql` (83854 bytes, SHA-256 `70596e1bd8278d383dfb32c622fd382d1ba9d0ff41e6270b1a102ca723b14862`). Restore belum diuji.
