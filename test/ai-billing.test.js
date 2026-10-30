import test from 'node:test';
import assert from 'node:assert/strict';
import { createAiBilling, parseBillingTariffs, quoteBilledUsage, reservationInputTokens } from '../server/ai-billing.js';
import { trackedClient } from '../server/ai-usage.js';
import { enforceCapacity, lockBillingEntitlements } from '../server/billing-enforcement.js';
import { inspectMigrationDirectory } from '../server/migrations/status.js';
import { AI_BILLING_CONTRACT, validateBillingSchema } from '../server/migrations/billing-contract.js';
import { fileURLToPath } from 'node:url';
import { createLiveChatModelCatalog } from '../server/live-chat-models.js';
import { MODEL_PRICE_VERSION } from '../shared/ai-model-prices.js';
import { defaultModelTariffRows } from '../server/default-model-tariffs.js';

const now = Date.parse('2026-10-25T12:00:00Z');
const tariff = { inputUsdPerMillion:'2', outputUsdPerMillion:'10', cacheReadUsdPerMillion:'0.1', maxInputTokens:100, maxOutputTokens:20, approvalReference:'fixture-only-not-real-tariff', verifiedAt:'2026-10-24T00:00:00Z', validUntil:'2026-11-01T00:00:00Z' };
const scope = { organizationId:1, workspaceId:2, userId:3, sessionId:4, operation:'job', resourceId:5, agentId:'fixture' };
const input = { model:'fixture-model', max_tokens:20, messages:[{role:'user',content:'Hi'}] };
const message = { id:'msg-fixture', model:input.model, usage:{input_tokens:10,output_tokens:2} };

// Mock persistence + serialized wallet adapter. Production wallet SQL is separately tested
// in billing.test.js and the rollback-only local verification; no network/provider here.
function fixture({resolveTariff=null}={}) {
  let s = { available:100n, reserved:0n, spent:0n, attempts:[], settlements:{}, paid:true, access:true, members:1, divisions:1, failSettlement:false };
  let queue = Promise.resolve(), providerCalls = 0, seq = 0;
  const env = { BILLING_MODEL_RATES_JSON:JSON.stringify({[input.model]:tariff}) };
  const fx = { available:true, date:'2026-10-25', idrPerUsd:'16000' };
  const db = { async execute(sql,v=[]) {
    if(sql.includes('FROM managed_demo_accounts'))return [[]];
    if (sql.startsWith('SELECT id FROM organizations')) return [[{id:1}]];
    if (sql.includes('FROM billing_subscriptions WHERE')) return [s.paid ? [{maxDivisions:3,maxMembers:6,whatsapp:1}] : []];
    if (sql.includes('FROM demo_access')) return [s.demo ? [{workspace_id:2}] : []];
    if (sql.startsWith('SELECT\n    (SELECT COUNT(*)')) return [[{divisions:s.divisions,members:s.members}]];
    if (sql.startsWith('SELECT u.id')) return [s.access ? [{id:3}] : []];
    if (sql.startsWith('INSERT INTO ai_billing_attempts')) {
      if (s.attempts.some(a=>a.organization_id===v[1] && a.request_key===v[2])) throw Object.assign(new Error('duplicate'),{code:'ER_DUP_ENTRY'});
      s.attempts.push({usage_id:v[0],organization_id:v[1],request_key:v[2],hold_id:v[3],pricing_snapshot:v[4],state:'prepared'}); return [{}];
    }
    const a = s.attempts.find(a=>a.usage_id===v.at(-1));
    if (sql.startsWith('SELECT organization_id,hold_id')) return [a?[a]:[]];
    if (sql.includes("SET state='dispatched'")) {
      if (!a || a.state!=='prepared') return [{affectedRows:0}];
      a.state='dispatched'; return [{affectedRows:1}];
    }
    if (sql.includes('SET provider_evidence=')) {
      if (a && ['dispatched','unresolved'].includes(a.state) && !a.provider_evidence) {
        if (s.attempts.some(b=>b!==a && b.provider_message_id===v[1])) throw new Error('duplicate provider message');
        a.provider_evidence=v[0]; a.provider_message_id=v[1]; a.state='unresolved';
      }
      return [{}];
    }
    if (sql.includes("SET state='unresolved'")) { if(a && ['prepared','dispatched'].includes(a.state)) a.state='unresolved'; return [{}]; }
    if (sql.includes("SET state='settled'")) { a.state='settled'; a.actual_idr=v[0]; return [{}]; }
    throw new Error('Unexpected mock SQL');
  } };
  async function atomic(fn) {
    const before=queue; let release; queue=new Promise(r=>{release=r;}); await before;
    const snapshot=structuredClone(s);
    try {return await fn();} catch(e) {s=snapshot;throw e;} finally {release();}
  }
  const holds = new Map();
  const service = {
    reserve: p=>atomic(async()=>{
      if (s.available<BigInt(p.amountIdr)) throw Object.assign(new Error('balance'),{status:402});
      const hold=`hold-${p.key}`;
      await p.onReserved(db,hold);
      s.available-=BigInt(p.amountIdr); s.reserved+=BigInt(p.amountIdr); holds.set(hold,BigInt(p.amountIdr));
    }),
    finishHold: p=>atomic(async()=>{
      if(s.settlements[p.key]) return;
      if(s.failSettlement) throw new Error('database temporarily unavailable');
      const amount=holds.get(p.holdId), actual=BigInt(p.actualIdr);
      assert(actual<=amount); await p.onFinished(db);
      s.available+=amount-actual; s.reserved-=amount; s.spent+=actual; s.settlements[p.key]=true;
    }),
  };
  const billing=createAiBilling(()=>db,{pricing:{snapshot:async()=>({fx})},env,now:()=>now,service,resolveTariff});
  const store={start:async(sc,_model,i,n)=>{const id=`usage-${++seq}`;await billing.prepare(id,sc,i,n);return id;}, dispatched:billing.dispatched,finish:billing.finish};
  const client=trackedClient({messages:{create:async request=>{providerCalls++;return {...message,model:request.model,id:`msg-${providerCalls}`};}}},store,scope);
  return {billing,client,store,env,fx,state:()=>s,providerCalls:()=>providerCalls};
}

