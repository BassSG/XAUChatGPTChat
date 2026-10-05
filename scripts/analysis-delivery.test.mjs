import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createRequire} from 'node:module';
import {validateRunFailure,runFailureView} from '../src/analysis-run-state.js';
import {deliverPush} from '../worker/src/push-delivery.js';
import {queueAnalysisFailure} from './notify-analysis-failure.mjs';
import {sendWorkerPublication} from './send-worker-publication.mjs';
const require=createRequire(new URL('../worker/package.json',import.meta.url));
const {Miniflare,convertV4MiniflareOptions}=require('miniflare'),{build}=require('esbuild');
const failure=()=>({runId:'test-run-private-123',startedAt:new Date().toISOString(),status:'FAILED',code:'EVIDENCE_MISMATCH'});
async function environment(t){
  const result=await build({entryPoints:['worker/src/index.js'],bundle:true,write:false,format:'esm',platform:'browser'});
  const mf=new Miniflare(convertV4MiniflareOptions({workers:[{name:'delivery-test',modules:true,script:result.outputFiles[0].text,d1Databases:['DB'],bindings:{APP_ORIGIN:'https://example.test',APP_URL:'https://example.test/app/',REPORT_TOKEN:'LOCAL-TEST-ONLY'}}]}));
  t.after(()=>mf.dispose());const DB=await mf.getD1Database('DB');
  for(const name of ['0001_init.sql','0005_analysis_delivery.sql'])for(const sql of (await readFile('worker/migrations/'+name,'utf8')).split(';').filter(s=>s.trim()))await DB.prepare(sql).run();
  const add=async endpoint=>DB.prepare('INSERT INTO push_subscriptions (endpoint,p256dh,auth,created_at,updated_at) VALUES (?,?,?,?,?)').bind(endpoint,'test-key','test-auth',new Date().toISOString(),new Date().toISOString()).run();
  return {mf,DB,add};
}
test('status contract forbids prices, secrets, arbitrary errors and future starts; newer reports clear the failure banner',()=>{
  const f=failure();assert.equal(validateRunFailure(f).status,'FAILED');
  for(const bad of [{...f,body:'unvalidated prices'},{...f,error:'secret'},{...f,code:'raw error'},{...f,status:'WAIT'},{...f,startedAt:'2999-01-01T00:00:00Z'}])assert.throws(()=>validateRunFailure(bad));
  assert.match(runFailureView(f,{snapshotAt:'2020-01-01T00:00:00Z'}).message,/รอบก่อน/);
  assert.equal(runFailureView(f,{snapshotAt:f.startedAt}),null);
  assert.match(runFailureView({...f,code:'DELIVERY_FAILED'},{snapshotAt:f.startedAt}).message,/รายงานพร้อมอ่าน/);
  assert.equal(runFailureView({...f,code:'DELIVERY_FAILED'},{snapshotAt:new Date(Date.parse(f.startedAt)+1).toISOString()}),null);
});
test('operational failure needs admin authorization, never writes a market report, and is immutable',async t=>{
  const {mf,DB}=await environment(t),f=failure();
  const send=(value,token='LOCAL-TEST-ONLY')=>mf.dispatchFetch('https://local.test/api/admin/analysis-runs',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(value)});
  assert.equal((await send(f,'wrong')).status,401);
  assert.equal((await send({...f,error:'private raw error'})).status,400);
  assert.equal((await send(f)).status,200);
  assert.equal((await send(f)).status,200);
  assert.equal((await send({...f,code:'PUBLICATION_FAILED'})).status,409);
  assert.equal((await DB.prepare('SELECT COUNT(*) n FROM reports').first()).n,0);
  assert.equal((await DB.prepare('SELECT COUNT(*) n FROM analysis_run_status').first()).n,1);
  const view=await (await mf.dispatchFetch('https://local.test/api/analysis-runs/latest')).json();
  assert.equal(view.run.code,f.code);assert.equal(view.run.error,undefined);
});
test('only failed devices retry; accepted pushes are idempotent and expired endpoints are removed',async t=>{
  const {DB,add}=await environment(t);await add('https://example.test/ok');await add('https://example.test/transient');await add('https://example.test/expired');
  const calls=new Map();const send=async(env,sub)=>{const n=(calls.get(sub.endpoint)||0)+1;calls.set(sub.endpoint,n);if(sub.endpoint.endsWith('expired'))return false;if(sub.endpoint.endsWith('transient')&&n===1)throw new Error('local test outage');return true;};
  const first=await deliverPush({DB},'test-key',{title:'TEST ONLY'},{send});
  assert.deepEqual(first,{registered:3,delivered:1,failed:1,removed:1,alreadyDelivered:0});
  const next=await deliverPush({DB},'test-key',{title:'TEST ONLY'},{send});
  assert.deepEqual(next,{registered:2,delivered:2,failed:0,removed:0,alreadyDelivered:1});
  assert.equal(calls.get('https://example.test/ok'),1);assert.equal(calls.get('https://example.test/expired'),1);
  await deliverPush({DB},'test-key',{title:'TEST ONLY'},{send});assert.equal(calls.get('https://example.test/transient'),2);
});
test('a concurrent duplicate cannot send the same successful endpoint twice; persistent failures stop after three attempts',async t=>{
  const {DB,add}=await environment(t);await add('https://example.test/one');let sent=0;
  await Promise.all(Array.from({length:4},()=>deliverPush({DB},'same-run',{title:'TEST ONLY'},{send:async()=>{sent++;return true;}})));
  assert.equal(sent,1);
  let failed=0;for(let n=0;n<5;n++)await deliverPush({DB},'failure-run',{title:'TEST ONLY'},{send:async()=>{failed++;throw new Error('test');}});
  assert.equal(failed,3);
});
test('failure dispatch queues once using sanitized run metadata; failed dispatch remains visible and can be retried',async t=>{
  const runDir=await mkdtemp(join(tmpdir(),'xau-alert-test-'));t.after(()=>rm(runDir,{recursive:true,force:true}));
  const context={runDir,progressPath:join(runDir,'progress.json')};await writeFile(context.progressPath,JSON.stringify({startedAt:new Date().toISOString()}));
  let calls=0;const args=[];let receipt=await queueAnalysisFailure(context,{dispatchImpl:async()=>{throw new Error('secret raw error');}});
  assert.equal(receipt.state,'QUEUE_FAILED');assert.ok(!JSON.stringify(receipt).includes('secret raw error'));
  const dispatchImpl=async a=>{calls++;args.push(...a);};receipt=await queueAnalysisFailure(context,{dispatchImpl});
  assert.equal(receipt.state,'QUEUED');assert.equal(receipt.deliveryVerified,false);
  await queueAnalysisFailure(context,{dispatchImpl});assert.equal(calls,1);assert.ok(!args.join(' ').includes(runDir));
});
test('CI retries bounded delivery failures, treats zero devices and expired devices as incomplete, and does not log secrets',async()=>{
  let calls=0;const result=await sendWorkerPublication({url:'https://example.test',token:'TEST ONLY',payload:failure(),failure:true,wait:async()=>{},fetchImpl:async()=>new Response(JSON.stringify({ok:true,notifications:{registered:2,delivered:++calls===1?1:2,failed:calls===1?1:0,removed:0}}),{status:200})});
  assert.equal(calls,2);assert.equal(result.notifications.delivered,2);
  for(const n of [{registered:0,delivered:0,failed:0,removed:0},{registered:3,delivered:2,failed:0,removed:1}])await assert.rejects(()=>sendWorkerPublication({url:'https://example.test',token:'TEST ONLY',payload:failure(),failure:true,wait:async()=>{},fetchImpl:async()=>new Response(JSON.stringify({ok:true,notifications:n}),{status:200})}),/incomplete/);
  calls=0;await assert.rejects(()=>sendWorkerPublication({url:'https://example.test',token:'TEST ONLY',payload:failure(),failure:true,wait:async()=>{},fetchImpl:async()=>{calls++;return new Response('{}',{status:401});}}),/HTTP 401/);assert.equal(calls,1);
});
