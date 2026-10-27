import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { seedModelCatalog, readModelCatalog, fetchModelMetadata } from '../server/model-catalog.js';
import { createLiveChatModelCatalog } from '../server/live-chat-models.js';
import { quoteBilledUsage } from '../server/ai-billing.js';
import { inspectMigrationDirectory } from '../server/migrations/status.js';
import { validateBillingSchema, MODEL_CATALOG_CONTRACT } from '../server/migrations/billing-contract.js';

const now = Date.parse('2026-10-25T12:00:00Z');
const metadata = [{ id:'fixture-sonnet',display_name:'Claude Sonnet 5',lifecycle:'active',max_input_tokens:200000,max_tokens:8000 },
  { id:'fixture-unknown',display_name:'New unapproved model',lifecycle:'active',max_input_tokens:200000,max_tokens:8000 }];
function fixture() {
  const models = new Map(), tariffs = new Map();
  const c = { async execute(sql, args=[]) {
    if (sql.startsWith('INSERT INTO ai_models')) {
      if (!models.has(args[1])) models.set(args[1], {catalogId:args[0],provider:'anthropic',model:args[1],label:args[2],lifecycle:args[3]||'unknown',seedEnabled:args[4]||0,seedTariff:args[5]||null,seedReference:args[6]||'existing-admin-tariff'});
      return [{affectedRows:1}]; // Simulates MySQL CLIENT_FOUND_ROWS on a no-op.
    }
    if (sql === 'SELECT id FROM ai_models WHERE id=?') return [[...models.values()].filter(r=>r.catalogId===args[0]).map(r=>({id:r.catalogId}))];
    if (sql === 'SELECT model FROM billing_model_tariffs ORDER BY model') return [[...tariffs.keys()].map(model=>({model}))];
    if (sql.includes('FROM ai_models m LEFT JOIN')) return [[...models.values()].map(row=>({...row,...tariffs.get(row.model)}))];
    throw Error('Unexpected SQL');
  }};
  const catalog = createLiveChatModelCatalog({models:{team:'fixture-sonnet',leader:'fixture-sonnet'},databaseOnly:true,now:()=>now,readTariffs:()=>readModelCatalog(c)});
  return {c,models,tariffs,catalog};
}

test('explicit seed stores internal IDs, exact provider IDs and approved prices; unknown models are inactive', async()=>{
  const f=fixture(); assert.deepEqual(await seedModelCatalog(f.c,metadata,{now}),{inserted:2});
  const rows=await readModelCatalog(f.c);
  assert.match(rows[0].catalogId,/^[a-f0-9-]{36}$/); assert.equal(rows[0].provider,'anthropic');
  assert.equal(rows[0].model,'fixture-sonnet'); assert.equal(rows[0].tariff.inputUsdPerMillion,'2');
  assert.equal(rows[1].enabled,0); assert.equal(rows[1].tariff,null);
  await f.catalog.refresh(); assert.equal(f.catalog.list().find(m=>m.id==='fixture-sonnet').selectable,true);
  assert.throws(()=>f.catalog.validate('fixture-unknown'));
});

test('seed rerun is a no-op even with FOUND_ROWS, preserves IDs and every admin edit/status/expiry',async()=>{
  const f=fixture(); await seedModelCatalog(f.c,metadata,{now});
  const original=structuredClone([...f.models]);
  const seed=(await readModelCatalog(f.c))[0];
  f.tariffs.set(seed.model,{version:7,enabled:0,tariff:{...seed.tariff,inputUsdPerMillion:'9',validUntil:'2020-01-01T00:00:00Z'},sourceReference:'https://fixture.invalid/pricing'});
  assert.deepEqual(await seedModelCatalog(f.c,metadata,{now}),{inserted:0});
  assert.deepEqual([...f.models],original);
  const [row]=await readModelCatalog(f.c);assert.equal(row.version,7);assert.equal(row.enabled,0);assert.equal(row.tariff.inputUsdPerMillion,'9');
  await assert.rejects(f.catalog.resolveTariff(seed.model));
});

