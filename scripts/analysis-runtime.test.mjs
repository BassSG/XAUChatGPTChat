import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {baselineCandidate,journalIndex,runBudget,recordRunStage,prepareRun,acknowledgeContracts,CONTRACT_FILES,sha256,nextScheduledAt} from './analysis-runtime.mjs';
import {collectFmpEndpoint,usableCache,requirePrivatePath} from './fmp-cache.mjs';
import {fixtureReport} from './fixtures/desk-v4-fixture.mjs';
import {deskEvidenceReferences} from '../src/desk-v4.js';
import {FRAME_MS} from '../src/analysis-evidence.js';
import {calendarEvents,bangkok,compactFmpContext} from './fmp-context.mjs';
import {RUN_POLICY} from '../src/run-policy.js';

// Every fixture lives in a temporary private workspace. No publisher is invoked.
function candidateFixture() {const r=fixtureReport();delete r.testOnly;delete r.dataClass;return r;}
async function sandbox(t) {
  const base=await mkdtemp(join(tmpdir(),'xau-runtime-test-'));
  t.after(()=>rm(base,{recursive:true,force:true}));
  const repo=join(base,'work','repo'),root=join(base,'outputs','desk-runtime');
  await mkdir(join(repo,'public/reports/archive'),{recursive:true});
  await mkdir(join(base,'outputs/analysis-evidence'),{recursive:true});
  for(const name of CONTRACT_FILES) await writeFile(join(repo,name),'TEST CONTRACT '+name);
  const r=candidateFixture(),frames={};
  for(const ref of deskEvidenceReferences(r.desk)) {
    frames[ref.timeframe] ||= [];
    if(frames[ref.timeframe].some(b=>b.closedAt===ref.closedAt)) continue;
    frames[ref.timeframe].push({closedAt:ref.closedAt,...ref.bar,
      ...(['W1','D1','H4'].includes(ref.timeframe)?{openedAt:new Date(Date.parse(ref.closedAt)-FRAME_MS[ref.timeframe]).toISOString()}:{})});
  }
  for(const bars of Object.values(frames)) bars.sort((a,b)=>Date.parse(a.closedAt)-Date.parse(b.closedAt));
  const pack={version:2,symbol:'PEPPERSTONE:XAUUSD',capturedAt:r.snapshotAt,chartUrl:r.evidence.chartUrl,method:'DATA_WINDOW',frames,quote:r.evidence.quote,gaps:[]};
  const hash=sha256(JSON.stringify(pack));r.evidenceArchive.sha256=hash;
  await writeFile(join(base,'outputs/analysis-evidence',hash+'.json'),JSON.stringify(pack));
  const stamp=new Date(r.snapshotAt).toISOString().slice(0,19).replace(/[-:]/g,'').replace('T','-');
  const originalPath=join(repo,'public/reports/archive','analysis-'+stamp+'.json');
  const reportPath=join(repo,'public/reports/latest.json');
  await writeFile(originalPath,JSON.stringify(r));await writeFile(reportPath,JSON.stringify(r,null,2));
  await writeFile(join(base,'outputs/XAUUSD_Trading_Desk_Journal.md'),'## 20260930-0900-W1\nรอตรวจ\n## 20260930-1430-W1\nPrior review: {"outcome":"ตรวจไม่ได้"}\n');
  return {base,repo,root,r,pack,originalPath,reportPath,now:Date.parse(r.snapshotAt)+60000};
}