test('demo AI uses existing holds and actual settlement; expiry and second human fail before provider',async(t)=>{
  const previous=process.env.DEMO_ENABLED;process.env.DEMO_ENABLED='1';
  t.after(()=>{if(previous===undefined)delete process.env.DEMO_ENABLED;else process.env.DEMO_ENABLED=previous;});
  const f=fixture();f.state().paid=false;f.state().demo=input.model;
  await f.client.messages.create(input);
  assert.equal(f.providerCalls(),1);assert.equal(f.state().reserved,0n);assert(f.state().spent>0n);
  for(const change of [s=>{s.demo=null;},s=>{s.members=2;}]) {
    const g=fixture();g.state().paid=false;g.state().demo=input.model;change(g.state());
    await assert.rejects(g.client.messages.create(input));assert.equal(g.providerCalls(),0);assert.equal(g.state().available,100n);
  }
});

test('demo accepts multiple currently approved models at their own prices but denies disabled models and low balance',async(t)=>{
  const previous=process.env.DEMO_ENABLED;process.env.DEMO_ENABLED='1';
  t.after(()=>{if(previous===undefined)delete process.env.DEMO_ENABLED;else process.env.DEMO_ENABLED=previous;});
  const premium='premium-catalog-model',active=new Set([input.model,premium]);
  const f=fixture({resolveTariff:async model=>active.has(model)?{...tariff,...(model===premium?{inputUsdPerMillion:'5',outputUsdPerMillion:'25'}:{})}:null});
  f.state().paid=false;f.state().demo=true;
  await f.client.messages.create(input);const cheapCost=f.state().spent;
  await f.client.messages.create({...input,model:premium});
  assert.equal(f.providerCalls(),2);assert(f.state().spent-cheapCost>cheapCost);
  assert.equal(JSON.parse(f.state().attempts[1].pricing_snapshot).model,premium);
  active.delete(premium);
  await assert.rejects(f.client.messages.create({...input,model:premium}));assert.equal(f.providerCalls(),2);
  f.state().available=0n;
  await assert.rejects(f.client.messages.create(input));assert.equal(f.providerCalls(),2);
});

