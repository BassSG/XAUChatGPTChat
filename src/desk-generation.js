import { applyRebaseline, deskReadiness, validateDeskV4, NO_TRADE } from './desk-v4.js';
import { deskBody } from './desk-render.js';
import { attachLocationScan, locationPriceLevels } from './desk-location.js';
import { isLocationDesk, isBreakSetup, scenarioZone, scenarioTitle, zoneText,selectedScenario } from './scenario-archetypes.js';
import { reportPolicy } from './desk-policy.js';
// Input is observed structure + explicit analyst reasoning, never an indicator-score vote.
export function assembleDeskReport(input) {
  if(input.schemaVersion!==4)throw new Error('V4 draft required; no automatic conversion of V3');
  let report=applyRebaseline(input);
  const location=isLocationDesk(report);
  if(location)attachLocationScan(report);
  const ready=deskReadiness(report);
  if(!ready.eligible){
    report.status='WAIT';report.planLevels=null;report.desk.invalidation.actualStop=null;
    const reason=ready.reasons.includes('MARKET_CLOSED')?'MARKET_CLOSED':ready.reasons.includes('REBASELINE')?'REBASELINE':ready.reasons.includes('NEWS_EMBARGO')?'NEWS_RISK':ready.reasons.includes('INSUFFICIENT_EVIDENCE')?'DATA_MISSING':ready.reasons.some(r=>['MISSING_STOP','MISSING_ENTRY','MISSING_TARGET','LIQUIDITY_UNVERIFIED'].includes(r))?'STRUCTURE_PENDING':ready.reasons.includes('M15_PENDING')?'SIGNAL_PENDING':'NO_TRADE';
    report.decision={reason,missing:ready.reasons.map(r=>NO_TRADE[r]),nextAction:report.waitFor};
    for(const code of ready.reasons)if(!report.desk.noTradeZones.some(z=>z.reason===code))report.desk.noTradeZones.push({reason:code,active:true,detail:NO_TRADE[code]});
  }else{
    report.status='WATCH '+report.planLevels.side;
    report.decision={reason:'CONDITIONAL_PLAN',missing:[],nextAction:report.waitFor};
  }
  if(report.status==='WAIT')report.desk.conclusion=`WAIT — ${ready.reasons.map(r=>NO_TRADE[r]).join(' · ')}\nขั้นต่อไป: ${report.waitFor}`;
  if(location){
    const scenarios=report.scenarioPlan?.scenarios||[];
    report.candidateEntryZone=scenarios.map(s=>(s.role==='PRIMARY'?'แผนหลัก':'แผนสำรอง')+': '+scenarioTitle(s)+' '+zoneText(scenarioZone(s))+' · '+(s.m15Confirmation.state==='OBSERVED'?'M15 ยืนยันแล้ว · M5 ตามเงื่อนไข':'ยังต้องยืนยัน M15')).join('\n')||'ยังไม่มีโซนที่ตรวจได้';
    if(report.status==='WAIT')report.desk.conclusion+='\n'+report.candidateEntryZone;
    const supported=scenarios.length&&isBreakSetup(scenarios[0])&&(report.desk.activeScenarioRole||'PRIMARY')==='PRIMARY';
    report.reviewSupport={mode:supported?'LEGACY_BREAK_RETEST':'UNSUPPORTED_MANUAL',reason:supported?'ใช้กติกาเดิมที่เผยแพร่พร้อมแผนเท่านั้น':'ชนิด setup นี้ต้องทบทวนหลักฐานเอง ยังไม่รองรับ replay และไม่นับ R อัตโนมัติ'};
    if(!supported)delete report.reviewRules;
  }
  report.headline=report.status+' — '+Array.from(report.status==='WAIT' ? ready.reasons.map(r=>NO_TRADE[r]).join(' · ') : report.desk.conclusion).slice(0,150).join('');
  report.summary=Array.from(report.desk.conclusion).slice(0,500).join('');
  if(location){
    const scenarios=report.scenarioPlan?.scenarios||[],primary=selectedScenario(report)||scenarios[0];
    report.headline=report.status+' — '+(primary?(primary.role==='ALTERNATIVE'?'แผนสำรอง · ':'')+scenarioTitle(primary)+' '+zoneText(scenarioZone(primary)):ready.reasons.map(r=>NO_TRADE[r]).slice(0,2).join(' · '));
    report.summary=Array.from([report.desk.baseline.bias+' · '+report.desk.phase.name,
      ...scenarios.map(s=>(s.role==='PRIMARY'?'หลัก: ':'สำรอง: ')+scenarioTitle(s)+' '+zoneText(scenarioZone(s))),
      report.status==='WAIT'?ready.reasons.map(r=>NO_TRADE[r]).slice(0,2).join(' · '):'M15 ยืนยันแล้ว · ตรวจ M5 ตามแผนและความเสี่ยงล่าสุด'].join('\n')).slice(0,500).join('');
    if(report.testOnly)report.headline='ตัวอย่างทดสอบ · '+report.headline;
  }
  report.planState=report.desk.rebaseline.state==='REQUIRED'?'พักแผนเพื่อประเมินโครงสร้างใหม่':report.status==='WAIT'?'รอเงื่อนไขครบ':'แผนมีเงื่อนไข · รอ trigger';
  const p=report.planLevels;
  if(location&&report.desk.risk)report.desk.risk.quality=!p?'UNAVAILABLE':p.netR>=reportPolicy(report).preferredNetR?'PREFERRED':'CONDITIONAL';
  const n=v=>v.toLocaleString('en-US',{maximumFractionDigits:3});
  report.bias=report.desk.baseline.bias+' · '+report.desk.phase.reason;
  report.entryZone=p?`โซนเข้า ${n(p.entry.low)}–${n(p.entry.high)}`:'รอโครงสร้างและเงื่อนไขครบก่อนกำหนดจุดเข้า';
  report.trigger=report.desk.trigger.condition;
  report.invalidation=report.desk.invalidation.tactical.condition;
  report.stop=p?`Stop ${n(p.stop.price)} ตาม swing ${n(p.stop.structurePrice)} รวม buffer ${n(p.stop.buffer)}`:'ยังไม่มี Stop พร้อมใช้';
  report.targets=p?p.targets.map(t=>`${t.label} ${n(t.price)}`):[];
  report.riskReward=p?`ประมาณ ${p.netR.toFixed(2)}R สุทธิหลังต้นทุน ${n(p.costPerUnit)}`:'ยังไม่คำนวณ R:R เพราะ Entry / Stop / Target ไม่ครบพร้อมใช้';
  if(location&&p)report.riskReward+=` · ${p.netR>=reportPolicy(report).preferredNetR?'ผ่านเกณฑ์ที่ต้องการ':'ผ่านขั้นต่ำ แต่ต่ำกว่าเกณฑ์ที่ต้องการ'}`;
  report.priceMap={banner:report.headline,levels:p?[{kind:'ENTRY',price:`${n(p.entry.low)}–${n(p.entry.high)}`,label:'โซนเข้า'},{kind:'STOP',price:n(p.stop.price),label:'Stop ตามโครงสร้าง'},{kind:'TARGET',price:n(p.targets[0].price),label:'เป้าแรก'}]:[],scenarios:[],context:report.newsRisk};
  if(location)report.priceMap.levels=p?[...report.priceMap.levels,...locationPriceLevels(report)].slice(0,7):locationPriceLevels(report);
  validateDeskV4(report);
  report.body=deskBody(report);
  return report;
}
