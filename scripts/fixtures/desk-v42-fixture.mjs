import {fixtureDraft} from './desk-v4-fixture.mjs';
import {LOCATION_POLICY} from '../../src/desk-policy.js';
import {assembleDeskReport} from '../../src/desk-generation.js';
import {scanLocations,locationCandidates} from '../../src/desk-location.js';
// SYNTHETIC: no market observations; never write these reports under public/.
export function locationDraft(side='SELL',watch=false,now=Date.now()){
  const r=fixtureDraft(false,now),d=r.desk;
  r.planId='TEST-V42-'+side+'-'+(watch?'WATCH':'WAIT');
  Object.assign(d,{architectureVersion:'4.2',policyId:LOCATION_POLICY.id,activeScenarioRole:'PRIMARY',scenarioSelection:{mode:watch?'ANALYST':'AUTO',reason:'TEST ONLY: compare location with continuation'},toolkit:{observations:[]}});
  d.news.policyId=LOCATION_POLICY.id;d.baseline.bias=side;d.setup.side=side;
  d.xauSummary='ตัวอย่างทดสอบ: สมมติฐานกรอบใหญ่ '+side+' เพื่อทดสอบแผน ไม่ใช่การวิเคราะห์ตลาดจริง';
  for(const frame of Object.values(d.baseline.frames))frame.structure='โครงสร้างจำลองสำหรับ bias '+side+' · TEST ONLY';
  const upper={...d.baseline.frames.H1.evidence[0],bar:{open:4291,high:4297,low:4290,close:4292}};
  const lower={...d.baseline.frames.H4.evidence[0],bar:{open:4273,high:4275,low:4268,close:4272}};
  d.baseline.frames.H1.evidence=[upper];d.baseline.frames.H4.evidence=[lower];d.baseline.checkEvidence=[upper];r.evidence.bars.H1={closedAt:upper.closedAt,...upper.bar};
  d.dailySR.levels=[{id:'upper',side:'SELL',type:'STRUCTURAL',status:'FRESH',low:4290,high:4295,evidence:[upper]},
    {id:'lower',side:'BUY',type:'STRUCTURAL',status:'TESTED',low:4270,high:4275,evidence:[lower]}];
  d.amm.zones=[];
  const continuation={role:'PRIMARY',side,setupType:'BREAK_RETEST_CONTINUATION',trendRelationship:'WITH_TREND',setupFrame:'M15',triggerFrame:'M5',
    breakFrame:'M15',retestFrame:'M5',breakPrice:side==='SELL'?4275:4290,retestLow:side==='SELL'?4275:4288,retestHigh:side==='SELL'?4277:4290,breakState:'WAITING',
    m15Confirmation:{type:'BREAK_CLOSE',state:'PENDING',evidence:[]},structuralReason:'TEST ONLY: continuation if primary location is missed',confirmation:'M15 เบรกยืนยันก่อน M5 รีเทสต์',invalidation:'พักฉากเมื่อ M15 กลับเข้ากรอบ',evidence:'SYNTHETIC TEST',levelEvidence:[side==='SELL'?lower:upper]};
  d.opportunityInputs={continuationScenarios:[continuation]};r.scenarioPlan=undefined;
  if(watch){
    const buy=side==='BUY',q=r.evidence.quote;
    q.bid=buy?4273.88:4291;q.ask=q.bid+.12;q.spread=.12;
    const m15={symbol:'PEPPERSTONE:XAUUSD',timeframe:'M15',closedAt:r.evidence.bars.M15.closedAt,bar:buy?{open:4273,high:4280,low:4271,close:4276}:{open:4294,high:4296,low:4288,close:4289}};
    r.evidence.bars.M15={closedAt:m15.closedAt,...m15.bar};
    const c=locationCandidates(scanLocations(r)).find(c=>c.side===side),z={low:c.low,high:c.high};
    const primary={role:'PRIMARY',side,setupType:'PULLBACK_CONTINUATION',trendRelationship:'WITH_TREND',candidateId:c.id,zone:z,sourceFrame:c.sourceFrame,sourceLayer:c.sourceLayer,
      setupFrame:'M15',triggerFrame:'M5',m15Confirmation:{type:'REJECTION_CLOSE',state:'OBSERVED',evidence:[m15]},structuralReason:'TEST ONLY: trend location reaction confirmed by closed M15',confirmation:'M15 ปฏิเสธโซนแล้ว รอ M5 หาจังหวะหลังยืนยัน',invalidation:'M15 ยอมรับเสียโซนให้ยกเลิกฉาก',evidence:'SYNTHETIC TEST',levelEvidence:c.evidence};
    r.scenarioPlan={symbol:'PEPPERSTONE:XAUUSD',asOf:r.snapshotAt,scenarios:[primary,{...continuation,role:'ALTERNATIVE',activateWhen:'PRIMARY_INVALIDATED',transition:'ถ้าแผนหลักเสียแล้วโครงสร้างใหญ่ยังใช้ได้ จึงตรวจ continuation'}]};
    Object.assign(d.setup,{status:'CONFIRMED',evidence:[m15],reason:'TEST ONLY: closed M15 rejection confirmed',priceLocation:'IN_ZONE'});
    d.waitZones=[{...z,side,priority:'PRIMARY',purpose:buy?'BUY_PULLBACK':'SELL_PULLBACK',sourceLayer:c.sourceLayer,setupType:primary.setupType,relationToCurrentPrice:'AT_ZONE',condition:primary.confirmation,evidence:c.evidence}];
    const entry=buy?{low:4273,high:4275,reference:4275}:{low:4290,high:4292,reference:4290};
    const stop={kind:'FIXED_VERIFIED',price:buy?4267.5:4297.5,structurePrice:buy?4268:4297,structureAt:(buy?lower:upper).closedAt,buffer:.5};
    const target=buy?4290:4275,cost=.2,risk=Math.abs(entry.reference-stop.price),reward=Math.abs(target-entry.reference);
    r.planLevels={side,entry,stop,targets:[{label:'TP1',price:target}],costPerUnit:cost,costNote:'TEST ONLY: spread + slippage',netR:(reward-cost)/(risk+cost)};
    d.invalidation.actualStop=stop.price;d.risk={stopBasis:'STRUCTURE_FIRST',stopTiming:'PREEXISTING_STRUCTURAL_STOP',stopEvidence:[buy?lower:upper],targetEvidence:[buy?upper:lower]};
    d.trigger.condition='รอ M5 ปฏิกิริยาหลัง M15 ยืนยัน ไม่ใช่สัญญาณที่เกิดแล้ว';
  }
  return r;
}
export const locationReport=(side='SELL',watch=false,now)=>assembleDeskReport(locationDraft(side,watch,now));