test('exact rupiah cost rounds once, uses cache-read rate and never accepts unpriced cache writes or invalid counts',()=>{
  const snapshot={tariff,fx:{idrPerUsd:'16000'},maxOutputTokens:20};
  assert.equal(quoteBilledUsage(snapshot,message.usage),'2');
  assert.equal(quoteBilledUsage(snapshot,{input_tokens:0,output_tokens:0,cache_read_input_tokens:10}),'1');
  for(const usage of [{input_tokens:-1,output_tokens:1},{input_tokens:1,output_tokens:21},{input_tokens:101,output_tokens:0},{input_tokens:1,output_tokens:1,cache_creation_input_tokens:1},{input_tokens:1.1,output_tokens:1}]) assert.throws(()=>quoteBilledUsage(snapshot,usage));
});

test('only approved current explicit tariffs are accepted; estimates never become billing authority',()=>{
  assert.deepEqual(parseBillingTariffs('{}',now),{});
  for(const change of [{inputUsdPerMillion:2},{inputUsdPerMillion:'0'},{maxInputTokens:0},{validUntil:'2026-10-24'},{verifiedAt:'2027-01-01'},{approvalReference:''}]) assert.throws(()=>parseBillingTariffs(JSON.stringify({fixture:{...tariff,...change}}),now));
});

test('persisted seeded tariff flows through real billing orchestration, captures a snapshot and settles mocked provider usage',async()=>{
  const catalog=createLiveChatModelCatalog({models:{team:input.model,leader:input.model},now:()=>now,maxTokens:20,
    readTariffs:async()=>defaultModelTariffRows([{id:input.model,display_name:'Claude Sonnet 5',max_input_tokens:100,max_tokens:20}],now)});
  const f=fixture({resolveTariff:model=>catalog.resolveTariff(model)});
  await f.client.messages.create(input);
  assert.equal(f.providerCalls(),1);assert.equal(f.state().spent,2n);assert.equal(f.state().reserved,0n);
  const captured=JSON.parse(f.state().attempts[0].pricing_snapshot);
  assert.equal(captured.tariff.approvalReference,MODEL_PRICE_VERSION);assert.equal(captured.tariff.catalogVersion,MODEL_PRICE_VERSION);
  assert.equal(captured.tariff.cacheReadUsdPerMillion,'0.20');assert.equal(captured.markup,2);
});

test('actual provider usage settles once, releases unused reservation and is independent of later FX changes',async()=>{
  const f=fixture(); await f.billing.prepare('a',scope,input,1);
  assert.equal(f.state().reserved,13n); await f.billing.dispatched('a');
  f.fx.idrPerUsd='32000'; await f.billing.finish('a',message); await f.billing.finish('a',message); await f.billing.reconcile('a');
  assert.equal(f.state().spent,2n); assert.equal(f.state().available,98n); assert.equal(f.state().reserved,0n);
});

test('reservation counts system prompt, complete history and UTF-8 with margin, not model context capacity',()=>{
  const short={...input,max_tokens:1500};
  const base=reservationInputTokens(short,1000000);
  assert(base>1000 && base<2000);
  assert.equal(reservationInputTokens(short,200000),base,'larger model capacity alone must not increase the hold');
  const system={...short,system:'Private server agent instructions '.repeat(100)};
  assert(reservationInputTokens(system,1000000)>base);
  const history={...system,messages:[{role:'user',content:'Older context '.repeat(100)},{role:'assistant',content:'Previous answer '.repeat(100)},...input.messages]};
  assert(reservationInputTokens(history,1000000)>reservationInputTokens(system,1000000));
  assert(reservationInputTokens({...short,system:'漢'.repeat(100)},1000000)>reservationInputTokens({...short,system:'a'.repeat(100)},1000000));
  assert.equal(reservationInputTokens(short,100),100,'never reserve beyond the approved context bound');
});

test('short premium-model chat fits a 49k wallet, snapshots its input budget and debits actual usage only',async()=>{
  const premium={...tariff,inputUsdPerMillion:'5',outputUsdPerMillion:'25',maxInputTokens:1000000,maxOutputTokens:128000};
  const f=fixture({resolveTariff:async()=>premium});f.state().available=49942n;
  await f.client.messages.create({...input,max_tokens:1500,system:'You are a helpful employee.'});
  const captured=JSON.parse(f.state().attempts[0].pricing_snapshot);
  assert(captured.reservation.inputTokens<2000);assert.equal(captured.reservation.method,'utf8-json-margin-v1');
  assert.equal(f.providerCalls(),1);assert.equal(f.state().spent,4n);assert.equal(f.state().reserved,0n);assert.equal(f.state().available,49938n);
  assert.equal(captured.tariff.maxInputTokens,1000000,'capacity is still retained for actual usage validation');
});

