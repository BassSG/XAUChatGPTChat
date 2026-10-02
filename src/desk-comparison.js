import {scenarioZone,zoneText} from './scenario-archetypes.js';
import {validateDeskV4} from './desk-v4.js';
// Comparing snapshots is not replay and never claims a signal happened between them.
export function compareDeskReports(previous,current){
  if(!previous||previous.testOnly!==current.testOnly||previous.schemaVersion!==4)return {state:'UNAVAILABLE',reason:'ไม่มีรายงานกรอบเดียวกันที่ตรวจได้สำหรับเทียบ'};
  try{validateDeskV4(previous);}catch{return {state:'UNAVAILABLE',reason:'รายงานก่อนหน้าไม่ผ่านกติกาต้นฉบับ'};}
  if(Date.parse(previous.snapshotAt)>=Date.parse(current.snapshotAt))return {state:'UNAVAILABLE',reason:'เวลาเดิมไม่อยู่ก่อน snapshot นี้'};
  const changes=[],p=previous.desk,d=current.desk;
  const labelRole=r=>r==='PRIMARY'?'แผนหลัก':'แผนสำรอง';
  if(p.baseline.id!==d.baseline.id)changes.push('เปลี่ยนฐานโครงสร้าง '+p.baseline.id+' → '+d.baseline.id);
  if(p.baseline.bias!==d.baseline.bias)changes.push('Bias '+p.baseline.bias+' → '+d.baseline.bias);
  if(p.phase.name!==d.phase.name)changes.push('ภาวะตลาด '+p.phase.name+' → '+d.phase.name);
  for(const role of ['PRIMARY','ALTERNATIVE']){
    const a=previous.scenarioPlan?.scenarios?.find(s=>s.role===role),b=current.scenarioPlan?.scenarios?.find(s=>s.role===role);
    if(!a&&b)changes.push('เพิ่ม'+labelRole(role)+' '+b.side);
    else if(a&&!b)changes.push('พัก'+labelRole(role));
    else if(a&&b){
      if(a.side!==b.side||a.setupType!==b.setupType||JSON.stringify(scenarioZone(a))!==JSON.stringify(scenarioZone(b)))changes.push(labelRole(role)+'เปลี่ยน '+a.side+' '+zoneText(scenarioZone(a))+' → '+b.side+' '+zoneText(scenarioZone(b)));
      if(a.m15Confirmation?.state!==b.m15Confirmation?.state)changes.push(labelRole(role)+' M15 '+a.m15Confirmation?.state+' → '+b.m15Confirmation?.state);
    }
  }
  if(previous.status!==current.status)changes.push('สถานะแผน '+previous.status+' → '+current.status);
  const prior=p.noTradeZones.filter(z=>z.active).map(z=>z.reason),next=d.noTradeZones.filter(z=>z.active).map(z=>z.reason);
  if(JSON.stringify(prior)!==JSON.stringify(next))changes.push('ทบทวนข้อห้ามเข้าใหม่: '+(next.join(', ')||'ไม่พบ ณ snapshot'));
  return {state:'AVAILABLE',previousPlanId:previous.planId,previousSnapshotAt:previous.snapshotAt,changes,
    reason:changes.length?changes.join('\n'):'ฐานและโซนเดิมยังใช้ในรายงานนี้; ตรวจราคา/แท่งปิด/ข่าวใหม่แล้วตามหลักฐานรอบนี้',
    note:'เปรียบเทียบรายงานสองเวลา ไม่สรุป trigger / fill / ผลเทรดระหว่างกลาง'};
}
