const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
export function validateScenarioPlan(report) {
  const plan = report.scenarioPlan;
  if (!plan) return null;
  if (plan.symbol !== 'PEPPERSTONE:XAUUSD' || Date.parse(plan.asOf) !== Date.parse(report.snapshotAt)) throw new Error('Scenario source/time must match report');
  if (!Array.isArray(plan.scenarios) || !plan.scenarios.length || plan.scenarios.length > 2) throw new Error('Use 1–2 scenarios');
  for (const s of plan.scenarios) {
    if (!['BUY','SELL'].includes(s.side) || !['M5','M15','H1'].includes(s.breakFrame) || !['M5','M15','H1'].includes(s.retestFrame)) throw new Error('Invalid scenario side/timeframe');
    if (![s.breakPrice,s.retestLow,s.retestHigh].every(Number.isFinite) || s.retestLow > s.retestHigh || s.breakPrice < s.retestLow || s.breakPrice > s.retestHigh) throw new Error('Invalid scenario levels');
    if (![s.confirmation,s.invalidation,s.evidence].every(v => typeof v === 'string' && v.trim())) throw new Error('Scenario needs confirmation, invalidation and evidence');
    if (!['WAITING','OBSERVED'].includes(s.breakState)) throw new Error('Invalid break state');
    if (s.breakState === 'OBSERVED' && (!s.breakClosedAt || !Number.isFinite(Date.parse(s.breakClosedAt)) || Date.parse(s.breakClosedAt) > Date.parse(report.snapshotAt))) throw new Error('Observed break requires closed-bar time');
  }
  return plan;
}
export function scenarioSvg(report) {
  const plan = validateScenarioPlan(report);
  if (!plan) return '';
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
    svg+=t(45,50,`${i+1}. ${buy?'ฉากฝั่งซื้อ':'ฉากฝั่งขาย'} · ${s.breakFrame} เบรก → ${s.retestFrame} รีเทสต์`,29,color);
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
