// Setup meaning is independent of chart drawing and replay support.
export const SETUP_TYPES = ['PULLBACK_CONTINUATION','BREAK_RETEST_CONTINUATION','DEEP_RETRACE_CONTINUATION',
  'SUPPORT_REACTION_SCALP','RESISTANCE_REACTION_SCALP','RECOVERY_REBASELINE','REVERSAL_REBASELINE'];
export const CONFIRMATION_TYPES = ['BREAK_CLOSE','REJECTION_CLOSE','SWEEP_RECLAIM','ZONE_HOLD','STRUCTURE_RESUMPTION','BOS_CONFIRMATION','ENGULFING_CLOSE','FAILED_RECLAIM','SWING_RESUMPTION'];
export const TREND_RELATIONSHIPS = ['WITH_TREND','COUNTERTREND_SCALP','REVERSAL_REQUIRES_REBASELINE'];
export const isLocationDesk = report => report?.schemaVersion===4 && ['4.2','4.3'].includes(report.desk?.architectureVersion);
export const isAlignedDesk = report => report?.schemaVersion===4 && report.desk?.architectureVersion==='4.3';
// Read-only fallback: old reports are never rewritten or assigned a new architecture version.
export const setupType = scenario => scenario?.setupType || 'BREAK_RETEST_CONTINUATION';
export const isBreakSetup = scenario => setupType(scenario)==='BREAK_RETEST_CONTINUATION';
export const isRebaselineSetup = scenario => ['RECOVERY_REBASELINE','REVERSAL_REBASELINE'].includes(setupType(scenario));
export const scenarioZone = scenario => scenario?.zone || {low:scenario?.retestLow,high:scenario?.retestHigh};
export const selectedScenario = report => report.scenarioPlan?.scenarios?.find(s=>s.role===(report.desk?.activeScenarioRole || 'PRIMARY'));
const n=value=>Number.isFinite(value)?value.toLocaleString('en-US',{maximumFractionDigits:3}):'ยังไม่ยืนยัน';
export const zoneText = zone => `${n(zone.low)}–${n(zone.high)}`;
export const confirmationTitle=type=>({BREAK_CLOSE:'ปิดผ่านระดับเบรก',REJECTION_CLOSE:'ปิดปฏิเสธโซน',SWEEP_RECLAIM:'กวาดราคาแล้วปิดกลับ',ZONE_HOLD:'ทดสอบแล้วรักษาโซน',STRUCTURE_RESUMPTION:'กลับเดินตามโครงสร้าง',BOS_CONFIRMATION:'ยืนยันทะลุโครงสร้าง',ENGULFING_CLOSE:'แท่งกลับตัวกลืนแท่งก่อน',FAILED_RECLAIM:'ยึดโซนกลับไม่สำเร็จ',SWING_RESUMPTION:'ยืนยัน HL/LH แล้วเดินต่อ'}[type]||'รอยืนยัน');
export function scenarioTitle(s) {
  if(isBreakSetup(s))return `${s.side==='BUY'?'ซื้อเมื่อเบรกขึ้น':'ขายเมื่อหลุดฐาน'} → รีเทสต์`;
  if(isRebaselineSetup(s))return `${s.side==='BUY'?'ฟื้นตัวฝั่งซื้อ':'เปลี่ยนเป็นฝั่งขาย'} · ประเมินฐานใหม่ก่อน`;
  if(s.setupType==='DEEP_RETRACE_CONTINUATION')return s.side==='SELL'?'รอเด้งลึกขึ้นไปขาย':'รอย่อลึกลงมาซื้อ';
  if(['SUPPORT_REACTION_SCALP','RESISTANCE_REACTION_SCALP'].includes(s.setupType))return (s.side==='BUY'?'ซื้อจากแนวรับ':'ขายจากแนวต้าน')+' · scalp'+(s.trendRelationship==='COUNTERTREND_SCALP'?' สวนแนวโน้ม':' ตามแนวโน้ม');
  if(s.trendRelationship==='COUNTERTREND_SCALP')return `${s.side==='BUY'?'ซื้อจากแนวรับ':'ขายจากแนวต้าน'} · scalp สวนแนวโน้ม`;
  return s.side==='SELL'?'รอเด้งขึ้นไปขาย':'รอย่อลงมาซื้อ';
}
export function scenarioSteps(s) {
  const z=scenarioZone(s);
  if(isBreakSetup(s))return [`${s.breakFrame} ปิด${s.side==='BUY'?'เหนือ':'ต่ำกว่า'} ${n(s.breakPrice)}${s.breakState==='OBSERVED'?' · ยืนยันแล้ว':''}`,...(s.breakFrame==='H1'?[`M15 ยืนยัน setup${s.m15Confirmation?.state==='OBSERVED'?' แล้ว':' ก่อน'}`]:[]),`${s.retestFrame} รีเทสต์ ${zoneText(z)}`];
  if(isRebaselineSetup(s))return ['ยอมรับผ่าน Critical · ประเมินฐานใหม่',`M15 ยืนยันฐานใหม่ · โซน ${zoneText(z)}`];
  if(s.m15Confirmation?.state==='OBSERVED')return [`โซน${s.side==='SELL'?'ขาย':'ซื้อ'} ${zoneText(z)}`,`M15 ${confirmationTitle(s.m15Confirmation.type)}ยืนยันแล้ว → รอ M5 ตามแผน`];
  return [`${s.side==='SELL'?'รอขึ้น':'รอลง'}เข้าโซน ${zoneText(z)}`,`M15 ${confirmationTitle(s.m15Confirmation?.type)} → M5 หาจังหวะ`];
}
// Verify an observable candle pattern, rather than trusting the word CONFIRMED.
export function confirmsM15(s, refs = s.m15Confirmation?.evidence || []) {
  const type=s.m15Confirmation?.type, z=scenarioZone(s), last=refs.at(-1);
  if(!last || !refs.every(r=>r.symbol==='PEPPERSTONE:XAUUSD'&&r.timeframe==='M15'&&Number.isFinite(Date.parse(r.closedAt))&&r.bar&&['open','high','low','close'].every(k=>Number.isFinite(r.bar[k])&&r.bar[k]>0)&&r.bar.high>=Math.max(r.bar.open,r.bar.close)&&r.bar.low<=Math.min(r.bar.open,r.bar.close)) || !Number.isFinite(z.low) || !Number.isFinite(z.high)||z.low>z.high)return false;
  if(!refs.every((r,i)=>!i || Date.parse(r.closedAt)>Date.parse(refs[i-1].closedAt)))return false;
  const b=last.bar, buy=s.side==='BUY', touched=r=>r.bar.high>=z.low && r.bar.low<=z.high;
  const reclaimed=buy?b.close>z.high:b.close<z.low, body=buy?b.close>b.open:b.close<b.open;
  if(type==='BREAK_CLOSE'){const level=isRebaselineSetup(s)?s.acceptancePrice:s.breakPrice;return Number.isFinite(level)&&(buy?b.close>level:b.close<level);}
  if(type==='REJECTION_CLOSE')return touched(last) && reclaimed && body;
  if(type==='SWEEP_RECLAIM')return (buy?b.low<z.low:b.high>z.high) && reclaimed && body;
  if(type==='ZONE_HOLD')return touched(last) && reclaimed && body && (buy?b.low>=z.low:b.high<=z.high);
  if(['STRUCTURE_RESUMPTION','BOS_CONFIRMATION'].includes(type))return refs.length>=2 && refs.some(touched) && body &&
    (buy?b.close>refs[0].bar.high:b.close<refs[0].bar.low);
  if(['ENGULFING_CLOSE','FAILED_RECLAIM','SWING_RESUMPTION'].includes(type)){
    if(!refs.every((r,i)=>!i || Date.parse(r.closedAt)-Date.parse(refs[i-1].closedAt)===900000))return false;
    if(!body || !refs.some(touched))return false;
    const prior=refs.at(-2)?.bar;
    if(type==='ENGULFING_CLOSE')return !!prior && (buy?
      prior.close<prior.open && b.open<=prior.close && b.close>prior.open && b.close>(z.low+z.high)/2:
      prior.close>prior.open && b.open>=prior.close && b.close<prior.open && b.close<(z.low+z.high)/2);
    if(type==='FAILED_RECLAIM')return !!prior && reclaimed && touched(last) && (buy?prior.close<z.high:prior.close>z.low);
    // Two completed 2-left/2-right pivots; the final close must resume beyond the intervening structure.
    const pivots=[];
    for(let i=2;i<refs.length-2;i++){
      const key=buy?'low':'high',v=refs[i].bar[key];
      if(refs.slice(i-2,i+3).every((r,j)=>j===2 || (buy?r.bar[key]>v:r.bar[key]<v)))pivots.push(i);
    }
    if(pivots.length<2)return false;
    const [a,c]=pivots.slice(-2),first=refs[a].bar,second=refs[c].bar;
    const between=refs.slice(a+1,c);
    return between.length>0 && touched(refs[c]) && (buy?
      second.low>first.low && b.close>Math.max(...between.map(r=>r.bar.high)):
      second.high<first.high && b.close<Math.min(...between.map(r=>r.bar.low)));
  }
  return false;
}
