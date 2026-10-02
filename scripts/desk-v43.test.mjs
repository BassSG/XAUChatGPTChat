import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {alignedDraft,alignedReport,alignedPack} from './fixtures/desk-v43-fixture.mjs';
import {locationReport} from './fixtures/desk-v42-fixture.mjs';
import {fixtureReport} from './fixtures/desk-v4-fixture.mjs';
import {assembleDeskReport} from '../src/desk-generation.js';
import {validateDeskV4} from '../src/desk-v4.js';
import {confirmsM15} from '../src/scenario-archetypes.js';
import {validateIndicatorVerification,INDICATOR_PROFILE} from '../src/indicator-profile.js';
import {derivePriceAction,confirmedSwing} from '../src/price-action.js';
import {spdrFlow} from '../src/desk-enrichment.js';
import {checkDxyCarry} from '../src/dxy-baseline.js';
import {compareDeskReports} from '../src/desk-comparison.js';
import {matchReportEvidence} from '../src/analysis-evidence.js';
import {reviewPlan} from '../src/plan-review.js';
import {deskHtml,deskSvg,locationHtml} from '../src/desk-render.js';
import {scenarioHtml} from '../src/scenario-plan.js';
import {assertProductionReport} from '../src/desk-policy.js';
import {supplementalContext} from './desk-context-cache.mjs';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import {normalizeSpdrHistory,spdrDate,SPDR_ARCHIVE} from '../src/spdr-history.js';
import {validatePublicationEvidence} from '../src/report-accuracy.js';
const clone=structuredClone,iso=t=>new Date(t).toISOString(),sha=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const now=Date.now(),fixed=Date.UTC(2026,9,2,3,1),ms5=300000,ms15=900000;
const ref=(bar,t,frame='M15')=>({symbol:'PEPPERSTONE:XAUUSD',timeframe:frame,closedAt:iso(t),bar});
test('4.3 keeps sell-higher/buy-lower WAIT, actual source state and compact usable plans without execution levels',()=>{
  for(const side of ['BUY','SELL']){
    const r=alignedReport(side,false,now);assert.equal(r.status,'WAIT');assert.equal(r.planLevels,null);assert.equal(r.desk.invalidation.actualStop,null);assert.equal(r.desk.planning.rows[0].stopAnchor.state,'VERIFIED_STRUCTURAL_ANCHOR');
    assert.equal(r.desk.planning.rows[0].netR,null);assert.equal(r.desk.planning.rows[0].entry,null);assert.ok(r.desk.planning.rows[0].targetCandidates.length);assert.ok(r.summary.length);assert.ok([...r.summary].length<=500);
    assert.match(r.desk.practical.primary,side==='SELL'?/รอเด้งขึ้นไปขาย/:/รอย่อลงมาซื้อ/);assert.match(deskHtml(r),/desk-trade-table/);assert.match(locationHtml(r),/แผนหลัก/);assert.equal(r.reviewRules.version,3);
    assert.ok(!r.summary.includes('Pepperstone'));assert.ok(!r.summary.includes('Asia/Bangkok'));
  }
});
test('exact Pine requires both source hash and actual critical Inputs; name alone and stale verification cannot claim it',()=>{
  const v=alignedReport().desk.indicatorVerification;assert.doesNotThrow(()=>validateIndicatorVerification(v,iso(now)));
  for(const mutate of [v=>delete v.inputs.combo_kLength,v=>v.chartSourceSha256='1'.repeat(64),v=>v.verifiedAt=iso(now-8*86400000),v=>v.inputs.combo_kLength=0]){const x=clone(v);mutate(x);assert.throws(()=>validateIndicatorVerification(x,iso(now)));}
  const x=clone(v);x.state='NAME_ONLY';assert.throws(()=>validateIndicatorVerification(x,iso(now)),/name alone/);
  const bad=clone(v);Object.assign(bad,{state:'SOURCE_MISMATCH',referenceCanonicalSha256:'2'.repeat(64)});assert.throws(()=>validateIndicatorVerification(bad,iso(now)),/actual reference/);
  const layout=alignedReport();layout.desk.indicatorVerification.chartUrl='https://www.tradingview.com/chart/other-layout/';assert.throws(()=>validateDeskV4(layout),/actual primary chart/);
});
test('14-3-3 is usable only with verified actual Inputs; 9-3-3 remains a separate study, never silently remapped',()=>{
  const d=alignedDraft();d.desk.indicatorVerification={state:'UNAVAILABLE',reason:'TEST missing source'};assert.throws(()=>assembleDeskReport(d),/Stochastic parameters/);
  d.desk.toolkit.observations.find(o=>o.name==='STOCHASTIC').parameters.k=9;assert.equal(assembleDeskReport(d).status,'WAIT');
  const r=alignedReport();r.desk.toolkit.observations.find(o=>o.name==='STOCHASTIC').value.k=175;assert.throws(()=>validateDeskV4(r),/Stochastic parameters/);
});
test('AMM unavailable cannot be replaced by ordinary candle zones; observed output needs its source provenance',()=>{
  const d=alignedDraft(),ref=d.desk.dailySR.levels[0].evidence[0];d.desk.amm.zones=[{side:'SELL',low:4290,high:4295,purpose:'PULLBACK_SELL',status:'ACTIVE',method:'TEST',evidence:[ref]}];
  assert.throws(()=>assembleDeskReport(d),/AMM unavailable/);
  d.desk.amm.source={state:'OBSERVED_OUTPUT',name:'TEST AMM OUTPUT',sourceUrl:'https://www.tradingview.com/chart/',checkedAt:d.snapshotAt,reason:'TEST ONLY'};
  assert.throws(()=>assembleDeskReport(d),/provenance/);
  d.desk.amm.zones[0].provenance={sourceName:'TEST AMM OUTPUT',observedAt:d.snapshotAt,method:'CHART_LABEL'};assert.equal(assembleDeskReport(d).status,'WAIT');
});
test('closed pivots and FVG are reproducible desk observations; lone extreme, gap and wrong provider fail',()=>{
  const d=alignedDraft(),swing=d.desk.toolkit.observations.find(o=>o.name==='SWING_HIGH');assert.equal(confirmedSwing(swing.evidence,'SELL'),true);assert.equal(confirmedSwing(swing.evidence.slice(1),'SELL'),false);
  const refs=clone(swing.evidence);refs[4].closedAt=iso(Date.parse(refs[4].closedAt)+3600000);assert.equal(confirmedSwing(refs,'SELL'),false);
  const time=Math.floor(now/ms15)*ms15;const bars=[{closedAt:iso(time-2*ms15),open:100,high:102,low:99,close:101},{closedAt:iso(time-ms15),open:102,high:106,low:101,close:105},{closedAt:iso(time),open:105,high:108,low:104,close:107}];
  const items=derivePriceAction({M15:bars},iso(now));assert.equal(items.find(o=>o.name==='FVG').value.low,102);assert.equal(items.find(o=>o.name==='FVG').value.high,104);
  const r=alignedReport();r.desk.toolkit.observations.find(o=>o.name==='SWING_HIGH').value.price=4296;assert.throws(()=>validateDeskV4(r),/swing/);
});
test('zone confluence shows observed overlaps and conflict without changing bias; broken supply cannot strengthen it',()=>{
  const d=alignedDraft(),e=d.desk.dailySR.levels[0].evidence;
  d.desk.toolkit.observations.push({id:'supply',name:'SUPPLY_DEMAND',state:'OBSERVED',value:{side:'BUY',low:4291,high:4294,status:'FRESH'},symbol:'PEPPERSTONE:XAUUSD',timeframe:'H1',observedAt:d.snapshotAt,method:'CHART_LABEL',sourceName:'TEST EBW',sourceUrl:d.evidence.chartUrl,evidence:e,reason:'TEST conflicting demand'});
  let r=assembleDeskReport(d);assert.equal(r.desk.baseline.bias,'SELL');assert.ok(r.desk.zoneEvidence.some(z=>z.items.some(i=>i.observationId==='supply'&&i.relation==='CONTRADICT')));assert.equal(r.status,'WAIT');
  d.desk.toolkit.observations.at(-1).value.status='HISTORICAL';r=assembleDeskReport(d);assert.ok(!r.desk.zoneEvidence.some(z=>z.items.some(i=>i.observationId==='supply')));
});
test('new M15 definitions prove engulfing, failed reclaim and confirmed LH/HL, not gap, wick or M5',()=>{
  const t=Math.floor(now/ms15)*ms15,zone={low:100,high:110};
  const engulf=[ref({open:104,close:108,high:109,low:103},t-ms15),ref({open:109,close:102,high:111,low:101},t)];
  const failed=[ref({open:101,close:105,high:106,low:100},t-ms15),ref({open:105,close:99,high:107,low:98},t)];
  for(const [type,evidence]of [['ENGULFING_CLOSE',engulf],['FAILED_RECLAIM',failed]]){
    const s={side:'SELL',zone,m15Confirmation:{type,evidence}};assert.equal(confirmsM15(s),true,type);assert.equal(confirmsM15(s,evidence.map(r=>({...r,timeframe:'M5'}))),false);assert.equal(confirmsM15(s,evidence.map(r=>({...r,symbol:'OANDA:XAUUSD'}))),false);
    const gap=clone(evidence);gap[0].closedAt=iso(t-2*ms15);assert.equal(confirmsM15(s,gap),false);const wick=clone(evidence);wick.at(-1).bar.close=wick.at(-1).bar.open;assert.equal(confirmsM15(s,wick),false);
  }
  const highs=[105,108,112,108,107,109,106,104,103,101],refs=highs.map((h,i)=>ref({open:i===9?101:100,high:h,low:i===9?96:98,close:i===9?97:100},t-(9-i)*ms15));
  assert.equal(confirmsM15({side:'SELL',zone,m15Confirmation:{type:'SWING_RESUMPTION',evidence:refs}}),true);
  const r=locationReport();r.scenarioPlan.scenarios[0].m15Confirmation.type='ENGULFING_CLOSE';assert.throws(()=>validateDeskV4(r),/4.3/);
});
test('a genuine engulfing M15 reaction WATCH does not require a separate break/retest first',()=>{
  const d=alignedDraft('SELL',true,now),s=d.scenarioPlan.scenarios[0],t=Date.parse(d.evidence.bars.M15.closedAt);
  const evidence=[ref({open:4291,high:4295,low:4290,close:4294},t-ms15),ref({open:4294,high:4296,low:4288,close:4289},t)];
  s.m15Confirmation={type:'ENGULFING_CLOSE',state:'OBSERVED',evidence};d.desk.setup.evidence=evidence;d.evidence.bars.M15={closedAt:iso(t),...evidence[1].bar};
  const r=assembleDeskReport(d);assert.equal(r.status,'WATCH SELL');assert.equal(r.reviewRules.m15.type,'ENGULFING_CLOSE');assert.equal(s.breakPrice,undefined);assert.match(scenarioHtml(r),/กลืนแท่งก่อน/);
  assert.match(r.desk.practical.activeConfirmation,/ยืนยันแล้ว/);assert.match(deskSvg(r),/แผนเข้าแบบมีเงื่อนไข/);
});
test('SPDR needs five verified dated observations; gaps are not zero, stale or conflicting series cannot claim current flow',()=>{
  const r=alignedReport(),h=r.desk.spdr.history;assert.equal(spdrFlow(h,r.snapshotAt).direction,'UP');assert.equal(r.desk.spdr.dailyChange,1);assert.equal(r.desk.spdr.changeFromDate,h.at(-2).dataDate);const wrong=clone(r);wrong.desk.spdr.dailyChange=999;assert.throws(()=>validateDeskV4(wrong),/dated holdings|prior observation date/);assert.equal(spdrFlow(h.slice(-2),r.snapshotAt).direction,'UNKNOWN');assert.equal(spdrFlow([],r.snapshotAt).netChange,null);
  assert.throws(()=>spdrFlow([...h,h[0]],r.snapshotAt),/unique/);const old=h.map(x=>({...x,dataDate:'2026-08-01'}));assert.throws(()=>spdrFlow(old,r.snapshotAt),/unique/);
  const d=alignedDraft();d.desk.spdr.history=d.desk.spdr.history.slice(-2);const p=assembleDeskReport(d);assert.equal(p.desk.spdr.flowBias,'UNKNOWN');Object.assign(p.desk.spdr,{direction:'UP',period:'TEST',flowEvidence:'TEST'});assert.throws(()=>validateDeskV4(p),/SPDR latest|too little/);
});
test('DXY supports actual structural conditions and fresh H1; it cannot be a standalone XAU trigger',()=>{
  const r=alignedReport();r.desk.dxy.conditions[0].price=101.987;assert.throws(()=>validateDeskV4(r),/structural anchor/);
  const d=alignedDraft();d.desk.dxy.frames=d.desk.dxy.frames.filter(f=>f.timeframe!=='H1');d.desk.dxy.assessment.supportingFrames=['D1','H4'];d.desk.dxy.conditions=[];assert.throws(()=>assembleDeskReport(d),/fresh closed H1/);
});
test('DXY carry keeps old HTF times and demands current H1; acceptance/displacement or expiry forces refresh',()=>{
  const r=alignedReport(),candidate={state:'CANDIDATE_NEEDS_CURRENT_H1',frames:r.desk.dxy.frames.filter(f=>f.timeframe!=='H1'),originalObservedAt:r.snapshotAt,refreshAt:iso(now+3600000),originPlanId:r.planId,originEvidenceSha256:'0'.repeat(64)},h1=r.desk.dxy.frames.at(-1);
  assert.equal(checkDxyCarry(candidate,h1,r.snapshotAt).state,'CARRIED');assert.deepEqual(checkDxyCarry(candidate,h1,r.snapshotAt).frames,candidate.frames);
  assert.equal(checkDxyCarry(candidate,null,r.snapshotAt).state,'UNAVAILABLE');assert.equal(checkDxyCarry(candidate,h1,iso(now+3600000)).state,'REFRESH_REQUIRED');
  assert.equal(checkDxyCarry({...candidate,refreshAt:'invalid'},h1,r.snapshotAt).state,'REFRESH_REQUIRED');assert.equal(checkDxyCarry({...candidate,originEvidenceSha256:'unproved'},h1,r.snapshotAt).state,'REFRESH_REQUIRED');
  const outside=clone(h1);for(const x of outside.evidence)x.bar={open:101.35,high:101.6,low:101.3,close:101.5};assert.equal(checkDxyCarry(candidate,outside,r.snapshotAt).state,'REFRESH_REQUIRED');
});
test('news separates fact / inference / gold mechanism; mismatched event context and future context are rejected',()=>{
  const d=alignedDraft();delete d.desk.news.context[0].interpretation;assert.throws(()=>assembleDeskReport(d),/fact \/ inference/);
  d.desk.news.context[0]={kind:'EVENT',eventTitle:'not observed',eventAt:d.snapshotAt,fact:'TEST',interpretation:'TEST',goldMechanism:'TEST',monitor:'TEST',checkedAt:d.snapshotAt,sourceUrl:'https://www.forexfactory.com/calendar'};assert.throws(()=>assembleDeskReport(d),/verified event/);
});
function replay(side='SELL',watch=true){
  const r=alignedReport(side,watch,fixed),p=alignedPack(r),t=Math.floor(fixed/ms15)*ms15;
  r.validUntil=iso(t+3600000);p.capturedAt=iso(t+3600000);p.publication={planId:r.planId,publishedAt:r.snapshotAt,originalReportSha256:sha(r),sourceUrl:'https://example.test/receipt'};
  const buy=side==='BUY';
  const neutral=buy?{open:4276,high:4277,low:4275.5,close:4276}:{open:4289,high:4290,low:4288,close:4289};
  for(let i=1;i<=4;i++)(p.frames.M15||=[]).push({closedAt:iso(t+i*ms15),...neutral});
  for(let i=1;i<=12;i++)(p.frames.M5||=[]).push({closedAt:iso(t+i*ms5),...neutral});
  // First fully-post-publication M5 touches and closes in the intended direction.
  Object.assign(p.frames.M5.find(b=>Date.parse(b.closedAt)===t+2*ms5),buy?{open:4273,high:4276,low:4272,close:4275}:{open:4292,high:4293,low:4289,close:4290});
  Object.assign(p.frames.M5.find(b=>Date.parse(b.closedAt)===t+3*ms5),buy?{open:4274,high:4291,low:4273,close:4290}:{open:4291,high:4292,low:4274,close:4275});
  return {r,p,t};
}
test('archetype replay proves publication M15→M5→next-open→TP with stated costs; WAIT signals never get R',async()=>{
  for(const side of ['BUY','SELL']){const {r,p}=replay(side),result=reviewPlan(r,p);assert.equal(result.resultStatus,'SIMULATED_TP1',result.evidence);assert.ok(result.simulatedR>1.1);assert.deepEqual(result.timeline.map(e=>e.type),['SETUP','TRIGGER','ENTRY','TARGET']);}
  const sample=replay(),folder=await mkdtemp(join(tmpdir(),'xau-v43-review-'));await writeFile(join(folder,'original.json'),JSON.stringify(sample.r));await writeFile(join(folder,'observations.json'),JSON.stringify(sample.p));
  execFileSync(process.execPath,['scripts/review-analysis-plan.mjs','--report',join(folder,'original.json'),'--evidence',join(folder,'observations.json'),'--output',join(folder,'review.json')]);
  const proof=JSON.parse(await readFile(join(folder,'review.json'),'utf8'));assert.equal(proof.reviewMethod,'ARCHETYPE_REPLAY_V3');assert.equal(proof.scenarioRole,'PRIMARY');assert.equal(proof.simulatedR,reviewPlan(sample.r,sample.p).simulatedR);
  const next=alignedReport('SELL',false,now);delete next.testOnly;delete next.dataClass; // In-memory validator test only; never write or publish this object.
  next.priorReview=proof;assert.doesNotThrow(()=>validatePublicationEvidence(next));next.priorReview.reviewMethod='RULE_REPLAY_V1';assert.throws(()=>validatePublicationEvidence(next),/Invalid prior-review event/);
  const {r,p,t}=replay('SELL',false);r.scenarioPlan.scenarios[0].m15Confirmation.state='PENDING';r.scenarioPlan.scenarios[0].m15Confirmation.evidence=[];
  const m15=p.frames.M15.find(b=>Date.parse(b.closedAt)===t+2*ms15);Object.assign(m15,{open:4294,high:4296,low:4288,close:4289});
  Object.assign(p.frames.M5.find(b=>Date.parse(b.closedAt)===t+7*ms5),{open:4292,high:4293,low:4289,close:4290});
  const result=reviewPlan(r,p);assert.equal(result.resultStatus,'SIGNAL_ONLY',result.evidence);assert.equal(result.simulatedR,null);
});
test('replay cannot use a forming pre-publication candle, missing receipt/gaps, or hindsight rules',()=>{
  const {r,p,t}=replay();const noReceipt=clone(p);delete noReceipt.publication;assert.equal(reviewPlan(r,noReceipt).resultStatus,'UNVERIFIABLE');
  const gap=clone(p);gap.frames.M5=gap.frames.M5.filter(b=>Date.parse(b.closedAt)!==t+4*ms5);assert.equal(reviewPlan(r,gap).resultStatus,'UNVERIFIABLE');
  const first=clone(p);first.frames.M5.find(b=>Date.parse(b.closedAt)===t+2*ms5).close=4292;for(let i=3;i<=12;i++)Object.assign(first.frames.M5.find(b=>Date.parse(b.closedAt)===t+i*ms5),{open:4289,high:4290,low:4288,close:4289});
  Object.assign(first.frames.M5.find(b=>Date.parse(b.closedAt)===t+ms5),{open:4292,high:4293,low:4289,close:4290});assert.equal(reviewPlan(r,first).resultStatus,'NO_SIGNAL');
  const changed=clone(r);changed.reviewRules.m5.price=4292;assert.equal(reviewPlan(changed,p).resultStatus,'UNVERIFIABLE');
});
test('replay records ambiguous TP/SL, no-fill gap, and protective Stop instead of inventing winners',()=>{
  const {r,p,t}=replay();let b=p.frames.M5.find(b=>Date.parse(b.closedAt)===t+3*ms5);b.high=4298;assert.equal(reviewPlan(r,p).resultStatus,'AMBIGUOUS');assert.equal(reviewPlan(r,p).simulatedR,null);
  const gap=replay();Object.assign(gap.p.frames.M5.find(b=>Date.parse(b.closedAt)===gap.t+3*ms5),{open:4293,high:4294});assert.equal(reviewPlan(gap.r,gap.p).resultStatus,'NO_FILL');
  const stopped=replay();Object.assign(stopped.p.frames.M5.find(b=>Date.parse(b.closedAt)===stopped.t+3*ms5),{open:4291,high:4298,low:4290,close:4297});const result=reviewPlan(stopped.r,stopped.p);assert.equal(result.resultStatus,'SIMULATED_STOP');assert.equal(result.simulatedR,-1);
});
test('an Alternative selected at publication owns replay; an unselected Alternative is never activated later',()=>{
  const {r,p}=replay('BUY'),d=alignedDraft('BUY',true,fixed),buy=clone(d.scenarioPlan.scenarios[0]);
  const sell=alignedReport('SELL',false,fixed).scenarioPlan.scenarios[0];
  Object.assign(buy,{role:'ALTERNATIVE',setupType:'SUPPORT_REACTION_SCALP',trendRelationship:'COUNTERTREND_SCALP',activateWhen:'COUNTERTREND_CONFIRMED',transition:'TEST ONLY: own support M15 confirmed; limited countertrend scalp'});
  d.desk.baseline.bias='SELL';d.desk.activeScenarioRole='ALTERNATIVE';d.scenarioPlan.scenarios=[sell,buy];d.desk.risk.targetPolicy='NEAREST_OPPOSING_STRUCTURE';
  const out=assembleDeskReport(d);out.validUntil=r.validUntil;p.publication.planId=out.planId;p.publication.originalReportSha256=sha(out);
  const result=reviewPlan(out,p);assert.equal(result.scenarioRole,'ALTERNATIVE');assert.equal(result.resultStatus,'SIMULATED_TP1',result.evidence);assert.match(out.summary,/กำลังตรวจ แผนสำรอง/);assert.match(out.desk.practical.activePlan,/ซื้อ/);
  const changed=clone(out);changed.reviewRules.scenarioRole='PRIMARY';assert.equal(reviewPlan(changed,p).resultStatus,'UNVERIFIABLE');
});
test('private archive exact-matches sources, auxiliary history, DXY and toolkit; tampering or missing source context fails',()=>{
  const r=alignedReport(),p=alignedPack(r);assert.doesNotThrow(()=>matchReportEvidence(r,p));
  for(const field of ['indicatorVerification','spdrHistory','newsContext','dxyConditions']){const bad=clone(p);delete bad.context[field];assert.throws(()=>matchReportEvidence(r,bad),/private archive/);}
});
test('report comparison is explicit and dated, without silently upgrading historical reports or scoring between snapshots',()=>{
  const prior=locationReport('SELL',false,now-3600000),r=alignedReport('BUY',false,now),before=JSON.stringify(prior),comparison=compareDeskReports(prior,r);
  assert.equal(comparison.state,'AVAILABLE');assert.match(comparison.reason,/Bias SELL → BUY/);assert.equal(JSON.stringify(prior),before);assert.equal(prior.desk.architectureVersion,'4.2');assert.equal(compareDeskReports({...prior,schemaVersion:3},r).state,'UNAVAILABLE');
  for(const old of [fixtureReport(),locationReport()]){assert.ok(!deskHtml(old).includes('desk-v4-error'));assert.equal(old.desk.practical,undefined);}
});
test('bounded context cache reuses verified sources/series, excludes fixture reports and preserves dates',async()=>{
  const base=await mkdtemp(join(tmpdir(),'xau-v43-cache-')),repo=join(base,'work/repo'),root=join(base,'outputs/desk-runtime');
  await mkdir(join(repo,'public/reports/archive'),{recursive:true});await mkdir(join(base,'outputs/analysis-evidence'),{recursive:true});await mkdir(root,{recursive:true});
  const r=alignedReport();assert.equal((await supplementalContext({repo,root,now,report:r})).spdrHistory.length,0);
  delete r.testOnly;delete r.dataClass;const p=alignedPack(r),hash=sha(p);r.evidenceArchive.sha256=hash;await writeFile(join(base,'outputs/analysis-evidence',hash+'.json'),JSON.stringify(p));
  const c=await supplementalContext({repo,root,now,report:r});assert.equal(c.spdrHistory.length,5);assert.equal(c.dxyBaseline.state,'CANDIDATE_NEEDS_CURRENT_H1');assert.equal(c.indicatorVerification.state,'EXACT_SOURCE_VERIFIED');assert.equal(c.spdrHistory[0].checkedAt,r.snapshotAt);assert.equal(c.readLimit,24);assert.ok(c.neverCarryAsLive.includes('quote'));
});
test('4.3 CLI validates/renders private WAIT/WATCH and rejects fixture publication; production report bytes unchanged',async()=>{
  const folder=await mkdtemp(join(tmpdir(),'xau-v43-render-')),before=await readFile('public/reports/latest.json'),imageBefore=await readFile('public/reports/latest.png');
  for(const watch of [false,true]){
    const r=alignedReport('SELL',watch),path=join(folder,watch?'watch.json':'wait.json'),png=path.replace('.json','.png');await writeFile(path,JSON.stringify(r));
    execFileSync(process.execPath,['scripts/validate-report.mjs','--input',path]);execFileSync(process.execPath,['scripts/render-analysis-image.mjs','--input',path,'--output',png]);execFileSync(process.execPath,['scripts/validate-report.mjs','--input',path,'--image',png]);
    assert.throws(()=>assertProductionReport(r),/fixtures/);assert.match(deskSvg(r),/แผนผังระดับราคา ไม่ใช่กราฟราคาจริง/);
  }
  assert.deepEqual(await readFile('public/reports/latest.json'),before);assert.deepEqual(await readFile('public/reports/latest.png'),imageBefore);
});

