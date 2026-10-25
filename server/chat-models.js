const invalid = () => new Error('Konfigurasi CHAT_MODELS_JSON tidak valid. Periksa ID, label, dan kategori model tanpa memasukkan kredensial.');
const validId = (id) => typeof id === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,190}$/.test(id);
const guidance = {
  economy: 'Lebih hemat menurut konfigurasi operator; cocok untuk tugas rutin. Biaya aktual bergantung pada token dan riwayat.',
  balanced: 'Seimbang menurut konfigurasi operator; pertimbangkan kebutuhan tugas dan panjang jawaban.',
  premium: 'Kelas premium menurut konfigurasi operator; perhatikan pemakaian token untuk tugas panjang.',
  unspecified: 'Kategori biaya belum ditentukan. Biaya bergantung pada token input/output dan panjang riwayat.',
};

// Local operator allowlist, not provider discovery and not a pricing/availability guarantee.
export function createChatModelCatalog(models, json = '') {
  let extra;
  try { extra = json ? JSON.parse(json) : []; } catch { throw invalid(); }
  if (!Array.isArray(extra) || extra.length > 30) throw invalid();
  const entries = new Map();
  for (const id of [models.team, models.leader]) {
    if (!validId(id)) throw invalid();
    entries.set(id, { id, label: id, costClass: 'unspecified', description: guidance.unspecified });
  }
  const seen = new Set();
  for (const item of extra) {
    if (!item || Object.keys(item).some((key) => !['id', 'label', 'costClass'].includes(key)) || !validId(item.id) || seen.has(item.id)
      || typeof item.label !== 'string' || !item.label.trim() || item.label.length > 100 || !Object.hasOwn(guidance, item.costClass)) throw invalid();
    seen.add(item.id);
    entries.set(item.id, { id: item.id, label: item.label.trim(), costClass: item.costClass, description: guidance[item.costClass] });
  }
  return Object.freeze({
    list: () => [...entries.values()].map((entry) => ({ ...entry })),
    resolve(override, agent) {
      const id = override ?? models[agent.modelTier === 'leader' ? 'leader' : 'team'];
      if (!entries.has(id)) throw Object.assign(new Error('Model tersimpan tidak lagi tersedia. Pilih model lain atau default agen.'), { status: 409 });
      return id;
    },
    validate(id) {
      if (id !== null && !entries.has(id)) throw Object.assign(new Error('Model tidak tersedia dalam pilihan server.'), { status: 400 });
      return id;
    },
  });
}
