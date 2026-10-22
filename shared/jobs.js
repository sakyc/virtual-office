// Definisi perintah (job) yang bisa diberikan ke tiap agent.
// Publik: dipakai frontend (render form) dan backend (validasi). Instruksi prompt ada di server/jobSpecs.js.
//
// Menambah perintah baru = tambah satu J(...) di bawah + satu entri di server/jobSpecs.js.

const MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

export const monthLabel = (ym) => {
  const m = /^(\d{4})-(\d{2})$/.exec(ym || '');
  return m ? `${MONTHS[Number(m[2]) - 1]} ${m[1]}` : String(ym || '');
};

export function monthOptions(count = 6) {
  const now = new Date();
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    return { value, label: monthLabel(value) };
  });
}

export const TYPE_LABEL = {
  idea: 'Ide konten', carousel: 'Carousel', caption: 'Caption', video_script: 'Skenario video', review: 'Review',
  brief: 'Analisis brief', proposal: 'Proposal', pricing: 'Paket harga', ad_copy: 'Copy iklan', landing: 'Landing page',
  angle: 'Angle kampanye', checklist: 'Checklist QA', code: 'Kode', report: 'Laporan', message: 'Pesan klien',
  invoice: 'Invoice', recap: 'Rekap',
};

// ---------- helper field ----------
const T = (name, label, o = {}) => ({ name, label, type: 'text', ...o });
const A = (name, label, o = {}) => ({ name, label, type: 'textarea', ...o });
const N = (name, label, min, max, def, o = {}) => ({ name, label, type: 'number', min, max, default: def, ...o });
const S = (name, label, options, o = {}) => ({ name, label, type: 'select', options, ...o });
const M = (name, label, options, def, o = {}) => ({ name, label, type: 'multi', options, default: def, ...o });
const MO = (name = 'bulan', label = 'Bulan') => ({ name, label, type: 'month', required: true });
const I = (name, label, itemType) => ({ name, label, type: 'item', itemType });
const J = (id, agent, label, desc, type, fields, o = {}) => ({ id, agent, label, desc, type, fields, ...o });

const PLATFORMS = ['Instagram', 'Facebook', 'TikTok', 'LinkedIn'];
const GOALS = ['Awareness', 'Traffic', 'Leads', 'Penjualan'];

const qaFields = () => [
  S('jenis', 'Jenis website', ['Company profile', 'Toko online', 'Landing page', 'Blog / media']),
  S('platform', 'Platform', ['WordPress', 'Shopify', 'Webflow', 'Custom / lainnya']),
  T('halaman', 'Halaman / fitur penting (opsional)', { placeholder: 'mis. Home, Produk, Checkout, Kontak' }),
  A('catatan', 'Catatan khusus (opsional)'),
];

const devFields = (platforms) => [
  S('platform', 'Platform / stack', platforms),
  A('tugas', 'Masalah / yang ingin dibuat', { required: true, placeholder: 'Jelaskan gejala atau kebutuhan sejelas mungkin' }),
  T('error', 'Pesan error (opsional)'),
  A('kode', 'Kode terkait (opsional)', { limit: 20000 }),
];

