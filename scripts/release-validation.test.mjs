import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fixtureDraft,fixtureReport } from './fixtures/desk-v4-fixture.mjs';
import {locationReport} from './fixtures/desk-v42-fixture.mjs';
import { assembleDeskReport } from '../src/desk-generation.js';
import { validateDeskV4 } from '../src/desk-v4.js';
import { reviewPlan } from '../src/plan-review.js';
const require=createRequire(new URL('../worker/package.json',import.meta.url));
const {Miniflare,convertV4MiniflareOptions}=require('miniflare');
const {build}=require('esbuild');
test('A: strong EBW BUY cannot override bearish HTF',()=>{
  const r=fixtureDraft(true);r.desk.baseline.bias='SELL';r.desk.amm.zones=[];r.scenarioPlan=undefined;
  r.indicatorContext={status:'OK',frames:['H1','M15','M5'].map(timeframe=>({timeframe,buyScore:99,sellScore:1,side:'BUY'}))};
  const result=assembleDeskReport(r);assert.equal(result.status,'WAIT');assert.equal(result.desk.baseline.bias,'SELL');
  assert.match(result.summary,/M15 ขัด/);assert.ok(!result.summary.includes('ตัวอย่าง WATCH'));
});
test('B: countertrend AMM may be retained as FILTERED information but cannot become active BUY',()=>{
  const r=fixtureDraft();r.desk.baseline.bias='SELL';r.scenarioPlan=undefined;
  Object.assign(r.desk.amm.zones[0],{status:'FILTERED',filterReason:'สวน HTF จึงไม่ใช้เป็นสัญญาณเข้า'});
  const result=assembleDeskReport(r);assert.equal(result.status,'WAIT');assert.equal(result.desk.amm.zones[0].status,'FILTERED');
  result.desk.amm.zones[0].status='ACTIVE';assert.throws(()=>validateDeskV4(result),/HTF direction/);
});
test('C: an M5 observed BUY without a confirmed M15 setup is rejected',()=>{
  const r=fixtureDraft();r.desk.trigger.state='OBSERVED';r.desk.trigger.evidence=[{timeframe:'M5',symbol:'PEPPERSTONE:XAUUSD',closedAt:r.evidence.bars.M5.closedAt,bar:r.evidence.bars.M5}];
  assert.throws(()=>assembleDeskReport(r),/M5 trigger must follow/);
});
test('D: DXY contradiction is a filter, never an automatic XAU reversal',()=>{
  const r=fixtureDraft(true);Object.assign(r.desk.dxy,{symbol:'TVC:DXY',state:'CONTRADICT',observedAt:r.snapshotAt,timeframe:'H1',sourceUrl:'https://www.tradingview.com/symbols/TVC-DXY/',structure:'DXY ทดสอบแนวต้าน',reason:'ขัดกับแผนซื้อทอง ต้องติดตามโดยไม่กลับฝั่งอัตโนมัติ'});
  const result=assembleDeskReport(r);assert.equal(result.status,'WATCH BUY');assert.equal(result.desk.dxy.state,'CONTRADICT');
  result.desk.dxy.symbol='FX:EURUSD';assert.throws(()=>validateDeskV4(result),/no currency-pair proxy/);
});
test('unknown data remains unknown; GLD price cannot be labelled holdings',()=>{
  const r=fixtureDraft();r.desk.baseline={id:'UNKNOWN',status:'UNAVAILABLE',bias:'UNAVAILABLE',refreshReason:'ยังอ่าน HTF ไม่ได้',invalidation:'ตรวจใหม่ก่อนใช้',frames:{}};
  r.desk.phase={name:'UNAVAILABLE',location:'UNKNOWN',reason:'ไม่มีหลักฐานพอ'};r.desk.amm.zones=[];r.scenarioPlan=undefined;
  const result=assembleDeskReport(r);assert.equal(result.status,'WAIT');assert.equal(result.desk.spdr.holdings,null);assert.equal(result.desk.phase.name,'UNAVAILABLE');
  result.desk.dxy.value=0;assert.throws(()=>validateDeskV4(result),/substituted value/);delete result.desk.dxy.value;
  Object.assign(result.desk.spdr,{holdings:240,measure:'GLD_PRICE',dataDate:'2026-09-28',sourceUrl:'https://www.spdrgoldshares.com/usa/gld/'});
  assert.throws(()=>validateDeskV4(result),/GLD quote/);
});
test('generator checks market state and primary freshness before creating WATCH',()=>{
  for(const mutate of [r=>r.evidence.marketState='CLOSED',r=>r.evidence.quote.at='2020-01-01T00:00:00Z',r=>r.evidence.newsCheck.status='UNAVAILABLE',r=>r.evidence.bars.M15.closedAt='2020-01-01T00:00:00Z']){
    const r=fixtureDraft(true);mutate(r);assert.equal(assembleDeskReport(r).status,'WAIT');
  }
});
test('all scenario paths reject a third equally-ranked plan',()=>{
  const r=fixtureDraft();r.scenarioPlan.scenarios.push(structuredClone(r.scenarioPlan.scenarios[0]));
  assert.throws(()=>assembleDeskReport(r),/one PRIMARY/);
});
test('an H1 break can precede a confirmed M15 setup without pretending M15 is H1',()=>{
  const r=fixtureDraft(true),h1=r.desk.baseline.frames.H1.evidence[0],s=r.scenarioPlan.scenarios[0];
  s.breakFrame='H1';s.breakClosedAt=h1.closedAt;s.levelEvidence=[h1];
  assert.equal(assembleDeskReport(r).status,'WATCH BUY');
  r.desk.setup.evidence[0].closedAt=new Date(Date.parse(h1.closedAt)-900000).toISOString();
  assert.throws(()=>assembleDeskReport(r),/M15 confirmation/);
});
test('re-baseline clears old observed trigger and replay rules without reviving a ready plan',()=>{
  const r=fixtureDraft(true),h=r.desk.baseline.frames.H1.evidence[0];
  const refs=[{...h,closedAt:new Date(Date.parse(h.closedAt)-3600000).toISOString(),bar:{open:4288,high:4302,low:4287,close:4301}},{...h,bar:{open:4301,high:4304,low:4290,close:4302}}];
  r.desk.rebaseline.signals=[{type:'H1_ACCEPTANCE',direction:'ABOVE',levelId:'critical',evidence:refs}];
  r.reviewRules={version:2};r.desk.trigger.state='OBSERVED';
  const result=assembleDeskReport(r);assert.equal(result.status,'WAIT');assert.equal(result.reviewRules,undefined);assert.equal(result.desk.trigger.state,'UNAVAILABLE');assert.match(result.waitFor,/โครงสร้างใหญ่ใหม่/);
});
test('V3 production replay requires actual publication receipt instead of assumed snapshot entry',()=>{
  const report={schemaVersion:3,snapshotAt:'2026-09-25T10:00:00+07:00',planId:'old',scenarioPlan:{symbol:'PEPPERSTONE:XAUUSD',asOf:'2026-09-25T10:00:00+07:00',scenarios:[{side:'BUY',breakFrame:'M15',retestFrame:'M5',breakPrice:100,retestLow:99,retestHigh:100,breakState:'WAITING',confirmation:'test',invalidation:'test',evidence:'test'}]},reviewRules:{version:1,side:'BUY',confirmation:'RETEST_THEN_CLOSE',confirmationPrice:100,invalidation:{timeframe:'M5',direction:'BELOW',price:98}}};
  const pack={version:1,symbol:'PEPPERSTONE:XAUUSD',capturedAt:'2026-09-25T11:00:00+07:00',chartUrl:'https://www.tradingview.com/chart/',method:'DATA_WINDOW',gaps:[],frames:{}};
  assert.match(reviewPlan(report,pack).evidence,/เวลาเผยแพร่จริง/);
});
test('Worker rejects fixtures, stale data, future Actuals, and invalid V4 before storage; valid shape reaches local D1',async()=>{
  const result=await build({entryPoints:['worker/src/index.js'],bundle:true,write:false,format:'esm',platform:'browser'});
  const mf=new Miniflare(convertV4MiniflareOptions({workers:[{name:'release-test',modules:true,script:result.outputFiles[0].text,d1Databases:['DB'],bindings:{APP_ORIGIN:'https://example.test',REPORT_TOKEN:'TEST-ONLY-NONSECRET'}}]}));
  try{
    const db=await mf.getD1Database('DB');for(const sql of (await readFile('worker/migrations/0001_init.sql','utf8')).split(';').filter(x=>x.trim()))await db.prepare(sql).run();
    const send=body=>mf.dispatchFetch('https://local.test/api/admin/reports',{method:'POST',headers:{Authorization:'Bearer TEST-ONLY-NONSECRET','Content-Type':'application/json'},body:JSON.stringify(body)});
    assert.equal((await send(fixtureReport(true))).status,400);
    assert.equal((await send(locationReport('SELL',true))).status,400);
    const base=fixtureReport(true);delete base.testOnly;delete base.dataClass; // local emulator only
    const stale=structuredClone(base);stale.evidence.quote.at='2020-01-01T00:00:00Z';assert.equal((await send(stale)).status,400);
    const future=structuredClone(base);future.newsEvents=[{title:'test',at:'2999-01-01T00:00:00Z',state:'RELEASED',actual:0,sourceUrl:'https://example.test'}];assert.equal((await send(future)).status,400);
    const conflict=structuredClone(base);conflict.desk.setup.timeframe='M5';assert.equal((await send(conflict)).status,400);
    assert.equal((await db.prepare('SELECT count(*) as n FROM reports').first()).n,0);
    assert.equal((await send(base)).status,201);assert.equal((await db.prepare('SELECT count(*) as n FROM reports').first()).n,1);
    const location=locationReport('SELL',true);delete location.testOnly;delete location.dataClass; // local emulator only
    assert.equal((await send(location)).status,201);assert.equal((await db.prepare('SELECT count(*) as n FROM reports').first()).n,2);
  }finally{await mf.dispose();}
});
