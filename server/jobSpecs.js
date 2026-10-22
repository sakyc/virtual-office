// Instruksi per job (server-only, tidak ikut ke browser).
//   instr(p)    tugas spesifik untuk model
//   rule(p)     (opsional) aturan untuk SATU item saat revisi, kalau instr() menyuruh banyak item
//   heavy       true -> pakai MODEL_LEADER, selain itu MODEL_TEAM
//   tokens      batas output (angka atau fungsi p => angka)
//   tag(p)      label singkat yang tampil di kartu board
//   validate / fix   cek batas (mis. karakter iklan); fix membuang yang melanggar bila tetap gagal setelah 1x ulang
//   post(item,p)     angka dihitung di kode, bukan oleh AI (invoice, rekap)
import { monthLabel } from '../shared/jobs.js';

const PPN_RATE = 0.11;

const L = (v) => [].concat(v ?? []).join(', ');
const num = (s) => Number(String(s ?? '').replace(/[^\d]/g, '')) || 0;
const idr = (n) => `Rp${Math.round(n).toLocaleString('id-ID')}`;
const rows = (text) => String(text || '').split('\n').map((l) => l.split('|').map((x) => x.trim())).filter((a) => a[0] && a.length >= 2);

function setComputed(item, label, lines) {
  item.content.fields = item.content.fields.filter((f) => !f.label.includes('(dihitung sistem)'));
  item.content.fields.unshift({ label: `${label} (dihitung sistem)`, kind: 'list', value: lines });
}

const qa = (focus) => ({
  heavy: false,
  tokens: 4500,
  instr: (p) =>
    `Buat SATU checklist QA fokus ${focus} untuk ${p.jenis} di ${p.platform}. Halaman/fitur penting: ${p.halaman || 'umum'}. ${p.catatan ? `Catatan: ${p.catatan}. ` : ''}` +
    'Semua field berjenis "checklist", dikelompokkan per area (label = nama area, mis. "Homepage" atau "Mobile"), 4-10 butir spesifik per area, urut dari yang paling berisiko. ' +
    'Pakai istilah dan lokasi pengaturan yang relevan dengan platform. Akhiri dengan field "Bug yang sering lolos" (list).',
});

const dev = (extra) => ({
  heavy: false,
  tokens: 5000,
  instr: (p) =>
    `Platform/stack: ${p.platform}. Tugas: ${p.tugas}. ${p.error ? `Pesan error: ${p.error}. ` : ''}${p.kode ? `Kode yang diberikan:\n${p.kode}\n` : ''}` +
    `Hasilkan SATU item dengan fields: "Diagnosis" (text, kemungkinan penyebab berurutan), "Solusi" (text, langkah singkat), "Kode" (code, siap tempel), "Tempel di mana" (text), "Peringatan" (text: backup dan uji di staging sebelum ke situs live). ${extra} ` +
    'Jangan mengarang nama plugin, hook, atau fungsi yang tidak kamu yakini; bila ragu, tulis di Peringatan apa yang perlu dicek.',
});