test('runtime never considers a fixture, V3, expired or suspended baseline reusable',()=>{
  const now=Date.now(),r=candidateFixture();
  assert.equal(baselineCandidate(fixtureReport(),now).reason,'TEST_REPORT');
  assert.equal(baselineCandidate({...r,schemaVersion:3},now).reason,'NO_V4_BASELINE');
  for(const mutate of [r=>r.desk.baseline.status='SUSPENDED',r=>r.desk.rebaseline.state='REQUIRED',r=>r.desk.baseline.refreshAt='2020-01-01T00:00:00Z',r=>r.desk.baseline.createdAt='2999-01-01T00:00:00Z']) {
    const changed=structuredClone(r);mutate(changed);assert.equal(baselineCandidate(changed,now).state,'REFRESH_REQUIRED');
  }
});
test('an old H1 check requests a new H1 check, not a complete W1/D1/H4 reread',()=>{
  const r=candidateFixture();r.desk.baseline.checkedAt='2020-01-01T00:00:00Z';
  const b=baselineCandidate(r,Date.now());assert.equal(b.state,'CANDIDATE_NEEDS_CURRENT_H1');
  assert.equal(b.baseline.checkedAt,'2020-01-01T00:00:00Z');assert.equal(b.tacticalReuseAllowed,false);
});
test('startup only carries hash-verified structural bars and canonical report origin; no live quote',async t=>{
  const s=await sandbox(t),first=await prepareRun(s),c=first.context;
  assert.equal(c.baseline.state,'CANDIDATE_NEEDS_CURRENT_H1');
  assert.equal(c.baseline.baseline.originReportSha256,sha256(JSON.stringify(s.r)));
  assert.equal(c.baseline.baseline.mode,'CARRY_FORWARD');assert.equal(c.baseline.baseline.checkedAt,s.r.desk.baseline.checkedAt);
  const carry=JSON.parse(await readFile(c.carryEvidence.path,'utf8'));
  assert.equal(carry.capturedAt,s.pack.capturedAt);assert.equal(carry.quote,undefined);
  assert.deepEqual(carry.frames.W1,s.pack.frames.W1);
  assert.ok(c.requiredFresh.some(x=>x.includes('M5')));assert.ok(c.neverCarryAsLive.includes('quote'));
});
test('contract hash is acknowledged only after use; unchanged contract avoids repeated full reads',async t=>{
  const s=await sandbox(t),first=await prepareRun(s);
  assert.equal(first.context.contractsChanged,true);
  assert.equal((await prepareRun(s)).context.contractsChanged,true);
  await acknowledgeContracts(first.context);
  assert.equal((await prepareRun(s)).context.contractsChanged,false);
  await writeFile(join(s.repo,'V4_REASONING_CONTRACT.md'),'CHANGED TEST CONTRACT');
  assert.equal((await prepareRun(s)).context.contractsChanged,true);
});
test('corrupt structural archive or changed original forces HTF refresh without invented observations',async t=>{
  const s=await sandbox(t);
  await writeFile(s.originalPath,JSON.stringify({...s.r,planId:'DIFFERENT_TEST'}));
  let c=(await prepareRun(s)).context;
  assert.equal(c.baseline.state,'REFRESH_REQUIRED');assert.equal(c.carryEvidence.path,null);assert.equal(c.baseline.baseline,undefined);
  await writeFile(s.originalPath,JSON.stringify(s.r));
  await writeFile(join(s.base,'outputs/analysis-evidence',s.r.evidenceArchive.sha256+'.json'),JSON.stringify({...s.pack,gaps:['TAMPERED']}));
  c=(await prepareRun(s)).context;assert.equal(c.baseline.reason,'PRIVATE_STRUCTURAL_EVIDENCE_UNVERIFIABLE');
});
test('missing journal and baseline are explicit gaps; V3 is not silently promoted',async t=>{
  const s=await sandbox(t);await rm(join(s.base,'outputs/XAUUSD_Trading_Desk_Journal.md'));
  await writeFile(s.reportPath,JSON.stringify({...s.r,schemaVersion:3}));
  const c=(await prepareRun(s)).context;
  assert.equal(c.latest.schemaVersion,3);assert.equal(c.baseline.reason,'NO_V4_BASELINE');assert.ok(c.journal.error);assert.equal(c.carryLevels,null);
});
test('journal index keeps every ID and original lines; it does not decide trading outcomes',()=>{
  const entries=journalIndex('## 20260930-0900-W1\nPENDING\n## 20260930-1430-W1\noutcome: ตรวจไม่ได้\n## 20260930-0900-W1\nรอตรวจ');
  assert.equal(entries.length,2);assert.equal(entries[0].line,5);assert.deepEqual(entries[0].previousLines,[1]);assert.equal(entries[0].reviewHint,'PENDING_OR_MENTIONED');assert.equal(entries[0].simulatedR,undefined);
});
test('review text about the prior plan does not resolve the new plan; legacy sections remain indexed',()=>{
  const entries=journalIndex('## แผนรอบ 25 ก.ย. 2026 เวลา 19:00\nรอตรวจ\n## 20260930-1430-W1\nPrior review: {"planId":"20260930-0900-W1","outcome":"ตรวจไม่ได้"}\n### 20260930-1430-W1 refreshed snapshot\nรอตรวจ');
  assert.equal(entries[0].planId,null);assert.equal(entries[0].reviewHint,'HISTORICAL_SECTION');
  assert.equal(entries[1].reviewHint,'PENDING_OR_MENTIONED');assert.deepEqual(entries[1].previousLines,[3]);
  const priorOnly=journalIndex('## 20260930-1430-W1\nPrior review: {"planId":"20260930-0900-W1","outcome":"ตรวจไม่ได้"}');
  assert.equal(priorOnly[0].reviewHint,'CHECK_SECTION');assert.equal(priorOnly[0].reviewForPlanId,'20260930-0900-W1');
});
test('collection budget switches to finalization without bypassing a publication gate',()=>{
  const start='2026-09-30T19:00:00+07:00',ms=Date.parse(start);
  assert.equal(runBudget(start,ms+7*60000).mode,'COLLECT');
  assert.equal(runBudget(start,ms+8*60000).mode,'FINALIZE_AVAILABLE');
  assert.equal(runBudget(start,ms+12*60000).targetExceeded,true);
  assert.match(runBudget(start,ms+12*60000).action,/Never bypass/);
});
test('a blocked source gets one focused retry; budget expiry prohibits additional optional collection',()=>{
  const startedAt='2026-09-30T19:00:00+07:00',now=Date.parse(startedAt)+60000,progress={startedAt,events:[]};
  assert.equal(recordRunStage(progress,'RETRY',now,'PEPPERSTONE').retryAllowed,true);
  const second=recordRunStage(progress,'RETRY',now+1000,'PEPPERSTONE');assert.equal(second.retryAllowed,false);assert.equal(second.retryReason,'RETRY_LIMIT');
  assert.equal(recordRunStage(progress,'RETRY',now+2000,'DXY').retryAllowed,true);
  assert.equal(recordRunStage(progress,'RETRY',Date.parse(startedAt)+8*60000,'EBW').retryAllowed,false);
  assert.throws(()=>recordRunStage(progress,'RETRY',now,'OTHER_PROVIDER'),/known source/);
  const end=recordRunStage(progress,'PUBLISHED',now+60000);assert.equal(progress.totalSeconds,120);assert.equal(end.elapsedSeconds,120);
});
test('private runtime and FMP output paths are rejected inside the repository',()=>{
  const repo=join(tmpdir(),'xau-test-repo');
  assert.throws(()=>requirePrivatePath(repo,repo),/outside/);
  assert.throws(()=>requirePrivatePath(join(repo,'public/cache.json'),repo),/outside/);
  assert.doesNotThrow(()=>requirePrivatePath(repo+'-private/cache.json',repo));
});
test('FMP cache avoids duplicate requests, preserves original fetchedAt and redacts private key',async t=>{
  const s=await sandbox(t),key='FAKE_TEST_KEY_ONLY',cacheRoot=join(s.root,'fmp-cache');let requests=0;
  const fetchImpl=async()=>{requests++;return {ok:true,status:200,json:async()=>[{date:'2026-09-29',year10:4.1,unsafe:key}]};};
  const args={name:'treasury',route:'test?x=1',key,cacheRoot,repo:s.repo,now:s.now,fetchImpl};
  const first=await collectFmpEndpoint(args),second=await collectFmpEndpoint({...args,now:s.now+30000});
  assert.equal(requests,1);assert.equal(second.cacheStatus,'HIT');assert.equal(second.fetchedAt,first.fetchedAt);
  assert.equal(second.ageSeconds,30);assert.ok(!(await readFile(join(cacheRoot,'treasury.json'),'utf8')).includes(key));
  await collectFmpEndpoint({...args,force:true});assert.equal(requests,2);
});
test('expired or future FMP cache cannot masquerade as current data after failed fetch',async t=>{
  const s=await sandbox(t),cacheRoot=join(s.root,'fmp-cache');
  const args={name:'news',route:'test?x=1',key:'FAKE_TEST_KEY',cacheRoot,repo:s.repo,now:s.now,fetchImpl:async()=>({ok:true,status:200,json:async()=>[]})};
  await collectFmpEndpoint(args);
  const expired=await collectFmpEndpoint({...args,now:s.now+RUN_POLICY.fmpTtlMs.news,fetchImpl:async()=>{throw new Error('offline');}});
  assert.equal(expired.status,'UNAVAILABLE');assert.equal(expired.data,undefined);
  assert.equal(usableCache({version:1,name:'news',data:[],fetchedAt:new Date(s.now+1).toISOString(),thaiDay:bangkok(s.now).slice(0,10)},'news',s.now),false);
});
test('calendar cache invalidates across an actual release and Thai midnight; cached Actual remains unverified',()=>{
  const fetched=Date.parse('2026-09-30T11:58:00Z'),row={currency:'USD',event:'TEST',date:'2026-09-30 12:00:00',actual:1};
  const cache={version:1,name:'calendar',fetchedAt:new Date(fetched).toISOString(),thaiDay:'2026-09-30',data:[row]};
  assert.equal(usableCache(cache,'calendar',fetched+60000),true);
  assert.equal(calendarEvents(cache.data,fetched+60000)[0].providerActual,null);
  assert.equal(usableCache(cache,'calendar',fetched+120000),false);
  assert.equal(calendarEvents(cache.data,fetched+120000)[0].state,'UNVERIFIED');
  const midnight=Date.parse('2026-09-30T16:59:00Z');
  assert.equal(usableCache({...cache,fetchedAt:new Date(midnight).toISOString(),data:[]},'calendar',midnight+60000),false);
});
test('news window reaches the next original weekday schedule without waiting for that event',()=>{
  assert.equal(bangkok(nextScheduledAt(Date.parse('2026-09-30T09:00:00+07:00'))),'2026-09-30T14:30:00+07:00');
  assert.equal(bangkok(nextScheduledAt(Date.parse('2026-09-30T14:30:00+07:00'))),'2026-09-30T19:00:00+07:00');
  assert.equal(bangkok(nextScheduledAt(Date.parse('2026-10-02T19:00:00+07:00'))),'2026-10-05T09:00:00+07:00');
});
test('compact FMP output preserves provenance/unverified values, excludes irrelevant dates and retains unknown timestamps',()=>{
  const from=Date.parse('2026-09-30T14:30:00+07:00'),to=Date.parse('2026-09-30T19:00:00+07:00');
  const ctx={collectedAt:'original collection time',endpoints:[{fetchedAt:'original fetch time',cacheStatus:'HIT'}],
    calendar:[{at:'2026-09-29T19:00:00+07:00'},{at:'2026-09-30T18:00:00+07:00',state:'UNVERIFIED',providerActual:0},{at:null,state:'UNVERIFIED'}],
    news:Array.from({length:10},(_,i)=>({title:'TEST '+i,timezoneStatus:'UNVERIFIED'})),treasury:{frequency:'DAILY',rows:[]}};
  const summary=compactFmpContext(ctx,from,to);
  assert.equal(summary.calendar.length,2);assert.equal(summary.calendar[0].state,'UNVERIFIED');assert.equal(summary.calendar[0].providerActual,0);
  assert.equal(summary.endpoints[0].fetchedAt,'original fetch time');assert.equal(summary.news.length,6);assert.equal(summary.scope.newsOmitted,4);assert.equal(ctx.news.length,10);
});
test('wider calendar query cannot be satisfied by a narrower cached window',async t=>{
  const s=await sandbox(t);let requests=0;
  const args={name:'calendar',route:'economic-calendar?from=2026-09-30&to=2026-10-01',key:'FAKE_TEST_KEY',cacheRoot:join(s.root,'fmp-cache'),repo:s.repo,now:s.now,
    fetchImpl:async()=>{requests++;return {ok:true,status:200,json:async()=>[]};}};
  await collectFmpEndpoint(args);await collectFmpEndpoint(args);assert.equal(requests,1);
  await collectFmpEndpoint({...args,route:'economic-calendar?from=2026-09-30&to=2026-10-05'});assert.equal(requests,2);
});
