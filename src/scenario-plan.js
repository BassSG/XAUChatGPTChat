const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
import {isLocationDesk,isAlignedDesk,isBreakSetup,isRebaselineSetup,SETUP_TYPES,CONFIRMATION_TYPES,TREND_RELATIONSHIPS,scenarioZone,scenarioTitle,scenarioSteps,zoneText} from './scenario-archetypes.js';
import {diagramLines} from './diagram-text.js';
export function validateScenarioPlan(report) {
  const plan = report.scenarioPlan;
  if (!plan) return null;
  if (plan.symbol !== 'PEPPERSTONE:XAUUSD' || Date.parse(plan.asOf) !== Date.parse(report.snapshotAt)) throw new Error('Scenario source/time must match report');
  if (!Array.isArray(plan.scenarios) || !plan.scenarios.length || plan.scenarios.length > 2) throw new Error('Use 1–2 scenarios');
  if(report.schemaVersion===4 && (plan.scenarios[0].role!=='PRIMARY' || plan.scenarios.length===2 && (plan.scenarios[1].role!=='ALTERNATIVE' || !plan.scenarios[1].transition)))throw new Error('V4 needs PRIMARY then conditional ALTERNATIVE');
  for (const s of plan.scenarios) {
    if(isLocationDesk(report)){
      if(!SETUP_TYPES.includes(s.setupType)||!TREND_RELATIONSHIPS.includes(s.trendRelationship)||!['BUY','SELL'].includes(s.side))throw new Error('V4.2 scenario needs an explicit archetype and trend relationship');
      if(![s.confirmation,s.invalidation,s.evidence,s.structuralReason].every(v=>typeof v==='string'&&v.trim()))throw new Error('Scenario needs confirmation, invalidation and structural reasoning');
      if(s.setupFrame!=='M15'||s.triggerFrame!=='M5')throw new Error('V4.2 requires M15 setup then M5 fine entry');
      const c=s.m15Confirmation;
      if(!c||!CONFIRMATION_TYPES.includes(c.type)||!['PENDING','OBSERVED'].includes(c.state)||!Array.isArray(c.evidence))throw new Error('V4.2 needs typed M15 confirmation');
      if(['ENGULFING_CLOSE','FAILED_RECLAIM','SWING_RESUMPTION'].includes(c.type)&&!isAlignedDesk(report))throw new Error('New pattern definitions require explicit architectureVersion 4.3');
      const z=scenarioZone(s);
      if(![z.low,z.high].every(v=>Number.isFinite(v)&&v>0)||z.low>z.high)throw new Error('Invalid scenario zone');
      if(!isBreakSetup(s)){
        if(['breakPrice','breakFrame','breakState','retestLow','retestHigh'].some(k=>s[k]!=null))throw new Error('Location setup cannot masquerade as break/retest');
        if(c.type==='BREAK_CLOSE'&&!isRebaselineSetup(s))throw new Error('Location confirmation cannot require an unrelated breakout');
        continue;
      }
    }else if(s.setupType)throw new Error('Explicit archetypes require architectureVersion 4.2; legacy reports remain legacy');
    if (report.schemaVersion === 4 && (!['M15','H1'].includes(s.breakFrame) || s.retestFrame !== 'M5' || !['PRIMARY','ALTERNATIVE'].includes(s.role))) throw new Error('V4 scenario requires M15+ setup and M5 retest with role');
    if (!['BUY','SELL'].includes(s.side) || !['M5','M15','H1'].includes(s.breakFrame) || !['M5','M15','H1'].includes(s.retestFrame)) throw new Error('Invalid scenario side/timeframe');
    if (![s.breakPrice,s.retestLow,s.retestHigh].every(Number.isFinite) || s.retestLow > s.retestHigh || s.breakPrice < s.retestLow || s.breakPrice > s.retestHigh) throw new Error('Invalid scenario levels');
    if (![s.confirmation,s.invalidation,s.evidence].every(v => typeof v === 'string' && v.trim())) throw new Error('Scenario needs confirmation, invalidation and evidence');
    if (!['WAITING','OBSERVED'].includes(s.breakState)) throw new Error('Invalid break state');
    if (s.breakState === 'OBSERVED' && (!s.breakClosedAt || !Number.isFinite(Date.parse(s.breakClosedAt)) || Date.parse(s.breakClosedAt) > Date.parse(report.snapshotAt))) throw new Error('Observed break requires closed-bar time');
  }
  return plan;
}
export function scenarioHtml(report) {
  const plan = validateScenarioPlan(report);
  if (!plan) return '';
  if(isLocationDesk(report))return locationScenarioHtml(report,plan);
  const source = scenarioSvg(report);
  return `<p class="sequence-note">แผนผังระดับราคา ไม่ใช่กราฟราคาจริง · เส้นประ = เส้นทางสมมติ</p>` + plan.scenarios.map((s, i) => {
    // Reuse exactly the same paths as the report image, cropping only the drawings.
    const drawing = (x, label) => source.replace(/width="1200" height="\d+" viewBox="[^"]+"/, `role="img" aria-label="${esc(label)}" width="525" height="180" viewBox="${x} ${248+i*550} 525 180"`);
    return `<article data-side="${s.side}" data-role="${esc(s.role || '')}" class="sequence-card ${s.side === 'BUY' ? 'sequence-buy' : 'sequence-sell'}">
      <h4>${i + 1}. ${s.role === 'PRIMARY' ? 'แผนหลัก · ' : s.role === 'ALTERNATIVE' ? 'แผนสำรอง · ' : ''}${s.side === 'BUY' ? 'ฉากฝั่งซื้อ' : 'ฉากฝั่งขาย'} · ${esc(s.breakFrame)} เบรก → ${esc(s.retestFrame)} รีเทสต์</h4>
      <div class="sequence-steps">
        <div><h5>① ${esc(s.breakFrame)} ปิด${s.side === 'BUY' ? 'เหนือ' : 'ต่ำกว่า'} ${s.breakPrice.toFixed(2)}</h5>${drawing(45, 'เส้นทางสมมติขั้นเบรก')}<p>${s.breakState === 'OBSERVED' ? `พบแท่งปิดตามรายงาน ${esc(s.breakClosedAt.slice(11,16))}` : 'กรอบประ = แท่งยืนยันที่รอ ยังไม่เกิด'}</p></div>
        <div><h5>② ${esc(s.retestFrame)} รีเทสต์ ${s.retestLow.toFixed(2)}–${s.retestHigh.toFixed(2)}</h5>${drawing(615, 'เส้นทางสมมติขั้นรีเทสต์')}<p>จุดสีทอง = โซนทดสอบ · รอแท่งปิดยืนยัน</p></div>
      </div>
      <p class="sequence-transition">${esc(s.transition || s.structuralReason || '')}</p>
      <p class="sequence-confirm">③ ${esc(s.confirmation)}</p>
      <p class="sequence-cancel">ยกเลิกฉาก: ${esc(s.invalidation)}</p>
    </article>`;
  }).join('') + '<p class="sequence-note">เส้นทางไม่มีสเกลเวลา · Stop/เป้าใช้เฉพาะที่รายงานยืนยันแล้ว</p>';
}
export function scenarioSvg(report) {
  const plan = validateScenarioPlan(report);
  if (!plan) return '';
  if(isLocationDesk(report))return locationScenarioSvg(report,plan);
  const height = 150 + plan.scenarios.length * 550;
  const t = (x,y,value,size=24,color='#edf3f5') => `<text x="${x}" y="${y}" font-size="${size}" fill="${color}">${esc(value)}</text>`;
  const wrap = (value,y,color) => {
    const chars=Array.from(value); let out='';
    for(let i=0;i<chars.length;i+=73) out+=t(45,y+(i/73)*30,chars.slice(i,i+73).join(''),22,color);
    return out;
  };
  let svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="${height}" viewBox="0 0 1200 ${height}"><rect width="1200" height="${height}" fill="#0b1928"/><g font-family="Noto Sans Thai, Tahoma, sans-serif">`;
  svg+=t(40,48,'ลำดับแผน: เบรก → รีเทสต์ → รอยืนยัน',34,'#f6cd78');
  svg+=t(40,88,'แผนผังระดับราคา ไม่ใช่กราฟราคาจริง · เส้นประ = เส้นทางสมมติ',23);
  svg+=t(40,123,`ข้อมูล ${report.snapshotAt} · แผน ${report.planId}`,19,'#a8bdcb');
  plan.scenarios.forEach((s,i)=>{
    const y=150+i*550; const buy=s.side==='BUY'; const color=buy?'#49d6c9':'#ff808b';
    svg+=`<g transform="translate(0 ${y})"><rect x="20" y="8" width="1160" height="526" rx="18" fill="#102638" stroke="${color}"/>`;
    svg+=t(45,50,`${i+1}. ${s.role==='PRIMARY'?'แผนหลัก · ':s.role==='ALTERNATIVE'?'แผนสำรอง · ':''}${buy?'ซื้อ':'ขาย'} · ${s.breakFrame} เบรก → ${s.retestFrame} รีเทสต์`,29,color);
    svg+=t(45,90,`① ${s.breakFrame} ปิด${buy?'เหนือ':'ต่ำกว่า'} ${s.breakPrice.toFixed(2)}`,25);
    svg+=t(615,90,`② ${s.retestFrame} รีเทสต์ ${s.retestLow.toFixed(2)}–${s.retestHigh.toFixed(2)}`,24);
    for(const x of [45,615]) svg+=`<rect x="${x}" y="162" width="525" height="35" fill="${color}" opacity=".15"/><line x1="${x}" y1="180" x2="${x+525}" y2="180" stroke="${color}" stroke-width="2"/>`;
    const path=buy?'M65 244 L145 226 L210 240 L300 130 L410 105':'M65 116 L145 137 L210 120 L300 230 L410 253';
    svg+=`<path d="${path}" fill="none" stroke="${color}" stroke-width="5" stroke-dasharray="11 8"/><path d="${buy?'M398 96 L421 102 L406 122':'M400 235 L422 258 L397 265'}" fill="${color}"/>`;
    const cy=buy?143:217;
    svg+=`<rect x="285" y="${cy-18}" width="25" height="36" fill="none" stroke="${color}" stroke-width="3" stroke-dasharray="4 3"/>`;
    svg+=t(45,296,s.breakState==='OBSERVED'?`พบแท่งปิดตามรายงาน ${s.breakClosedAt.slice(11,16)}`:'กรอบประ = แท่งยืนยันที่รอ ยังไม่เกิด',21,'#f6cd78');
    const p2=buy?'M635 120 L715 105 L820 180 L880 158 L1030 110':'M635 240 L715 254 L820 180 L880 205 L1030 254';
    svg+=`<path d="${p2}" fill="none" stroke="${color}" stroke-width="5" stroke-dasharray="11 8"/><path d="${buy?'M1018 101 L1041 107 L1026 127':'M1020 236 L1042 259 L1017 266'}" fill="${color}"/><circle cx="820" cy="180" r="10" fill="#f6cd78"/>`;
    svg+=t(615,296,'จุดสีทอง = โซนทดสอบ · รอแท่งปิดยืนยัน',21,'#f6cd78');
    svg+=wrap(`③ ${s.confirmation}`,340);
    svg+=wrap(`ยกเลิกฉาก: ${s.invalidation}`,415,'#ffbdad');
    svg+=t(45,508,'เส้นทางไม่มีสเกลเวลา · Stop/เป้าใช้เฉพาะที่รายงานยืนยันแล้ว',20,'#a8bdcb');
    svg+='</g>';
  });
  return svg+'</g></svg>';
}

function locationDrawing(s,panel){
  const color=s.side==='BUY'?'#49d6c9':'#ff808b',buy=s.side==='BUY';
  // First panel approaches the location: sell higher / buy lower. It is not a price forecast.
  const approach=buy?'M30 40 L130 65 L220 130 L300 100 L410 142':'M30 160 L130 135 L220 60 L300 85 L410 55';
  const reaction=buy?'M30 155 L130 115 L210 135 L300 65 L410 40':'M30 40 L130 80 L210 60 L300 130 L410 165';
  const breakPath=buy?'M30 160 L130 145 L220 160 L300 65 L410 40':'M30 40 L130 65 L220 40 L300 135 L410 165';
  const path=panel===0?(isBreakSetup(s)||isRebaselineSetup(s)?breakPath:approach):reaction;
  return `<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${esc(panel===0?'เส้นทางสมมติเข้าหาโซน':'เส้นทางสมมติหลังยืนยัน')}" width="525" height="200" viewBox="0 0 450 200"><rect x="12" y="85" width="425" height="30" fill="${color}" opacity=".15"/><line x1="12" x2="437" y1="100" y2="100" stroke="${color}"/><path d="${path}" fill="none" stroke="${color}" stroke-width="5" stroke-dasharray="11 8"/><circle cx="220" cy="100" r="8" fill="#f6cd78"/></svg>`;
}
function locationScenarioHtml(report,plan){
  return '<p class="sequence-note">แผนผังระดับราคา ไม่ใช่กราฟราคาจริง · เส้นประ = เงื่อนไขสมมติ · ไม่ใช่ Entry ที่เกิดแล้ว</p>'+plan.scenarios.map((s,i)=>{
    const steps=scenarioSteps(s);
    return `<article data-side="${s.side}" data-role="${s.role}" data-setup-type="${s.setupType}" class="sequence-card ${s.side==='BUY'?'sequence-buy':'sequence-sell'}"><h4>${i+1}. ${s.role==='PRIMARY'?'แผนหลัก':'แผนสำรอง'} · ${esc(scenarioTitle(s))}</h4><div class="sequence-steps">${steps.map((step,j)=>`<div><h5>${j+1}. ${esc(step)}</h5>${locationDrawing(s,j)}<p>${j===0?'โซนเฝ้ารอ · แตะแล้วต้องตรวจ setup':'M15 ยืนยันก่อน · M5 ใช้หาจังหวะภายหลัง'}</p></div>`).join('')}</div><p class="sequence-transition">${esc(s.transition||s.structuralReason)}</p><p class="sequence-confirm">${esc(s.confirmation)}</p><p class="sequence-cancel">ยกเลิกฉาก: ${esc(s.invalidation)}</p></article>`;
  }).join('');
}
function locationScenarioSvg(report,plan){
  const text=(x,y,value,size=24,color='#edf3f5')=>`<text x="${x}" y="${y}" font-size="${size}" fill="${color}">${esc(value)}</text>`;
  const wrap=value=>diagramLines(value,67);
  let y=150,body='';
  for(const s of plan.scenarios){
    const steps=scenarioSteps(s),rows=wrap((s.transition||s.structuralReason)+'\n'+s.confirmation+'\nยกเลิกฉาก: '+s.invalidation),height=350+rows.length*32;
    const color=s.side==='BUY'?'#49d6c9':'#ff808b';
    body+=`<g transform="translate(0 ${y})"><rect x="20" y="8" width="1160" height="${height}" rx="18" fill="#102638" stroke="${color}"/>`;
    body+=text(45,52,`${s.role==='PRIMARY'?'แผนหลัก':'แผนสำรอง'} · ${scenarioTitle(s)}`,29,color);
    body+=text(45,95,steps[0],23)+text(615,95,steps[1],23);
    body+=`<g transform="translate(45 100)">${locationDrawing(s,0)}</g><g transform="translate(615 100)">${locationDrawing(s,1)}</g>`;
    rows.forEach((r,i)=>body+=text(45,335+i*32,r,23));
    body+='</g>';y+=height+24;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="${y+20}" viewBox="0 0 1200 ${y+20}"><rect width="1200" height="${y+20}" fill="#0b1928"/><g font-family="Noto Sans Thai, Tahoma, sans-serif">${text(40,48,'ตำแหน่งที่รอ → M15 ยืนยัน → M5 หาจังหวะ',34,'#f6cd78')}${text(40,88,'แผนผังระดับราคา ไม่ใช่กราฟราคาจริง · เส้นประ = เงื่อนไขสมมติ',23)}${text(40,125,`Snapshot ${report.snapshotAt} · ตัวอย่างเส้นทาง ไม่รับประกันราคา`,20)}${body}</g></svg>`;
}