export const JOBS = [
  // ---------- Social Media ----------
  J('content_planner', 'raka', 'Buat planner konten', 'Planner bulanan: pilih bulan, jumlah ide, platform. Hasilnya masuk board sebagai draft.', 'idea', [
    MO('bulan'),
    N('jumlah', 'Jumlah ide', 1, 31, 12, { required: true }),
    M('platform', 'Platform', PLATFORMS, ['Instagram']),
    T('pilar', 'Pilar konten (opsional)', { placeholder: 'mis. edukasi, promo, testimoni' }),
    A('catatan', 'Tema / momen / promo khusus (opsional)'),
  ], { many: true }),
  J('carousel', 'nadia', 'Buat carousel', 'Rancang carousel per slide dari ide di board atau dari topik bebas.', 'carousel', [
    I('ide', 'Dari ide di board', 'idea'),
    T('topik', 'Atau tulis topik', { placeholder: 'mis. 5 kesalahan SEO untuk toko online' }),
    N('slide', 'Jumlah slide', 3, 10, 7),
    S('gaya', 'Gaya', ['Edukasi', 'Storytelling', 'Promo', 'Tips cepat']),
    S('platform', 'Platform', PLATFORMS),
  ], { anyOf: ['ide', 'topik'] }),
  J('caption', 'nadia', 'Tulis caption', 'Beberapa variasi caption + hashtag.', 'caption', [
    I('ide', 'Dari ide di board', 'idea'),
    T('topik', 'Atau tulis topik'),
    S('tone', 'Tone', ['Santai', 'Profesional', 'Playful', 'Persuasif']),
    N('jumlah', 'Jumlah variasi', 1, 8, 3),
    S('platform', 'Platform', PLATFORMS),
  ], { anyOf: ['ide', 'topik'] }),
  J('video_script', 'eko', 'Rancang skenario video', 'Hook, scene per scene, narasi, CTA, dan catatan produksi.', 'video_script', [
    I('ide', 'Dari ide di board', 'idea'),
    T('topik', 'Atau tulis topik'),
    S('durasi', 'Durasi', ['15 detik', '30 detik', '45 detik', '60 detik'], { default: '30 detik' }),
    S('platform', 'Platform', ['TikTok', 'Instagram Reels', 'YouTube Shorts', 'Facebook Reels']),
    S('gaya', 'Gaya', ['Edukasi', 'Storytelling', 'Behind the scene', 'Promo / hard sell', 'Humor']),
  ], { anyOf: ['ide', 'topik'] }),
  J('calendar_review', 'dewi', 'Review kalender konten', 'Review jujur: apa yang bagus, apa yang lemah, perbaikan konkret.', 'review', [
    A('teks', 'Tempel kalender / daftar ide', { required: true, limit: 12000 }),
    A('catatan', 'Brand voice / tujuan (opsional)'),
  ]),

  // ---------- Proposal ----------
  J('brief_analysis', 'bagas', 'Analisis brief klien', 'Pain point, pertanyaan discovery call, asumsi, risiko scope.', 'brief', [
    A('brief', 'Brief klien', { required: true, limit: 12000 }),
    T('industri', 'Industri / jenis bisnis (opsional)'),
  ]),
  J('proposal_draft', 'siti', 'Tulis draft proposal', 'Proposal per bagian, bisa dimulai dari hasil analisis brief.', 'proposal', [
    I('analisis', 'Dari analisis brief di board', 'brief'),
    T('layanan', 'Layanan yang ditawarkan', { required: true, placeholder: 'mis. Website company profile + SEO dasar' }),
    A('kebutuhan', 'Konteks klien / kebutuhan (opsional)'),
    A('catatan', 'Catatan lain (opsional)'),
  ]),
  J('pricing', 'dimas', 'Susun paket harga', 'Tiga paket + scope, timeline, termin pembayaran.', 'pricing', [
    T('layanan', 'Layanan', { required: true }),
    T('budget', 'Kisaran budget klien (opsional)'),
    T('durasi', 'Perkiraan durasi (opsional)', { placeholder: 'mis. 6 minggu' }),
    A('catatan', 'Catatan scope (opsional)'),
  ]),
  J('proposal_review', 'roy', 'Review proposal', 'Skor, kelebihan, kelemahan, perbaikan konkret.', 'review', [
    I('proposal', 'Dari proposal di board', 'proposal'),
    A('teks', 'Atau tempel teks proposal', { limit: 15000 }),
  ], { anyOf: ['proposal', 'teks'] }),

  // ---------- Ads ----------
  J('meta_ads', 'fajar', 'Copy Meta Ads', 'Variasi primary text, headline, deskripsi, dan CTA.', 'ad_copy', [
    T('produk', 'Produk / layanan', { required: true }),
    S('tujuan', 'Tujuan', GOALS),
    T('audiens', 'Target audiens', { required: true }),
    T('penawaran', 'Penawaran / promo (opsional)'),
    N('variasi', 'Jumlah varian', 1, 8, 4),
  ]),
  J('google_rsa', 'anisa', 'Copy Google RSA', '15 headline (maks 30 karakter) dan 4 deskripsi (maks 90), dicek otomatis.', 'ad_copy', [
    T('produk', 'Produk / layanan', { required: true }),
    T('keyword', 'Keyword utama', { required: true }),
    A('usp', 'Keunggulan / penawaran (opsional)'),
  ]),
  J('landing_copy', 'yoga', 'Landing page & A/B test', 'Copy hero, variasi CTA, atau kritik landing page.', 'landing', [
    S('mode', 'Mode', ['Copy hero', 'Variasi CTA & A/B test', 'Kritik landing page']),
    A('deskripsi', 'Deskripsi bisnis / isi landing page', { required: true }),
    T('tujuan', 'Tujuan konversi (opsional)', { placeholder: 'mis. isi form konsultasi' }),
  ]),
  J('ad_angle', 'putri', 'Angle & struktur kampanye', '3-5 angle iklan + struktur funnel.', 'angle', [
    T('produk', 'Produk / layanan', { required: true }),
    T('target', 'Target audiens', { required: true }),
    S('tujuan', 'Tujuan', GOALS),
    T('budget', 'Budget iklan (opsional)'),
  ]),

  // ---------- Web QA ----------
  J('qa_handover', 'hendra', 'Checklist handover', 'Checklist serah terima menyeluruh yang bisa dicentang.', 'checklist', qaFields()),
  J('qa_visual', 'laras', 'Checklist visual & responsive', 'Tampilan, responsive, konsistensi desain, typo.', 'checklist', qaFields()),
  J('qa_functional', 'andi', 'Checklist fungsional', 'Form, checkout, pembayaran, email, tracking.', 'checklist', qaFields()),
  J('qa_perf', 'maya', 'Checklist performa & SEO', 'Kecepatan, Core Web Vitals, SEO teknis, gambar.', 'checklist', qaFields()),

  // ---------- Developer ----------
  J('dev_wp', 'citra', 'Snippet WordPress / Elementor', 'Solusi + kode siap tempel + tempatnya.', 'code', devFields(['WordPress', 'Elementor', 'WooCommerce'])),
  J('dev_backend', 'bayu', 'Backend, API & database', 'Endpoint, query, skema database, auth.', 'code', devFields(['Node.js / Express', 'Laravel', 'CodeIgniter', 'MySQL / MariaDB', 'REST API & Auth'])),
  J('dev_frontend', 'tari', 'Webflow & frontend', 'Interaksi, JavaScript, CSS, embed.', 'code', devFields(['Webflow', 'JavaScript', 'CSS / animasi', 'Embed & integrasi'])),
  J('code_review', 'arief', 'Review kode', 'Temuan per bagian + versi perbaikan.', 'review', [
    A('kode', 'Kode', { required: true, limit: 20000 }),
    A('konteks', 'Konteks (opsional)'),
    S('fokus', 'Fokus', ['Bug', 'Keamanan', 'Performa', 'Keterbacaan']),
  ]),

  // ---------- Reporting / Account / Finance ----------
  J('monthly_report', 'kirana', 'Laporan bulanan klien', 'Ubah data GA4 / Ads / Search Console jadi laporan yang mudah dipahami.', 'report', [
    MO('bulan'),
    A('data', 'Tempel data (GA4 / Ads / Search Console)', { required: true, limit: 20000 }),
    A('catatan', 'Fokus / konteks (opsional)'),
  ]),
  J('client_message', 'rizky', 'Draft pesan ke klien', 'Update progres, balas revisi, follow-up approval, komplain.', 'message', [
    S('jenis', 'Jenis pesan', ['Update progres', 'Balas permintaan revisi', 'Follow-up approval', 'Reminder deadline', 'Tangani komplain']),
    A('konteks', 'Konteks / situasi', { required: true }),
    S('nada', 'Nada', ['Hangat', 'Tegas tapi sopan', 'Santai']),
    S('channel', 'Channel', ['WhatsApp', 'Email']),
  ]),
  J('invoice', 'melati', 'Draft invoice', 'Teks invoice; rincian dan total dihitung sistem, bukan AI.', 'invoice', [
    T('klienNama', 'Nama klien', { required: true }),
    A('items', 'Item (satu per baris: nama | qty | harga satuan)', { required: true, placeholder: 'Website company profile | 1 | 7500000' }),
    S('ppn', 'Pajak', ['Tanpa PPN', 'PPN 11%']),
    T('termin', 'Termin (opsional)', { placeholder: 'mis. DP 50%, pelunasan 50%' }),
    T('nomor', 'Nomor invoice (opsional)'),
    T('jatuhTempo', 'Jatuh tempo (opsional)'),
  ]),
  J('payment_reminder', 'melati', 'Pesan tagih / reminder', 'Pesan sopan untuk menagih pembayaran.', 'message', [
    T('klienNama', 'Nama klien', { required: true }),
    T('nomor', 'Nomor invoice (opsional)'),
    T('jumlah', 'Jumlah tagihan', { required: true }),
    T('jatuhTempo', 'Jatuh tempo / telat berapa hari', { required: true }),
    S('tingkat', 'Tingkat', ['Pengingat ramah', 'Pengingat kedua', 'Tegas (terakhir)']),
  ]),
  J('billing_recap', 'melati', 'Rekap tagihan bulanan', 'Rekap dari daftar tagihan; total dihitung sistem.', 'recap', [
    MO('bulan'),
    A('data', 'Data tagihan (satu per baris: klien | jumlah | lunas/belum)', { required: true, limit: 8000 }),
  ]),
];

export const jobById = (id) => JOBS.find((j) => j.id === id);
export const jobsOf = (agentId) => JOBS.filter((j) => j.agent === agentId);
// Perintah lanjutan untuk sebuah item (mis. ide -> carousel, caption, skenario video).
export const jobsForParent = (itemType) => JOBS.filter((j) => j.fields.some((f) => f.type === 'item' && f.itemType === itemType));
