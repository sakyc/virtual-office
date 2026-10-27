import 'dotenv/config';
import assert from 'node:assert/strict';
import { connectApprovedNonProduction, migrationConnectionOptions, safeDatabaseError } from '../server/migrations/database.js';
import { createAiBilling } from '../server/ai-billing.js';

// Operator-only local reconciliation of ALREADY STORED provider evidence.
// Never dispatches an AI request, accepts browser claims, reprices or releases unknown usage.
let c;
try {
  const [id, confirm, ...extra] = process.argv.slice(2);
  assert(/^[a-f0-9-]{36}$/i.test(id || '') && confirm === '--confirm-non-production' && extra.length === 0, 'Usage: node scripts/reconcile-ai-billing-local.mjs <usage-uuid> --confirm-non-production');
  const options = migrationConnectionOptions();
  assert(['127.0.0.1','localhost','::1'].includes(options.host));
  assert.equal(options.database, 'virtual_office'); assert.equal(options.port, 3306); assert.notEqual(process.env.NODE_ENV, 'production');
  c = await connectApprovedNonProduction();
  const [[target]] = await c.execute('SELECT @@datadir AS datadir');
  assert.match(target.datadir.replaceAll('\\','/'), /^C:\/laragon\/data\/mysql-8\//i);
  const adapter = { execute:(...args)=>c.execute(...args), beginTransaction:()=>c.beginTransaction(), commit:()=>c.commit(), rollback:()=>c.rollback(), release() {} };
  const pool = { execute:(...args)=>c.execute(...args), getConnection:async()=>adapter };
  await createAiBilling(()=>pool, { pricing:null }).reconcile(id);
  const [[result]] = await c.execute('SELECT state,CAST(actual_idr AS CHAR) AS actualIdr FROM ai_billing_attempts WHERE usage_id=?',[id]);
  console.log(JSON.stringify({ usageId:id, ...result, providerCalls:0 }));
} catch(error) { console.error(JSON.stringify({ failed:true, ...safeDatabaseError(error) })); process.exitCode=1; }
finally { await c?.end(); }
