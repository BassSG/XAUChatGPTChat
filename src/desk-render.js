import { validateDeskV4, deskReadiness, NO_TRADE } from './desk-v4.js';
import {isLocationDesk,scenarioTitle,scenarioSteps,scenarioZone,zoneText} from './scenario-archetypes.js';
import {diagramLines} from './diagram-text.js';
const esc = v => String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const n = v => Number.isFinite(v) ? v.toLocaleString('en-US',{maximumFractionDigits:3}) : 'ยังไม่ยืนยัน';
const zone = z => `${n(z.low)}–${n(z.high)}`;
const rule = r => `${r.timeframe}: ${r.condition}${r.price != null ? ' · '+n(r.price) : ''}`;
export function deskSections(report) {
  if (report.schemaVersion !== 4) return [];
  validateDeskV4(report);
  const d=report.desk, readiness=deskReadiness(report);
  const scenarios=(report.scenarioPlan?.scenarios || []).map(s=>({
    id:s.role.toLowerCase(), title:s.role==='PRIMARY'?'แผนหลัก · '+s.side:'แผนสำรอง · '+s.side,
    text:[s.structuralReason, s.transition, isLocationDesk(report)?scenarioTitle(s)+' · '+scenarioSteps(s).join(' → '):s.breakFrame+' เบรก '+n(s.breakPrice)+' → '+s.retestFrame+' รีเทสต์ '+n(s.retestLow)+'–'+n(s.retestHigh),s.confirmation,'ยกเลิกฉาก: '+s.invalidation].filter(Boolean).join('\n')
  }));
  return [
    {id:'overview',title:'Bias / Phase',text:`${d.baseline.bias} · ${d.phase.name}\n${d.phase.reason}`},
    {id:'xau',title:'XAU/USD · โครงสร้างกรอบใหญ่',text:d.xauSummary+'\n'+Object.entries(d.baseline.frames || {}).map(([f,v])=>`${f}: ${v.structure}`).join('\n')},
    ...(isLocationDesk(report)?[{id:'location',title:'ตำแหน่งราคา / โซนที่ควรรอ',text:locationSummary(report)},
      {id:'price-map',title:'แผนผังระดับราคา · candidate ไม่ใช่ Entry',text:(report.priceMap?.levels||[]).map(l=>l.price+' · '+l.label).join('\n')||d.locationMatrix.reason}]:[]),
    {id:'baseline',title:'ระดับที่ใช้ต่อ / Re-baseline',text:`${d.baseline.id} · ${d.baseline.mode || 'UNAVAILABLE'} · ${d.baseline.status}\n${d.baseline.refreshReason}\nยกเลิกฐาน: ${d.baseline.invalidation}\nRe-baseline: ${d.rebaseline.state}`},
    {id:'sr',title:'Daily SR · แผนที่ตำแหน่งราคา',text:d.dailySR.summary+'\n'+d.dailySR.levels.map(l=>`${l.type} · ${l.status} · ${zone(l)}`).join('\n')},
    {id:'amm',title:'AMM · โซนประกอบแผน',text:d.amm.summary+'\n'+d.amm.zones.map(z=>`${z.side} · ${zone(z)} · ${z.status} · ${z.method}`).join('\n')},
    {id:'entry',title:'แนวคิดเข้า / M15 → M5',text:`${d.entryIdea}\nM15 ${d.setup.status}: ${d.setup.reason}\nM5 ${d.trigger.state}: ${d.trigger.condition}`},
    ...scenarios,
    {id:'wait',title:'Wait zone · พื้นที่รอตรวจ setup',text:d.waitZones.map(z=>(z.side||'')+' '+zone(z)+' '+(z.priority||'')+': '+z.condition).join('\n') || 'ยังไม่มีโซนที่ยืนยันได้'},
    {id:'no-trade',title:'No-trade · เงื่อนไขงดเปิดเทรด',text:[...new Set([...readiness.reasons.map(r=>NO_TRADE[r]),...d.noTradeZones.filter(z=>z.active).map(z=>(z.low!=null?zone(z)+': ':'')+z.detail)])].join('\n') || 'ไม่พบข้อห้าม ณ snapshot; ยังต้องรอ trigger ตามแผน'},
    {id:'invalidation',title:'เงื่อนไขล้มเหลว / ยกเลิก',text:`Trigger failure: ${rule(d.invalidation.triggerFailure)}\nTactical: ${rule(d.invalidation.tactical)}\nStructural: ${rule(d.invalidation.structural)}\nRe-baseline: ${rule(d.invalidation.rebaseline)}\nActual Stop: ${n(d.invalidation.actualStop)}`},
    {id:'trade',title:'Trade Plan · ต้นทุนและความเสี่ยง',text:[report.entryZone,report.stop,(report.targets||[]).join(' → '),report.riskReward].filter(Boolean).join('\n')},
    {id:'dxy',title:'DXY · ตัวกรองยืนยัน',text:`${d.dxy.state}\n${d.dxy.structure}\n${d.dxy.reason}`+(d.dxy.frames?'\n'+d.dxy.frames.map(f=>f.timeframe+': '+f.direction+' · '+f.reason+(f.evidence?.length?' · ปิด '+n(f.evidence.at(-1).bar.close)+' ณ '+f.evidence.at(-1).closedAt:'')).join('\n'):'')},
    {id:'spdr',title:'SPDR · กระแสเงินระยะกลาง',text:`${d.spdr.summary}\n${d.spdr.dataDate || 'ยังไม่ยืนยันวันที่'} · ถือครอง ${n(d.spdr.holdings)} ตัน · เปลี่ยน ${n(d.spdr.dailyChange)} ตัน\n${d.spdr.direction} · ${d.spdr.flowBias}`},
    {id:'news',title:'ข่าว · ภาวะตลาดและความเสี่ยง',text:`${d.news.regime}\n${report.newsRisk}`},
    {id:'secondary',title:'EBW / All Indy · ยืนยันประกอบ',text:report.indicatorContext?.summary || 'ไม่มีค่าที่ตรวจสอบได้; ไม่ใช้แทนโครงสร้างราคา'},
    {id:'conclusion',title:'สรุปใช้งานจริง',text:d.conclusion}
    ,...(isLocationDesk(report)?[{id:'toolkit',title:'เครื่องมือประกอบ · ใช้เมื่อมีหลักฐาน',text:(d.toolkit?.observations||[]).map(o=>o.name+' '+(o.timeframe||'')+': '+o.state+(o.state==='OBSERVED'?' · '+JSON.stringify(o.value)+' · '+o.observedAt:'')+' · '+o.reason).join('\n')||'ยังไม่มีค่าที่ตรวจได้ ไม่สมมติ EMA / RSI / Stochastic หรือโซนจากอินดิเคเตอร์'},
      {id:'review',title:'การทบทวนแผน',text:report.reviewSupport?.reason||'ใช้กติกาต้นฉบับและหลักฐานตามลำดับเวลาเท่านั้น'}]:[])
  ];
}
export function locationSummary(report){
  const d=report.desk,m=d.locationMatrix;
  if(!m||m.state!=='AVAILABLE')return m?.reason||'ยังไม่มี location scan ที่ตรวจได้';
  const sell=m.aboveCandidates.find(c=>c.side==='SELL'),buy=m.belowCandidates.find(c=>c.side==='BUY');
  const scenarios=report.scenarioPlan?.scenarios||[];
  const align=c=>c.htfAlignment==='WITH_TREND'?'ตามแนวโน้ม':c.htfAlignment==='OPPOSING'?'สวนแนวโน้ม · โซนประกอบ':'ทิศทางยังไม่ยืนยัน';
  return ['ราคา ณ snapshot '+n(m.currentPrice)+' · '+(d.setup.locationRelation||'UNKNOWN'),
    'เฝ้าขายด้านบน: '+(sell?zone(sell)+' · '+align(sell):'ยังไม่มีโซนที่ยืนยันได้'),
    'เฝ้าซื้อด้านล่าง: '+(buy?zone(buy)+' · '+align(buy):'ยังไม่มีโซนที่ยืนยันได้'),
    ...m.atCandidates.map(c=>'ขณะนี้อยู่ในโซน '+c.side+': '+zone(c)+' · '+align(c)),
    ...(d.activeScenarioRole==='ALTERNATIVE'?['กำลังตรวจแผนสำรองตามเงื่อนไขเปลี่ยนฉาก · Bias กรอบใหญ่ยังเดิม']:[]),
    ...scenarios.map(s=>(s.role==='PRIMARY'?'แผนหลัก':'แผนสำรอง')+': '+scenarioTitle(s)+' · '+zoneText(scenarioZone(s))),
    'งดเปิดเทรด: '+(d.noTradeZones.filter(z=>z.active).map(z=>(z.low!=null?zone(z)+' · ':'')+z.detail).join(' · ')||(report.status==='WAIT'?'รอเงื่อนไข M15 / ความเสี่ยงครบ':'ไม่พบข้อห้าม ณ snapshot · ตรวจ M5 ตามแผน')),
    'โซนเฝ้ารอไม่ใช่จุดเข้าที่เกิดแล้ว'].join('\n');
}
export function locationHtml(report){
  if(!isLocationDesk(report))return '';
  try{validateDeskV4(report);const rows=locationSummary(report).split('\n');return '<div class="location-brief"><strong>รอที่ไหน · ทำอะไรต่อ</strong><ul>'+rows.map((row,i)=>'<li class="'+(i===1?'location-sell':i===2?'location-buy':row.startsWith('แผนหลัก')?'location-primary':'')+'">'+esc(row)+'</li>').join('')+'</ul><a href="#scenario-plan">ดูเงื่อนไขแผนหลัก / แผนสำรอง →</a></div>';}catch{return '';}
}
export function deskHtml(report) {
  if (report.schemaVersion !== 4) return '';
  try {
    const sections=deskSections(report);
    const primary=report.scenarioPlan?.scenarios?.find(s=>s.role===(report.desk.activeScenarioRole||'PRIMARY'));
    return `<div class="desk-v4" data-schema="4"><header class="desk-brief"><strong>${esc(report.status)} · ${esc(report.desk.baseline.bias)}</strong><p>${esc(report.desk.phase.name)} · ${esc(report.desk.phase.reason)}</p><p><b>ฉากที่กำลังตรวจ:</b> ${esc(primary?.structuralReason || 'พักแผนเพื่อรอโครงสร้างที่ตรวจสอบได้')}</p><p><b>รอ:</b> ${esc(report.waitFor)}</p></header><p class="desk-hierarchy">HTF → Daily SR → AMM → M15 → M5 → DXY</p>${report.testOnly?'<strong class="desk-test">ตัวอย่างทดสอบ · ไม่ใช่ข้อมูลตลาดจริง</strong>':''}${sections.map(s=>`<details class="desk-layer desk-${s.id}"${['no-trade'].includes(s.id)?' open':''}><summary>${esc(s.title)}</summary><p>${esc(s.text)}</p></details>`).join('')}</div>`;
  } catch { return '<p class="desk-v4-error">ข้อมูล V4 ไม่ผ่านการตรวจโครงสร้าง โปรดอ่านรายงานต้นฉบับและตรวจใหม่ก่อนใช้แผน</p>'; }
}
export function deskBody(report) {
  return `XAU/USD — ${report.status}\nข้อมูล snapshot ${report.snapshotAt} · PEPPERSTONE:XAUUSD\n\n`+
    deskSections(report).map(s=>`${s.title}\n${s.text}`).join('\n\n')+
    '\n\nข้อมูลจริงและแหล่งอ้างอิง\n'+(report.observationsSummary || 'รายละเอียดแท่งปิดและเวลาจัดเก็บใน evidence ของรายงาน')+
    '\n\nการตีความและเส้นทางในแผนเป็นเงื่อนไข ไม่รับประกันการเคลื่อนที่ของราคา';
}
export function deskSvg(report) {
  const sections=deskSections(report);
  if(!sections.length)return '';
  const lines=value=>diagramLines(value);
  let y=230, body='';
  for(const s of sections){
    const rows=lines(s.text),height=84+rows.length*36;
    const color=s.id==='no-trade'?'#ff8b94':s.id==='primary'?'#58ddd0':'#f2cb83';
    body+=`<rect x="32" y="${y}" width="1136" height="${height}" rx="18" fill="#142b38" stroke="${color}"/><text x="60" y="${y+43}" fill="${color}" font-size="30" font-weight="bold">${esc(s.title)}</text>`;
    rows.forEach((line,i)=>{body+=`<text x="60" y="${y+84+i*36}" fill="#e7eeee" font-size="26">${esc(line)}</text>`;});
    y+=height+22;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="${y+20}" viewBox="0 0 1200 ${y+20}"><rect width="1200" height="${y+20}" fill="#081824"/><g font-family="Tahoma, Noto Sans Thai, sans-serif"><text x="40" y="64" font-size="43" fill="#f2cb83">XAU/USD · ${esc(report.status)} · Trading Desk V4</text><text x="40" y="112" font-size="27" fill="#e7eeee">แผนผังระดับราคา ไม่ใช่กราฟราคาจริง</text><text x="40" y="155" font-size="24" fill="#b5c5cc">Snapshot ${esc(report.snapshotAt)}</text><text x="40" y="198" font-size="25" fill="#ffb4ad">${report.testOnly?'ตัวอย่างทดสอบ · ไม่ใช่ข้อมูลตลาดจริง':'แผนมีเงื่อนไข · ตรวจข้อมูลปัจจุบันก่อนใช้'}</text>${body}</g></svg>`;
}