test('long history and maximum output increase the hold; insufficient funds deny before inference',async()=>{
  const premium={...tariff,inputUsdPerMillion:'5',outputUsdPerMillion:'25',maxInputTokens:1000000,maxOutputTokens:128000};
  const short=fixture({resolveTariff:async()=>premium}),long=fixture({resolveTariff:async()=>premium});
  short.state().available=1000000n;long.state().available=1000000n;
  await short.billing.prepare('short',scope,input,1);
  await long.billing.prepare('long',scope,{...input,max_tokens:1500,messages:[{role:'user',content:'history '.repeat(10000)},...input.messages]},1);
  assert(long.state().reserved>short.state().reserved);
  const empty=fixture({resolveTariff:async()=>premium});empty.state().available=1n;
  await assert.rejects(empty.client.messages.create(input));assert.equal(empty.providerCalls(),0);assert.equal(empty.state().reserved,0n);
});

test('unsupported images, tools and unpriced request features never use cheap text reservations',async()=>{
  for(const change of [{tools:[]},{messages:[{role:'user',content:[{type:'image',source:{type:'url',url:'https://fixture.invalid/image'}}]}]},
    {system:[{type:'text',text:'test',cache_control:{type:'ephemeral'}}]},{messages:[{role:'user',content:'test',forged:true}]}]) {
    const f=fixture();await assert.rejects(f.client.messages.create({...input,...change}));assert.equal(f.providerCalls(),0);assert.equal(f.state().reserved,0n);
  }
});

test('unexpected usage above a reduced hold remains unresolved without overdrawing or replaying inference',async()=>{
  const f=fixture({resolveTariff:async()=>({...tariff,maxInputTokens:1000000})});f.state().available=100000n;
  await f.billing.prepare('large',scope,input,1);const reserved=f.state().reserved;
  await f.billing.dispatched('large');
  await assert.rejects(f.billing.finish('large',{...message,usage:{input_tokens:900000,output_tokens:2}}));
  assert.equal(f.state().reserved,reserved);assert.equal(f.state().spent,0n);assert(f.state().available>=0n);
  assert.equal(f.state().attempts[0].state,'unresolved');assert(f.state().attempts[0].provider_evidence);assert.equal(f.providerCalls(),0);
});

test('missing tariff, stale FX, unsupported features, inactive plan, revoked access and insufficient balance prevent provider calls',async()=>{
  for(const change of [f=>{f.env.BILLING_MODEL_RATES_JSON='{}';},f=>{f.fx.date='2026-10-01';},f=>{f.state().paid=false;},f=>{f.state().access=false;},f=>{f.state().available=12n;},f=>{f.state().divisions=4;},f=>{f.state().members=7;}]) {
    const f=fixture();change(f);await assert.rejects(f.client.messages.create(input));assert.equal(f.providerCalls(),0);assert.equal(f.state().reserved,0n);
  }
  const f=fixture();await assert.rejects(f.client.messages.create({...input,thinking:{type:'enabled'}}));assert.equal(f.providerCalls(),0);
  await assert.rejects(f.billing.prepare('bad',{...scope,sessionId:null},input,1));
});

test('database tariff resolver takes precedence: missing database approval cannot fall back to an environment price',async()=>{
  const f=fixture({resolveTariff:async()=>null});
  await assert.rejects(f.client.messages.create(input));assert.equal(f.providerCalls(),0);assert.equal(f.state().reserved,0n);
});

