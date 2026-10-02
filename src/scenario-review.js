import {FRAME_MS,PRIMARY_SYMBOL} from './analysis-evidence.js';
import {confirmsM15,scenarioZone,selectedScenario,isRebaselineSetup,isBreakSetup} from './scenario-archetypes.js';
import {newsEmbargo,reportPolicy} from './desk-policy.js';
import {confirmedSwing} from './price-action.js';
const n=v=>Number.isFinite(v)&&v>0;
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export function buildScenarioReviewRules(report){
  const s=selectedScenario(report),definition=report.desk.reviewDefinition;
  if(!s||!definition)return null;
  if(isRebaselineSetup(s)&&(!s.baselineTransition||report.desk.baseline.mode!=='REFRESH'))return null;
  return {version:3,scenarioRole:s.role,side:s.side,setupType:s.setupType,
    selectedAt:report.snapshotAt,activation:'SELECTED_AT_PUBLICATION',
    m15:{type:s.m15Confirmation.type,zone:scenarioZone(s),breakPrice:s.breakPrice??null,acceptancePrice:s.acceptancePrice??null,breakFrame:isBreakSetup(s)?s.breakFrame:null},
    m5:structuredClone(definition.m5),invalidation:structuredClone(definition.invalidation),
    entry:'NEXT_M5_OPEN_WITHIN_ZONE',exit:'FULL_AT_TP1_OR_STOP',
    executionSource:'DESK_RULE_V3_NOT_PINE_FILL',stopTiming:report.desk.risk?.stopTiming||'UNAVAILABLE'};
}
export function validateScenarioReviewRules(report){
  const r=report.reviewRules,s=selectedScenario(report),d=report.desk;
  const ok=(v,m)=>{if(!v)throw new Error('Scenario replay V3: '+m);};
  ok(r?.version===3&&s&&r.scenarioRole===s.role&&r.side===s.side&&r.setupType===s.setupType&&r.selectedAt===report.snapshotAt&&r.activation==='SELECTED_AT_PUBLICATION','rules must belong to the explicitly selected published scenario');
  ok(same(r.m15,{type:s.m15Confirmation.type,zone:scenarioZone(s),breakPrice:s.breakPrice??null,acceptancePrice:s.acceptancePrice??null,breakFrame:isBreakSetup(s)?s.breakFrame:null}),'M15 rules must match original archetype');
  ok(r.entry==='NEXT_M5_OPEN_WITHIN_ZONE'&&r.exit==='FULL_AT_TP1_OR_STOP'&&r.executionSource==='DESK_RULE_V3_NOT_PINE_FILL','explicit simulation entry/exit rules');
  const m=r.m5;
  ok(m&&['TOUCH_THEN_DIRECTIONAL_CLOSE','RETEST_THEN_CLOSE','STRUCTURE_BREAK'].includes(m.confirmation)&&n(m.price)&&n(m.zone?.low)&&n(m.zone?.high)&&m.zone.low<=m.zone.high&&typeof m.reason==='string'&&m.reason.trim(),'explicit M5 threshold / zone / reason');
  if(m.confirmation!=='STRUCTURE_BREAK')ok(m.price>=m.zone.low&&m.price<=m.zone.high,'M5 threshold within its declared retest zone');
  else ok(confirmedSwing(m.levelEvidence,s.side==='BUY'?'SELL':'BUY')&&m.levelEvidence.every(e=>e.timeframe==='M5'&&Date.parse(e.closedAt)<=Date.parse(report.snapshotAt))&&m.price===m.levelEvidence[2].bar[s.side==='BUY'?'high':'low'],'M5 structure break needs a published confirmed swing anchor');
  const z=scenarioZone(s);ok(m.zone.low>=z.low&&m.zone.high<=z.high,'M5 fine-entry zone cannot create a new location setup');
  const rule=r.invalidation,tactical=d.invalidation.tactical;
  ok(rule&&['M5','M15','H1'].includes(rule.timeframe)&&['ABOVE','BELOW'].includes(rule.direction)&&n(rule.price)&&rule.timeframe===tactical.timeframe&&rule.price===tactical.price,'replay invalidation must match published tactical rule');
  ok(rule.direction===(s.side==='BUY'?'BELOW':'ABOVE'),'side-aware tactical failure');
  ok(same(r,buildScenarioReviewRules(report)),'replay differs from original explicit review definition');
}
export function reviewScenarioV3(report,pack){
  const base={planId:report.planId,checkedAt:pack.capturedAt,outcome:'ตรวจไม่ได้',resultStatus:'UNVERIFIABLE',simulatedR:null,timeline:[]};
  const fail=evidence=>({...base,evidence});
  try{validateScenarioReviewRules(report);}catch(e){return fail(e.message);}
  const rules=report.reviewRules,s=selectedScenario(report),published=Date.parse(pack.publication?.publishedAt),snapshot=Date.parse(report.snapshotAt),end=Date.parse(pack.capturedAt),expiry=Date.parse(report.validUntil);
  if(!Number.isFinite(published)||published<snapshot||published>end||pack.publication.planId!==report.planId)return fail('ขาด receipt เวลาเผยแพร่จริงของแผนต้นฉบับ');
  if(!Number.isFinite(expiry)||expiry<=published)return fail('แผนหมดอายุก่อนเผยแพร่หรือไม่มีเวลาสิ้นสุดที่พิสูจน์ได้');
  if(pack.gaps.length)return fail('หลักฐานมีช่องว่าง: '+pack.gaps.join('; '));
  const checkEnd=Math.min(end,expiry),frames=[...new Set(['M15','M5',rules.invalidation.timeframe,...(rules.m15.breakFrame==='H1'?['H1']:[])])];
  for(const frame of frames){
    const times=new Set((pack.frames[frame]||[]).map(b=>Date.parse(b.closedAt)));
    for(let t=Math.floor(published/FRAME_MS[frame])*FRAME_MS[frame]+FRAME_MS[frame];t<=checkEnd;t+=FRAME_MS[frame])if(!times.has(t))return fail('แท่งปิดไม่ต่อเนื่อง: '+frame+' '+new Date(t).toISOString());
  }
  const result={...base,reviewFrom:new Date(published).toISOString(),reviewTo:new Date(end).toISOString(),scenarioRole:s.role};
  const add=(type,bar,frame,price=bar.close,at=bar.closedAt)=>result.timeline.push({type,at,closedAt:bar.closedAt,timeframe:frame,symbol:PRIMARY_SYMBOL,price,bar:{...bar}});
  const ref=b=>({symbol:PRIMARY_SYMBOL,timeframe:'M15',closedAt:b.closedAt,bar:{open:b.open,high:b.high,low:b.low,close:b.close}});
  const match=r=>(pack.frames.M15||[]).some(b=>Date.parse(b.closedAt)===Date.parse(r.closedAt)&&['open','high','low','close'].every(k=>b[k]===r.bar[k]));
  let setupAt=null,htfBreakAt=null;
  if(rules.m15.breakFrame==='H1'&&s.breakState==='OBSERVED'){
    const bar=pack.frames.H1?.find(b=>Date.parse(b.closedAt)===Date.parse(s.breakClosedAt));
    if(!bar||!(s.side==='BUY'?bar.close>s.breakPrice:bar.close<s.breakPrice))return fail('ขาดหลักฐาน H1 break ที่ประกาศไว้');
    htfBreakAt=Date.parse(bar.closedAt);
  }
  if(s.m15Confirmation.state==='OBSERVED'){
    if(!s.m15Confirmation.evidence.every(match)||!confirmsM15(s))return fail('หลักฐาน M15 ที่เผยแพร่แล้วไม่ตรงกับแท่งต้นฉบับ');
    setupAt=Date.parse(s.m15Confirmation.evidence.at(-1).closedAt);
    if(rules.m15.breakFrame==='H1'&&(htfBreakAt==null||setupAt<htfBreakAt))return fail('M15 ต้องตามหลัง H1 break ที่พิสูจน์ได้');
    add('SETUP',s.m15Confirmation.evidence.at(-1).bar,'M15',s.m15Confirmation.evidence.at(-1).bar.close,s.m15Confirmation.evidence.at(-1).closedAt);
    // Event bars retain the closedAt separately even for references embedded in the original report.
    result.timeline.at(-1).closedAt=s.m15Confirmation.evidence.at(-1).closedAt;
  }
  const events=frames.flatMap(frame=>(pack.frames[frame]||[]).filter(b=>Date.parse(b.closedAt)>published&&Date.parse(b.closedAt)<=checkEnd).map(bar=>({frame,bar,t:Date.parse(bar.closedAt)})))
    .sort((a,b)=>a.t-b.t||(a.frame===rules.invalidation.timeframe?-1:b.frame===rules.invalidation.timeframe?1:a.frame==='M15'?-1:1));
  let touched=false,trigger=null;
  const buy=s.side==='BUY',direction=buy?1:-1;
  for(const {frame,bar,t}of events){
    if(frame===rules.invalidation.timeframe&&(rules.invalidation.direction==='ABOVE'?bar.close>rules.invalidation.price:bar.close<rules.invalidation.price)){
      add('INVALIDATED',bar,frame);return {...result,outcome:'ยกเลิก',resultStatus:'INVALIDATED',evidence:'แท่งปิดผ่าน tactical invalidation ก่อนเกิดราคาเข้า'};
    }
    if(frame==='H1'&&rules.m15.breakFrame==='H1'&&htfBreakAt==null&&t-FRAME_MS.H1>=published&&(buy?bar.close>s.breakPrice:bar.close<s.breakPrice))htfBreakAt=t;
    if(!setupAt&&frame==='M15'&&t-FRAME_MS.M15>=published){
      // Only candles that were fully formed after publication can confirm a pending setup.
      const refs=(pack.frames.M15||[]).filter(b=>Date.parse(b.closedAt)-FRAME_MS.M15>=published&&Date.parse(b.closedAt)<=t).map(ref);
      const needed=rules.m15.type==='SWING_RESUMPTION'?refs.length:['ENGULFING_CLOSE','FAILED_RECLAIM','STRUCTURE_RESUMPTION','BOS_CONFIRMATION'].includes(rules.m15.type)?2:1;
      if((rules.m15.breakFrame!=='H1'||htfBreakAt!=null&&t-FRAME_MS.M15>=htfBreakAt)&&confirmsM15(s,refs.slice(-needed))){setupAt=t;add('SETUP',bar,'M15');}
    }
    if(!setupAt||frame!=='M5'||t-FRAME_MS.M5<Math.max(published,setupAt))continue;
    const m=rules.m5;
    if(newsEmbargo(report.newsEvents,t,reportPolicy(report)).length){add('NEWS_FILTER',bar,'M5');touched=false;continue;}
    touched ||= bar.high>=m.zone.low&&bar.low<=m.zone.high;
    const crossed=direction*(bar.close-m.price)>0,body=direction*(bar.close-bar.open)>0;
    if(crossed&&(m.confirmation==='STRUCTURE_BREAK'||touched)&&(m.confirmation==='RETEST_THEN_CLOSE'||body)){
      trigger=t;add('TRIGGER',bar,'M5');break;
    }
  }
  if(!trigger)return {...result,outcome:end<expiry?'รอตรวจ':'ไม่เกิดสัญญาณ',resultStatus:end<expiry?'PENDING':'NO_SIGNAL',evidence:'ตรวจแท่งปิดครบถึงเวลาที่ระบุ ยังไม่มี M15 → M5 ตามกติกาต้นฉบับ'};
  result.outcome='เกิดสัญญาณ';
  const p=report.planLevels;
  if(!p||p.side!==s.side||!n(p.stop?.price)||!n(p.entry?.low)||!n(p.entry?.high)||!n(p.targets?.[0]?.price)||!Number.isFinite(p.costPerUnit)||p.costPerUnit<0)return {...result,resultStatus:'SIGNAL_ONLY',evidence:'ยืนยัน M15 และ M5 ได้ แต่แผนเดิมไม่มี Entry / Stop / Target ครบ จึงไม่คิด R'};
  if(trigger>=expiry||newsEmbargo(report.newsEvents,trigger,reportPolicy(report)).length)return {...result,resultStatus:'NO_FILL',evidence:'หมดเวลารับ entry หรืออยู่ในช่วงข่าว จึงไม่มีการเข้าจำลอง'};
  const bars=(pack.frames.M5||[]).filter(b=>Date.parse(b.closedAt)>trigger&&Date.parse(b.closedAt)<=end),first=bars[0];
  if(!first)return {...result,resultStatus:'SIGNAL_ONLY',evidence:'ยังไม่มีแท่งถัดไปเพื่อพิสูจน์ entry'};
  if(Date.parse(first.closedAt)!==trigger+FRAME_MS.M5)return fail('ขาดแท่งถัดจาก trigger');
  const entry=first.open;
  if(entry<p.entry.low||entry>p.entry.high||direction*(entry-p.stop.price)<=0||direction*(p.targets[0].price-entry)<=0)return {...result,resultStatus:'NO_FILL',evidence:'เปิดแท่งถัดไปนอกโซนหรือเลย Stop/Target'};
  add('ENTRY',first,'M5',entry,new Date(trigger).toISOString());
  let previous=trigger;
  for(const b of bars){
    if(Date.parse(b.closedAt)!==previous+FRAME_MS.M5)return {...result,resultStatus:'UNVERIFIABLE',simulatedR:null,evidence:'มี entry แต่ข้อมูลหลัง entry ขาดหาย จึงไม่เดาลำดับ TP/SL'};
    previous=Date.parse(b.closedAt);
    const stop=buy?b.low<=p.stop.price:b.high>=p.stop.price,target=buy?b.high>=p.targets[0].price:b.low<=p.targets[0].price;
    const stopGap=direction*(b.open-p.stop.price)<=0,targetGap=direction*(b.open-p.targets[0].price)>=0;
    if(stop&&target&&!stopGap&&!targetGap)return {...result,resultStatus:'AMBIGUOUS',evidence:'แท่งเดียวแตะ TP/SL ลำดับไม่ชัด ไม่คำนวณ R และไม่นับชนะ'};
    if(stop||target){const stopped=stopGap||(!targetGap&&stop),exit=stopped?(stopGap?b.open:p.stop.price):p.targets[0].price;
      add(stopped?'STOP':'TARGET',b,'M5',exit);
      return {...result,resultStatus:stopped?'SIMULATED_STOP':'SIMULATED_TP1',simulatedR:Math.round(((direction*(exit-entry)-p.costPerUnit)/(direction*(entry-p.stop.price)+p.costPerUnit))*100)/100,evidence:'ผลจำลองกติกา DESK V3 ที่เผยแพร่ไว้พร้อมแผน ใช้ต้นทุนที่ประกาศ ไม่ใช่ Pine fill หรือผลเทรดจริงของผู้ใช้'};
    }
  }
  return {...result,resultStatus:'OPEN_SIMULATION',evidence:'พิสูจน์ entry ได้ ยังไม่พบ TP/SL ในช่วงข้อมูล'};
}
