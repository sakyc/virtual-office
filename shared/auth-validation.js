export function normalizeEmail(value) {
  if (typeof value !== 'string') return null;
  const email = value.trim().toLowerCase();
  if (email.length > 254 || email.split('@').length !== 2) return null;
  const [local, domain] = email.split('@');
  if (!local || local.length > 64 || local.startsWith('.') || local.endsWith('.') || local.includes('..')
      || !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(local)) return null;
  const labels = domain.split('.');
  return labels.length >= 2 && labels.every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))
    && /^[a-z]{2,63}$/.test(labels.at(-1)) ? email : null;
}

function hasSequence(value) {
  const text = value.toLowerCase();
  // Three or more consecutive alphabetic/numeric characters, in either direction.
  for (const alphabet of ['abcdefghijklmnopqrstuvwxyz', '0123456789']) {
    for (let index = 0; index <= alphabet.length - 3; index++) {
      const part = alphabet.slice(index, index + 3);
      if (text.includes(part) || text.includes([...part].reverse().join(''))) return true;
    }
  }
  return false;
}

export function passwordRequirements(value) {
  const password = typeof value === 'string' ? value : '';
  return [
    { id: 'length', label: 'Minimal 8 karakter', passed: [...password].length >= 8 },
    { id: 'capital', label: 'Diawali huruf kapital', passed: /^\p{Lu}/u.test(password) },
    { id: 'number', label: 'Mengandung angka', passed: /[0-9]/.test(password) },
    { id: 'symbol', label: 'Mengandung simbol, misalnya !, @, atau #', passed: /[^\p{L}\p{N}\s]/u.test(password) },
    { id: 'sequence', label: 'Tanpa urutan 3 huruf/angka, misalnya abc, 123, atau 321', passed: Boolean(password) && !hasSequence(password) },
  ];
}

export function validPassword(password) {
  return passwordRequirements(password).every((rule) => rule.passed);
}

export function validateAuthFields(form, { register = false } = {}) {
  const errors = {};
  if (register && (typeof form.displayName !== 'string' || !form.displayName.trim() || form.displayName.trim().length > 150)) errors.displayName = 'Isi nama lengkap, maksimal 150 karakter.';
  if (register && !normalizeWhatsapp(form.whatsappNumber)) errors.whatsappNumber = 'Isi nomor WhatsApp yang valid, contoh 081234567890 atau +6281234567890.';
  if (!normalizeEmail(form.email)) errors.email = form.email?.trim() ? 'Format email tidak valid. Contoh: nama@domain.com.' : 'Email wajib diisi.';
  if (typeof form.password !== 'string' || !form.password) errors.password = 'Kata sandi wajib diisi.';
  else if (register && !validPassword(form.password)) errors.password = 'Kata sandi belum memenuhi semua persyaratan di bawah.';
  else if (new TextEncoder().encode(form.password).length > 256) errors.password = 'Kata sandi maksimal 256 byte.';
  return errors;
}

export function normalizeWhatsapp(value) {
  if (typeof value !== 'string' || !/^[+\d\s().-]+$/.test(value.trim())) return null;
  let number = value.trim().replace(/[\s().-]/g, '');
  if (number.startsWith('0')) number = '+62' + number.slice(1);
  else if (!number.startsWith('+') && number.startsWith('62')) number = '+' + number;
  return /^\+[1-9]\d{7,14}$/.test(number) ? number : null;
}