test('unknown outcomes and model mismatch keep reservations; stored evidence reconciles without replaying the provider',async()=>{
  const f=fixture();await f.billing.prepare('a',scope,input,1);await f.billing.dispatched('a');await f.billing.finish('a',null);
  assert.equal(f.state().reserved,13n);assert.equal(f.state().attempts[0].state,'unresolved');
  f.state().failSettlement=true;await assert.rejects(f.billing.finish('a',message));
  assert(f.state().attempts[0].provider_evidence); f.state().failSettlement=false;
  await Promise.all([f.billing.reconcile('a'),f.billing.reconcile('a')]);assert.equal(f.state().spent,2n);assert.equal(f.providerCalls(),0);
  await f.billing.prepare('b',scope,input,2);await f.billing.dispatched('b');
  await assert.rejects(f.billing.finish('b',{...message,id:'different',model:'wrong-model'}));assert.equal(f.state().reserved,13n);
});

test('duplicate logical jobs/revisions cannot dispatch twice; distinct retry attempts are billed individually',async()=>{
  const f=fixture();await f.client.messages.create(input);
  await assert.rejects(f.billing.prepare('duplicate',scope,input,1));
  await f.client.messages.create(input);assert.equal(f.providerCalls(),2);assert.equal(f.state().spent,4n);
  await assert.rejects(f.billing.dispatched('usage-1'));
});

test('simultaneous reservations cannot overdraw the wallet and denial rolls back attempt creation',async()=>{
  const f=fixture();f.state().available=20n;
  const result=await Promise.allSettled([f.billing.prepare('a',scope,input,1),f.billing.prepare('b',scope,input,2)]);
  assert.equal(result.filter(r=>r.status==='fulfilled').length,1);assert.equal(f.state().reserved,13n);assert.equal(f.state().available,7n);assert.equal(f.state().attempts.length,1);
});

test('stream finalization is shared and an interrupted stream keeps its reservation without fabricating success',async()=>{
  const f=fixture();let calls=0;
  const streamed=trackedClient({messages:{stream:()=>{calls++;return {on(){},abort(){},finalMessage:async()=>message};}}},f.store,{...scope,operation:'chat'});
  const stream=await streamed.messages.stream(input);
  await Promise.all([stream.finalMessage(),stream.finalMessage()]);assert.equal(calls,1);assert.equal(f.state().spent,2n);
  const interrupted=trackedClient({messages:{stream:()=>({on(){},abort(){},finalMessage:async()=>{throw new Error('transport lost');}})}},f.store,{...scope,operation:'chat'});
  const broken=await interrupted.messages.stream(input);await assert.rejects(broken.finalMessage());
  assert.equal(f.state().spent,2n);assert.equal(f.state().reserved,13n);assert.equal(f.state().attempts.at(-1).state,'unresolved');
});

test('entitlement query counts organization-wide distinct humans and active divisions; WhatsApp never implied by admin role',async()=>{
  const calls=[];
  await lockBillingEntitlements({execute:async(sql)=>{calls.push(sql);return [[sql.includes('FROM billing_subscriptions')?{maxDivisions:1,maxMembers:2}:sql.startsWith('SELECT\n')?{divisions:1,members:2}:{id:1}]];}},1);
  assert(calls.some(sql=>sql.includes('COUNT(DISTINCT memberships.user_id)') && sql.includes('UNION ALL')));
  assert.throws(()=>enforceCapacity({divisions:1,members:2,maxDivisions:1,maxMembers:2,whatsapp:0},{whatsapp:true}),{status:402});
});

test('011 is registered and additive; schema validator includes unique request, hold, provider ID, foreign keys and state check',async()=>{
  const report=await inspectMigrationDirectory(fileURLToPath(new URL('../migrations',import.meta.url)));
  assert.deepEqual(report.diagnostics,[]);
  const migration=report.migrations.find(m=>m.id==='011_ai_billing_attempts'); assert.match(migration.checksum,/^[a-f0-9]{64}$/);
  assert.doesNotMatch(migration.source,/^\s*(DROP|UPDATE|DELETE|ALTER|INSERT)\b/im);
  const differences=await validateBillingSchema({execute:async()=>[[]]},{aiBilling:true});
  for(const constraint of ['fk_ai_billing_usage','fk_ai_billing_org','fk_ai_billing_hold','ck_ai_billing_final']) assert(differences.some(d=>d.constraint===constraint));
  for(const index of Object.keys(AI_BILLING_CONTRACT.ai_billing_attempts.indexes)) assert(differences.some(d=>d.index===index && d.table==='ai_billing_attempts'));
});