test('formal V4 schema compiles and distinguishes original / 4.2 / 4.3 without silent conversion',async()=>{
  const ajv=new Ajv2020({strict:false,allErrors:true});addFormats(ajv);const validate=ajv.compile(JSON.parse(await readFile('schemas/report-v4.schema.json','utf8')));
  for(const r of [fixtureReport(),locationReport(),alignedReport(),alignedReport('BUY',true)])assert.equal(validate(r),true,JSON.stringify(validate.errors));
  const fresh=alignedReport();for(const path of ['practical','zoneEvidence','planning','indicatorVerification']){const bad=clone(fresh);delete bad.desk[path];assert.equal(validate(bad),false,path);}
  const bad=clone(fresh);bad.desk.indicatorVerification.inputs.lp_view='made up';assert.equal(validate(bad),false);assert.throws(()=>validateDeskV4(bad),/Inputs enum/);
  const legacy=locationReport();legacy.scenarioPlan.scenarios[0].m15Confirmation.type='ENGULFING_CLOSE';assert.equal(validate(legacy),false);
  const old=JSON.parse(await readFile('public/reports/archive/analysis-20260930-021055.json','utf8'));assert.equal(validate(old),false);assert.equal(deskHtml(old),'');assert.equal(old.schemaVersion,3);
});
test('new M15 reaction patterns work symmetrically for BUY, and invalid structural resumption fails',()=>{
  const t=Math.floor(fixed/ms15)*ms15,zone={low:98,high:108},mirror=b=>({open:208-b.open,close:208-b.close,low:208-b.high,high:208-b.low});
  const groups=[['ENGULFING_CLOSE',[{open:104,close:108,high:109,low:103},{open:109,close:102,high:111,low:101}]],['FAILED_RECLAIM',[{open:101,close:105,high:106,low:100},{open:105,close:99,high:107,low:98}]]];
  for(const [type,bars]of groups){const evidence=bars.map((b,i)=>ref(mirror(b),t-(1-i)*ms15));assert.equal(confirmsM15({side:'BUY',zone,m15Confirmation:{type,evidence}}),true);evidence.at(-1).bar.close=evidence.at(-1).bar.open;assert.equal(confirmsM15({side:'BUY',zone,m15Confirmation:{type,evidence}}),false);}
  const highs=[105,108,112,108,107,109,106,104,103,101],refs=highs.map((h,i)=>ref(mirror({open:i===9?101:100,high:h,low:i===9?96:98,close:i===9?97:100}),t-(9-i)*ms15));
  const s={side:'BUY',zone,m15Confirmation:{type:'SWING_RESUMPTION',evidence:refs}};assert.equal(confirmsM15(s),true);refs[5].bar.low=refs[2].bar.low-1;assert.equal(confirmsM15(s),false);
});
test('M5 structure break needs an existing confirmed M5 swing, and remains subordinate to M15',()=>{
  const d=alignedDraft('SELL',false,fixed);d.desk.reviewDefinition.m5.confirmation='STRUCTURE_BREAK';assert.throws(()=>assembleDeskReport(d),/confirmed swing anchor/);
  const t=Date.parse(d.evidence.bars.M5.closedAt)-ms5,refs=[4289,4288,4287,4288,4289].map((low,i)=>ref({open:4290,high:4291,low,close:4290},t-(4-i)*ms5,'M5'));
  Object.assign(d.desk.reviewDefinition.m5,{price:4287,levelEvidence:refs});const r=assembleDeskReport(d);assert.equal(r.status,'WAIT');assert.equal(r.desk.setup.status,'PENDING');assert.doesNotThrow(()=>matchReportEvidence(r,alignedPack(r)));
  r.reviewRules.m5.price=4286;assert.throws(()=>validateDeskV4(r),/confirmed swing anchor/);
});
test('Re-baseline suspends old rules/planning while keeping verified indicator identity as secondary context',()=>{
  const d=alignedDraft('SELL',true,fixed),level=d.desk.dailySR.levels[0],old=d.desk.baseline.checkEvidence[0];level.type='CRITICAL';
  const refs=[{...clone(old),closedAt:iso(Date.parse(old.closedAt)-3600000),bar:{open:4296,high:4303,low:4295,close:4301}},{...clone(old),bar:{open:4301,high:4305,low:4299,close:4303}}];
  d.desk.rebaseline.signals=[{type:'H1_ACCEPTANCE',direction:'ABOVE',levelId:level.id,evidence:refs}];const r=assembleDeskReport(d);
  assert.equal(r.status,'WAIT');assert.equal(r.reviewRules,undefined);assert.equal(r.desk.reviewDefinition,undefined);assert.equal(r.desk.planning.rows.length,0);assert.equal(r.desk.indicatorVerification.state,'EXACT_SOURCE_VERIFIED');assert.equal(r.desk.rebaseline.state,'REQUIRED');
});
test('news embargo / plan expiry / H1-first review are behavioral gates, not decorative fields',()=>{
  const {r,p,t}=replay();r.validUntil=iso(t+ms5);p.publication.originalReportSha256=sha(r);assert.equal(reviewPlan(r,p).resultStatus,'NO_SIGNAL');
  const d=alignedDraft('SELL',true,fixed);d.newsEvents=[{currency:'USD',impact:'HIGH',at:iso(t+3600000),title:'TEST ONLY release',state:'UPCOMING',sourceUrl:'https://www.forexfactory.com/calendar'}];
  const blocked=assembleDeskReport(d);assert.equal(blocked.status,'WAIT');assert.equal(blocked.planLevels,null);assert.match(blocked.summary,/งดเข้า/);
  const np=replay().p;np.publication.planId=blocked.planId;np.publication.originalReportSha256=sha(blocked);assert.equal(reviewPlan(blocked,np).resultStatus,'PENDING');assert.ok(reviewPlan(blocked,np).timeline.some(e=>e.type==='NEWS_FILTER'));assert.equal(reviewPlan(blocked,np).simulatedR,null);
  const draft=alignedDraft('BUY',false,fixed),b=draft.desk.opportunityInputs.continuationScenarios[0];b.breakFrame='H1';draft.desk.scenarioSelection.mode='ANALYST';draft.desk.scenarioSelection.rejectedLocationReason='TEST ONLY: compare the H1 break branch';draft.desk.reviewDefinition.m5.zone={low:b.retestLow,high:b.retestHigh};draft.desk.reviewDefinition.m5.price=4289;draft.scenarioPlan={symbol:'PEPPERSTONE:XAUUSD',asOf:draft.snapshotAt,scenarios:[b]};
  const waiting=assembleDeskReport(draft),hp=alignedPack(waiting);hp.capturedAt=iso(t+3600000);hp.publication={planId:waiting.planId,publishedAt:waiting.snapshotAt,originalReportSha256:sha(waiting),sourceUrl:'https://example.test/receipt'};
  hp.frames.M15=np.frames.M15;hp.frames.M5=np.frames.M5;hp.frames.H1=[];assert.equal(reviewPlan(waiting,hp).resultStatus,'UNVERIFIABLE');assert.match(reviewPlan(waiting,hp).evidence,/H1/);
});
test('official SPDR dates/tonnes are normalized without timezone guessing, holiday zeros or future dates',()=>{
  const raw={dateHeader:'Date',holdingsHeader:'Tonnes of Gold',rows:[{date:'28-Sep-2026',holdings:'1,058.83'},{date:'29-Sep-2026',holdings:'1057.41'},{date:'30-Sep-2026',holdings:'US Holiday'},{date:'01-Oct-2026',holdings:'1056.55'}]},at='2026-10-02T09:00:00+07:00';
  const rows=normalizeSpdrHistory(raw,at);assert.equal(rows.length,3);assert.equal(rows[0].holdings,1058.83);assert.equal(rows.at(-1).dataDate,'2026-10-01');assert.equal(rows.at(-1).checkedAt,at);
  assert.equal(spdrDate('46022'),'2025-12-31');assert.throws(()=>spdrDate('10/01/2026'),/Ambiguous/);assert.throws(()=>spdrDate('31-Sep-2026'),/calendar/);
  assert.throws(()=>normalizeSpdrHistory({...raw,holdingsHeader:'GLD Price'},at),/column/);assert.throws(()=>normalizeSpdrHistory({...raw,rows:[{date:'03-Oct-2026',holdings:1050}]},at),/future/);assert.throws(()=>normalizeSpdrHistory({...raw,rows:[{date:'01-Oct-2026',holdings:0}]},at),/zero/);
  assert.throws(()=>normalizeSpdrHistory({...raw,rows:[raw.rows[0],{...raw.rows[0],holdings:1000}]},at),/Conflicting/);
});
test('official SPDR cache is usable without network, preserves checkedAt and excludes conflicting archive dates',async()=>{
  const base=await mkdtemp(join(tmpdir(),'xau-spdr-cache-')),repo=join(base,'work/repo'),root=join(base,'outputs/desk-runtime');await mkdir(root,{recursive:true});await mkdir(join(repo,'public/reports/archive'),{recursive:true});await mkdir(join(base,'outputs/analysis-evidence'),{recursive:true});
  const r=alignedReport(),history=clone(r.desk.spdr.history);await writeFile(join(root,'spdr-history.json'),JSON.stringify({downloadUrl:SPDR_ARCHIVE,checkedAt:r.snapshotAt,state:'AVAILABLE',history}));
  const c=await supplementalContext({repo,root,now,report:r});assert.equal(c.spdrHistory.length,5);assert.equal(c.spdrHistory[0].checkedAt,r.snapshotAt);
  const output=join(root,'spdr-history.json');const cli=JSON.parse(execFileSync(process.execPath,['scripts/collect-spdr-history.mjs','--output',output],{encoding:'utf8'}));assert.equal(cli.cacheStatus,'HIT');assert.equal(cli.checkedAt,r.snapshotAt);
  const stale=clone(history).map(h=>({...h,dataDate:iso(Date.parse(h.dataDate)-9*86400000).slice(0,10)}));await writeFile(output,JSON.stringify({downloadUrl:SPDR_ARCHIVE,checkedAt:r.snapshotAt,state:'AVAILABLE',history:stale}));const dated=JSON.parse(execFileSync(process.execPath,['scripts/collect-spdr-history.mjs','--output',output],{encoding:'utf8'}));assert.equal(dated.cacheStatus,'HIT');assert.equal(dated.state,'PARTIAL');
  assert.throws(()=>execFileSync(process.execPath,['scripts/collect-spdr-history.mjs','--output','public/reports/fixture-history.json'],{stdio:'pipe'}));
  delete r.testOnly;delete r.dataClass;const pack=alignedPack(r),hash=sha(pack);r.evidenceArchive.sha256=hash;await writeFile(join(base,'outputs/analysis-evidence',hash+'.json'),JSON.stringify(pack));history[0].holdings+=1;await writeFile(output,JSON.stringify({downloadUrl:SPDR_ARCHIVE,checkedAt:r.snapshotAt,state:'AVAILABLE',history}));
  const conflict=await supplementalContext({repo,root,now,report:r});assert.equal(conflict.spdrHistory.length,4);assert.ok(conflict.gaps.some(g=>g.includes('ขัดกัน')));
});
