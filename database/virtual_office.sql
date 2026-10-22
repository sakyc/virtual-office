-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Host: 127.0.0.1
-- Generation Time: Oct 20, 2026 at 01:54 PM
-- Server version: 10.4.32-MariaDB
-- PHP Version: 8.2.12

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Database: `virtual_office`
--

-- --------------------------------------------------------

--
-- Table structure for table `clients`
--

CREATE TABLE `clients` (
  `id` int(10) UNSIGNED NOT NULL,
  `name` varchar(150) NOT NULL,
  `brief` text DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `clients`
--

INSERT INTO `clients` (`id`, `name`, `brief`, `created_at`) VALUES
(1, 'lelangpet', 'aplikasi komunitas pecinta hewan, didalam aplikasi terdapat fitur : lelang, forum komunikasi dan shop', '2026-10-19 00:33:11');

-- --------------------------------------------------------

--
-- Table structure for table `items`
--

CREATE TABLE `items` (
  `id` int(10) UNSIGNED NOT NULL,
  `job_id` int(10) UNSIGNED NOT NULL,
  `parent_id` int(10) UNSIGNED DEFAULT NULL,
  `client_id` int(10) UNSIGNED DEFAULT NULL,
  `agent_id` varchar(30) NOT NULL,
  `type` varchar(30) NOT NULL,
  `title` varchar(255) NOT NULL,
  `tag` varchar(120) DEFAULT NULL,
  `content` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL CHECK (json_valid(`content`)),
  `status` enum('draft','revising','approved','rejected') NOT NULL DEFAULT 'draft',
  `version` int(10) UNSIGNED NOT NULL DEFAULT 1,
  `reject_reason` varchar(500) DEFAULT NULL,
  `last_error` varchar(255) DEFAULT NULL,
  `approved_at` datetime DEFAULT NULL,
  `deleted_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `items`
--

INSERT INTO `items` (`id`, `job_id`, `parent_id`, `client_id`, `agent_id`, `type`, `title`, `tag`, `content`, `status`, `version`, `reject_reason`, `last_error`, `approved_at`, `deleted_at`, `created_at`, `updated_at`) VALUES
(1, 1, NULL, 1, 'raka', 'idea', 'Ide 1 – Kenalan sama lelangpet', 'November 2026 / Instagram, Facebook, TikTok', '{\"fields\":[{\"label\":\"Platform\",\"kind\":\"text\",\"value\":\"Instagram\"},{\"label\":\"Pilar\",\"kind\":\"text\",\"value\":\"Memperkenalkan aplikasi – overview 3 fitur\"},{\"label\":\"Format\",\"kind\":\"text\",\"value\":\"Carousel 6 slide\"},{\"label\":\"Usulan tanggal\",\"kind\":\"text\",\"value\":\"Senin, 2 November 2026\"},{\"label\":\"Hook\",\"kind\":\"text\",\"value\":\"Lelang, ngobrol, belanja kebutuhan hewan: semuanya ada di satu aplikasi.\"},{\"label\":\"Ringkasan\",\"kind\":\"text\",\"value\":\"Slide 1 hook, slide 2-4 satu fitur per slide (lelang, forum diskusi, shop), slide 5 manfaat untuk pecinta hewan, slide 6 CTA. Visual konsisten dengan brand lelangpet, pakai screenshot asli aplikasi.\"},{\"label\":\"CTA\",\"kind\":\"text\",\"value\":\"Unduh lelangpet sekarang, link di bio.\"},{\"label\":\"Catatan asumsi\",\"kind\":\"text\",\"value\":\"Asumsi: link unduh sudah tersedia dan brand voice hangat-santai khas komunitas. Detail fitur \'aman\' (mis. mekanisme pembayaran/verifikasi) tidak saya tulis spesifik karena belum ada datanya. Mohon konfirmasi ke klien lewat Rizky Ramadhan sebelum produksi. Hanya satu momen yang disebut, yaitu 11.11 di ide 5, tanpa klaim promo.\"}]}', 'approved', 1, NULL, NULL, '2026-10-19 00:37:54', NULL, '2026-10-19 00:36:52', '2026-10-19 00:37:54'),
(2, 1, NULL, 1, 'raka', 'idea', 'Ide 2 – POV grup chat berantakan (revisi v2)', 'November 2026 / Instagram, Facebook, TikTok', '{\"fields\":[{\"label\":\"Platform\",\"kind\":\"text\",\"value\":\"TikTok\"},{\"label\":\"Pilar\",\"kind\":\"text\",\"value\":\"Memperkenalkan aplikasi – fitur forum diskusi. Metrik sukses (tanpa angka target dulu, karena baseline akun belum saya punya): utama = klik link bio dan install/pendaftaran dari konten ini; pendukung = retention 3 detik pertama, completion rate, share, save, komentar. Angka target ditentukan setelah cek performa konten lama akun bersama Kirana Dewanti (Reporting Analyst).\"},{\"label\":\"Format\",\"kind\":\"text\",\"value\":\"Video skit POV 15-25 detik, vertikal 9:16, 1 karakter utama + 1 kucing (kalau tidak ada kucing, boleh boneka/foto).\"},{\"label\":\"Usulan tanggal\",\"kind\":\"text\",\"value\":\"Rabu, 4 November 2026 (cek dulu bentrok dengan kalender klien).\"},{\"label\":\"Hook\",\"kind\":\"text\",\"value\":\"Visual detik 0-3: close-up layar HP dari atas bahu karakter (Dina) yang menggulir grup chat buatan sendiri. Pertanyaannya \'Tips grooming bulu kucing biar nggak rontok?\' tertimpa notifikasi dan stiker bertubi-tubi sampai hilang dari layar. Teks di layar: \'POV: nanya tips merawat kucing di grup chat, tapi jawabannya tenggelam sama stiker.\' Kucing di sebelahnya ikut menatap layar.\"},{\"label\":\"Ringkasan\",\"kind\":\"text\",\"value\":\"Karakter: Dina, pemilik kucing yang lagi butuh jawaban. Semua tampilan chat dan stiker dibuat sendiri oleh tim (mockup), bukan tangkapan grup asli atau stiker berhak cipta.\\n\\nAdegan:\\n1) 0-3 dtk – Hook visual di atas.\\n2) 3-9 dtk – Dina scroll cepat. Isi grup tidak nyambung: \'Ada yang jual kandang?\', stiker \'Selamat pagi\', stiker \'Mantap\'. Satu jawaban yang tampaknya berguna muncul, tapi langsung tertimpa stiker besar sehingga hanya terbaca separuh. Punchline: Dina menatap kamera pasrah, kucing ikut menghela napas (SFX).\\n3) 9-12 dtk – Jeda \'lega\': Dina menaruh HP, tarik napas, lalu membuka lelangpet. Teks: \'Pindah ke tempat yang lebih rapi.\' Beri jeda hening 1 detik supaya transisi tidak terasa seperti iklan mendadak.\\n4) 12-20 dtk – Screen recording forum dengan contoh dummy yang dibuat tim: topik \'Tips grooming bulu kucing\' dengan 2-3 jawaban berurutan berisi tips umum (hindari saran medis). Gunakan zoom dan highlight pada judul topik dan jawaban, teks: \'Topik rapi, jawaban gampang dicari.\' Link bio muncul sebagai teks kecil mulai detik 12.\\n5) 20-25 dtk – Dina mengetik pertanyaan di forum, kucing tampak puas/duduk manis. Tutup dengan logo lelangpet dan CTA.\\n\\nAsumsi: tampilan forum yang direkam sesuai versi aplikasi terbaru; fitur yang ditonjolkan hanya yang sudah ada (topik rapi, jawaban mudah dicari). Musik pakai library TikTok yang aman untuk akun bisnis. Mohon klien/tim produk cek screen recording sebelum tayang.\"},{\"label\":\"CTA\",\"kind\":\"text\",\"value\":\"Lisan/teks akhir: \'Gabung forum lelangpet, tanya apa aja soal hewan kesayanganmu. Link di bio!\' Tambahkan komentar tersemat: \'Download lelangpet lewat link di bio.\' Asumsi: link bio mengarah ke halaman download aplikasi; cek link dan store yang tersedia (Play Store/App Store) sebelum tayang.\"}]}', 'draft', 2, NULL, NULL, NULL, NULL, '2026-10-19 00:36:52', '2026-10-19 00:45:51'),
(3, 1, NULL, 1, 'raka', 'idea', 'Ide 3 – Cara ikut lelang', 'November 2026 / Instagram, Facebook, TikTok', '{\"fields\":[{\"label\":\"Platform\",\"kind\":\"text\",\"value\":\"Instagram\"},{\"label\":\"Pilar\",\"kind\":\"text\",\"value\":\"Memperkenalkan aplikasi – fitur lelang\"},{\"label\":\"Format\",\"kind\":\"text\",\"value\":\"Reel 20-30 detik (screen recording + teks)\"},{\"label\":\"Usulan tanggal\",\"kind\":\"text\",\"value\":\"Jumat, 6 November 2026\"},{\"label\":\"Hook\",\"kind\":\"text\",\"value\":\"Penasaran gimana cara lelang hewan di aplikasi? Ternyata gampang.\"},{\"label\":\"Ringkasan\",\"kind\":\"text\",\"value\":\"Tunjukkan alur ikut lelang dari buka aplikasi sampai pasang tawaran, dalam 3-4 langkah berteks besar. Langkah harus disesuaikan dengan alur asli aplikasi, jadi minta screen recording dari tim klien.\"},{\"label\":\"CTA\",\"kind\":\"text\",\"value\":\"Simpan reel ini dan coba lelang pertamamu di lelangpet.\"}]}', 'draft', 1, NULL, NULL, NULL, NULL, '2026-10-19 00:36:52', '2026-10-19 00:36:52'),
(4, 1, NULL, 1, 'raka', 'idea', 'Ide 4 – Checklist jual beli hewan online', 'November 2026 / Instagram, Facebook, TikTok', '{\"fields\":[{\"label\":\"Platform\",\"kind\":\"text\",\"value\":\"Facebook\"},{\"label\":\"Pilar\",\"kind\":\"text\",\"value\":\"Memperkenalkan aplikasi – edukasi jual beli aman\"},{\"label\":\"Format\",\"kind\":\"text\",\"value\":\"Foto infografis + caption panjang\"},{\"label\":\"Usulan tanggal\",\"kind\":\"text\",\"value\":\"Senin, 9 November 2026\"},{\"label\":\"Hook\",\"kind\":\"text\",\"value\":\"Mau beli hewan online? Cek 5 hal ini dulu biar nggak nyesel.\"},{\"label\":\"Ringkasan\",\"kind\":\"text\",\"value\":\"Infografis berisi checklist umum sebelum transaksi, seperti cek profil penjual, minta foto/video terbaru, dan tanyakan riwayat perawatan hewan. Di akhir, kaitkan dengan komitmen lelangpet untuk jual beli yang lebih aman. Jangan menyebut fitur keamanan spesifik sebelum dikonfirmasi klien.\"},{\"label\":\"CTA\",\"kind\":\"text\",\"value\":\"Bagikan ke temanmu yang lagi cari hewan baru, lalu kenali lelangpet.\"}]}', 'draft', 1, NULL, NULL, NULL, NULL, '2026-10-19 00:36:52', '2026-10-19 00:36:52'),
(5, 1, NULL, 1, 'raka', 'idea', 'Ide 5 – Belanja kebutuhan hewan di Shop', 'November 2026 / Instagram, Facebook, TikTok', '{\"fields\":[{\"label\":\"Platform\",\"kind\":\"text\",\"value\":\"TikTok\"},{\"label\":\"Pilar\",\"kind\":\"text\",\"value\":\"Memperkenalkan aplikasi – fitur shop\"},{\"label\":\"Format\",\"kind\":\"text\",\"value\":\"Video \'haul\' / unboxing 20-30 detik\"},{\"label\":\"Usulan tanggal\",\"kind\":\"text\",\"value\":\"Rabu, 11 November 2026 (momen belanja online 11.11)\"},{\"label\":\"Hook\",\"kind\":\"text\",\"value\":\"Lagi ramai belanja 11.11, kebutuhan hewan kesayanganmu udah masuk keranjang belum?\"},{\"label\":\"Ringkasan\",\"kind\":\"text\",\"value\":\"Video unboxing kebutuhan hewan (makanan, mainan, aksesori) yang dibeli lewat Shop lelangpet, dengan cuplikan layar proses belanja. Tidak menyebut diskon atau promo kecuali sudah dikonfirmasi klien.\"},{\"label\":\"CTA\",\"kind\":\"text\",\"value\":\"Cek Shop di lelangpet, lengkapi kebutuhan hewanmu.\"}]}', 'draft', 1, NULL, NULL, NULL, NULL, '2026-10-19 00:36:52', '2026-10-19 00:36:52'),
(6, 1, NULL, 1, 'raka', 'idea', 'Ide 6 – 5 topik seru di forum', 'November 2026 / Instagram, Facebook, TikTok', '{\"fields\":[{\"label\":\"Platform\",\"kind\":\"text\",\"value\":\"Instagram\"},{\"label\":\"Pilar\",\"kind\":\"text\",\"value\":\"Memperkenalkan aplikasi – komunitas & forum\"},{\"label\":\"Format\",\"kind\":\"text\",\"value\":\"Carousel 5-7 slide\"},{\"label\":\"Usulan tanggal\",\"kind\":\"text\",\"value\":\"Jumat, 13 November 2026\"},{\"label\":\"Hook\",\"kind\":\"text\",\"value\":\"5 pertanyaan yang sering muncul di komunitas pecinta hewan.\"},{\"label\":\"Ringkasan\",\"kind\":\"text\",\"value\":\"Tiap slide menampilkan satu contoh topik diskusi, misalnya memilih makanan, kebiasaan lucu hewan, atau tips perawatan dasar. Tambahkan catatan bahwa diskusi bersifat berbagi pengalaman, bukan pengganti saran dokter hewan.\"},{\"label\":\"CTA\",\"kind\":\"text\",\"value\":\"Punya pertanyaan lain? Tanyakan langsung di forum lelangpet.\"}]}', 'draft', 1, NULL, NULL, NULL, NULL, '2026-10-19 00:36:52', '2026-10-19 00:36:52'),
(7, 1, NULL, 1, 'raka', 'idea', 'Ide 7 – Polling hewan peliharaan', 'November 2026 / Instagram, Facebook, TikTok', '{\"fields\":[{\"label\":\"Platform\",\"kind\":\"text\",\"value\":\"Facebook\"},{\"label\":\"Pilar\",\"kind\":\"text\",\"value\":\"Memperkenalkan aplikasi – engagement komunitas\"},{\"label\":\"Format\",\"kind\":\"text\",\"value\":\"Foto polling + pertanyaan di caption\"},{\"label\":\"Usulan tanggal\",\"kind\":\"text\",\"value\":\"Senin, 16 November 2026\"},{\"label\":\"Hook\",\"kind\":\"text\",\"value\":\"Tim kucing atau tim anjing? Atau punya yang lain?\"},{\"label\":\"Ringkasan\",\"kind\":\"text\",\"value\":\"Gambar sederhana dengan pilihan jenis hewan, lalu ajak audiens menjawab dan menceritakan hewan mereka di kolom komentar. Tutup dengan perkenalan singkat bahwa lelangpet adalah rumah bagi semua pecinta hewan.\"},{\"label\":\"CTA\",\"kind\":\"text\",\"value\":\"Jawab di komentar, lalu gabung komunitasnya di lelangpet.\"}]}', 'draft', 1, NULL, NULL, NULL, NULL, '2026-10-19 00:36:52', '2026-10-19 00:36:52'),
(8, 1, NULL, 1, 'raka', 'idea', 'Ide 8 – 3 langkah pertama setelah unduh', 'November 2026 / Instagram, Facebook, TikTok', '{\"fields\":[{\"label\":\"Platform\",\"kind\":\"text\",\"value\":\"TikTok\"},{\"label\":\"Pilar\",\"kind\":\"text\",\"value\":\"Memperkenalkan aplikasi – onboarding\"},{\"label\":\"Format\",\"kind\":\"text\",\"value\":\"Video tutorial cepat 20-30 detik\"},{\"label\":\"Usulan tanggal\",\"kind\":\"text\",\"value\":\"Rabu, 18 November 2026\"},{\"label\":\"Hook\",\"kind\":\"text\",\"value\":\"Baru download lelangpet? Lakukan 3 hal ini dulu.\"},{\"label\":\"Ringkasan\",\"kind\":\"text\",\"value\":\"Walkthrough singkat: buat akun, jelajahi forum, lalu lihat lelang dan shop. Urutan langkah disesuaikan dengan alur onboarding asli di aplikasi.\"},{\"label\":\"CTA\",\"kind\":\"text\",\"value\":\"Follow untuk tips lelangpet lainnya.\"}]}', 'draft', 1, NULL, NULL, NULL, NULL, '2026-10-19 00:36:52', '2026-10-19 00:36:52'),
(9, 1, NULL, 1, 'raka', 'idea', 'Ide 9 – Tipe pecinta hewan kamu yang mana?', 'November 2026 / Instagram, Facebook, TikTok', '{\"fields\":[{\"label\":\"Platform\",\"kind\":\"text\",\"value\":\"Instagram\"},{\"label\":\"Pilar\",\"kind\":\"text\",\"value\":\"Memperkenalkan aplikasi – relatable content\"},{\"label\":\"Format\",\"kind\":\"text\",\"value\":\"Reel meme / teks overlay 10-15 detik\"},{\"label\":\"Usulan tanggal\",\"kind\":\"text\",\"value\":\"Jumat, 20 November 2026\"},{\"label\":\"Hook\",\"kind\":\"text\",\"value\":\"Tipe pecinta hewan: yang galeri HP-nya isinya cuma foto peliharaan.\"},{\"label\":\"Ringkasan\",\"kind\":\"text\",\"value\":\"Reel ringan berisi 3-4 tipe pecinta hewan yang relatable, misalnya si kolektor mainan, si paling rajin cari tips, dan si hobi lelang. Tiap tipe dikaitkan ke satu fitur lelangpet.\"},{\"label\":\"CTA\",\"kind\":\"text\",\"value\":\"Tag temanmu yang begini, lalu ajak mereka gabung di lelangpet.\"}]}', 'draft', 1, NULL, NULL, NULL, NULL, '2026-10-19 00:36:52', '2026-10-19 00:36:52'),
(10, 1, NULL, 1, 'raka', 'idea', 'Ide 10 – FAQ lelangpet', 'November 2026 / Instagram, Facebook, TikTok', '{\"fields\":[{\"label\":\"Platform\",\"kind\":\"text\",\"value\":\"Facebook\"},{\"label\":\"Pilar\",\"kind\":\"text\",\"value\":\"Memperkenalkan aplikasi – menjawab pertanyaan umum\"},{\"label\":\"Format\",\"kind\":\"text\",\"value\":\"Carousel FAQ 5 slide\"},{\"label\":\"Usulan tanggal\",\"kind\":\"text\",\"value\":\"Senin, 23 November 2026\"},{\"label\":\"Hook\",\"kind\":\"text\",\"value\":\"Pertanyaan yang paling sering ditanyakan soal lelangpet, kami jawab.\"},{\"label\":\"Ringkasan\",\"kind\":\"text\",\"value\":\"Kumpulkan 4-5 pertanyaan calon pengguna, misalnya cara daftar, cara ikut lelang, dan cara belanja di shop. Jawaban harus diverifikasi klien dulu supaya akurat dan tidak mengarang.\"},{\"label\":\"CTA\",\"kind\":\"text\",\"value\":\"Masih ada pertanyaan? Tulis di komentar.\"}]}', 'draft', 1, NULL, NULL, NULL, NULL, '2026-10-19 00:36:52', '2026-10-19 00:36:52'),
(11, 1, NULL, 1, 'raka', 'idea', 'Ide 11 – Red flag penjual hewan online', 'November 2026 / Instagram, Facebook, TikTok', '{\"fields\":[{\"label\":\"Platform\",\"kind\":\"text\",\"value\":\"TikTok\"},{\"label\":\"Pilar\",\"kind\":\"text\",\"value\":\"Memperkenalkan aplikasi – edukasi jual beli aman\"},{\"label\":\"Format\",\"kind\":\"text\",\"value\":\"Video edukasi bergaya talking head 25-35 detik\"},{\"label\":\"Usulan tanggal\",\"kind\":\"text\",\"value\":\"Kamis, 26 November 2026\"},{\"label\":\"Hook\",\"kind\":\"text\",\"value\":\"3 red flag penjual hewan online yang wajib kamu waspadai.\"},{\"label\":\"Ringkasan\",\"kind\":\"text\",\"value\":\"Bahas tanda-tanda umum yang patut dicurigai, seperti menolak video call, harga terlalu murah, dan memaksa transfer cepat. Tutup dengan pesan bahwa jual beli lebih tenang jika dilakukan lewat platform yang jelas seperti lelangpet. Jangan menjanjikan jaminan tertentu tanpa konfirmasi klien.\"},{\"label\":\"CTA\",\"kind\":\"text\",\"value\":\"Simpan video ini dan lihat lelang di lelangpet.\"}]}', 'draft', 1, NULL, NULL, NULL, NULL, '2026-10-19 00:36:52', '2026-10-19 00:36:52'),
(12, 1, NULL, 1, 'raka', 'idea', 'Ide 12 – Ajakan gabung komunitas', 'November 2026 / Instagram, Facebook, TikTok', '{\"fields\":[{\"label\":\"Platform\",\"kind\":\"text\",\"value\":\"Instagram\"},{\"label\":\"Pilar\",\"kind\":\"text\",\"value\":\"Memperkenalkan aplikasi – rangkuman & ajakan komunitas\"},{\"label\":\"Format\",\"kind\":\"text\",\"value\":\"Reel montase 20-30 detik\"},{\"label\":\"Usulan tanggal\",\"kind\":\"text\",\"value\":\"Minggu, 29 November 2026\"},{\"label\":\"Hook\",\"kind\":\"text\",\"value\":\"Satu bulan kenalan sama lelangpet. Ini yang bisa kamu lakukan di dalamnya.\"},{\"label\":\"Ringkasan\",\"kind\":\"text\",\"value\":\"Montase cuplikan lelang, forum, dan shop dari konten bulan ini, dengan musik santai dan teks rangkuman. Tutup dengan ajakan bergabung ke komunitas pecinta hewan.\"},{\"label\":\"CTA\",\"kind\":\"text\",\"value\":\"Unduh lelangpet dan gabung komunitasnya, link di bio.\"}]}', 'draft', 1, NULL, NULL, NULL, NULL, '2026-10-19 00:36:52', '2026-10-19 00:36:52'),
(13, 2, 1, 1, 'nadia', 'caption', 'Caption Instagram Carousel - Kenalan sama Lelangpet (3 Variasi)', 'Instagram', '{\"fields\":[{\"label\":\"Variasi 1\",\"kind\":\"text\",\"value\":\"Mencari tempat terpercaya untuk lelang hewan kesayangan, berbagi tips perawatan, atau berbelanja kebutuhan mereka? Semua ada di satu aplikasi!\\n\\nLelangpet menghadirkan 3 fitur utama untuk komunitas pecinta hewan:\\n🐾 Lelang – Temukan hewan impian dengan sistem terpercaya\\n💬 Forum Diskusi – Berbagi pengalaman dan tips dengan sesama pecinta hewan\\n🛍️ Shop – Belanja kebutuhan hewan dari penjual terverifikasi\\n\\nJangan lewatkan kesempatan untuk menjadi bagian dari komunitas yang saling mendukung. Unduh Lelangpet sekarang, link di bio!\"},{\"label\":\"Variasi 2\",\"kind\":\"text\",\"value\":\"Platform all-in-one untuk pecinta hewan kini hadir!\\n\\nLelang, ngobrol, belanja kebutuhan hewan: semuanya bisa kamu lakukan di satu aplikasi yang aman dan terpercaya.\\n\\nDengan Lelangpet, kamu bisa:\\n✨ Ikut lelang hewan berkualitas dengan verifikasi ketat\\n✨ Bergabung dengan forum komunitas untuk berbagi ilmu\\n✨ Berbelanja produk kebutuhan hewan dari seller terpilih\\n\\nWujudkan petualangan dengan hewan peliharaan kamu secara lebih mudah dan aman. Download Lelangpet hari ini, link di bio!\"},{\"label\":\"Variasi 3\",\"kind\":\"text\",\"value\":\"Bagi para pecinta hewan sejati, Lelangpet adalah solusi yang lama ditunggu-tunggu.\\n\\nTiga fitur unggulan dirancang khusus untuk memenuhi kebutuhan komunitas:\\n🏆 Lelang – Akses ke berbagai pilihan hewan dengan sistem verifikasi\\n👥 Forum Komunikasi – Ruang diskusi yang aktif dengan sesama pecinta hewan\\n🏪 Shop – Belanja perlengkapan hewan dari vendor terpercaya\\n\\nBersama Lelangpet, pengalaman menjadi pecinta hewan jadi lebih bermakna dan menyenangkan. Unduh aplikasinya sekarang, link ada di bio!\"},{\"label\":\"Hashtag\",\"kind\":\"list\",\"value\":[\"#Lelangpet\",\"#KomunitasHewan\",\"#PecintaHewan\",\"#AplikasiHewan\",\"#LelangHewan\",\"#ForumHewan\",\"#ShopHewan\",\"#TerpercayaDanAman\",\"#CommunityPower\",\"#AllInOneApp\"]}]}', 'approved', 1, NULL, NULL, '2026-10-19 00:39:43', NULL, '2026-10-19 00:39:14', '2026-10-19 00:39:43'),
(14, 3, 1, 1, 'eko', 'video_script', 'Video Script TikTok 30 Detik - Lelangpet (Storytelling)', '30 detik / TikTok', '{\"fields\":[{\"label\":\"Hook (3 detik pertama)\",\"kind\":\"text\",\"value\":\"Detik: 0-3\\nVisual: Close-up wajah seseorang dengan ekspresi bingung, background blur (ruang tamu modern)\\nTeks layar: \\\"Pengen laku hewan kesayangan?\\\"\\nNarasi: \\\"Halo pecinta hewan! Pernah merasa bingung gimana menjual atau membeli hewan kesayangan dengan aman?\\\"\"},{\"label\":\"Scene 1 - Fitur Lelang\",\"kind\":\"text\",\"value\":\"Detik: 3-9\\nVisual: Transisi cepat ke smartphone, scroll aplikasi lelangpet section lelang dengan thumbnail hewan, animasi smoothing atau tapping tombol\\nTeks layar: \\\"Lelang hewan dengan aman\\\"\\nNarasi: \\\"Di lelangpet, ada fitur lelang. Kamu bisa jual atau beli hewan favorit dengan sistem yang terverifikasi.\\\"\"},{\"label\":\"Scene 2 - Fitur Forum\",\"kind\":\"text\",\"value\":\"Detik: 9-15\\nVisual: Smartphone menampilkan forum diskusi dengan chat bubbles, multiple messages scrolling, emojis, & avatars pengguna\\nTeks layar: \\\"Ngobrol sama pet lovers lain\\\"\\nNarasi: \\\"Plus, ada forum komunitas tempat kamu bisa ngobrol, tanya-jawab, atau berbagi tips perawatan hewan dengan ribuan pecinta hewan lainnya.\\\"\"},{\"label\":\"Scene 3 - Fitur Shop\",\"kind\":\"text\",\"value\":\"Detik: 15-21\\nVisual: Smartphone menampilkan section shop dengan grid produk (makanan hewan, mainan, aksesoris), smooth swipe transisi antar kategori\\nTeks layar: \\\"Belanja kebutuhan hewan di satu tempat\\\"\\nNarasi: \\\"Terus ada shop untuk semua kebutuhan hewan kamu. Makanan, mainan, atau perlengkapan lainnya—semuanya ada dan mudah ditemukan.\\\"\"},{\"label\":\"Scene 4 - Manfaat & CTA\",\"kind\":\"text\",\"value\":\"Detik: 21-30\\nVisual: Split screen atau montase 3 screenshot fitur (lelang, forum, shop) bergerak dinamis, lalu zoom out ke phone utuh yang dipegang tangan pemeran pertama dengan senyuman lebar\\nTeks layar: \\\"Lelang. Ngobrol. Belanja.\\\" (baris 1) \\\"Semuanya satu aplikasi!\\\" (baris 2)\\nNarasi: \\\"Jadi, tidak perlu lagi repot cari di sana-sini. Lelang, ngobrol, belanja—semuanya ada di lelangpet. Download sekarang, link di bio. Jangan kehabisan!\\\"\"},{\"label\":\"Catatan produksi\",\"kind\":\"text\",\"value\":\"Properti: Smartphone (dengan mock-up UI lelangpet real atau screenshot asli), optional: props hewan kecil (boneka) di scene tertentu untuk visual interest.\\nLokasi: Indoor sederhana (ruang keluarga atau setup studio minimal); fokus utama pada smartphone screen.\\nMusik: Background musik upbeat, energik, tropical atau pop modern (tempo ~120-130 BPM); sound effect kecil pada transisi slide/tap aplikasi untuk tambah dinamis.\\nTone: Santai, ramah, relatable—berbicara langsung ke viewers sebagai pecinta hewan.\\nAsumsi: Menggunakan screenshot asli aplikasi lelangpet atau mockup UI yang sudah disetujui klien. Jika UI/screenshot belum final, koordinasi dengan Rizky Ramadhan sebelum produksi dimulai. Panjang narasi disesuaikan agar natural saat dibaca dengan kecepatan normal.\"}]}', 'approved', 1, NULL, NULL, '2026-10-19 00:41:11', NULL, '2026-10-19 00:40:27', '2026-10-19 00:41:11'),
(15, 4, NULL, 1, 'dewi', 'review', 'Review Ide 2 – POV grup chat berantakan (TikTok, Rabu 4 Nov 2026)', NULL, '{\"fields\":[{\"label\":\"Yang sudah bagus\",\"kind\":\"list\",\"value\":[\"Hook relatable dan spesifik: \'jawaban tenggelam sama stiker\' gampang dibayangkan siapa pun yang pernah ada di grup chat hobi hewan.\",\"Format POV skit cocok untuk TikTok dan durasi 15-25 detik realistis untuk produksi cepat.\",\"Struktur masalah → solusi → tampilan layar jelas, jadi fitur forum langsung terlihat fungsinya (topik rapi, jawaban mudah dicari).\",\"Fokus ke satu fitur (forum), tidak mencoba menjelaskan semua fitur sekaligus.\",\"Tanggal Rabu 4 Nov 2026 masuk akal untuk hari kerja; tidak ada bentrok yang saya tahu (cek dulu dengan kalender klien).\"]},{\"label\":\"Yang lemah\",\"kind\":\"list\",\"value\":[\"Hook baru berupa teks, belum ada detail visual untuk 3 detik pertama. Di TikTok, ini yang menentukan orang lanjut nonton atau tidak.\",\"Ringkasan masih umum: belum jelas siapa karakternya, adegan per adegan, dan momen \'lucunya\' (punchline) apa.\",\"Pergantian ke aplikasi terkesan iklan kalau transisinya mendadak. Penonton perlu merasakan \'lega\' dulu sebelum solusi muncul.\",\"Penutup \'tampilan layar forum\' berisiko statis dan membosankan jika hanya screen recording biasa tanpa contoh pertanyaan dan jawaban yang menarik.\",\"CTA terlalu umum dan hanya ada di akhir. Belum jelas arah aksinya: download dari mana, atau cari di mana (link bio?).\",\"Belum ada kejelasan soal keamanan konten: tampilan chat/stiker sebaiknya buatan sendiri, bukan tangkapan grup asli atau stiker berhak cipta.\",\"Pilar \'memperkenalkan aplikasi\' tidak punya metrik sukses yang jelas (view, save, klik link bio, install?).\"]},{\"label\":\"Perbaikan konkret\",\"kind\":\"list\",\"value\":[\"Tulis ulang 3 detik pertama secara visual: close-up HP, notifikasi grup chat \'ting-ting\' beruntun, stiker dan voice note memenuhi layar, sementara karakter mengetik pertanyaan soal kucing. Teks overlay: \'POV: nanya tips kucing di grup chat\'.\",\"Susun skenario kasar per detik. Contoh: 0-3 dtk hook; 3-8 dtk jawaban tenggelam stiker, karakter scroll panik; 8-12 dtk karakter menyerah, buka lelangpet; 12-20 dtk tampilan forum rapi (topik per kategori, jawaban jelas), ekspresi lega; 20-25 dtk CTA.\",\"Tambahkan punchline: misalnya jawaban yang akhirnya ditemukan di grup chat ternyata cuma stiker kucing joget, atau scroll sampai 200 pesan belum ketemu.\",\"Untuk adegan layar forum, siapkan contoh thread nyata atau dummy yang rapi dengan pertanyaan seperti \'Kucing mogok makan, kenapa ya?\' dan 1-2 jawaban singkat. Beri zoom/highlight pada kolom topik dan jawaban agar tidak statis.\",\"Jangan menampilkan saran perawatan medis yang spesifik di thread contoh kecuali sudah dicek tim klien. Pakai pertanyaan umum yang aman.\",\"Perjelas CTA dan tampilkan juga sebagai teks di layar: \'Tanya apa aja soal hewan kesayanganmu di forum lelangpet\' + arahan ke link bio atau app store (konfirmasi dengan klien link yang dipakai).\",\"Pakai stiker dan tampilan chat buatan sendiri (mock-up), dan hindari nama grup atau kontak asli.\",\"Tentukan target metrik bersama klien, misalnya jumlah save/share dan klik link bio, dan cek apakah ada fitur app yang belum siap dipromosikan.\",\"Caption TikTok: 1-2 kalimat santai + 3-5 hashtag relevan. Minta Nadia Safitri membuat opsinya, dan Eko Saputra untuk shot list/naskah detail.\"]},{\"label\":\"Keseimbangan pilar dan format\",\"kind\":\"text\",\"value\":\"Hanya satu ide yang dikirim, jadi keseimbangan seluruh kalender belum bisa saya nilai. Ide ini ada di pilar \'memperkenalkan aplikasi\' dengan format skit video, dan itu cocok untuk TikTok. Pastikan postingan di sekitarnya tidak semuanya skit dan tidak semuanya soal fitur. Selingi dengan pilar lain, misalnya edukasi hewan, cerita komunitas, atau fitur lelang dan shop. Variasikan juga format, misalnya carousel, behind-the-scenes, atau UGC. Kirim ide lain atau kalender lengkapnya, dan saya bisa cek distribusinya.\"}]}', 'approved', 1, NULL, NULL, '2026-10-19 00:44:56', NULL, '2026-10-19 00:43:47', '2026-10-19 00:44:56');

-- --------------------------------------------------------

--
-- Table structure for table `jobs`
--

CREATE TABLE `jobs` (
  `id` int(10) UNSIGNED NOT NULL,
  `agent_id` varchar(30) NOT NULL,
  `job_type` varchar(50) NOT NULL,
  `client_id` int(10) UNSIGNED DEFAULT NULL,
  `parent_item_id` int(10) UNSIGNED DEFAULT NULL,
  `params` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL CHECK (json_valid(`params`)),
  `status` enum('generating','done','failed') NOT NULL DEFAULT 'generating',
  `error` varchar(255) DEFAULT NULL,
  `model` varchar(80) DEFAULT NULL,
  `tokens_in` int(10) UNSIGNED DEFAULT NULL,
  `tokens_out` int(10) UNSIGNED DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `finished_at` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `jobs`
--

INSERT INTO `jobs` (`id`, `agent_id`, `job_type`, `client_id`, `parent_item_id`, `params`, `status`, `error`, `model`, `tokens_in`, `tokens_out`, `created_at`, `finished_at`) VALUES
(1, 'raka', 'content_planner', 1, NULL, '{\"bulan\":\"2026-11\",\"jumlah\":12,\"platform\":[\"Instagram\",\"Facebook\",\"TikTok\"],\"pilar\":\"memperkenalkan aplikasi lelangpet\",\"catatan\":\"aplikasi untuk pecinta hewan peliharaan, dengan fitur forum diskusi, bisa lelang atau jual beli hewan dengan aman, bisa membeli kebutuhan hewan\"}', 'done', NULL, 'claude-sonnet-5-5', 5288, 10268, '2026-10-19 00:36:00', '2026-10-19 00:36:52'),
(2, 'nadia', 'caption', 1, 1, '{\"ide\":1,\"topik\":\"\",\"tone\":\"Profesional\",\"jumlah\":3,\"platform\":\"Instagram\"}', 'done', NULL, 'claude-haiku-4-5-20251001', 1995, 768, '2026-10-19 00:39:06', '2026-10-19 00:39:14'),
(3, 'eko', 'video_script', 1, 1, '{\"ide\":1,\"topik\":\"\",\"durasi\":\"30 detik\",\"platform\":\"TikTok\",\"gaya\":\"Storytelling\"}', 'done', NULL, 'claude-haiku-4-5-20251001', 2119, 1078, '2026-10-19 00:40:15', '2026-10-19 00:40:27'),
(4, 'dewi', 'calendar_review', 1, NULL, '{\"teks\":\"Ide 2 – POV grup chat berantakan\\n\\nPlatform\\nTikTok\\n\\nPilar\\nMemperkenalkan aplikasi – fitur forum diskusi\\n\\nFormat\\nVideo skit 15-25 detik\\n\\nUsulan tanggal\\nRabu, 4 November 2026\\n\\nHook\\nPOV: nanya tips merawat kucing di grup chat, tapi jawabannya tenggelam sama stiker.\\n\\nRingkasan\\nSkit singkat orang bingung mencari jawaban di grup chat yang ramai, lalu pindah ke forum lelangpet yang topiknya rapi dan jawabannya mudah dicari. Tutup dengan tampilan layar forum.\\n\\nCTA\\nGabung forum lelangpet, tanya apa aja soal hewan kesayanganmu.\",\"catatan\":\"\"}', 'done', NULL, 'claude-sonnet-5-5', 2525, 1952, '2026-10-19 00:43:31', '2026-10-19 00:43:47');

-- --------------------------------------------------------

--
-- Table structure for table `revisions`
--

CREATE TABLE `revisions` (
  `id` int(10) UNSIGNED NOT NULL,
  `item_id` int(10) UNSIGNED NOT NULL,
  `version` int(10) UNSIGNED NOT NULL,
  `reason` text NOT NULL,
  `title_before` varchar(255) NOT NULL,
  `content_before` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL CHECK (json_valid(`content_before`)),
  `created_at` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `revisions`
--

INSERT INTO `revisions` (`id`, `item_id`, `version`, `reason`, `title_before`, `content_before`, `created_at`) VALUES
(1, 2, 1, 'Review Ide 2 – POV grup chat berantakan (TikTok, Rabu 4 Nov 2026)\n\nYang sudah bagus\n- Hook relatable dan spesifik: \'jawaban tenggelam sama stiker\' gampang dibayangkan siapa pun yang pernah ada di grup chat hobi hewan.\n- Format POV skit cocok untuk TikTok dan durasi 15-25 detik realistis untuk produksi cepat.\n- Struktur masalah → solusi → tampilan layar jelas, jadi fitur forum langsung terlihat fungsinya (topik rapi, jawaban mudah dicari).\n- Fokus ke satu fitur (forum), tidak mencoba menjelaskan semua fitur sekaligus.\n- Tanggal Rabu 4 Nov 2026 masuk akal untuk hari kerja; tidak ada bentrok yang saya tahu (cek dulu dengan kalender klien).\n\nYang lemah\n- Hook baru berupa teks, belum ada detail visual untuk 3 detik pertama. Di TikTok, ini yang menentukan orang lanjut nonton atau tidak.\n- Ringkasan masih umum: belum jelas siapa karakternya, adegan per adegan, dan momen \'lucunya\' (punchline) apa.\n- Pergantian ke aplikasi terkesan iklan kalau transisinya mendadak. Penonton perlu merasakan \'lega\' dulu sebelum solusi muncul.\n- Penutup \'tampilan layar forum\' berisiko statis dan membosankan jika hanya screen recording biasa tanpa contoh pertanyaan dan jawaban yang menarik.\n- CTA terlalu umum dan hanya ada di akhir. Belum jelas arah aksinya: download dari mana, atau cari di mana (link bio?).\n- Belum ada kejelasan soal keamanan konten: tampilan chat/stiker sebaiknya buatan sendiri, bukan tangkapan grup asli atau stiker berhak cipta.\n- Pilar \'memperkenalkan aplikasi\' tidak punya metrik suks', 'Ide 2 – POV grup chat berantakan', '{\"fields\":[{\"label\":\"Platform\",\"kind\":\"text\",\"value\":\"TikTok\"},{\"label\":\"Pilar\",\"kind\":\"text\",\"value\":\"Memperkenalkan aplikasi – fitur forum diskusi\"},{\"label\":\"Format\",\"kind\":\"text\",\"value\":\"Video skit 15-25 detik\"},{\"label\":\"Usulan tanggal\",\"kind\":\"text\",\"value\":\"Rabu, 4 November 2026\"},{\"label\":\"Hook\",\"kind\":\"text\",\"value\":\"POV: nanya tips merawat kucing di grup chat, tapi jawabannya tenggelam sama stiker.\"},{\"label\":\"Ringkasan\",\"kind\":\"text\",\"value\":\"Skit singkat orang bingung mencari jawaban di grup chat yang ramai, lalu pindah ke forum lelangpet yang topiknya rapi dan jawabannya mudah dicari. Tutup dengan tampilan layar forum.\"},{\"label\":\"CTA\",\"kind\":\"text\",\"value\":\"Gabung forum lelangpet, tanya apa aja soal hewan kesayanganmu.\"}]}', '2026-10-19 00:45:51');

--
-- Indexes for dumped tables
--

--
-- Indexes for table `clients`
--
ALTER TABLE `clients`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `items`
--
ALTER TABLE `items`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_items_board` (`deleted_at`,`status`,`agent_id`),
  ADD KEY `idx_items_type` (`type`,`status`),
  ADD KEY `idx_items_job` (`job_id`),
  ADD KEY `idx_items_parent` (`parent_id`),
  ADD KEY `fk_items_client` (`client_id`);

--
-- Indexes for table `jobs`
--
ALTER TABLE `jobs`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_jobs_agent` (`agent_id`,`id`),
  ADD KEY `fk_jobs_client` (`client_id`);

--
-- Indexes for table `revisions`
--
ALTER TABLE `revisions`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_rev_item` (`item_id`,`id`);

--
-- AUTO_INCREMENT for dumped tables
--

--
-- AUTO_INCREMENT for table `clients`
--
ALTER TABLE `clients`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=2;

--
-- AUTO_INCREMENT for table `items`
--
ALTER TABLE `items`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=16;

--
-- AUTO_INCREMENT for table `jobs`
--
ALTER TABLE `jobs`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=5;

--
-- AUTO_INCREMENT for table `revisions`
--
ALTER TABLE `revisions`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=2;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