test('admin tariff wins including malformed values; DB errors and unpersisted provider discovery never enable fallback',async()=>{
  const f=fixture();await seedModelCatalog(f.c,metadata,{now});
  f.tariffs.set('fixture-sonnet',{version:1,enabled:1,tariff:null});
  await assert.rejects(f.catalog.resolveTariff('fixture-sonnet'));
  const empty=createLiveChatModelCatalog({models:{team:'fixture-sonnet',leader:'fixture-sonnet'},databaseOnly:true,now:()=>now,
    client:{models:{list:async()=>({data:metadata,has_more:false})}},readTariffs:async()=>[]});
  await empty.refresh();assert.deepEqual(empty.list(),[]);await assert.rejects(empty.resolveTariff('fixture-sonnet'));
  const failing=createLiveChatModelCatalog({models:{team:'fixture-sonnet',leader:'fixture-sonnet'},databaseOnly:true,readTariffs:async()=>{throw Error('private SQL');}});
  await assert.rejects(failing.refresh(),error=>!error.message.includes('SQL'));
});

test('saved billing snapshot keeps old price and internal catalog ID after admin disables the model',async()=>{
  const f=fixture();await seedModelCatalog(f.c,metadata,{now});
  const tariff=await f.catalog.resolveTariff('fixture-sonnet');assert.equal(tariff.catalogId,f.models.get('fixture-sonnet').catalogId);
  const snapshot={tariff,fx:{idrPerUsd:'16000'},maxOutputTokens:1500};
  f.tariffs.set('fixture-sonnet',{version:1,enabled:0,tariff:{...tariff,inputUsdPerMillion:'99'}});
  await assert.rejects(f.catalog.resolveTariff('fixture-sonnet'));
  assert.equal(quoteBilledUsage(snapshot,{input_tokens:1000,output_tokens:1000}),'384');
});

test('existing manually approved IDs import without changing tariffs or assigning a guessed family',async()=>{
  const f=fixture(); f.tariffs.set('manual-approved-id',{version:4,enabled:0,tariff:null});
  await seedModelCatalog(f.c,[],{now});const [row]=await readModelCatalog(f.c);
  assert.equal(row.model,'manual-approved-id');assert.equal(row.label,row.model);assert.equal(row.enabled,0);assert.equal(row.version,4);
  assert.deepEqual(await seedModelCatalog(f.c,[],{now}),{inserted:0});
});

test('metadata fetching is bounded, paginated, does not use inference, and rejects pagination loops',async()=>{
  const calls=[];
  const client={models:{list:async(args,options)=>{calls.push({args,options});return args.after_id?{data:[metadata[1]],has_more:false}:{data:[metadata[0]],has_more:true,last_id:metadata[0].id};}}};
  assert.deepEqual(await fetchModelMetadata(client),metadata);assert.equal(calls.length,2);assert.equal(calls[0].options.maxRetries,0);
  await assert.rejects(fetchModelMetadata({models:{list:async()=>({data:[],has_more:true,last_id:'loop'})}}));
  await assert.rejects(seedModelCatalog(fixture().c,[{...metadata[0],id:'../invalid'}],{now}));
});

test('013 is registered/checksummed, additive, and schema validation detects missing catalog constraints',async()=>{
  const report=await inspectMigrationDirectory(fileURLToPath(new URL('../migrations',import.meta.url)));
  assert.deepEqual(report.diagnostics,[]);const m=report.migrations.find(m=>m.id==='013_ai_model_catalog');
  assert.equal(m.checksum,createHash('sha256').update(m.source).digest('hex'));
  assert(!/\b(DELETE|DROP|ALTER|UPDATE|INSERT)\b/i.test(m.source));
  const differences=await validateBillingSchema({execute:async()=>[[]]},{modelCatalog:true});
  for(const name of MODEL_CATALOG_CONTRACT.ai_models.checks)assert(differences.some(d=>d.table==='ai_models'&&d.constraint===name));
  assert(differences.some(d=>d.table==='ai_models'&&d.index==='uq_ai_model_provider'));
});
