import { createHash, timingSafeEqual } from 'node:crypto';
import { billingError } from './billing-policy.js';

export function createMidtrans({ env = process.env, request = globalThis.fetch } = {}) {
  const production = env.MIDTRANS_IS_PRODUCTION === '1';
  const mode = production ? 'production' : 'sandbox';
  const sandboxOrg = /^[1-9]\d*$/.test(env.MIDTRANS_SANDBOX_ORGANIZATION_ID || '') && Number.isSafeInteger(Number(env.MIDTRANS_SANDBOX_ORGANIZATION_ID)) ? Number(env.MIDTRANS_SANDBOX_ORGANIZATION_ID) : null;
  const enabled = env.MIDTRANS_ENABLED === '1' && Boolean(env.MIDTRANS_SERVER_KEY?.trim() && env.MIDTRANS_CLIENT_KEY?.trim()) &&
    (production || env.NODE_ENV !== 'production' || Boolean(sandboxOrg));
  const api = production ? 'https://api.midtrans.com' : 'https://api.sandbox.midtrans.com';
  const snap = production ? 'https://app.midtrans.com' : 'https://app.sandbox.midtrans.com';
  async function call(url, method = 'GET', body) {
    if (!enabled) throw billingError('PAYMENT_NOT_CONFIGURED', 503);
    try {
      const response = await request(url, { method, signal: AbortSignal.timeout(15000), headers: {
        Authorization: `Basic ${Buffer.from(`${env.MIDTRANS_SERVER_KEY}:`).toString('base64')}`,
        Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}),
      }, ...(body ? { body: JSON.stringify(body) } : {}) });
      if (!response.ok) throw Error();
      const result = await response.json();
      if (!result || typeof result !== 'object') throw Error();
      return result;
    } catch { throw billingError('PAYMENT_PROVIDER_UNAVAILABLE', 503); }
  }
  return {
    enabled, mode, allowedOrganizationId: !production ? sandboxOrg : null,
    publicConfig: () => ({ enabled, mode, ...(enabled ? { clientKey: env.MIDTRANS_CLIENT_KEY, scriptUrl: `${snap}/snap/snap.js` } : {}) }),
    async checkout(order) {
      const result = await call(`${snap}/snap/v1/transactions`, 'POST', {
        transaction_details: { order_id: order.id, gross_amount: Number(order.amount) },
        item_details: [{ id: order.kind, price: Number(order.amount), quantity: 1, name: order.kind === 'topup' ? 'Top up saldo AI Karyora' : `Karyora ${order.planCode}` }],
        expiry: { unit: 'hours', duration: 24 },
      });
      if (typeof result.token !== 'string' || !result.token || result.token.length > 255) throw billingError('PAYMENT_PROVIDER_UNAVAILABLE', 503);
      return result.token;
    },
    status: id => call(`${api}/v2/${encodeURIComponent(id)}/status`),
    verify(body) {
      if (!enabled || !body || typeof body.order_id !== 'string' || !/^[a-f0-9]{128}$/i.test(body.signature_key || '') ||
        typeof body.status_code !== 'string' || typeof body.gross_amount !== 'string') return false;
      const expected = createHash('sha512').update(body.order_id + body.status_code + body.gross_amount + env.MIDTRANS_SERVER_KEY).digest();
      return timingSafeEqual(expected, Buffer.from(body.signature_key, 'hex'));
    },
  };
}
