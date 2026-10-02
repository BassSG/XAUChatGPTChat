import {DESK_POLICY} from './desk-policy.js';
// A cached DXY map is context only. Current H1 must be read before reuse.
const ms=3600000,finite=v=>Number.isFinite(v)&&v>0;
function h1Evidence(frame,at){
  const refs=frame?.evidence||[];
  return frame?.timeframe==='H1'&&refs.length>=2&&refs.every((r,i)=>r.symbol==='TVC:DXY'&&r.timeframe==='H1'&&Date.parse(r.closedAt)<=Date.parse(at)&&
    r.bar&&['open','high','low','close'].every(k=>finite(r.bar[k]))&&r.bar.high>=Math.max(r.bar.open,r.bar.close)&&r.bar.low<=Math.min(r.bar.open,r.bar.close)&&
    (!i||Date.parse(r.closedAt)-Date.parse(refs[i-1].closedAt)===ms))&&Date.parse(at)-Date.parse(refs.at(-1).closedAt)<=2*ms;
}
export function checkDxyCarry(candidate,h1,at){
  const base={state:'REFRESH_REQUIRED',checkedAt:at,frames:[],reason:'ต้องอ่าน DXY D1/H4 ใหม่ก่อนใช้ฐานเดิม'};
  if(!candidate||candidate.state!=='CANDIDATE_NEEDS_CURRENT_H1'||!Array.isArray(candidate.frames)||!candidate.frames.length||![at,candidate.refreshAt,candidate.originalObservedAt].every(x=>Number.isFinite(Date.parse(x)))||Date.parse(at)>=Date.parse(candidate.refreshAt)||Date.parse(candidate.originalObservedAt)>Date.parse(at)||Date.parse(candidate.refreshAt)-Date.parse(candidate.originalObservedAt)>48*ms||!candidate.originPlanId||!/^[a-f0-9]{64}$/.test(candidate.originEvidenceSha256||''))return {...base,reason:'ไม่มี DXY baseline ที่ยังอยู่ในอายุใช้งาน'};
  if(!h1Evidence(h1,at))return {...base,state:'UNAVAILABLE',reason:'ยังไม่มี DXY H1 สองแท่งปิดต่อเนื่องและล่าสุดสำหรับตรวจฐานเดิม'};
  const refs=candidate.frames.flatMap(f=>f.evidence||[]);
  if(!refs.length||!refs.every(r=>['D1','H4'].includes(r.timeframe)&&r.symbol==='TVC:DXY'&&Date.parse(r.closedAt)<=Date.parse(candidate.originalObservedAt)&&r.bar&&['open','high','low','close'].every(k=>finite(r.bar[k]))&&r.bar.high>=Math.max(r.bar.open,r.bar.close)&&r.bar.low<=Math.min(r.bar.open,r.bar.close)))return base;
  const high=Math.max(...refs.map(r=>r.bar.high)),low=Math.min(...refs.map(r=>r.bar.low)),[prior,last]=h1.evidence.slice(-2),a=prior.bar,b=last.bar;
  const acceptance=a.close>high&&b.close>high||a.close<low&&b.close<low;
  const displacement=(b.close>high||b.close<low)&&Math.abs(b.close-b.open)/Math.max(b.high-b.low,.000001)>=DESK_POLICY.displacementBodyRatio&&(b.high-b.low)>=(a.high-a.low)*DESK_POLICY.abnormalRangeMultiple;
  if(acceptance||displacement)return {...base,reason:acceptance?'DXY H1 ยอมรับนอกกรอบ D1/H4 เดิมสองแท่ง':'DXY H1 displacement ผิดปกตินอกกรอบเดิม ต้องตรวจกรอบใหญ่ใหม่'};
  return {state:'CARRIED',checkedAt:at,originalObservedAt:candidate.originalObservedAt,refreshAt:candidate.refreshAt,
    originPlanId:candidate.originPlanId,originEvidenceSha256:candidate.originEvidenceSha256,frames:structuredClone(candidate.frames),
    reason:'ตรวจ H1 ใหม่แล้ว ยังไม่ยอมรับนอกกรอบฐานเดิม; D1/H4 คงเวลาเดิม ไม่ถือเป็นราคาสด'};
}
