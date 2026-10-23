export function onboardingErrors(form, step = 3) {
  const errors = {};
  for (const [field, label] of [['organizationName', 'organisasi'], ['workspaceName', 'workspace']]) {
    if (field === 'workspaceName' && step < 2) continue;
    const value = form?.[field];
    if (typeof value !== 'string' || !value.trim()) errors[field] = `Nama ${label} wajib diisi.`;
    else if (value.trim().length > 150) errors[field] = `Nama ${label} maksimal 150 karakter.`;
  }
  if (!errors.organizationName && !/[a-z0-9]/i.test(form.organizationName.normalize('NFKD'))) errors.organizationName = 'Nama organisasi harus memuat huruf atau angka Latin.';
  if (step >= 2) {
    if (form?.clientName != null && (typeof form.clientName !== 'string' || form.clientName.trim().length > 150)) errors.clientName = 'Nama klien maksimal 150 karakter.';
    if (form?.clientBrief != null && (typeof form.clientBrief !== 'string' || form.clientBrief.trim().length > 4000)) errors.clientBrief = 'Brief klien maksimal 4000 karakter.';
  }
  return errors;
}
