import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {locationDraft,locationReport} from './fixtures/desk-v42-fixture.mjs';
import {fixtureReport,fixtureDraft} from './fixtures/desk-v4-fixture.mjs';
import {assembleDeskReport} from '../src/desk-generation.js';
import {validateDeskV4,deskReadiness,deskEvidenceReferences} from '../src/desk-v4.js';
import {LOCATION_POLICY,DESK_POLICY,newsEmbargo,assertProductionReport,reportPolicy} from '../src/desk-policy.js';
import {scanLocations,chooseLocationScenarios} from '../src/desk-location.js';
import {SETUP_TYPES,confirmsM15} from '../src/scenario-archetypes.js';
import {scenarioHtml,scenarioSvg} from '../src/scenario-plan.js';
import {deskHtml,deskBody,deskSvg,locationHtml} from '../src/desk-render.js';
import {matchReportEvidence} from '../src/analysis-evidence.js';
import {reviewPlan} from '../src/plan-review.js';
import {reportState} from '../src/report-state.js';
import {validatePublicationEvidence} from '../src/report-accuracy.js';
import {diagramLines} from '../src/diagram-text.js';
const testTime=Date.now();
const clone=v=>structuredClone(v);
const watch=(s='SELL')=>locationReport(s,true,testTime);
const wait=(s='SELL')=>locationReport(s,false,testTime);
function packFor(r){
  const frames={};
  for(const ref of [...deskEvidenceReferences(r.desk),...deskEvidenceReferences(r.scenarioPlan)]){
    const bar={closedAt:ref.closedAt,...ref.bar,...(['H4','D1','W1'].includes(ref.timeframe)?{openedAt:new Date(Date.parse(ref.closedAt)-60000).toISOString()}: {})};
    (frames[ref.timeframe]||=[]).push(bar);
  }
  for(const [f,b]of Object.entries(r.evidence.bars)) (frames[f]||=[]).push(b);
  for(const f in frames)frames[f]=[...new Map(frames[f].map(b=>[b.closedAt,b])).values()].sort((a,b)=>Date.parse(a.closedAt)-Date.parse(b.closedAt));
  return {version:2,symbol:'PEPPERSTONE:XAUUSD',capturedAt:r.snapshotAt,chartUrl:r.evidence.chartUrl,method:'DATA_WINDOW',gaps:[],quote:r.evidence.quote,frames};
}
test('location-first selects sell higher / buy lower, continuation is secondary, WAIT retains map',()=>{
  for(const side of ['BUY','SELL']){
    const r=wait(side),s=r.scenarioPlan.scenarios;
    assert.equal(s[0].setupType,'PULLBACK_CONTINUATION');assert.equal(s[1].setupType,'BREAK_RETEST_CONTINUATION');
    assert.equal(r.status,'WAIT');assert.equal(r.planLevels,null);assert.equal(r.targets.length,0);
    assert.equal(r.desk.setup.locationRelation,side==='SELL'?'BELOW_SELL_ZONE':'ABOVE_BUY_ZONE');
    assert.equal(r.desk.waitZones[0].relationToCurrentPrice,side==='SELL'?'ABOVE':'BELOW');
    assert.ok(r.priceMap.levels.some(l=>l.side==='BUY'));assert.ok(r.priceMap.levels.some(l=>l.side==='SELL'));
    assert.ok(!r.priceMap.levels.some(l=>['ENTRY','STOP','TARGET'].includes(l.kind)));
    assert.match(r.candidateEntryZone,/ยังต้องยืนยัน M15/);
  }
});
test('reaction WATCH works from closed M15, existing Stop, without any break fields or EBW',()=>{
  for(const side of ['BUY','SELL']){
    const r=watch(side),s=r.scenarioPlan.scenarios[0];assert.equal(r.status,'WATCH '+side);
    assert.equal(s.breakPrice,undefined);assert.equal(r.desk.trigger.state,'PENDING');
    assert.equal(r.desk.risk.stopTiming,'PREEXISTING_STRUCTURAL_STOP');assert.equal(r.indicatorContext.status,'UNAVAILABLE');
    assert.equal(r.reviewSupport.mode,'UNSUPPORTED_MANUAL');
  }
});
test('all seven archetypes render their own meaning and remain max two scenarios',()=>{
  for(const type of SETUP_TYPES){
    const r=wait(type==='SUPPORT_REACTION_SCALP'?'BUY':'SELL'),s=r.scenarioPlan.scenarios[0];
    r.desk.scenarioSelection.mode='ANALYST';
    if(type==='BREAK_RETEST_CONTINUATION'){r.scenarioPlan.scenarios=[{...r.scenarioPlan.scenarios[1],role:'PRIMARY'}];r.desk.scenarioSelection={mode:'ANALYST',reason:'test',rejectedLocationReason:'test: choose continuation'};}
    else {s.setupType=type;if(['RECOVERY_REBASELINE','REVERSAL_REBASELINE'].includes(type))s.trendRelationship='REVERSAL_REQUIRES_REBASELINE';}
    const out=assembleDeskReport(r);assert.ok(!deskHtml(out).includes('desk-v4-error'));assert.ok(scenarioHtml(out).includes(type));
    assert.match(scenarioSvg(out),/แผนผังระดับราคา/);assert.ok(!deskBody(out).includes('undefined'));
    if(type==='PULLBACK_CONTINUATION')assert.match(scenarioHtml(out),/รอเด้งขึ้นไปขาย/);
  }
  const r=wait();r.scenarioPlan.scenarios.push(clone(r.scenarioPlan.scenarios[0]));assert.throws(()=>validateDeskV4(r),/PRIMARY|1–2/);
});
test('M15 pattern checks prove rejection, sweep, hold, resumption, BOS, and break from OHLC',()=>{
  const ref=bar=>({symbol:'PEPPERSTONE:XAUUSD',timeframe:'M15',closedAt:'2026-10-02T08:00:00Z',bar});
  const cases={REJECTION_CLOSE:[ref({open:105,high:111,low:99,close:99})],SWEEP_RECLAIM:[ref({open:105,high:112,low:98,close:99})],ZONE_HOLD:[ref({open:105,high:109,low:98,close:99})],
    STRUCTURE_RESUMPTION:[{...ref({open:105,high:108,low:99,close:102}),closedAt:'2026-10-02T07:45:00Z'},ref({open:101,high:104,low:97,close:98})],
    BOS_CONFIRMATION:[{...ref({open:105,high:108,low:99,close:102}),closedAt:'2026-10-02T07:45:00Z'},ref({open:101,high:104,low:97,close:98})],BREAK_CLOSE:[ref({open:101,high:102,low:97,close:98})]};
  for(const [type,evidence]of Object.entries(cases)){const s={side:'SELL',zone:{low:100,high:110},breakPrice:100,m15Confirmation:{type,evidence}};assert.equal(confirmsM15(s),true,type);assert.equal(confirmsM15(s,evidence.map(r=>({...r,timeframe:'M5'}))),false);}
  const r=watch();r.scenarioPlan.scenarios[0].m15Confirmation.evidence[0].bar.close=4294;assert.throws(()=>validateDeskV4(r),/confirmation|OHLC/);
});
test('deep retrace and both reaction scalp WATCH paths use M15 reaction; new break path preserves old rules',()=>{
  for(const [side,type]of [['BUY','DEEP_RETRACE_CONTINUATION'],['BUY','SUPPORT_REACTION_SCALP'],['SELL','RESISTANCE_REACTION_SCALP']]){
    const r=locationDraft(side,true,testTime);r.scenarioPlan.scenarios[0].setupType=type;
    assert.equal(assembleDeskReport(r).status,'WATCH '+side);
  }
  const r=fixtureDraft(true),s=r.scenarioPlan.scenarios[0];r.scenarioPlan.scenarios=[s];
  Object.assign(r.desk,{architectureVersion:'4.2',policyId:LOCATION_POLICY.id,activeScenarioRole:'PRIMARY',scenarioSelection:{mode:'ANALYST',reason:'TEST',rejectedLocationReason:'TEST: continuation chosen'}});
  r.desk.news.policyId=LOCATION_POLICY.id;r.desk.amm.zones[0].purpose='PULLBACK_BUY';r.desk.risk.stopTiming='PREEXISTING_STRUCTURAL_STOP';
  Object.assign(s,{setupType:'BREAK_RETEST_CONTINUATION',trendRelationship:'WITH_TREND',setupFrame:'M15',triggerFrame:'M5',m15Confirmation:{type:'BREAK_CLOSE',state:'OBSERVED',evidence:r.desk.setup.evidence}});
  r.reviewRules={version:2,side:'BUY',confirmation:'RETEST_THEN_CLOSE',confirmationPrice:4282,entry:'NEXT_M5_OPEN_WITHIN_ZONE',exit:'FULL_AT_TP1_OR_STOP',invalidation:{timeframe:'M15',direction:'BELOW',price:4278.5}};
  const out=assembleDeskReport(r);assert.equal(out.status,'WATCH BUY');assert.equal(out.reviewRules.version,2);assert.equal(out.reviewSupport.mode,'LEGACY_BREAK_RETEST');
});
test('M5, zone touch, AMM, DXY, or missing structural Stop cannot create a WATCH',()=>{
  for(const mutate of [r=>{r.desk.setup.status='PENDING';},r=>{r.planLevels=null;r.desk.invalidation.actualStop=null;},r=>{r.desk.setup.timeframe='M5';}]){
    const r=locationDraft('SELL',true,testTime);mutate(r);
    if(r.desk.setup.timeframe==='M5')assert.throws(()=>assembleDeskReport(r),/M15 minimum/);else assert.equal(assembleDeskReport(r).status,'WAIT');
  }
  const r=locationDraft('SELL',true,testTime);r.scenarioPlan.scenarios[0].m15Confirmation.state='PENDING';r.scenarioPlan.scenarios[0].m15Confirmation.evidence=[];assert.throws(()=>assembleDeskReport(r),/M15 confirmation/);
});
test('Countertrend is only an opposing major-location Alternative and leaves baseline unchanged',()=>{
  const r=locationDraft('BUY',true,testTime),buy=r.scenarioPlan.scenarios[0],lower=r.desk.dailySR.levels[1];
  const m=clone(buy.m15Confirmation.evidence[0]);m.bar={open:4273,high:4280,low:4271,close:4276};
  const counter={...buy,role:'ALTERNATIVE',setupType:'SUPPORT_REACTION_SCALP',trendRelationship:'COUNTERTREND_SCALP',activateWhen:'COUNTERTREND_CONFIRMED',transition:'TEST: major support M15 reaction, limited scalp'};
  r.desk.baseline.bias='SELL';r.desk.activeScenarioRole='ALTERNATIVE';
  const base=wait().scenarioPlan.scenarios[0];r.scenarioPlan.scenarios=[base,counter];r.desk.risk.targetPolicy='NEAREST_OPPOSING_STRUCTURE';
  const out=assembleDeskReport(r);assert.equal(out.status,'WATCH BUY');assert.equal(out.desk.baseline.bias,'SELL');
  assert.match(out.headline,/แผนสำรอง.*ซื้อ/);assert.ok(!out.headline.includes('รอเด้งขึ้นไปขาย'));
  const bad=clone(out);bad.scenarioPlan.scenarios[0]={...counter,role:'PRIMARY'};bad.scenarioPlan.scenarios=[bad.scenarioPlan.scenarios[0]];assert.throws(()=>validateDeskV4(bad),/primary|Primary/i);
  const weak=clone(out);weak.desk.dailySR.levels.find(l=>l.id===lower.id).type='TACTICAL';assert.throws(()=>validateDeskV4(weak),/source|major/);
});
test('Recovery/Reversal WATCH requires a proven refreshed baseline, not ordinary scenario failure',()=>{
  const r=locationDraft('BUY',true,testTime),s=r.scenarioPlan.scenarios[0];s.setupType='RECOVERY_REBASELINE';s.trendRelationship='REVERSAL_REQUIRES_REBASELINE';
  assert.throws(()=>assembleDeskReport(r),/refreshed baseline/);
  const upper=r.desk.dailySR.levels[0],last=clone(r.desk.baseline.checkEvidence[0]),first=clone(last);
  upper.evidence[0].closedAt=new Date(Date.parse(last.closedAt)-7200000).toISOString();
  const critical={id:'old-critical',type:'CRITICAL',status:'ACTIVE',low:4260,high:4265,evidence:[{...clone(last),closedAt:new Date(Date.parse(last.closedAt)-10800000).toISOString(),bar:{open:4261,high:4265,low:4258,close:4263}}]};
  first.closedAt=new Date(Date.parse(last.closedAt)-3600000).toISOString();first.bar={open:4267,high:4278,low:4266,close:4276};
  last.bar={open:4276,high:4280,low:4274,close:4278};r.desk.baseline.checkEvidence=[last];r.desk.baseline.frames.H1.evidence=[last];r.evidence.bars.H1={closedAt:last.closedAt,...last.bar};
  r.desk.baseline.id='TEST-REFRESH';r.desk.baseline.mode='REFRESH';r.desk.baseline.createdAt=last.closedAt;
  s.baselineTransition={fromBaselineId:'TEST-OLD',toBaselineId:'TEST-REFRESH',confirmedAt:last.closedAt,criticalLevel:critical,signals:[{type:'H1_ACCEPTANCE',direction:'ABOVE',levelId:critical.id,evidence:[first,last]}]};
  assert.equal(assembleDeskReport(r).status,'WATCH BUY');
  s.m15Confirmation.type='BREAK_CLOSE';s.acceptancePrice=critical.high;assert.equal(assembleDeskReport(r).status,'WATCH BUY');
  s.acceptancePrice++;assert.throws(()=>assembleDeskReport(r),/acceptance threshold/);
});
test('Historical levels excluded; missing primary quote suppresses map; conflicting or tampered map rejected',()=>{
  const r=locationDraft('SELL',false,testTime);r.desk.dailySR.levels[0].status='HISTORICAL';assert.equal(scanLocations(r).aboveCandidates.length,0);assert.equal(chooseLocationScenarios(r,scanLocations(r))[0].setupType,'BREAK_RETEST_CONTINUATION');
  delete r.evidence.quote;const out=assembleDeskReport(r);assert.equal(out.priceMap.levels.length,0);assert.equal(out.desk.locationMatrix.state,'UNAVAILABLE');
  const forged=wait();forged.desk.locationMatrix.aboveCandidates[0].high++;assert.throws(()=>validateDeskV4(forged),/differs/);
  const misleading=wait();misleading.priceMap.levels[0].kind='ENTRY';assert.throws(()=>validateDeskV4(misleading),/WAIT/);
  const tunneling=wait();tunneling.scenarioPlan.scenarios=[{...tunneling.scenarioPlan.scenarios[1],role:'PRIMARY'}];tunneling.desk.scenarioSelection={mode:'ANALYST',reason:'test'};
  assert.throws(()=>assembleDeskReport(tunneling),/explain why/);
});
test('Versioned risk/news policy boundaries agree with reasoning, publisher and frontend',()=>{
  const event={currency:'USD',impact:'HIGH',title:'TEST ONLY',at:new Date(testTime+113*60000).toISOString(),state:'UPCOMING',sourceUrl:'https://www.forexfactory.com/calendar'};
  assert.equal(newsEmbargo([event],testTime,LOCATION_POLICY).length,1);assert.equal(newsEmbargo([event],testTime,DESK_POLICY).length,0);
  assert.equal(newsEmbargo([event],Date.parse(event.at)+120*60000,LOCATION_POLICY).length,1);assert.equal(newsEmbargo([event],Date.parse(event.at)+120*60000+1,LOCATION_POLICY).length,0);
  const r=watch();r.newsEvents=[event];assert.ok(deskReadiness(r).reasons.includes('NEWS_EMBARGO'));assert.match(reportState({...r,status:'WAIT'},testTime).title,/ข่าว/);
  assert.throws(()=>validatePublicationEvidence(r),/fixture|TEST|WAIT|blocked/i);
  const localOnly=clone(r);delete localOnly.testOnly;delete localOnly.dataClass;assert.throws(()=>validatePublicationEvidence(localOnly),/NEWS_EMBARGO/);
  const draft=locationDraft('BUY',true,testTime),p=draft.planLevels;p.costPerUnit=(15-1.3*7.5)/2.3;p.netR=1.3;
  const conditional=assembleDeskReport(draft);assert.equal(conditional.status,'WATCH BUY');assert.match(conditional.riskReward,/ต่ำกว่าเกณฑ์/);assert.equal(reportPolicy(conditional).minimumNetR,1.1);
  const localConditional=clone(conditional);delete localConditional.testOnly;delete localConditional.dataClass;assert.equal(validatePublicationEvidence(localConditional),true);
  draft.planLevels.netR=1.09;assert.equal(assembleDeskReport(draft).status,'WAIT');
  assert.equal(reportPolicy(fixtureReport()).id,DESK_POLICY.id);
  assert.equal(reportPolicy({...conditional,schemaVersion:3}).id,DESK_POLICY.id);
});
test('missing Entry/Target/liquidity degrades to useful WAIT without numerical R or invented anchors',()=>{
  for(const mutate of [r=>delete r.planLevels.entry,r=>r.planLevels.targets=[],r=>r.desk.setup.opposingLiquidity='UNKNOWN']){
    const r=locationDraft('SELL',true,testTime);mutate(r);const out=assembleDeskReport(r);assert.equal(out.status,'WAIT');assert.equal(out.planLevels,null);
    assert.equal(out.decision.reason,'STRUCTURE_PENDING');assert.match(out.riskReward,/ยังไม่คำนวณ/);assert.ok(out.priceMap.levels.length);
  }
});
test('V4.2 Re-baseline clears old candidate plans, wait zones, continuation and entry idea',()=>{
  const r=locationDraft('SELL',true,testTime),level=r.desk.dailySR.levels[0],old=r.desk.baseline.checkEvidence[0];
  level.type='CRITICAL';
  const refs=[{...clone(old),closedAt:new Date(Date.parse(old.closedAt)-3600000).toISOString(),bar:{open:4296,high:4303,low:4295,close:4301}},
    {...clone(old),bar:{open:4301,high:4305,low:4299,close:4303}}];
  r.desk.rebaseline.signals=[{type:'H1_ACCEPTANCE',direction:'ABOVE',levelId:level.id,evidence:refs}];
  const out=assembleDeskReport(r);assert.equal(out.status,'WAIT');assert.equal(out.scenarioPlan,undefined);assert.equal(out.desk.waitZones.length,0);
  assert.equal(out.desk.locationMatrix.continuationLevels.length,0);assert.equal(out.desk.phase.name,'TRANSITION');assert.match(out.desk.entryIdea,/โครงสร้างใหญ่ใหม่/);
});
test('AUTO with no suitable archetype clears an incoming ready plan and stale trigger',()=>{
  const r=locationDraft('SELL',true,testTime);r.desk.scenarioSelection.mode='AUTO';r.desk.phase.name='TREND_IMPULSE';r.desk.opportunityInputs.continuationScenarios=[];
  const out=assembleDeskReport(r);assert.equal(out.status,'WAIT');assert.equal(out.planLevels,null);assert.equal(out.scenarioPlan,undefined);assert.equal(out.desk.trigger.state,'UNAVAILABLE');
});
test('Private archive verifies XAU refs and auxiliary DXY/toolkit; unavailable tools never become values',()=>{
  const r=watch(),pack=packFor(r);assert.equal(matchReportEvidence(r,pack),true);
  const h=r.desk.baseline.checkEvidence[0],ema={name:'EMA',state:'OBSERVED',symbol:'PEPPERSTONE:XAUUSD',timeframe:'H1',observedAt:r.snapshotAt,parameters:{period:25},value:4292,method:'TEST Data Window',reason:'TEST ONLY',evidence:[h]};
  r.desk.toolkit.observations=[ema];assert.equal(validateDeskV4(r).eligible,true);assert.throws(()=>matchReportEvidence(r,pack),/Toolkit/);
  pack.context={toolkitObservations:[clone(ema)]};assert.equal(matchReportEvidence(r,pack),true);assert.ok(deskBody(r).includes('EMA H1: OBSERVED · 4292'));
  ema.state='UNAVAILABLE';assert.throws(()=>validateDeskV4(r),/unavailable toolkit/);
  r.desk.toolkit.observations=[];const f={timeframe:'H1',direction:'UP',reason:'TEST closes',sourceUrl:'https://www.tradingview.com/symbols/TVC-DXY/',evidence:[0,1].map((i)=>({symbol:'TVC:DXY',timeframe:'H1',closedAt:new Date(Date.parse(h.closedAt)-(1-i)*3600000).toISOString(),bar:{open:100+i,high:102+i,low:99+i,close:101+i}}))};
  Object.assign(r.desk.dxy,{symbol:'TVC:DXY',state:'CONFIRM',timeframe:'H1',observedAt:r.snapshotAt,sourceUrl:f.sourceUrl,frames:[f],assessment:{xauSide:'SELL',supportingFrames:['H1'],contradictoryFrames:[],reason:'TEST ONLY'}});
  validateDeskV4(r);assert.throws(()=>matchReportEvidence(r,pack),/DXY/);pack.context.dxyFrames=[clone(f)];assert.equal(matchReportEvidence(r,pack),true);
  assert.ok(deskBody(r).includes('H1: UP'));assert.ok(deskBody(r).includes(f.evidence.at(-1).closedAt));
  r.desk.dxy.state='NEUTRAL';assert.throws(()=>validateDeskV4(r),/filter differs/);
});
test('new setup replay explicitly manual/unscored, legacy reports retain original schema semantics',async()=>{
  const r=watch();const result=reviewPlan(r,packFor(r));assert.equal(result.simulatedR,null);assert.match(result.evidence,/ไม่รองรับ replay/);
  const old=fixtureReport();assert.equal(old.desk.architectureVersion,undefined);assert.equal(old.candidateEntryZone,undefined);assert.match(scenarioHtml(old),/เบรก/);
  const v3=JSON.parse(await readFile('public/reports/archive/analysis-20260930-021055.json','utf8'));assert.equal(deskHtml(v3),'');assert.equal(v3.schemaVersion,3);
});
test('private V4.2 WAIT/WATCH validate/render PNG while production hashes and fixture isolation remain intact',async()=>{
  const prod=await readFile('public/reports/latest.json'),dir=await mkdtemp(join(tmpdir(),'xau-v42-'));
  for(const w of [false,true]){const r=locationReport('SELL',w),file=join(dir,w?'watch.json':'wait.json'),png=file+'.png';await writeFile(file,JSON.stringify(r));
    execFileSync(process.execPath,['scripts/validate-report.mjs','--input',file]);execFileSync(process.execPath,['scripts/render-analysis-image.mjs','--input',file,'--output',png]);
    const bytes=await readFile(png);assert.equal(bytes.subarray(1,4).toString(),'PNG');assert.throws(()=>assertProductionReport(r),/fixture|test/i);
    assert.match(deskSvg(r),w?/ขณะนี้อยู่ในโซนเฝ้า SELL/:/โซนเฝ้าขายด้านบน/);assert.ok(locationHtml(r).includes('รอที่ไหน'));
  }
  assert.deepEqual(await readFile('public/reports/latest.json'),prod);
});
test('diagram wrapping preserves Thai combining marks and whole Latin words without dropping text',()=>{
  const text='รอยืนยันปฏิกิริยาที่โซนแล้วตรวจเงื่อนไข tactical structural continuation และสภาพคล่องก่อนเข้า';
  const lines=diagramLines(text,30);assert.equal(lines.join(''),text);
  assert.ok(lines.every(line=>!/^\p{Mark}/u.test(line)));
  for(const word of ['tactical','structural','continuation'])assert.ok(lines.some(line=>line.includes(word)));
});
