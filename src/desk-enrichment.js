import {isAlignedDesk,scenarioZone,scenarioTitle,scenarioSteps,zoneText,selectedScenario} from './scenario-archetypes.js';
import {locationCandidates} from './desk-location.js';
import {confirmedSwing,orderedClosed} from './price-action.js';
import {validateIndicatorVerification,sameIndicatorChart} from './indicator-profile.js';
const text=v=>typeof v==='string'&&v.trim();
const ok=(c,m)=>{if(!c)throw new Error('V4.3: '+m);};
const n=v=>Number.isFinite(v)?v.toLocaleString('en-US',{maximumFractionDigits:3}):'ยังไม่ยืนยัน';
const range=v=>Number.isFinite(v?.low)&&Number.isFinite(v?.high)&&v.low>0&&v.low<=v.high;
export function spdrFlow(history=[],at){
  const rows=[...history].sort((a,b)=>a.dataDate.localeCompare(b.dataDate));
  const unique=new Set();
  for(const row of rows){
    ok(/^\d{4}-\d\d-\d\d$/.test(row.dataDate)&&Number.isFinite(Date.parse(row.dataDate))&&new Date(row.dataDate).toISOString().slice(0,10)===row.dataDate&&row.dataDate<=at.slice(0,10)&&!unique.has(row.dataDate)&&Number.isFinite(row.holdings)&&row.holdings>0,'unique dated SPDR holdings');
    ok(/^https:\/\/(www\.)?spdrgoldshares\.com\//.test(row.sourceUrl||'')&&/(?:Z|[+-]\d\d:\d\d)$/.test(row.checkedAt||'')&&Number.isFinite(Date.parse(row.checkedAt))&&Date.parse(row.checkedAt)<=Date.parse(at),'SPDR official provenance / explicit checked timezone');
    unique.add(row.dataDate);
  }
  if(rows.length&&(Date.parse(at.slice(0,10))-Date.parse(rows.at(-1).dataDate)>7*86400000||Date.parse(at.slice(0,10))-Date.parse(rows[0].dataDate)>35*86400000))return {state:'PARTIAL',direction:'UNKNOWN',flowBias:'UNKNOWN',netChange:null,observations:rows.length,reason:'ประวัติเกินช่วงบริบทปัจจุบัน 35 วัน หรือวันล่าสุดเกิน 7 วัน; ไม่อ้างทิศทางปัจจุบัน'};
  if(rows.length<5||Date.parse(rows.at(-1).dataDate)-Date.parse(rows[0].dataDate)<4*86400000)return {state:'PARTIAL',direction:'UNKNOWN',flowBias:'UNKNOWN',netChange:null,observations:rows.length,reason:'ต้องมีอย่างน้อย 5 วันที่ตรวจได้ ครอบคลุม 4 วันขึ้นไป; วันขาดหายไม่แทนด้วยศูนย์'};
  const delta=rows.at(-1).holdings-rows[0].holdings,changes=rows.slice(1).map((r,i)=>r.holdings-rows[i].holdings);
  return {state:'AVAILABLE',direction:delta>0?'UP':delta<0?'DOWN':'FLAT',flowBias:changes.some(v=>v>0)&&changes.some(v=>v<0)?'MIXED':delta>0?'INFLOW':delta<0?'OUTFLOW':'UNKNOWN',
    netChange:Math.round(delta*1000)/1000,observations:rows.length,period:rows[0].dataDate+' → '+rows.at(-1).dataDate,reason:'ผลต่าง holdings ตามวันที่มีหลักฐาน ไม่อ้างว่าข้อมูลต่อเนื่องครบทุกวัน'};
}
export function zoneConfluence(report){
  const observations=report.desk.toolkit?.observations||[];
  return locationCandidates(report.desk.locationMatrix).map(c=>({candidateId:c.id,
    items:observations.filter(o=>o.state==='OBSERVED'&&!['BROKEN','INVALIDATED','HISTORICAL','FILLED'].includes(o.value?.status)&&(range(o.value)?o.value.high>=c.low&&o.value.low<=c.high:Number.isFinite(o.value)&&o.value>=c.low&&o.value<=c.high || Number.isFinite(o.value?.price)&&o.value.price>=c.low&&o.value.price<=c.high)).map(o=>({observationId:o.id,name:o.name,timeframe:o.timeframe,relation:o.value?.side&&o.value.side!==c.side?'CONTRADICT':'CONTEXT',reason:o.reason})),
    reason:'ความซ้อนทับของตำแหน่งที่สังเกต ไม่ใช่คะแนนโหวตหรือ entry signal'}));
}
export function planningRows(report){
  const d=report.desk,m=d.locationMatrix;
  return (report.scenarioPlan?.scenarios||[]).map(s=>{
    const z=scenarioZone(s),candidate=locationCandidates(m).find(c=>c.id===s.candidateId);
    const swings=(d.toolkit?.observations||[]).filter(o=>o.state==='OBSERVED'&&o.name===(s.side==='SELL'?'SWING_HIGH':'SWING_LOW')&&confirmedSwing(o.evidence,s.side)&&
      (s.side==='SELL'?o.value.price>=z.high:o.value.price<=z.low));
    swings.sort((a,b)=>s.side==='SELL'?a.value.price-b.value.price:b.value.price-a.value.price);
    const swing=swings[0],anchor=swing?{state:'VERIFIED_STRUCTURAL_ANCHOR',price:swing.value.price,at:swing.value.pivotAt,evidence:swing.evidence,reason:'confirmed pivot; ต้องกำหนด buffer และต้นทุนก่อนใช้ Stop'}:
      candidate?.stopAnchor?{state:'EXTREMUM_CANDIDATE',price:candidate.stopAnchor.price,evidence:candidate.stopAnchor.evidence,reason:'มี high/low ที่สังเกตแล้ว แต่ยังไม่มีแท่งรอบข้างพอยืนยัน swing'}:
      {state:'UNAVAILABLE',price:null,evidence:[],reason:'ยังไม่มีหลักฐาน structural swing นอกโซน'};
    const targets=d.dailySR.levels.filter(l=>['ACTIVE','FRESH','TESTED'].includes(l.status)&&(s.side==='SELL'?l.high<z.low:l.low>z.high)).sort((a,b)=>s.side==='SELL'?b.high-a.high:a.low-b.low);
    const targetCandidates=targets.slice(0,s.trendRelationship==='COUNTERTREND_SCALP'?1:3).map(l=>({price:s.side==='SELL'?l.high:l.low,evidence:l.evidence,levelId:l.id}));
    const selected=s.role===(d.activeScenarioRole||'PRIMARY'),p=selected?report.planLevels:null;
    return {role:s.role,side:s.side,setupType:s.setupType,title:scenarioTitle(s),zone:z,
      confirmation:scenarioSteps(s).join(' → '),transition:s.transition||'แผนหลักตามโครงสร้างใหญ่',
      state:p?'CONDITIONAL_EXECUTION':'WATCH_LOCATION',stopAnchor:anchor,targetCandidates,
      entry:p?.entry||null,actualStop:p?.stop||null,targets:p?.targets||[],netR:p?.netR??null,
      invalidation:s.invalidation,dxyFilter:d.dxy.reason,
      reason:p?'M15 ยืนยันแล้ว; ราคาเข้ายังต้องเป็นไปตาม M5 และต้นทุนล่าสุด':'โซน/แนวเป้าหมายเพื่อเตรียมแผน ยังไม่ใช่ Entry / Stop / TP พร้อมใช้'};
  });
}
const phase={TREND_IMPULSE:'เคลื่อนตามแนวโน้ม',PULLBACK:'พักตัวสวนภาพใหญ่',CONSOLIDATION:'สะสมราคาในกรอบ',BREAKOUT:'กำลังออกจากกรอบ',RETEST:'กลับทดสอบระดับ',TRANSITION:'กำลังเปลี่ยนโครงสร้าง',REVERSAL_CANDIDATE:'เฝ้าการกลับแนวโน้ม',UNAVAILABLE:'ยังยืนยันภาวะตลาดไม่ได้'};
export function practicalBrief(report){
  const d=report.desk,m=d.locationMatrix,scenarios=report.scenarioPlan?.scenarios||[],primary=scenarios[0],alternative=scenarios[1];
  const selected=selectedScenario(report)||primary;
  const primaryText=primary?scenarioTitle(primary)+' '+zoneText(scenarioZone(primary)):'รอโครงสร้างที่มีหลักฐาน';
  return {bias:d.baseline.bias,phase:phase[d.phase.name]||d.phase.name,
    location:m?.state==='AVAILABLE'?'ราคา '+n(m.currentPrice)+' · '+({BELOW_SELL_ZONE:'อยู่ใต้โซนเฝ้าขาย',ABOVE_BUY_ZONE:'อยู่เหนือโซนเฝ้าซื้อ',IN_ZONE:'อยู่ในโซนเฝ้ารอ',PASSED_ZONE:'เลยโซนแล้ว',WAITING_BREAK_BELOW:'รอฐานด้านล่างเสีย',WAITING_BREAK_ABOVE:'รอผ่านแนวต้านด้านบน'}[d.setup.locationRelation]||'ตรวจตำแหน่งตามแผน'):m?.reason||'ยังไม่มีราคาหลัก',
    primary:primaryText,confirmation:primary?scenarioSteps(primary).join(' → '):report.waitFor,
    activeRole:selected?.role||'PRIMARY',activePlan:selected?scenarioTitle(selected)+' '+zoneText(scenarioZone(selected)):'พักแผนเพื่อรอโครงสร้าง',
    activeConfirmation:selected?scenarioSteps(selected).join(' → '):report.waitFor,
    alternative:alternative?scenarioTitle(alternative)+' '+zoneText(scenarioZone(alternative))+' · '+alternative.transition:'ยังไม่มีแผนสำรองที่มีหลักฐานพอ',
    avoid:d.noTradeZones.filter(z=>z.active).map(z=>(range(z)?zoneText(z)+' · ':'')+z.detail).join(' · ')||'ตรวจ M5 ตามแผนและความเสี่ยงล่าสุด',
    cancellation:selected?.invalidation||d.baseline.invalidation,
    changed:report.changeSinceLast||'ยังไม่มีการเปรียบเทียบที่ยืนยันได้',
    next:report.waitFor,asOf:report.snapshotAt};
}
export function enrichDesk(report){
  if(!isAlignedDesk(report))return report;
  const d=report.desk;
  d.indicatorVerification ||= {state:'UNAVAILABLE',reason:'ยังไม่ได้ตรวจชื่อ โค้ด และ Inputs ในรอบนี้'};
  d.amm.source ||= {state:'UNAVAILABLE',reason:'ไม่มี output หรือสูตร AMM ต้นฉบับที่ตรวจได้'};
  d.spdr.history ||= [];
  d.dxy.conditions ||= [];
  d.news.context ||= [];
  d.zoneEvidence=zoneConfluence(report);
  d.planning={rows:planningRows(report),note:'แยกโซนเตรียมแผนกับแผนพร้อมใช้; swing ที่สังเกตไม่เท่ากับ actual Stop'};
  d.spdr.flowAssessment=spdrFlow(d.spdr.history||[],report.snapshotAt);
  if(d.spdr.history?.length){
    const series=[...d.spdr.history].sort((a,b)=>a.dataDate.localeCompare(b.dataDate)),latest=series.at(-1),previous=series.at(-2);
    Object.assign(d.spdr,{holdings:latest.holdings,dataDate:latest.dataDate,measure:'GOLD_HOLDINGS_TONNES',sourceUrl:latest.sourceUrl,
      direction:d.spdr.flowAssessment.direction,flowBias:d.spdr.flowAssessment.flowBias,
      dailyChange:previous?Math.round((latest.holdings-previous.holdings)*1000)/1000:null,changeFromDate:previous?.dataDate||null,
      previousHoldings:previous?.holdings??null,previousDate:previous?.dataDate||null});
    if(d.spdr.flowAssessment.state==='AVAILABLE')Object.assign(d.spdr,{period:d.spdr.flowAssessment.period,flowEvidence:d.spdr.flowAssessment.reason});
  }
  if(d.spdr.flowAssessment.state!=='AVAILABLE')Object.assign(d.spdr,{direction:'UNKNOWN',flowBias:'UNKNOWN'});
  d.practical=practicalBrief(report);
  const short=(value,max)=>{const chars=Array.from(value);return chars.length<=max?value:chars.slice(0,max-1).join('')+'…';};
  // Reserve space for no-trade risk even when an Alternative transition is long.
  report.summary=[short(d.practical.bias+' · '+d.practical.phase,45),short('กำลังตรวจ '+(d.practical.activeRole==='PRIMARY'?'แผนหลัก':'แผนสำรอง')+': '+d.practical.activePlan,90),short('ยืนยัน: '+d.practical.activeConfirmation,130),short('งดเข้า: '+d.practical.avoid,115),short('สำรอง: '+d.practical.alternative,100)].join('\n');
  return report;
}
export function validateEnrichment(report,references){
  if(!isAlignedDesk(report))return;
  const d=report.desk,at=Date.parse(report.snapshotAt);
  if(report.reviewSupport?.mode==='ARCHETYPE_REPLAY_V3')ok(report.reviewRules?.version===3,'replay support requires original numeric rules');
  if(report.reviewRules?.version===3)ok(report.reviewSupport?.mode==='ARCHETYPE_REPLAY_V3','replay mode must match rule version');
  validateIndicatorVerification(d.indicatorVerification,report.snapshotAt);
  if(d.indicatorVerification.state!=='UNAVAILABLE')ok(sameIndicatorChart(d.indicatorVerification.chartUrl,report.evidence.chartUrl),'indicator source/Inputs belong to the actual primary chart, not another layout');
  const source=d.amm.source;
  ok(source&&['UNAVAILABLE','OBSERVED_OUTPUT','FORMULA_VERIFIED'].includes(source.state)&&text(source.reason),'explicit AMM source state');
  if(source.state==='UNAVAILABLE')ok(d.amm.zones.length===0,'AMM unavailable must not relabel candle ranges as AMM');
  else {
    ok(text(source.name)&&/^https:\/\//.test(source.sourceUrl||'')&&Number.isFinite(Date.parse(source.checkedAt))&&Date.parse(source.checkedAt)<=at,'AMM output source/time');
    if(source.state==='FORMULA_VERIFIED')ok(/^[a-f0-9]{64}$/.test(source.formulaSha256||'')&&source.inputs&&source.verificationMethod==='SOURCE_AND_INPUTS','AMM formula must actually be identified');
    for(const z of d.amm.zones)ok(z.provenance?.sourceName===source.name&&z.provenance.observedAt===source.checkedAt&&['DATA_WINDOW','CHART_LABEL','PERMITTED_EXPORT'].includes(z.provenance.method),'AMM observed output provenance');
  }
  const observations=d.toolkit?.observations||[],ids=new Set();
  for(const o of observations){
    ok(text(o.id)&&!ids.has(o.id),'unique technical observation ids');ids.add(o.id);
    if(o.state!=='OBSERVED')continue;
    if(['SWING_HIGH','SWING_LOW'].includes(o.name)){
      const side=o.name==='SWING_HIGH'?'SELL':'BUY';
      ok(confirmedSwing(o.evidence,side)&&o.value?.side===side&&o.value?.pivotAt===o.evidence[2].closedAt&&o.value.price===o.evidence[2].bar[side==='SELL'?'high':'low'],'swing needs confirmed neighbors, not a lone extreme');
    }
    if(o.name==='SUPPLY_DEMAND')ok(range(o.value)&&['BUY','SELL'].includes(o.value.side)&&['ACTIVE','FRESH','TESTED','BROKEN','HISTORICAL'].includes(o.value.status)&&text(o.sourceName)&&/^https:\/\//.test(o.sourceUrl||''),'observed supply/demand output provenance');
    if(o.name==='FVG'&&o.method==='DESK_CLOSED_OHLC_V1'){
      const refs=o.evidence,a=refs[0]?.bar,b=refs[2]?.bar;
      ok(refs.length===3&&orderedClosed(refs,o.timeframe)&&range(o.value)&&['BUY','SELL'].includes(o.value.side)&&
        (o.value.side==='BUY'?b.low>a.high&&o.value.low===a.high&&o.value.high===b.low:b.high<a.low&&o.value.low===b.high&&o.value.high===a.low),'derived FVG must match its three closed wick ranges');
    }
  }
  ok(JSON.stringify(d.zoneEvidence)===JSON.stringify(zoneConfluence(report)),'zone confluence must match observations');
  ok(d.planning&&JSON.stringify(d.planning.rows)===JSON.stringify(planningRows(report)),'planning anchors/targets must match actual evidence');
  for(const row of d.planning.rows){if(row.stopAnchor.evidence.length)references(row.stopAnchor.evidence,at);for(const t of row.targetCandidates)references(t.evidence,at);}
  ok(JSON.stringify(d.spdr.flowAssessment)===JSON.stringify(spdrFlow(d.spdr.history||[],report.snapshotAt)),'SPDR flow must match dated series');
  if(d.spdr.history?.length){const series=[...d.spdr.history].sort((a,b)=>a.dataDate.localeCompare(b.dataDate)),last=series.at(-1),previous=series.at(-2);ok(d.spdr.holdings===last.holdings&&d.spdr.dataDate===last.dataDate&&d.spdr.direction===d.spdr.flowAssessment.direction&&d.spdr.flowBias===d.spdr.flowAssessment.flowBias,'SPDR latest/flow cannot differ from history');ok(d.spdr.changeFromDate===(previous?.dataDate||null)&&d.spdr.previousDate===(previous?.dataDate||null)&&d.spdr.previousHoldings===(previous?.holdings??null)&&d.spdr.dailyChange===(previous?Math.round((last.holdings-previous.holdings)*1000)/1000:null),'SPDR change must name its actual prior observation date');}
  if(d.spdr.flowAssessment.state!=='AVAILABLE')ok(d.spdr.direction==='UNKNOWN'&&d.spdr.flowBias==='UNKNOWN','too little SPDR history cannot become a medium-term flow claim');
  if(d.dxy.frames?.some(f=>f.direction!=='UNAVAILABLE')){
    const h1=d.dxy.frames.find(f=>f.timeframe==='H1'&&f.direction!=='UNAVAILABLE');
    ok(h1&&at-Date.parse(h1.evidence.at(-1).closedAt)<=2*3600000,'DXY HTF context needs a fresh closed H1 check; old frames are not a current filter');
  }
  for(const c of d.dxy.conditions||[]){
    ok(['CONFIRM','CONTRADICT','NEUTRAL'].includes(c.effect)&&['ABOVE','BELOW'].includes(c.direction)&&['H1','H4','D1','M15'].includes(c.timeframe)&&Number.isFinite(c.price)&&c.price>0&&text(c.reason),'DXY conditional filter');
    const f=d.dxy.frames?.find(f=>f.timeframe===c.timeframe);
    ok(f?.direction!=='UNAVAILABLE'&&f?.evidence?.some(r=>[r.bar.high,r.bar.low,r.bar.close].includes(c.price)),'DXY level needs an actual closed structural anchor');
  }
  for(const c of d.news.context||[]){
    ok(text(c.fact)&&text(c.interpretation)&&text(c.goldMechanism)&&text(c.monitor)&&/^https:\/\//.test(c.sourceUrl||'')&&/(?:Z|[+-]\d\d:\d\d)$/.test(c.checkedAt||'')&&Number.isFinite(Date.parse(c.checkedAt))&&Date.parse(c.checkedAt)<=at,'news fact / inference / mechanism / monitor / source required');
    if(c.kind==='EVENT'){const e=report.newsEvents?.find(e=>e.title===c.eventTitle&&e.at===c.eventAt&&e.sourceUrl===c.sourceUrl);ok(e,'news context must reference a verified event');}
    else ok(['YIELD','HEADLINE'].includes(c.kind)&&/^\d{4}-\d\d-\d\d$/.test(c.dataDate)&&c.dataDate<=report.snapshotAt.slice(0,10),'dated news/yield context');
  }
  ok(JSON.stringify(d.practical)===JSON.stringify(practicalBrief(report)),'practical summary must use the same scenario and levels');
}