export const SPEC = {
  // ---------- Social ----------
  content_planner: {
    heavy: true,
    many: true,
    tokens: (p) => 1200 + p.jumlah * 450,
    tag: (p) => `${monthLabel(p.bulan)} / ${L(p.platform)}`,
    instr: (p) =>
      `Buat planner konten ${monthLabel(p.bulan)} berisi TEPAT ${p.jumlah} ide; satu ide = satu item. Platform: ${L(p.platform)}. ${p.pilar ? `Pilar: ${p.pilar}. ` : ''}${p.catatan ? `Catatan: ${p.catatan}. ` : ''}` +
      'Tiap item punya fields (text): "Platform", "Pilar", "Format" (mis. carousel/reel/foto), "Usulan tanggal", "Hook", "Ringkasan" (2-3 kalimat isi konten), "CTA". ' +
      'Sebar ide merata sepanjang bulan, variasikan pilar dan format. Sebut hari besar atau momen hanya bila kamu yakin tanggalnya.',
    rule: () => 'Tetap SATU ide konten dengan fields: "Platform", "Pilar", "Format", "Usulan tanggal", "Hook", "Ringkasan", "CTA".',
  },
  carousel: {
    heavy: false,
    tokens: 3500,
    tag: (p) => `${p.slide} slide / ${p.platform}`,
    instr: (p) =>
      `Buat SATU carousel ${p.slide} slide untuk ${p.platform}, gaya ${p.gaya}. ${p.topik ? `Topik: ${p.topik}. ` : 'Gunakan ide pada BAHAN DASAR. '}` +
      'Fields (text): "Konsep"; lalu satu field per slide berlabel "Slide 1 - Cover", "Slide 2 - (judul pendek)", dst. ' +
      'Isi tiap field slide WAJIB persis tiga baris: "Judul: ..." (maks 8 kata), "Isi: ..." (maks 25 kata; boleh kosong di cover), "Visual: ..." (arahan visual singkat, tidak ditampilkan di gambar). ' +
      'Lalu "Caption" (text) dan "Hashtag" (list). Slide 1 harus hook kuat, slide terakhir CTA. Teks slide akan dirender otomatis jadi gambar, jadi singkat dan tanpa markdown.',
  },
  caption: {
    heavy: false,
    tokens: 2500,
    tag: (p) => p.platform,
    instr: (p) =>
      `Tulis ${p.jumlah} variasi caption ${p.platform} dengan tone ${p.tone}. ${p.topik ? `Topik: ${p.topik}. ` : 'Gunakan ide pada BAHAN DASAR. '}` +
      'SATU item. Fields (text): "Variasi 1" sampai "Variasi N" (sudah termasuk CTA), dan "Hashtag" (list).',
  },
  video_script: {
    heavy: false,
    tokens: 3500,
    tag: (p) => `${p.durasi} / ${p.platform}`,
    instr: (p) =>
      `Buat SATU skenario video ${p.durasi} untuk ${p.platform}, gaya ${p.gaya}. ${p.topik ? `Topik: ${p.topik}. ` : 'Gunakan ide pada BAHAN DASAR. '}` +
      'Fields (text): "Hook (3 detik pertama)", "Scene 1", "Scene 2", dst., lalu "CTA penutup". ' +
      'Isi tiap field WAJIB baris: "Detik: 0-3" (rentang berurutan, mulai dari 0), "Visual: ...", "Teks layar: ..." (maks 12 kata, singkat dan kuat), "Narasi: ...". ' +
      'Terakhir field "Catatan produksi" (text: properti, lokasi, musik). Total rentang detik harus pas dengan durasi video.',
  },
  calendar_review: {
    heavy: true,
    tokens: 3500,
    instr: (p) =>
      `Review kalender/daftar ide berikut dengan jujur.\n${p.teks}\n${p.catatan ? `Brand voice/tujuan: ${p.catatan}\n` : ''}` +
      'SATU item dengan fields: "Yang sudah bagus" (list), "Yang lemah" (list), "Perbaikan konkret" (list), "Keseimbangan pilar dan format" (text).',
  },

  // ---------- Proposal ----------
  brief_analysis: {
    heavy: true,
    tokens: 4000,
    instr: (p) =>
      `Analisis brief klien berikut${p.industri ? ` (industri: ${p.industri})` : ''}:\n${p.brief}\n` +
      'SATU item dengan fields: "Ringkasan kebutuhan" (text), "Pain point" (list), "Pertanyaan discovery call" (list, maks 8), "Asumsi yang perlu dikonfirmasi" (list), "Risiko scope" (list).',
  },
  proposal_draft: {
    heavy: true,
    tokens: 6000,
    tag: (p) => p.layanan,
    instr: (p) =>
      `Tulis draft proposal untuk layanan: ${p.layanan}. ${p.kebutuhan ? `Konteks klien: ${p.kebutuhan}. ` : ''}${p.catatan ? `Catatan: ${p.catatan}. ` : ''}` +
      'SATU item dengan fields (text, satu per bagian): "Ringkasan eksekutif", "Pemahaman kebutuhan", "Solusi dan ruang lingkup", "Tahapan dan timeline", "Investasi", "Kenapa kami", "Langkah berikutnya". ' +
      'Jangan mengarang harga atau klaim; di "Investasi" tulis placeholder [harga dari paket] kecuali angka diberikan.',
  },
  pricing: {
    heavy: true,
    tokens: 4500,
    tag: (p) => p.layanan,
    instr: (p) =>
      `Susun tiga paket harga untuk: ${p.layanan}. ${p.budget ? `Kisaran budget klien: ${p.budget}. ` : ''}${p.durasi ? `Durasi: ${p.durasi}. ` : ''}${p.catatan ? `Catatan scope: ${p.catatan}. ` : ''}` +
      'SATU item. Fields: "Paket 1 - (nama)", "Paket 2 - (nama)", "Paket 3 - (nama)" (text: isi/scope, estimasi harga, timeline), "Termin pembayaran" (list), "Di luar scope" (list), "Asumsi" (list). ' +
      'Harga hanya estimasi wajar dan wajib ditandai "estimasi, perlu dikonfirmasi tim".',
  },
  proposal_review: {
    heavy: true,
    tokens: 3500,
    instr: (p) =>
      `Review proposal berikut dengan jujur. Teks proposal ada di BAHAN DASAR bila dipilih dari board, atau di sini:\n${p.teks || '(lihat bahan dasar)'}\n` +
      'SATU item dengan fields: "Skor (1-10)" (text, beserta alasan singkat), "Kelebihan" (list), "Kelemahan" (list), "Perbaikan konkret" (list), "Kalimat yang sebaiknya diganti" (list, format: asli -> usulan).',
  },

  // ---------- Ads ----------
  meta_ads: {
    heavy: false,
    tokens: 3500,
    instr: (p) =>
      `Tulis ${p.variasi} varian copy Meta Ads untuk: ${p.produk}. Tujuan: ${p.tujuan}. Audiens: ${p.audiens}. ${p.penawaran ? `Penawaran: ${p.penawaran}. ` : ''}` +
      'SATU item. Fields (text): "Varian 1" sampai "Varian N" (isi: Primary text dengan hook kuat di 125 karakter pertama, Headline maks 40 karakter, Deskripsi, tombol CTA), dan "Catatan kebijakan iklan" (hal yang perlu dicek agar tidak ditolak Meta).',
  },
  google_rsa: {
    heavy: false,
    tokens: 3000,
    tag: (p) => p.keyword,
    instr: (p) =>
      `Tulis copy Google Ads Responsive Search Ad untuk: ${p.produk}. Keyword utama: ${p.keyword}. ${p.usp ? `Keunggulan: ${p.usp}. ` : ''}` +
      'SATU item dengan fields: "Headline" (list, TEPAT 15, tiap butir MAKS 30 karakter termasuk spasi), "Deskripsi" (list, TEPAT 4, tiap butir MAKS 90 karakter), "Ide sitelink dan callout" (list). Variasikan angle; jangan ada klaim yang tidak bisa dibuktikan.',
    validate: (it) => {
      const errs = [];
      for (const f of it.content.fields) {
        const lim = /headline/i.test(f.label) ? 30 : /deskripsi/i.test(f.label) ? 90 : 0;
        if (lim && Array.isArray(f.value)) f.value.forEach((v) => v.length > lim && errs.push(`"${v}" = ${v.length} karakter (maks ${lim})`));
      }
      return errs;
    },
    fix: (it) => {
      for (const f of it.content.fields) {
        const lim = /headline/i.test(f.label) ? 30 : /deskripsi/i.test(f.label) ? 90 : 0;
        if (lim && Array.isArray(f.value)) f.value = f.value.filter((v) => v.length <= lim);
      }
      it.content.fields = it.content.fields.filter((f) => !Array.isArray(f.value) || f.value.length);
    },
  },
  landing_copy: {
    heavy: false,
    tokens: 3500,
    tag: (p) => p.mode,
    instr: (p) =>
      `Kerjakan sesuai mode "${p.mode}" untuk:\n${p.deskripsi}\n${p.tujuan ? `Tujuan konversi: ${p.tujuan}\n` : ''}` +
      'Mode "Copy hero": fields "Headline", "Subheadline", "CTA utama", "Poin keunggulan" (list), "Catatan bukti sosial" (placeholder yang harus diverifikasi klien). ' +
      'Mode "Variasi CTA & A/B test": "Variasi CTA" (list, 8 butir), "Ide A/B test" (list, tiap butir: hipotesis dan metrik). ' +
      'Mode "Kritik landing page": "Yang sudah kuat" (list), "Yang lemah" (list), "Perbaikan prioritas" (list berurutan). SATU item.',
  },
  ad_angle: {
    heavy: true,
    tokens: 4000,
    tag: (p) => p.produk,
    instr: (p) =>
      `Rancang angle kampanye iklan untuk: ${p.produk}. Target: ${p.target}. Tujuan: ${p.tujuan}. ${p.budget ? `Budget: ${p.budget}. ` : ''}` +
      'SATU item. Fields: "Angle 1" sampai "Angle 4" (text: ide inti, contoh hook, tahap funnel), "Struktur kampanye" (list), "Metrik utama" (text).',
  },

  // ---------- Web QA ----------
  qa_handover: qa('serah terima (handover) menyeluruh'),
  qa_visual: qa('visual, responsive, konsistensi desain, dan typo'),
  qa_functional: qa('fungsional: form, checkout, pembayaran, email notifikasi, pixel dan tracking'),
  qa_perf: qa('performa, Core Web Vitals, SEO teknis, dan optimasi gambar'),

  // ---------- Dev ----------
  dev_wp: dev('Utamakan solusi yang aman untuk situs WordPress live (child theme atau plugin snippet, bukan edit file inti).'),
  dev_backend: dev('Sertakan validasi input dan penanganan error. Untuk database, tulis query atau skema dalam dialek MySQL/MariaDB.'),
  dev_frontend: dev('Jelaskan juga di mana kode ditempel (custom code, embed, atau file) dan batasannya.'),
  code_review: {
    heavy: true,
    tokens: 5000,
    instr: (p) =>
      `Review kode berikut. Fokus: ${p.fokus}. ${p.konteks ? `Konteks: ${p.konteks}\n` : ''}\n${p.kode}\n` +
      'SATU item dengan fields: "Ringkasan penilaian" (text), "Temuan" (list, format: [tinggi/sedang/rendah] lokasi - masalah), "Perbaikan" (code, versi perbaikan bagian penting), "Saran lain" (list).',
  },

  // ---------- Reporting / Account / Finance ----------
  monthly_report: {
    heavy: true,
    tokens: 5000,
    tag: (p) => monthLabel(p.bulan),
    instr: (p) =>
      `Buat laporan bulanan ${monthLabel(p.bulan)} untuk klien non-teknis dari data berikut:\n${p.data}\n${p.catatan ? `Fokus/konteks: ${p.catatan}\n` : ''}` +
      'Hitung HANYA dari data yang diberikan dan tunjukkan perhitungan untuk angka turunan. SATU item dengan fields: "Ringkasan eksekutif" (text, 3-4 kalimat bahasa awam), "Angka kunci" (list), "Insight" (list), "Penjelasan perubahan" (text, bahasa awam), "Rekomendasi bulan depan" (list), "Data yang kurang atau perlu dicek" (list).',
  },
  client_message: {
    heavy: false,
    tokens: 2000,
    tag: (p) => `${p.jenis} / ${p.channel}`,
    instr: (p) =>
      `Tulis pesan "${p.jenis}" untuk klien lewat ${p.channel}, nada ${p.nada}. Situasi: ${p.konteks}\n` +
      `SATU item. Fields (text): ${p.channel === 'Email' ? '"Subjek", ' : ''}"Pesan" (siap kirim), "Versi singkat", "Catatan untuk tim" (hal sensitif atau yang perlu dicek sebelum kirim). ` +
      'Tidak menyalahkan, tegas soal batas scope bila relevan. Pakai [placeholder] untuk data yang tidak diberikan; jangan mengarang fakta.',
  },
  invoice: {
    heavy: false,
    tokens: 2500,
    tag: (p) => p.klienNama,
    instr: (p) =>
      `Tulis TEKS pendukung invoice untuk ${p.klienNama} (nomor ${p.nomor || '[nomor]'}, jatuh tempo ${p.jatuhTempo || '[tanggal]'}, ${p.ppn}). Termin: ${p.termin || 'sesuai kesepakatan'}.\nItem:\n${p.items}\n` +
      'JANGAN menghitung atau menulis angka total; sistem menambahkan rincian dan total sendiri. SATU item dengan fields: "Pesan pengantar" (text), "Keterangan item" (list, deskripsi singkat per item tanpa angka), "Termin dan cara pembayaran" (text, pakai [placeholder] untuk rekening), "Catatan" (text; soal pajak beri info umum dan sarankan konfirmasi ke akuntan).',
    post: (item, p) => {
      const lines = rows(p.items).map((a) => {
        const qty = a.length >= 3 ? num(a[1]) || 1 : 1;
        const price = num(a[a.length - 1]);
        return { name: a[0], qty, price, total: qty * price };
      });
      const sub = lines.reduce((s, l) => s + l.total, 0);
      const ppn = p.ppn === 'PPN 11%' ? Math.round(sub * PPN_RATE) : 0;
      setComputed(item, 'Rincian dan total', [
        ...lines.map((l) => `${l.name}: ${l.qty} x ${idr(l.price)} = ${idr(l.total)}`),
        `Subtotal: ${idr(sub)}`,
        ...(ppn ? [`PPN ${Math.round(PPN_RATE * 100)}%: ${idr(ppn)}`] : []),
        `TOTAL: ${idr(sub + ppn)}`,
      ]);
    },
  },
  payment_reminder: {
    heavy: false,
    tokens: 1800,
    tag: (p) => p.klienNama,
    instr: (p) =>
      `Tulis pesan tagih untuk ${p.klienNama}${p.nomor ? ` (invoice ${p.nomor})` : ''}, jumlah ${p.jumlah}, jatuh tempo/keterlambatan: ${p.jatuhTempo}. Tingkat: ${p.tingkat}. ` +
      'SATU item. Fields (text): "Pesan" (siap kirim lewat WhatsApp, sopan dan jelas), "Versi email" , "Catatan untuk tim". Jangan mengancam; pakai [placeholder] untuk rekening.',
  },
  billing_recap: {
    heavy: false,
    tokens: 2500,
    tag: (p) => monthLabel(p.bulan),
    instr: (p) =>
      `Buat rekap tagihan ${monthLabel(p.bulan)} dari data berikut:\n${p.data}\n` +
      'JANGAN menghitung total; sistem yang menghitung. SATU item dengan fields: "Ringkasan" (text), "Tagihan yang perlu ditindaklanjuti" (list), "Saran follow-up" (list).',
    post: (item, p) => {
      const data = rows(p.data).map((a) => ({ klien: a[0], jumlah: num(a[1]), lunas: /lunas|paid/i.test(a[2] || '') && !/belum/i.test(a[2] || '') }));
      const total = data.reduce((s, d) => s + d.jumlah, 0);
      const paid = data.filter((d) => d.lunas).reduce((s, d) => s + d.jumlah, 0);
      setComputed(item, 'Total', [
        `Total tagihan: ${idr(total)} (${data.length} tagihan)`,
        `Sudah lunas: ${idr(paid)} (${data.filter((d) => d.lunas).length})`,
        `Belum lunas: ${idr(total - paid)} (${data.filter((d) => !d.lunas).length})`,
      ]);
    },
  },
};
