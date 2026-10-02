import {locationDraft} from './desk-v42-fixture.mjs';
import {assembleDeskReport} from '../../src/desk-generation.js';
import {INDICATOR_PROFILE} from '../../src/indicator-profile.js';
import {derivePriceAction} from '../../src/price-action.js';
import {deskEvidenceReferences} from '../../src/desk-v4.js';
const clone=structuredClone,iso=t=>new Date(t).toISOString();
// SYNTHETIC TEST FIXTURES. Publication boundaries must reject these objects.
export function alignedDraft(side='SELL',watch=false,now=Date.now()){
  const r=locationDraft(side,watch,now),d=r.desk,buy=side==='BUY';
  d.architectureVersion='4.3';r.planId='TEST-V43-'+side+'-'+(watch?'WATCH':'WAIT');
  d.indicatorVerification={state:'EXACT_SOURCE_VERIFIED',profileId:INDICATOR_PROFILE.id,referenceFileSha256:INDICATOR_PROFILE.fileSha256,
    referenceCanonicalSha256:INDICATOR_PROFILE.canonicalSha256,chartSourceSha256:INDICATOR_PROFILE.canonicalSha256,
    symbol:'PEPPERSTONE:XAUUSD',chartUrl:r.evidence.chartUrl,verifiedAt:r.snapshotAt,inputs:clone(INDICATOR_PROFILE.defaults),reason:'TEST ONLY: simulated chart verification, never a real UI read'};
  d.amm.source={state:'UNAVAILABLE',reason:'TEST ONLY: no AMM formula/output'};
  if(!watch)d.risk={stopBasis:'STRUCTURE_FIRST',stopTiming:'UNAVAILABLE',stopEvidence:d.dailySR.levels[buy?1:0].evidence,targetEvidence:d.dailySR.levels[buy?0:1].evidence};
  const hour=Math.floor(now/3600000)*3600000;
  const bars=Array.from({length:5},(_,i)=>({closedAt:iso(hour-(6-i)*3600000),
    open:buy?4273:4291,close:buy?4272:4292,high:buy?4275:[4294,4295,4297,4295,4294][i],low:buy?[4271,4270,4268,4270,4271][i]:4287}));
  d.toolkit={observations:derivePriceAction({H1:bars},r.snapshotAt)};
  d.toolkit.observations.push({id:'stochastic-M15',name:'STOCHASTIC',state:'OBSERVED',symbol:'PEPPERSTONE:XAUUSD',timeframe:'M15',
    observedAt:r.snapshotAt,method:'DATA_WINDOW',parameters:{k:14,smooth:3,d:3},value:{k:61,d:59},reason:'TEST ONLY: raw 0-100 actual-input study',
    evidence:[{symbol:'PEPPERSTONE:XAUUSD',timeframe:'M15',closedAt:r.evidence.bars.M15.closedAt,bar:Object.fromEntries(['open','high','low','close'].map(k=>[k,r.evidence.bars.M15[k]]))}]});
  const frame=(timeframe,interval)=>({timeframe,direction:buy?'DOWN':'UP',sourceUrl:'https://www.tradingview.com/symbols/TVC-DXY/',reason:'TEST ONLY: directional closed structural context',
    evidence:[0,1].map(i=>({symbol:'TVC:DXY',timeframe,closedAt:iso(hour-(2-i)*interval),bar:{open:101.14,high:101.3,low:101.0,close:buy?101.2-i*.1:101.1+i*.1}}))});
  d.dxy={role:'CONFIRMATION_FILTER',symbol:'TVC:DXY',state:'CONFIRM',timeframe:'H1',observedAt:r.snapshotAt,structure:'TEST ONLY: DXY structure',reason:'TEST ONLY: filter, never a gold trigger',sourceUrl:'https://www.tradingview.com/symbols/TVC-DXY/',frames:[frame('D1',86400000),frame('H4',14400000),frame('H1',3600000)],
    assessment:{xauSide:side,supportingFrames:['D1','H4','H1'],contradictoryFrames:[],reason:'TEST ONLY: align all cited frames'},conditions:[{timeframe:'H1',direction:buy?'BELOW':'ABOVE',price:buy?101.0:101.3,effect:'CONFIRM',reason:'TEST ONLY: close beyond cited structural extreme'}]};
  const date=Date.parse(r.snapshotAt.slice(0,10));
  d.spdr.history=Array.from({length:5},(_,i)=>({dataDate:iso(date-(4-i)*86400000).slice(0,10),holdings:1000+i,checkedAt:r.snapshotAt,sourceUrl:'https://www.spdrgoldshares.com/usa/historical-data/'}));
  d.news.context=[{kind:'YIELD',dataDate:r.snapshotAt.slice(0,10),fact:'TEST ONLY: ข้อมูลยีลด์สมมติสำหรับทดสอบ',interpretation:'ตัวอย่างการตีความ แยกจากข้อเท็จจริง',goldMechanism:'ยีลด์เป็นบริบทต้นทุนถือทอง ไม่ใช่ M5 trigger',monitor:'ติดตาม DXY และ M15 ตามหลักฐานจริง',checkedAt:r.snapshotAt,sourceUrl:'https://home.treasury.gov/resource-center-data-chart-center/interest-rates'}];
  d.invalidation.tactical={timeframe:'M15',price:buy?4270:4296,condition:buy?'M15 ปิดต่ำกว่า 4,270 ยกเลิกแผน':'M15 ปิดเหนือ 4,296 ยกเลิกแผน',evidence:d.dailySR.levels[buy?1:0].evidence};
  d.reviewDefinition={m5:{confirmation:'TOUCH_THEN_DIRECTIONAL_CLOSE',price:buy?4274:4291,zone:buy?{low:4270,high:4275}:{low:4290,high:4295},reason:'TEST ONLY: explicit threshold published before replay'},invalidation:{timeframe:'M15',direction:buy?'BELOW':'ABOVE',price:buy?4270:4296}};
  d.trigger.condition=buy?'M15 ยืนยันก่อน → M5 แตะ 4,270–4,275 แล้วปิดเขียวเหนือ 4,274':'M15 ยืนยันก่อน → M5 แตะ 4,290–4,295 แล้วปิดแดงต่ำกว่า 4,291';
  r.waitFor=d.trigger.condition;
  return r;
}
export const alignedReport=(side='SELL',watch=false,now)=>assembleDeskReport(alignedDraft(side,watch,now));
export function alignedAlternativeReport(now=Date.now()){
  const d=alignedDraft('BUY',true,now),buy=clone(d.scenarioPlan.scenarios[0]);
  const sell=alignedReport('SELL',false,now).scenarioPlan.scenarios[0];
  Object.assign(buy,{role:'ALTERNATIVE',setupType:'SUPPORT_REACTION_SCALP',trendRelationship:'COUNTERTREND_SCALP',activateWhen:'COUNTERTREND_CONFIRMED',transition:'TEST ONLY: M15 ที่แนวรับยืนยันครบ ให้ตรวจแผนซื้อสวนแนวโน้มเฉพาะเป้าใกล้'});
  d.desk.baseline.bias='SELL';d.desk.activeScenarioRole='ALTERNATIVE';d.scenarioPlan.scenarios=[sell,buy];d.desk.risk.targetPolicy='NEAREST_OPPOSING_STRUCTURE';
  return assembleDeskReport(d);
}
export function alignedPack(r){
  const frames={};
  for(const ref of [...deskEvidenceReferences(r.desk),...deskEvidenceReferences(r.scenarioPlan)]){
    const b={closedAt:ref.closedAt,...ref.bar,...(['H4','D1','W1'].includes(ref.timeframe)?{openedAt:iso(Date.parse(ref.closedAt)-60000)}:{})};
    (frames[ref.timeframe]||=[]).push(b);
  }
  for(const [frame,b]of Object.entries(r.evidence.bars))(frames[frame]||=[]).push(b);
  for(const f in frames)frames[f]=[...new Map(frames[f].map(b=>[b.closedAt,b])).values()].sort((a,b)=>Date.parse(a.closedAt)-Date.parse(b.closedAt));
  return {version:2,symbol:'PEPPERSTONE:XAUUSD',capturedAt:r.snapshotAt,chartUrl:r.evidence.chartUrl,method:'DATA_WINDOW',quote:r.evidence.quote,gaps:[],frames,
    context:{indicatorVerification:r.desk.indicatorVerification,ammSource:r.desk.amm.source,toolkitObservations:r.desk.toolkit.observations,
      spdrHistory:r.desk.spdr.history,dxyFrames:r.desk.dxy.frames,dxyConditions:r.desk.dxy.conditions,newsContext:r.desk.news.context}};
}
