import { isBreakSetup, scenarioZone, zoneText, setupType,confirmationTitle } from './scenario-archetypes.js';
const active=z=>['ACTIVE','FRESH','TESTED'].includes(z.status);
const frames={M15:1,H1:2,H4:3,D1:4,W1:5};
const range=z=>Number.isFinite(z.low)&&Number.isFinite(z.high)&&z.low>0&&z.low<=z.high;
export function zoneRelation(side,z,current,type='PULLBACK_CONTINUATION',breakState='WAITING') {
  if(!Number.isFinite(current)||!range(z))return 'UNKNOWN';
  if(type==='BREAK_RETEST_CONTINUATION'&&breakState==='WAITING')return side==='SELL'?'WAITING_BREAK_BELOW':'WAITING_BREAK_ABOVE';
  if(current>=z.low&&current<=z.high)return 'IN_ZONE';
  if(side==='SELL')return current<z.low?'BELOW_SELL_ZONE':'PASSED_ZONE';
  return current>z.high?'ABOVE_BUY_ZONE':'PASSED_ZONE';
}
export function scanLocations(report) {
  const d=report.desk,q=report.evidence?.quote,at=Date.parse(report.snapshotAt);
  const result={state:'UNAVAILABLE',reason:'ยังไม่มีราคาหลักที่ตรวจได้สำหรับสำรวจตำแหน่ง',currentPrice:null,quoteAt:null,
    aboveCandidates:[],atCandidates:[],belowCandidates:[],continuationLevels:[],criticalLevels:[]};
  if(report.dataQuality?.status==='UNAVAILABLE'||!q||q.symbol!=='PEPPERSTONE:XAUUSD'||
    ![q.bid,q.ask].every(v=>Number.isFinite(v)&&v>0)||q.ask<q.bid||!Number.isFinite(at)||!Number.isFinite(Date.parse(q.at))||at<Date.parse(q.at)||at-Date.parse(q.at)>120000)return result;
  const current=(q.bid+q.ask)/2;
  Object.assign(result,{state:'AVAILABLE',reason:'สำรวจระดับที่มีหลักฐาน; candidate ยังไม่ใช่จุดเข้า',currentPrice:current,quoteAt:q.at});
  const levels=(d.dailySR?.levels||[]).filter(active);
  const extrema=levels.flatMap(l=>(l.evidence||[]).filter(r=>r.bar).map(r=>({ref:r,level:l})));
  const make=(z,id,sourceLayer,sourceId,type,side)=>{
    const evidence=z.evidence||[],sourceFrame=evidence.map(r=>r.timeframe).sort((a,b)=>frames[b]-frames[a])[0];
    const aligned=d.baseline.status==='ACTIVE'&&side===d.baseline.bias;
    const stops=extrema.filter(({ref:r})=>['H1','H4','D1','W1','M15'].includes(r.timeframe)&&
      (side==='SELL'?r.bar.high>=z.high:r.bar.low<=z.low));
    stops.sort((a,b)=>(side==='SELL'?a.ref.bar.high-b.ref.bar.high:b.ref.bar.low-a.ref.bar.low)||frames[b.ref.timeframe]-frames[a.ref.timeframe]);
    const targets=levels.filter(l=>side==='SELL'?l.high<z.low:l.low>z.high);
    targets.sort((a,b)=>side==='SELL'?b.high-a.high:a.low-b.low);
    const stop=stops[0]?.ref,targetLevel=targets[0];
    const targetRef=targetLevel?.evidence?.find(r=>side==='SELL'?[r.bar.high,r.bar.low].includes(targetLevel.high):[r.bar.high,r.bar.low].includes(targetLevel.low));
    return {id,side,low:z.low,high:z.high,type,sourceFrame,sourceLayer,sourceId,status:z.status,
      relationToCurrentPrice:current<z.low?'ABOVE':current>z.high?'BELOW':'AT_ZONE',distance:Math.max(z.low-current,current-z.high,0),
      htfAlignment:aligned?'WITH_TREND':d.baseline.status==='ACTIVE'&&['BUY','SELL'].includes(d.baseline.bias)?'OPPOSING':'UNKNOWN',phaseAlignment:['PULLBACK','RETEST'].includes(d.phase.name)&&aligned?'FIT':'REVIEW_REQUIRED',
      opposingLiquidity:'UNKNOWN',stopAnchorAvailable:Boolean(stop),targetAnchorAvailable:Boolean(targetRef),
      stopAnchor:stop?{price:side==='SELL'?stop.bar.high:stop.bar.low,kind:'OBSERVED_EXTREMUM_CANDIDATE',evidence:[stop]}:null,
      targetAnchor:targetRef?{price:side==='SELL'?targetLevel.high:targetLevel.low,kind:'OBSERVED_OPPOSING_LEVEL',evidence:[targetRef]}:null,
      evidence,selectedForScenario:null};
  };
  for(const l of levels){
    if(!range(l))continue;
    if(l.type==='CRITICAL')result.criticalLevels.push({...l});
    const side=l.side || (l.low>current?'SELL':l.high<current?'BUY':null);
    if(!['BUY','SELL'].includes(side))continue;
    const c=make(l,'SR:'+l.id,'DAILY_SR',l.id,l.type,side);
    result[c.relationToCurrentPrice==='ABOVE'?'aboveCandidates':c.relationToCurrentPrice==='BELOW'?'belowCandidates':'atCandidates'].push(c);
  }
  for(const [i,z]of(d.amm?.zones||[]).entries()){
    if(!['ACTIVE','TESTED'].includes(z.status)||!range(z))continue;
    const c=make(z,'AMM:'+(z.id||i),'AMM',z.id||String(i),'TACTICAL',z.side);
    c.purpose=z.purpose||'FILTER_ONLY';
    result[c.relationToCurrentPrice==='ABOVE'?'aboveCandidates':c.relationToCurrentPrice==='BELOW'?'belowCandidates':'atCandidates'].push(c);
  }
  for(const [i,s]of(d.opportunityInputs?.continuationScenarios||[]).entries()){
    const z=scenarioZone(s);
    result.continuationLevels.push({id:'CONTINUATION:'+i,side:s.side,price:s.breakPrice,low:z.low,high:z.high,
      sourceFrame:s.breakFrame,evidence:s.levelEvidence||[],scenario:structuredClone(s),selectedForScenario:null});
  }
  // Lexicographic location/structure ranking, never an indicator-score vote.
  const rank=(a,b)=>(a.htfAlignment!=='WITH_TREND')-(b.htfAlignment!=='WITH_TREND')||
    (a.phaseAlignment!=='FIT')-(b.phaseAlignment!=='FIT')||
    (a.type==='TACTICAL')-(b.type==='TACTICAL')||
    Number(b.stopAnchorAvailable)-Number(a.stopAnchorAvailable)||Number(b.targetAnchorAvailable)-Number(a.targetAnchorAvailable)||a.distance-b.distance;
  for(const key of ['aboveCandidates','atCandidates','belowCandidates'])result[key].sort(rank);
  return result;
}
export const locationCandidates=m=>[...m.aboveCandidates,...m.atCandidates,...m.belowCandidates];
export function chooseLocationScenarios(report,matrix) {
  const d=report.desk;
  if(matrix.state!=='AVAILABLE'||d.baseline.status!=='ACTIVE'||d.tacticalState!=='ACTIVE')return [];
  const side=d.baseline.bias;
  const candidates=[...matrix.atCandidates,...(side==='SELL'?matrix.aboveCandidates:side==='BUY'?matrix.belowCandidates:[])];
  const c=candidates.find(c=>c.side===side&&c.htfAlignment==='WITH_TREND'&&c.sourceLayer==='DAILY_SR');
  const continuation=matrix.continuationLevels.find(c=>c.side===side);
  const result=[];
  if(c&&['PULLBACK','RETEST','CONSOLIDATION'].includes(d.phase.name)){
    result.push({role:'PRIMARY',side,setupType:'PULLBACK_CONTINUATION',trendRelationship:'WITH_TREND',
      candidateId:c.id,zone:{low:c.low,high:c.high},sourceFrame:c.sourceFrame,sourceLayer:c.sourceLayer,levelEvidence:c.evidence,
      setupFrame:'M15',triggerFrame:'M5',m15Confirmation:{type:'REJECTION_CLOSE',state:'PENDING',evidence:[]},
      structuralReason:`${d.baseline.bias} · ${d.phase.name}: ${side==='SELL'?'ประเมินแนวต้านเหนือราคา':'ประเมินแนวรับใต้ราคา'}ก่อนแผนเบรก`,
      confirmation:'รอ M15 ยืนยันปฏิกิริยาที่โซน แล้ว M5 หาจังหวะ; แตะโซนอย่างเดียวไม่ใช่สัญญาณ',
      invalidation:'พักฉากเมื่อโครงสร้างที่รองรับโซนเสีย; ตรวจเงื่อนไข tactical/structural ของรายงาน',
      evidence:'candidate จากระดับ Daily SR ที่มีแท่งปิดอ้างอิง ไม่ใช่ Entry พร้อมใช้'});
  }
  if(continuation){
    const s=structuredClone(continuation.scenario);
    Object.assign(s,{setupType:'BREAK_RETEST_CONTINUATION',trendRelationship:'WITH_TREND',role:result.length?'ALTERNATIVE':'PRIMARY'});
    if(result.length)Object.assign(s,{activateWhen:'PRIMARY_NOT_REACHED',transition:'หากราคาไม่เข้าโซนแผนหลักและ M15 ยืนยันการเบรก ให้ตรวจฉาก continuation แทน'});
    result.push(s);
  }
  return result.slice(0,2);
}
export function attachLocationScan(report) {
  const d=report.desk,matrix=scanLocations(report);
  if(d.scenarioSelection?.mode==='AUTO'||!report.scenarioPlan?.scenarios?.length){
    const scenarios=chooseLocationScenarios(report,matrix);
    report.scenarioPlan=scenarios.length?{symbol:'PEPPERSTONE:XAUUSD',asOf:report.snapshotAt,scenarios}:undefined;
    if(!scenarios.length){
      d.waitZones=[];report.planLevels=null;d.invalidation.actualStop=null;
      if(d.rebaseline.state!=='REQUIRED'){
        d.setup.status='UNAVAILABLE';d.setup.reason='ยังไม่มีฉากที่เหมาะกับโครงสร้าง/phase และข้อมูลที่ตรวจได้';
        d.trigger={timeframe:'M5',state:'UNAVAILABLE',condition:'เลือกฉากจาก location และ M15 ก่อนกำหนด M5 trigger'};
        d.entryIdea=d.setup.reason;report.waitFor=d.trigger.condition;
      }
    }
    d.scenarioSelection={mode:'AUTO',reason:'เลือกจากโครงสร้าง/ตำแหน่ง/phase ก่อนชนิด setup; ไม่ยืนยัน M15 หรือความเสี่ยงโดยอัตโนมัติ'};
    d.activeScenarioRole='PRIMARY';
    const primary=scenarios[0];
    if(primary){
      Object.assign(d.setup,{side:primary.side,status:'PENDING',evidence:[],reason:'รอ M15 ยืนยันตามชนิดแผนที่เลือกจาก location scan'});
      d.waitZones=scenarios.map((s,i)=>({side:s.side,purpose:isBreakSetup(s)?s.side==='SELL'?'BREAKDOWN_RETEST':'BREAKOUT_RETEST':s.side==='SELL'?'SELL_PULLBACK':'BUY_PULLBACK',
        priority:i===0?'PRIMARY':'ALTERNATIVE',sourceLayer:s.sourceLayer||'PRICE_STRUCTURE',setupType:setupType(s),
        low:scenarioZone(s).low,high:scenarioZone(s).high,relationToCurrentPrice:matrix.currentPrice<scenarioZone(s).low?'ABOVE':matrix.currentPrice>scenarioZone(s).high?'BELOW':'AT_ZONE',
        condition:s.confirmation,evidence:s.levelEvidence}));
      d.entryIdea=scenarios.map(s=>`${s.role}: ${s.side} · ${zoneText(scenarioZone(s))} · ${s.confirmation}`).join('\n');
      report.waitFor='รอ M15 '+confirmationTitle(primary.m15Confirmation.type)+' ที่ '+zoneText(scenarioZone(primary))+' ก่อนตรวจ M5 หาจังหวะ';
      d.trigger={timeframe:'M5',state:'PENDING',condition:'หลัง M15 ยืนยันแผน '+primary.side+' จึงตรวจ M5 ที่โซน '+zoneText(scenarioZone(primary))+'; ยังไม่มีแท่ง trigger ที่ยืนยันแล้ว'};
      report.planLevels=null;d.invalidation.actualStop=null;
    }
  }
  for(const s of report.scenarioPlan?.scenarios||[]){
    const z=scenarioZone(s),c=locationCandidates(matrix).find(c=>c.id===s.candidateId || c.side===s.side&&c.low===z.low&&c.high===z.high);
    if(c)c.selectedForScenario=s.role;
    const continuation=matrix.continuationLevels.find(c=>c.side===s.side&&c.price===s.breakPrice);
    if(continuation)continuation.selectedForScenario=s.role;
  }
  const selected=report.scenarioPlan?.scenarios?.find(s=>s.role===(d.activeScenarioRole||'PRIMARY'));
  // Rebuild selected wait zones from the same scenarios used by prose and diagrams.
  if(report.scenarioPlan?.scenarios?.length)d.waitZones=report.scenarioPlan.scenarios.map(s=>{
    const z=scenarioZone(s);return {side:s.side,purpose:isBreakSetup(s)?s.side==='SELL'?'BREAKDOWN_RETEST':'BREAKOUT_RETEST':s.side==='SELL'?'SELL_PULLBACK':'BUY_PULLBACK',
      priority:s.role,sourceLayer:s.sourceLayer||'PRICE_STRUCTURE',setupType:setupType(s),...z,
      relationToCurrentPrice:matrix.state!=='AVAILABLE'?'UNKNOWN':matrix.currentPrice<z.low?'ABOVE':matrix.currentPrice>z.high?'BELOW':'AT_ZONE',condition:s.confirmation,evidence:s.levelEvidence};
  });
  if(selected)d.setup.locationRelation=zoneRelation(selected.side,scenarioZone(selected),matrix.currentPrice,setupType(selected),selected.breakState);
  if(selected&&d.setup.status==='CONFIRMED'&&d.trigger.state==='PENDING')report.waitFor=d.trigger.condition;
  d.locationMatrix=matrix;
  return report;
}
export function locationPriceLevels(report) {
  const d=report.desk,m=d.locationMatrix;
  if(!m||m.state!=='AVAILABLE')return [];
  const levels=[{kind:'CURRENT',price:String(Number(m.currentPrice.toFixed(3))),label:'ราคาที่สังเกต ณ snapshot · ไม่ใช่ราคาสดต่อเนื่อง'}];
  const sell=[...m.atCandidates,...m.aboveCandidates].find(c=>c.side==='SELL'),buy=[...m.atCandidates,...m.belowCandidates].find(c=>c.side==='BUY');
  for(const c of [sell,buy].filter(Boolean))levels.push({kind:'CANDIDATE',side:c.side,price:zoneText(c),low:c.low,high:c.high,
    label:(c.relationToCurrentPrice==='AT_ZONE'?'ขณะนี้อยู่ในโซนเฝ้า '+c.side:c.side==='SELL'?'โซนเฝ้าขายด้านบน':'โซนเฝ้าซื้อด้านล่าง')+' · ยังไม่ใช่ Entry',candidateId:c.id});
  for(const l of m.criticalLevels.slice(0,2))levels.push({kind:'CRITICAL',price:zoneText(l),low:l.low,high:l.high,label:'Critical · เฝ้าการเปลี่ยนโครงสร้าง',sourceId:l.id});
  const noTrade=d.noTradeZones.find(z=>z.active&&range(z));
  if(noTrade)levels.push({kind:'NO_TRADE',price:zoneText(noTrade),low:noTrade.low,high:noTrade.high,label:'พื้นที่งดเปิดเทรด'});
  const continuation=m.continuationLevels[0];
  if(continuation)levels.push({kind:'TRIGGER',price:String(continuation.price),label:'ระดับเฝ้า continuation · ต้องยืนยันก่อน'});
  return levels.slice(0,7);
}
