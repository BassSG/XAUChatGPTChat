import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile,writeFile,mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join,resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import sharp from 'sharp';
import { fixtureDraft,fixtureReport } from './fixtures/desk-v4-fixture.mjs';
import { validateDeskV4,deskReadiness,applyRebaseline,rebaselineReasons,baselineNeedsRefresh,deskEvidenceReferences } from '../src/desk-v4.js';
import { DESK_POLICY,newsEmbargo } from '../src/desk-policy.js';
import { assembleDeskReport } from '../src/desk-generation.js';
import { deskHtml,deskSections,deskSvg } from '../src/desk-render.js';
import { validatePublicationEvidence } from '../src/report-accuracy.js';
import { matchReportEvidence,validateEvidencePack } from '../src/analysis-evidence.js';
import { scenarioHtml } from '../src/scenario-plan.js';
import { reviewPlan } from '../src/plan-review.js';
const copy=structuredClone;
test('V4 WAIT retains all reasoning layers; WATCH works without EBW',()=>{
  const wait=fixtureReport(),watch=fixtureReport(true);
  assert.equal(wait.status,'WAIT');assert.equal(watch.status,'WATCH BUY');
  assert.equal(validateDeskV4(watch).eligible,true);
  for(const id of ['xau','sr','amm','dxy','spdr','news','entry','wait','no-trade','invalidation','trade','conclusion'])assert.ok(deskSections(wait).some(s=>s.id===id));
  // Exercise live publication constraints in memory only, never save/send an unmarked fixture.
  const candidate=copy(watch); delete candidate.testOnly;delete candidate.dataClass;
  assert.equal(validatePublicationEvidence(candidate),true);
});
test('fixture fails publication even with a fresh quote and complete WATCH',()=>{
  assert.throws(()=>validatePublicationEvidence(fixtureReport(true)),/fixtures cannot be published/);
});
test('V3 stays V3 and has no implied V4 baseline',async()=>{
  const old=JSON.parse(await readFile('public/reports/archive/analysis-20260930-021055.json','utf8'));
  assert.equal(old.schemaVersion,3);assert.equal(validateDeskV4(old),null);assert.equal(deskHtml(old),'');
  assert.ok(scenarioHtml(old).includes('M15'));assert.throws(()=>assembleDeskReport(old),/no automatic conversion/);
});
test('missing HTF, future evidence and primary indicator hierarchy are rejected',()=>{
  for(const mutate of [r=>delete r.desk.baseline.frames.W1,r=>r.desk.hierarchy.reverse(),r=>r.desk.baseline.frames.H4.evidence[0].closedAt='2999-01-01T00:00:00Z']){
    const r=fixtureReport(true);mutate(r);assert.throws(()=>validateDeskV4(r));
  }
});
test('carry baseline requires original identity and fresh H1 check, and expires',()=>{
  const r=fixtureReport(true),b=r.desk.baseline;b.mode='CARRY_FORWARD';
  assert.throws(()=>validateDeskV4(r),/original immutable/);
  b.originPlanId='earlier';b.originReportSha256='f'.repeat(64);
  assert.equal(validateDeskV4(r).eligible,true);
  assert.equal(baselineNeedsRefresh(b,new Date(Date.parse(b.refreshAt)+1).toISOString()),true);
  b.checkEvidence[0].closedAt='2020-01-01T00:00:00Z';assert.throws(()=>validateDeskV4(r),/H1 check/);
});
function rebaseFixture(type){
  const r=fixtureDraft(true),end=Date.parse(r.evidence.bars.H1.closedAt),at=t=>new Date(t).toISOString();
  const ref=(time,bar,frame='H1')=>({symbol:'PEPPERSTONE:XAUUSD',timeframe:frame,closedAt:at(time),bar});
  const before=ref(end-7200000,{open:4283,high:4289,low:4282,close:4284});
  const displacement=ref(end-3600000,{open:4286,high:4302,low:4285,close:4301});
  const retest=ref(end,{open:4291,high:4294,low:4289,close:4293});
  const refs=type==='H1_ACCEPTANCE'?[displacement,retest]:type==='STRUCTURE_SHIFT'?[before,displacement]:type==='POST_NEWS_DISPLACEMENT'?[before,displacement]:[displacement,retest];
  if(type==='POST_NEWS_DISPLACEMENT')r.newsEvents=[{currency:'USD',impact:'HIGH',state:'RELEASED',at:at(end-7200000),title:'test'}];
  r.desk.rebaseline.signals=[{type,direction:'ABOVE',levelId:'critical',evidence:refs}];
  return r;
}
for(const type of ['H1_ACCEPTANCE','DISPLACEMENT_RETEST','STRUCTURE_SHIFT','POST_NEWS_DISPLACEMENT'])test(`${type} suspends tactical plans and requires new baseline`,()=>{
  const input=rebaseFixture(type);assert.deepEqual(rebaselineReasons(input.desk,input.newsEvents),[type]);
  const r=assembleDeskReport(input);
  assert.equal(r.status,'WAIT');assert.equal(r.planLevels,null);assert.equal(r.scenarioPlan,undefined);
  assert.equal(r.desk.baseline.status,'SUSPENDED');assert.equal(r.desk.amm.zones[0].status,'HISTORICAL');
  assert.equal(r.desk.dailySR.levels.find(l=>l.type==='TACTICAL').status,'HISTORICAL');
  assert.equal(input.desk.baseline.status,'ACTIVE');
});
test('a single close or intrabar touch does not prove acceptance; tactical invalidation is not a re-baseline',()=>{
  const r=rebaseFixture('H1_ACCEPTANCE');r.desk.rebaseline.signals[0].evidence.pop();
  assert.deepEqual(rebaselineReasons(r.desk),[]);
  const other=fixtureDraft();other.desk.invalidation.tactical.condition='ฉากนี้ล้มเหลว';
  assert.equal(applyRebaseline(other).desk.baseline.status,'ACTIVE');
});
test('Daily SR and AMM cannot create signals; AMM cannot oppose HTF',()=>{
  for(const mutate of [r=>r.desk.dailySR.levels[0].signal='BUY',r=>r.desk.amm.zones[0].entry=4281,r=>r.desk.amm.zones[0].side='SELL']){
    const r=fixtureReport();mutate(r);assert.throws(()=>validateDeskV4(r));
  }
});
test('consolidation midpoint, conflict, spread, extended price, liquidity, missing stop and low R veto WATCH',()=>{
  for(const [code,mutate] of [
    ['CONSOLIDATION_MIDPOINT',r=>Object.assign(r.desk.phase,{name:'CONSOLIDATION',location:'MIDPOINT'})],
    ['HTF_M15_CONFLICT',r=>r.desk.setup.side='SELL'],['ABNORMAL_SPREAD',r=>r.evidence.spreadAssessment='WIDE'],
    ['EXTENDED_ENTRY',r=>r.desk.setup.priceLocation='EXTENDED'],['OPPOSING_LIQUIDITY',r=>r.desk.setup.opposingLiquidity='TOO_CLOSE'],
    ['MISSING_STOP',r=>delete r.planLevels.stop],['LOW_NET_R',r=>r.planLevels.netR=DESK_POLICY.minimumNetR-.01],
    ['M15_PENDING',r=>r.desk.setup.status='PENDING']]){
      const r=fixtureDraft(true);mutate(r);assert.ok(deskReadiness(r).reasons.includes(code));
      const wait=assembleDeskReport(r);assert.equal(wait.status,'WAIT');assert.equal(wait.planLevels,null);
  }
});
test('M5 cannot create M15 setup or be primary break; M1 is optional detail only',()=>{
  for(const mutate of [r=>r.desk.setup.timeframe='M5',r=>r.desk.setup.evidence[0].timeframe='M5',r=>r.scenarioPlan.scenarios[0].breakFrame='M5',r=>r.desk.execution={timeframe:'M1',role:'PRIMARY'}]){
    const r=fixtureReport(true);mutate(r);assert.throws(()=>validateDeskV4(r));
  }
});
test('primary/alternative require order, structural rationale and transition; stops remain separate',()=>{
  for(const mutate of [r=>r.scenarioPlan.scenarios.reverse(),r=>delete r.scenarioPlan.scenarios[1].transition,r=>r.scenarioPlan.scenarios[1].activateWhen='PRIMARY_INVALIDATED',r=>r.desk.invalidation.actualStop=4281,r=>delete r.desk.invalidation.triggerFailure]){
    const r=fixtureReport(true);mutate(r);assert.throws(()=>validateDeskV4(r));
  }
  assert.match(scenarioHtml(fixtureReport()),/แผนหลัก/);assert.match(scenarioHtml(fixtureReport()),/แผนสำรอง/);
});
test('DXY and SPDR cannot make a pending M15 setup actionable',()=>{
  const r=fixtureDraft(false);Object.assign(r.desk.dxy,{symbol:'TVC:DXY',state:'CONFIRM',timeframe:'H1',sourceUrl:'https://www.tradingview.com/symbols/TVC-DXY/',observedAt:r.snapshotAt});
  Object.assign(r.desk.spdr,{measure:'GOLD_HOLDINGS_TONNES',holdings:1000,dataDate:'2026-09-28',sourceUrl:'https://www.spdrgoldshares.com/usa/gld/',flowBias:'INFLOW',direction:'UP',period:'test week',flowEvidence:'test observations'});
  assert.equal(assembleDeskReport(r).status,'WAIT');
  r.desk.spdr.holdings=1000;r.desk.spdr.dailyChange=50;r.desk.spdr.previousHoldings=999;r.desk.spdr.dataDate='2026-09-28';r.desk.spdr.previousDate='2026-09-27';r.desk.spdr.sourceUrl='https://www.spdrgoldshares.com/usa/gld/';
  assert.throws(()=>assembleDeskReport(r),/daily change/);
});
test('one news policy enforces both sides of release, even when Actual confirmed',()=>{
  const r=fixtureReport(true),now=Date.parse(r.snapshotAt);
  for(const delta of [-DESK_POLICY.newsAfterMinutes,DESK_POLICY.newsBeforeMinutes]){
    r.newsEvents=[{currency:'USD',impact:'HIGH',state:'RELEASED',at:new Date(now+delta*60000).toISOString()}];
    assert.equal(newsEmbargo(r.newsEvents,now).length,1);assert.ok(deskReadiness(r).reasons.includes('NEWS_EMBARGO'));
  }
  r.newsEvents[0].at=new Date(now+(DESK_POLICY.newsBeforeMinutes+1)*60000).toISOString();
  assert.equal(newsEmbargo(r.newsEvents,now).length,0);
});
test('structure-first stop cannot be tightened to satisfy R and target needs observation',()=>{
  const r=fixtureReport(true);r.planLevels.stop.structurePrice=4280;assert.throws(()=>validateDeskV4(r),/anchor/);
  const t=fixtureReport(true);t.planLevels.targets[0].price=4500;assert.throws(()=>validateDeskV4(t),/targets/);
});
test('V4 structural references match private evidence, and session HTF bars preserve actual open/close',()=>{
  const r=fixtureReport(true),refs=deskEvidenceReferences(r.desk),frames={};
  for(const ref of refs){frames[ref.timeframe]||=[];if(!frames[ref.timeframe].some(b=>b.closedAt===ref.closedAt))frames[ref.timeframe].push({closedAt:ref.closedAt,openedAt:new Date(Date.parse(ref.closedAt)-3600000).toISOString(),...ref.bar});}
  for(const [f,b]of Object.entries(r.evidence.bars)){frames[f]||=[];if(!frames[f].some(x=>x.closedAt===b.closedAt))frames[f].push(b);}
  Object.values(frames).forEach(b=>b.sort((a,b)=>Date.parse(a.closedAt)-Date.parse(b.closedAt)));
  const pack={version:2,symbol:'PEPPERSTONE:XAUUSD',capturedAt:r.snapshotAt,chartUrl:r.evidence.chartUrl,method:'DATA_WINDOW',frames,gaps:[],quote:r.evidence.quote};
  assert.equal(matchReportEvidence(r,pack),true);r.desk.baseline.frames.W1.evidence[0].bar.high+=1;
  assert.throws(()=>matchReportEvidence(r,pack),/differs/);
  delete pack.frames.W1[0].openedAt;assert.throws(()=>validateEvidencePack(pack),/aligned/);
});
test('HTML escapes all analyst text and SVG contains full risk details',()=>{
  const r=fixtureReport();r.desk.conclusion='<script>alert(1)</script>';
  assert.ok(!deskHtml(r).includes('<script>'));assert.match(deskHtml(r),/&lt;script&gt;/);
  assert.match(deskSvg(r),/Actual Stop/);assert.match(deskSvg(r),/แผนผังระดับราคา ไม่ใช่กราฟราคาจริง/);
});
test('V4 review requires publication receipt and follows entry through expiry to exit',()=>{
  const at=m=>`2026-09-25T10:${String(m).padStart(2,'0')}:00+07:00`;
  const bar=(m,o,h,l,c)=>({closedAt:at(m),open:o,high:h,low:l,close:c});
  const r={schemaVersion:4,planId:'TEST-REVIEW',snapshotAt:at(0),validUntil:at(25),scenarioPlan:{symbol:'PEPPERSTONE:XAUUSD',asOf:at(0),scenarios:[{role:'PRIMARY',side:'BUY',breakFrame:'M15',retestFrame:'M5',breakPrice:101,retestLow:100.5,retestHigh:101,breakState:'WAITING',confirmation:'test',invalidation:'test',evidence:'test'}]},reviewRules:{version:2,side:'BUY',confirmation:'RETEST_THEN_CLOSE',confirmationPrice:101,invalidation:{timeframe:'M5',direction:'BELOW',price:99},entry:'NEXT_M5_OPEN_WITHIN_ZONE',exit:'FULL_AT_TP1_OR_STOP'},planLevels:{side:'BUY',entry:{low:101,high:102},stop:{price:99},targets:[{price:105}],costPerUnit:.2}};
  const pack={version:2,symbol:'PEPPERSTONE:XAUUSD',capturedAt:at(30),chartUrl:'https://www.tradingview.com/chart/',method:'DATA_WINDOW',gaps:[],frames:{M15:[bar(15,100,103,100,102),bar(30,102,106,100,105)],M5:[bar(5,100,101,100,101),bar(10,101,102,100,101),bar(15,101,103,100,102),bar(20,102,103,100.8,101.5),bar(25,101.5,104,101,103),bar(30,103,106,102,105)]}};
  assert.equal(reviewPlan(r,pack).resultStatus,'UNVERIFIABLE');
  pack.publication={planId:r.planId,publishedAt:at(5),originalReportSha256:'f'.repeat(64),sourceUrl:'https://example.com/receipt'};
  const result=reviewPlan(r,pack);assert.equal(result.resultStatus,'SIMULATED_TP1');assert.equal(result.timeline.at(-1).closedAt,at(30));
  pack.publication.publishedAt=at(20);assert.equal(reviewPlan(r,pack).simulatedR,null);
});
test('CLI validates and renders V3 and V4 WAIT/WATCH without changing production',async()=>{
  const before=await readFile('public/reports/latest.json');const dir=await mkdtemp(join(tmpdir(),'xau-v4-'));
  for(const [name,report]of [['wait',fixtureReport()],['watch',fixtureReport(true)],['v3',JSON.parse(before)]]){
    const file=join(dir,name+'.json'),png=join(dir,name+'.png');await writeFile(file,JSON.stringify(report));
    let run=spawnSync(process.execPath,['scripts/validate-report.mjs','--input',file],{encoding:'utf8'});assert.equal(run.status,0,run.stderr);
    run=spawnSync(process.execPath,['scripts/render-analysis-image.mjs','--input',file,'--output',png],{encoding:'utf8'});assert.equal(run.status,0,run.stderr);
    const meta=await sharp(png).metadata();assert.equal(meta.width,1200);assert.ok(meta.height>=1360);
    if(name!=='v3'){run=spawnSync(process.execPath,['scripts/validate-report.mjs','--publish','--input',file],{encoding:'utf8'});assert.notEqual(run.status,0);assert.match(run.stderr,/fixtures cannot be published/);}
  }
  assert.deepEqual(await readFile('public/reports/latest.json'),before);
});
