import {readFile,readdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {validateDeskV4} from '../src/desk-v4.js';
import {matchReportEvidence} from '../src/analysis-evidence.js';
import {validateIndicatorVerification} from '../src/indicator-profile.js';
import {spdrFlow} from '../src/desk-enrichment.js';
import {SPDR_ARCHIVE} from '../src/spdr-history.js';
const sha=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const read=async path=>JSON.parse((await readFile(path,'utf8')).replace(/^\uFEFF/,''));
export async function supplementalContext({repo,root,now,report}){
  const gaps=[],spdr=new Map(),conflicts=new Set(),at=new Date(now+7*3600000).toISOString().replace('Z','+07:00');
  const spdrFrom=Date.parse(at.slice(0,10))-35*86400000;
  let indicator=null,dxy=null;
  try {indicator=await read(join(root,'indicator-verification.json'));validateIndicatorVerification(indicator,at);if(indicator.state==='UNAVAILABLE')indicator=null;}
  catch {gaps.push('ไม่มี source/Inputs verification ที่ใช้ต่อได้ ต้องตรวจชื่อ/Inputs ตามความจำเป็น');indicator=null;}
  try{
    const cache=await read(join(root,'spdr-history.json'));
    if(cache.downloadUrl!==SPDR_ARCHIVE||!Number.isFinite(Date.parse(cache.checkedAt))||Date.parse(cache.checkedAt)>now||now-Date.parse(cache.checkedAt)>7*86400000)throw new Error('expired SPDR cache');
    spdrFlow(cache.history,at);
    for(const h of cache.history)if(Date.parse(h.dataDate)>=spdrFrom)spdr.set(h.dataDate,h);
    if(now-Date.parse(cache.checkedAt)>6*3600000)gaps.push('SPDR cache เกิน 6 ชั่วโมง; ลอง collector ครั้งเดียว คง checkedAt/dataDate เดิมหากใช้ fallback');
  }catch{/* No local official history yet; dated archived context remains available. */}
  const names=await readdir(join(repo,'public/reports/archive')).catch(()=>[]);
  // Bounded file reads. No remote request, polling, quote carry, or growing conversation replay.
  const paths=names.filter(n=>/^analysis-\d{8}-\d{6}\.json$/.test(n)).sort().reverse().slice(0,24);
  const candidates=[report,...await Promise.all(paths.map(name=>read(join(repo,'public/reports/archive',name)).catch(()=>null)))];
  for(const r of candidates){
    if(!r||r.testOnly||r.dataClass==='TEST_FIXTURE'||r.schemaVersion!==4||Date.parse(r.snapshotAt)>now)continue;
    try {
      validateDeskV4(r);
      const hash=r.evidenceArchive?.sha256;if(!/^[a-f0-9]{64}$/.test(hash||''))continue;
      const pack=await read(resolve(repo,'../../outputs/analysis-evidence',hash+'.json'));
      if(sha(pack)!==hash)continue;matchReportEvidence(r,pack);
      if(!indicator&&r.desk.indicatorVerification&&r.desk.indicatorVerification.state!=='UNAVAILABLE'){
        try{validateIndicatorVerification(r.desk.indicatorVerification,at);indicator=r.desk.indicatorVerification;}catch{/* expired Inputs must be reread */}
      }
      const frames=(pack.context?.dxyFrames||[]).filter(f=>['D1','H4'].includes(f.timeframe)&&f.direction!=='UNAVAILABLE');
      if(!dxy&&frames.length){
        const age=now-Date.parse(r.desk.dxy.observedAt);
        if(age>=0&&age<=48*3600000)dxy={state:'CANDIDATE_NEEDS_CURRENT_H1',frames,originPlanId:r.planId,originEvidenceSha256:hash,originalObservedAt:r.desk.dxy.observedAt,refreshAt:new Date(Date.parse(r.desk.dxy.observedAt)+48*3600000).toISOString(),conditions:r.desk.dxy.conditions||[],instruction:'คงเวลาของ D1/H4 เดิม อ่าน H1 ใหม่และตรวจ Critical/structure/displacement ก่อนใช้ต่อ; ไม่ carry quote หรือถือว่า check เดิมเป็นปัจจุบัน'};
      }
      // Legacy holdings without an actual checkedAt remain dated report context, not verified series.
      for(const h of pack.context?.spdrHistory||[]){
        if(Date.parse(h.checkedAt)>now||Date.parse(h.dataDate)<spdrFrom)continue;
        const prior=spdr.get(h.dataDate);
        if(prior&&prior.holdings!==h.holdings){conflicts.add(h.dataDate);continue;}
        spdr.set(h.dataDate,h);
      }
    }catch { /* An inaccessible or tampered old context never blocks a fresh analysis. */ }
  }
  for(const date of conflicts)spdr.delete(date);
  if(conflicts.size)gaps.push('SPDR holdings ขัดกันใน archive: '+[...conflicts].join(', ')+' ต้องตรวจต้นทางก่อนนำเข้า series');
  if(!spdr.size)gaps.push('ยังไม่มี SPDR history พร้อม source checkedAt ใน private archive; เริ่มสะสมข้อมูลจริง ไม่แทนด้วยศูนย์');
  if(!dxy)gaps.push('ยังไม่มี DXY D1/H4 baseline ที่ตรวจ hash ได้และไม่เกิน 48 ชั่วโมง');
  return {indicatorVerification:indicator,dxyBaseline:dxy,spdrHistory:[...spdr.values()].sort((a,b)=>a.dataDate.localeCompare(b.dataDate)),gaps,
    readLimit:24,neverCarryAsLive:['quote','DXY H1 check','M15/M5 setup','news Actual']};
}
