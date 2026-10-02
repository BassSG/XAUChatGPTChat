import { DESK_POLICY, LOCATION_POLICY, reportPolicy, newsEmbargo } from './desk-policy.js';
import {isLocationDesk,isAlignedDesk,isBreakSetup,isRebaselineSetup,selectedScenario,scenarioZone,confirmsM15} from './scenario-archetypes.js';
import {scanLocations,locationCandidates,zoneRelation,locationPriceLevels} from './desk-location.js';
import {validateDeskContext} from './desk-context.js';
import {validateScenarioPlan} from './scenario-plan.js';
import {validateEnrichment} from './desk-enrichment.js';
import {validateScenarioReviewRules} from './scenario-review.js';
export const HIERARCHY = ['XAU_HTF', 'DAILY_SR', 'AMM', 'M15_SETUP', 'M5_TRIGGER', 'DXY_FILTER'];
export const PHASES = ['TREND_IMPULSE','PULLBACK','CONSOLIDATION','BREAKOUT','RETEST','TRANSITION','REVERSAL_CANDIDATE','UNAVAILABLE'];
export const NO_TRADE = {
  CONSOLIDATION_MIDPOINT: 'กลางกรอบสะสมราคา', HTF_M15_CONFLICT: 'M15 ขัดโครงสร้างใหญ่',
  ABNORMAL_SPREAD: 'spread กว้างหรือยังตรวจไม่ได้', NEWS_EMBARGO: 'อยู่ในช่วงพักก่อน/หลังข่าว',
  EXTENDED_ENTRY: 'ราคาเลยโซนเข้า', MISSING_STOP: 'ยังไม่มี Stop ตามโครงสร้าง',
  OPPOSING_LIQUIDITY: 'สภาพคล่องฝั่งตรงข้ามใกล้เกินไป', INSUFFICIENT_EVIDENCE: 'หลักฐานยังไม่พอ',
  LOW_NET_R: 'ผลตอบแทนสุทธิต่ำกว่าเกณฑ์', REBASELINE: 'พักแผนเดิมเพื่อประเมินโครงสร้างใหม่',
  BASELINE_REFRESH: 'ต้องตรวจฐานกรอบใหญ่ใหม่',
  M15_PENDING: 'ยังรอ M15 ยืนยัน setup', MARKET_CLOSED:'ตลาดปิดตามหลักฐานที่ตรวจได้',
  MISSING_ENTRY:'ยังไม่มีโซนเข้าที่ตรวจสอบได้',MISSING_TARGET:'ยังไม่มีเป้าตามโครงสร้างที่ตรวจสอบได้',LIQUIDITY_UNVERIFIED:'ยังตรวจระยะถึงสภาพคล่องฝั่งตรงข้ามไม่ได้'
};
const ok = (condition, message) => { if (!condition) throw new Error('V4: ' + message); };
const text = v => typeof v === 'string' && v.trim().length > 0;
const time = v => typeof v === 'string' && /(?:Z|[+-]\d\d:\d\d)$/.test(v) ? Date.parse(v) : NaN;
const price = v => Number.isFinite(v) && v > 0;
const range = z => z && price(z.low) && price(z.high) && z.low <= z.high;
const sides = ['BUY','SELL','NEUTRAL','UNAVAILABLE'];
const active = level => ['ACTIVE','FRESH','TESTED'].includes(level.status);
const minutes = { M5:5, M15:15, H1:60, H4:240, D1:1440, W1:10080 };
function evidenceRef(ref, snapshot) {
  ok(ref && minutes[ref.timeframe] && ref.symbol === 'PEPPERSTONE:XAUUSD', 'structural evidence needs Pepperstone timeframe');
  ok(Number.isFinite(time(ref.closedAt)) && time(ref.closedAt) <= snapshot, 'structural evidence must be closed');
  ok(ref.bar && ['open','high','low','close'].every(k => price(ref.bar[k])) && ref.bar.high >= Math.max(ref.bar.open,ref.bar.close) && ref.bar.low <= Math.min(ref.bar.open,ref.bar.close), 'structural evidence needs actual OHLC');
}
function references(value, snapshot) {
  ok(Array.isArray(value) && value.length > 0, 'observed structures need evidence references');
  value.forEach(ref => evidenceRef(ref, snapshot));
}
export function baselineNeedsRefresh(baseline, snapshotAt) {
  const now = time(snapshotAt);
  return baseline.status !== 'ACTIVE' || !Number.isFinite(time(baseline.createdAt)) ||
    now - time(baseline.createdAt) > DESK_POLICY.baselineMaxHours * 3600000 ||
    !Number.isFinite(time(baseline.checkedAt)) || now - time(baseline.checkedAt) > DESK_POLICY.baselineCheckMinutes * 60000 ||
    !Number.isFinite(time(baseline.refreshAt)) || now >= time(baseline.refreshAt);
}
// Explicit closed-bar observations drive a state transition; scores are never inputs.
export function rebaselineReasons(desk, events = []) {
  const result = [];
  for (const signal of desk.rebaseline.signals) {
    const zone = desk.dailySR.levels.find(l => l.id === signal.levelId && l.type === 'CRITICAL' && active(l));
    if (!zone) continue;
    const refs = signal.evidence;
    const beyond = r => signal.direction === 'ABOVE' ? r.bar.close > zone.high : r.bar.close < zone.low;
    const displaced = r => beyond(r) && Math.abs(r.bar.close-r.bar.open) / Math.max(r.bar.high-r.bar.low,0.00001) >= DESK_POLICY.displacementBodyRatio;
    const ordered = refs.every((r,i) => !i || time(r.closedAt) > time(refs[i-1].closedAt));
    let confirmed = false;
    if (signal.type === 'H1_ACCEPTANCE') confirmed = refs.length >= 2 && ordered && refs.every(r => r.timeframe === 'H1' && beyond(r));
    if (signal.type === 'DISPLACEMENT_RETEST' && refs.length >= 2 && ordered) {
      const [first,last] = [refs[0],refs.at(-1)];
      confirmed = ['H1','H4'].includes(first.timeframe) && displaced(first) && ['M15','H1'].includes(last.timeframe) &&
        time(last.closedAt) - minutes[last.timeframe]*60000 >= time(first.closedAt) && beyond(last) && last.bar.low <= zone.high && last.bar.high >= zone.low;
    }
    if (signal.type === 'STRUCTURE_SHIFT') confirmed = refs.length >= 2 && ordered && refs.every(r => ['H1','H4'].includes(r.timeframe)) &&
      beyond(refs.at(-1)) && (signal.direction === 'ABOVE' ? refs.at(-1).bar.close > refs[0].bar.high : refs.at(-1).bar.close < refs[0].bar.low);
    if (signal.type === 'POST_NEWS_DISPLACEMENT' && refs.length >= 2 && ordered) {
      const [prior,last] = [refs[0],refs.at(-1)];
      confirmed = ['M15','H1'].includes(last.timeframe) && last.timeframe === prior.timeframe && displaced(last) &&
        last.bar.high-last.bar.low >= (prior.bar.high-prior.bar.low)*DESK_POLICY.abnormalRangeMultiple &&
        events.some(e => e.currency === 'USD' && e.impact === 'HIGH' && time(last.closedAt)-minutes[last.timeframe]*60000 >= time(e.at) && time(last.closedAt)-time(e.at) <= DESK_POLICY.postNewsReviewMinutes*60000);
    }
    if (confirmed) result.push(signal.type);
  }
  return [...new Set(result)];
}
export function applyRebaseline(report) {
  const next = structuredClone(report);
  const d = next.desk;
  const reasons = rebaselineReasons(d, next.newsEvents);
  if (!reasons.length) return next;
  d.rebaseline.state = 'REQUIRED'; d.rebaseline.reasons = reasons;
  d.baseline.status = 'SUSPENDED'; d.tacticalState = 'SUSPENDED';
  d.dailySR.levels = d.dailySR.levels.map(l => l.type === 'TACTICAL' ? {...l,status:'HISTORICAL'} : l);
  d.amm.zones = d.amm.zones.map(z => ({...z,status:'HISTORICAL'}));
  d.setup.status = 'SUSPENDED'; next.planLevels = null; next.status = 'WAIT';
  next.scenarioPlan = undefined;
  next.reviewRules = undefined;
  if(isAlignedDesk(next))delete d.reviewDefinition;
  if(isLocationDesk(next)){
    d.waitZones=[];d.activeScenarioRole='PRIMARY';d.setup.locationRelation='UNKNOWN';d.setup.priceLocation='UNKNOWN';
    d.opportunityInputs={continuationScenarios:[]};d.phase={name:'TRANSITION',location:'UNKNOWN',reason:'โครงสร้างเดิมถูกพัก ต้องประเมินฐานใหม่จากสัญญาณ Re-baseline'};
  }
  d.trigger = {timeframe:'M5',state:'UNAVAILABLE',condition:'พัก trigger เดิม รอ baseline ใหม่และ M15 ยืนยัน'};
  next.waitFor = 'ตรวจโครงสร้างใหญ่ใหม่หลังผ่าน Critical Zone ก่อนสร้าง M15 setup และ M5 trigger';
  if(isLocationDesk(next))d.entryIdea=next.waitFor;
  return next;
}
export function deskReadiness(report) {
  if (report.schemaVersion !== 4) return null;
  const d = report.desk, reasons = [], policy=reportPolicy(report), selected=selectedScenario(report);
  const e=report.evidence || {}, now=time(report.snapshotAt);
  const fresh=(at,max)=>Number.isFinite(time(at)) && now>=time(at) && now-time(at)<=max;
  if(e.marketState==='CLOSED')reasons.push('MARKET_CLOSED');
  if(e.marketState!=='OPEN' || !e.quote || !fresh(e.quote.at,120000) || e.newsCheck?.status!=='OK' || !fresh(e.newsCheck.checkedAt,900000) ||
    !Object.entries({H1:7200000,M15:1800000,M5:600000}).every(([frame,age])=>fresh(e.bars?.[frame]?.closedAt,age)))reasons.push('INSUFFICIENT_EVIDENCE');
  if (baselineNeedsRefresh(d.baseline, report.snapshotAt)) reasons.push('BASELINE_REFRESH');
  if (d.rebaseline.state === 'REQUIRED' || rebaselineReasons(d,report.newsEvents).length || d.tacticalState !== 'ACTIVE') reasons.push('REBASELINE');
  if (d.phase.name === 'CONSOLIDATION' && d.phase.location === 'MIDPOINT') reasons.push('CONSOLIDATION_MIDPOINT');
  const scalp=isLocationDesk(report)&&selected?.role==='ALTERNATIVE'&&selected.trendRelationship==='COUNTERTREND_SCALP';
  if (d.setup.side !== 'NEUTRAL' && d.setup.side !== d.baseline.bias && !scalp) reasons.push('HTF_M15_CONFLICT');
  if (report.evidence?.spreadAssessment !== 'NORMAL') reasons.push('ABNORMAL_SPREAD');
  if (newsEmbargo(report.newsEvents,report.snapshotAt,policy).length) reasons.push('NEWS_EMBARGO');
  const plan=report.planLevels,quote=report.evidence?.quote;
  if (d.setup.priceLocation === 'EXTENDED' || d.setup.locationRelation==='PASSED_ZONE' || (plan?.entry && quote && (plan.side==='BUY'?quote.ask>plan.entry.high:quote.bid<plan.entry.low))) reasons.push('EXTENDED_ENTRY');
  if(isLocationDesk(report)&&plan){
    if(!range(plan.entry)||!price(plan.entry.reference))reasons.push('MISSING_ENTRY');
    if(!plan.targets?.length||!plan.targets.every(t=>price(t.price)))reasons.push('MISSING_TARGET');
  }
  if(isLocationDesk(report)&&d.setup.opposingLiquidity==='UNKNOWN')reasons.push('LIQUIDITY_UNVERIFIED');
  if (!report.planLevels?.stop || report.planLevels.stop.kind !== 'FIXED_VERIFIED') reasons.push('MISSING_STOP');
  if (d.setup.opposingLiquidity === 'TOO_CLOSE') reasons.push('OPPOSING_LIQUIDITY');
  if(d.setup.status==='PENDING')reasons.push('M15_PENDING');
  if (['UNAVAILABLE','SUSPENDED'].includes(d.setup.status) || d.phase.name==='UNAVAILABLE' || d.setup.priceLocation==='UNKNOWN' || report.dataQuality?.status !== 'OK' || !['H1','M15','M5'].every(f=>report.evidence?.bars?.[f])) reasons.push('INSUFFICIENT_EVIDENCE');
  if (report.planLevels && (!Number.isFinite(report.planLevels.netR) || report.planLevels.netR < policy.minimumNetR)) reasons.push('LOW_NET_R');
  d.noTradeZones.filter(z=>z.active).forEach(z=>reasons.push(z.reason));
  return { eligible: reasons.length === 0, reasons:[...new Set(reasons)] };
}
export function validateDeskV4(report) {
  if (report.schemaVersion !== 4) return null; // Never retrofit old reports.
  const d = report.desk, snapshot = time(report.snapshotAt);
  const location=isLocationDesk(report),policy=reportPolicy(report);
  if(location)validateScenarioPlan(report);
  ok(d && d.policyId === (location?LOCATION_POLICY.id:DESK_POLICY.id), 'desk policy version required');
  ok(d.architectureVersion==null||location,'unknown desk architecture version');
  ok(Number.isFinite(snapshot), 'snapshot timestamp required');
  ok(JSON.stringify(d.hierarchy) === JSON.stringify(HIERARCHY), 'reasoning hierarchy differs');
  ok(text(d.conclusion) && text(d.entryIdea) && text(d.xauSummary), 'include actionable Thai summaries even in WAIT');
  const b = d.baseline;
  ok(b && text(b.id) && ['ACTIVE','SUSPENDED','UNAVAILABLE'].includes(b.status) && sides.includes(b.bias), 'baseline state/bias required');
  ok(text(b.invalidation) && text(b.refreshReason), 'baseline refresh/invalidation required');
  if(b.status==='UNAVAILABLE')ok(b.bias==='UNAVAILABLE' && !Object.keys(b.frames || {}).length,'missing baseline must remain unavailable, not neutral or populated');
  if (b.status !== 'UNAVAILABLE') {
    ok(['INITIAL','REFRESH','CARRY_FORWARD'].includes(b.mode) && time(b.createdAt) <= time(b.checkedAt) && time(b.checkedAt) <= snapshot && time(b.refreshAt) > time(b.createdAt), 'baseline chronology required');
    ok(b.frames && ['W1','D1','H4','H1'].every(f=>b.frames[f]), 'Week/Day/H4/H1 baseline required');
    for (const [f,frame] of Object.entries(b.frames)) {
      ok(['W1','D1','H4','H1'].includes(f) && text(frame.structure), 'HTF structure required');
      references(frame.evidence,snapshot); ok(frame.evidence.every(r=>r.timeframe===f), 'HTF frame evidence mismatch');
    }
    references(b.checkEvidence,snapshot);
    ok(b.checkEvidence.some(r=>r.timeframe==='H1' && time(b.checkedAt)-time(r.closedAt)>=0 && time(b.checkedAt)-time(r.closedAt)<=DESK_POLICY.baselineCheckMinutes*60000), 'baseline carry needs a current closed H1 check');
    if (b.mode === 'CARRY_FORWARD') ok(text(b.originPlanId) && /^[a-f0-9]{64}$/.test(b.originReportSha256 || ''), 'carry baseline needs original immutable report');
  }
  ok(d.dailySR?.role === 'LOCATION_MAP' && Array.isArray(d.dailySR.levels) && text(d.dailySR.summary), 'Daily SR is a location map');
  const ids = new Set();
  for (const l of d.dailySR.levels) {
    ok(text(l.id) && !ids.has(l.id) && range(l) && ['STRUCTURAL','TACTICAL','CRITICAL'].includes(l.type) && ['ACTIVE','FRESH','TESTED','BROKEN','INVALIDATED','HISTORICAL'].includes(l.status), 'invalid Daily SR level');
    ids.add(l.id); references(l.evidence,snapshot);
    if(location)ok(l.low>=Math.min(...l.evidence.map(r=>r.bar.low))&&l.high<=Math.max(...l.evidence.map(r=>r.bar.high)),'Daily SR zone must lie within its observed source range');
    ok(l.signal == null && l.entry == null, 'Daily SR cannot generate entry signals');
  }
  ok(d.amm?.role === 'SCENARIO_REFINER' && text(d.amm.summary) && Array.isArray(d.amm.zones), 'AMM is a tactical refiner');
  for (const z of d.amm.zones) {
    ok(range(z) && ['BUY','SELL'].includes(z.side) && ['ACTIVE','TESTED','FILTERED','HISTORICAL'].includes(z.status) && text(z.method), 'invalid AMM zone');
    references(z.evidence,snapshot);
    ok(z.signal == null && z.entry == null, 'AMM cannot signal independently');
    if (['ACTIVE','TESTED'].includes(z.status)) ok(z.side === b.bias, 'AMM must pass HTF direction filter');
    if (z.status==='FILTERED')ok(text(z.filterReason),'countertrend AMM requires an explicit filter reason');
  }
  ok(d.phase && PHASES.includes(d.phase.name) && ['MIDPOINT','EDGE','OUTSIDE','UNKNOWN'].includes(d.phase.location) && text(d.phase.reason), 'independent market phase required');
  if(d.phase.name==='UNAVAILABLE')ok(d.phase.location==='UNKNOWN','missing phase location must remain unknown');
  ok(d.setup?.timeframe === 'M15' && ['PENDING','CONFIRMED','SUSPENDED','UNAVAILABLE'].includes(d.setup.status) && sides.includes(d.setup.side), 'M15 minimum setup required');
  ok(['APPROACHING','IN_ZONE','EXTENDED','UNKNOWN'].includes(d.setup.priceLocation) && ['CLEAR','TOO_CLOSE','UNKNOWN'].includes(d.setup.opposingLiquidity), 'setup location/liquidity required');
  ok(text(d.setup.reason), 'setup reasoning required');
  if (d.setup.status === 'CONFIRMED') { references(d.setup.evidence,snapshot); ok(d.setup.evidence.every(r=>r.timeframe==='M15'), 'M5 cannot confirm primary setup'); }
  ok(d.trigger?.timeframe === 'M5' && text(d.trigger.condition) && ['PENDING','OBSERVED','UNAVAILABLE'].includes(d.trigger.state), 'M5 is trigger/fine entry only');
  if (d.trigger.state === 'OBSERVED') { references(d.trigger.evidence,snapshot); ok(d.setup.status === 'CONFIRMED' && d.trigger.evidence.every(r=>r.timeframe==='M5' && time(r.closedAt)-300000>=Math.max(...d.setup.evidence.map(r=>time(r.closedAt)))),'M5 trigger must follow M15 confirmation'); }
  ok(d.execution == null || d.execution.timeframe === 'M1' && d.execution.role === 'DETAIL_ONLY', 'M1 is optional execution detail only');
  ok(Array.isArray(d.waitZones) && Array.isArray(d.noTradeZones), 'separate wait/no-trade zones required');
  d.waitZones.forEach(z=>{ok(range(z) && text(z.condition),'wait zone needs a condition'); references(z.evidence,snapshot);});
  d.noTradeZones.forEach(z=>ok(z && Object.hasOwn(NO_TRADE,z.reason) && typeof z.active === 'boolean' && text(z.detail) && (z.low == null && z.high == null || range(z)), 'no-trade reason/range invalid'));
  for (const key of ['triggerFailure','tactical','structural','rebaseline']) {
    const rule = d.invalidation?.[key];
    ok(rule && text(rule.condition) && ['M5','M15','H1','H4','D1','W1'].includes(rule.timeframe), 'separate invalidation rules required: '+key);
    if (rule.price != null) { ok(price(rule.price),'invalidation price invalid'); references(rule.evidence,snapshot); }
  }
  ok(d.invalidation.actualStop === (report.planLevels?.stop?.price ?? null), 'actual Stop must match planLevels; do not replace it with invalidation');
  ok(d.dxy?.role === 'CONFIRMATION_FILTER' && ['CONFIRM','NEUTRAL','CONTRADICT','UNAVAILABLE'].includes(d.dxy.state) && text(d.dxy.structure) && text(d.dxy.reason), 'DXY structural filter required');
  if (d.dxy.state !== 'UNAVAILABLE') ok(d.dxy.symbol==='TVC:DXY' && time(d.dxy.observedAt)<=snapshot && /^https:\/\//.test(d.dxy.sourceUrl || '') && ['H1','H4','D1',...(location?['M15','M5']:[])].includes(d.dxy.timeframe), 'DXY symbol/source/timeframe required; no currency-pair proxy');
  if(d.dxy.value != null)ok(d.dxy.state!=='UNAVAILABLE' && price(d.dxy.value),'missing DXY cannot have a substituted value');
  ok(d.spdr?.role === 'MEDIUM_TERM_FLOW' && text(d.spdr.summary) && ['INFLOW','OUTFLOW','MIXED','UNKNOWN'].includes(d.spdr.flowBias), 'SPDR is medium-term flow only');
  ok(['UP','DOWN','FLAT','UNKNOWN'].includes(d.spdr.direction), 'SPDR medium-term direction required');
  if (d.spdr.holdings != null) ok(d.spdr.measure==='GOLD_HOLDINGS_TONNES' && price(d.spdr.holdings) && /^\d{4}-\d\d-\d\d$/.test(d.spdr.dataDate) && d.spdr.dataDate <= report.snapshotAt.slice(0,10) && /^https:\/\/(?:www\.)?spdrgoldshares\.com\//.test(d.spdr.sourceUrl || ''), 'SPDR dated holdings required; GLD quote is not holdings');
  if(d.spdr.holdings==null)ok(d.spdr.dailyChange==null && d.spdr.flowBias==='UNKNOWN' && d.spdr.direction==='UNKNOWN','missing SPDR must remain unknown');
  if (d.spdr.dailyChange != null) ok(Number.isFinite(d.spdr.dailyChange) && price(d.spdr.previousHoldings) && Math.abs(d.spdr.holdings-d.spdr.previousHoldings-d.spdr.dailyChange)<0.001 && d.spdr.previousDate<d.spdr.dataDate, 'SPDR daily change must match dated holdings');
  if (d.spdr.direction !== 'UNKNOWN') ok(text(d.spdr.period) && text(d.spdr.flowEvidence), 'medium-term direction needs a documented period and evidence');
  ok(d.news?.role === 'REGIME_EVENT_RISK' && text(d.news.regime) && d.news.policyId === policy.id, 'news must use shared policy');
  ok(d.rebaseline && ['STABLE','REQUIRED'].includes(d.rebaseline.state) && Array.isArray(d.rebaseline.signals) && ['ACTIVE','SUSPENDED'].includes(d.tacticalState), 're-baseline state required');
  for (const s of d.rebaseline.signals) { ok(['H1_ACCEPTANCE','DISPLACEMENT_RETEST','STRUCTURE_SHIFT','POST_NEWS_DISPLACEMENT'].includes(s.type) && ['ABOVE','BELOW'].includes(s.direction) && ids.has(s.levelId), 're-baseline signal invalid'); references(s.evidence,snapshot); }
  if (rebaselineReasons(d,report.newsEvents).length || d.rebaseline.state==='REQUIRED') ok(b.status==='SUSPENDED' && d.tacticalState==='SUSPENDED' && report.status==='WAIT' && !report.scenarioPlan && d.dailySR.levels.filter(l=>l.type==='TACTICAL').every(l=>l.status==='HISTORICAL') && d.amm.zones.every(z=>z.status==='HISTORICAL'), 'Re-baseline must suspend old plans and historical tactical levels');
  const scenarios = report.scenarioPlan?.scenarios || [];
  if (scenarios.length) {
    ok(scenarios.length <= 2 && scenarios[0].role === 'PRIMARY' && (scenarios.length===1 || scenarios[1].role==='ALTERNATIVE'), 'one PRIMARY then at most one ALTERNATIVE');
    for (const s of scenarios) {
      if(!location||isBreakSetup(s))ok(['M15','H1'].includes(s.breakFrame) && s.retestFrame === 'M5' && text(s.structuralReason), 'M15+ setup then M5 retest with structural reason');
      else ok(s.setupFrame==='M15'&&s.triggerFrame==='M5'&&text(s.structuralReason),'M15 location setup then M5 fine entry');
      references(s.levelEvidence,snapshot);
      if (s.role === 'PRIMARY') ok(s.side === b.bias, 'primary must follow HTF baseline');
      else ok(text(s.transition) && ['PRIMARY_INVALIDATED','REBASELINE_REQUIRED',...(location?['PRIMARY_NOT_REACHED','COUNTERTREND_CONFIRMED']:[])].includes(s.activateWhen), 'alternative needs an explicit transition');
      if (s.role==='ALTERNATIVE' && s.side!==b.bias && !(location&&s.trendRelationship==='COUNTERTREND_SCALP')) ok(s.activateWhen==='REBASELINE_REQUIRED', 'counter-bias alternative requires new baseline before activation');
    }
  }
  const readiness = deskReadiness(report);
  if(location)validateLocationArchitecture(report,snapshot);
  if (report.status !== 'WAIT') {
    ok(readiness.eligible, 'WATCH blocked: '+readiness.reasons.join(', '));
    const primary=location?selectedScenario(report):scenarios[0];
    ok(scenarios.length && primary?.side === report.planLevels?.side && d.setup.side===report.planLevels?.side, 'WATCH plan must match selected scenario and M15');
    const beyond=r=>primary.side==='BUY'?r.bar.close>primary.breakPrice:r.bar.close<primary.breakPrice;
    if(!location||isBreakSetup(primary))ok(primary.breakState==='OBSERVED' && primary.levelEvidence.some(r=>r.timeframe===primary.breakFrame && time(r.closedAt)===time(primary.breakClosedAt) && beyond(r)) &&
      d.setup.evidence.some(r=>r.timeframe==='M15' && time(r.closedAt)>=time(primary.breakClosedAt) && beyond(r)), 'WATCH requires an observed break and M15 confirmation; M5 may remain pending');
    if(location){
      ok(primary.m15Confirmation.state==='OBSERVED'&&confirmsM15(primary),'WATCH requires verified M15 confirmation appropriate to its archetype');
      ok(primary.m15Confirmation.evidence.every(ref=>d.setup.evidence.some(r=>JSON.stringify(r)===JSON.stringify(ref))),'M15 setup must cite the selected scenario confirmation');
      ok(time(primary.m15Confirmation.evidence.at(-1).closedAt)>=snapshot-1800000,'M15 confirmation is stale');
      ok(['PREEXISTING_STRUCTURAL_STOP','TRIGGER_FORMED_STOP'].includes(d.risk.stopTiming),'classify observed Stop anchor timing');
      if(d.risk.stopTiming==='PREEXISTING_STRUCTURAL_STOP')ok(time(report.planLevels.stop.structureAt)<=time(primary.m15Confirmation.evidence.at(-1).closedAt)&&d.risk.stopEvidence.some(r=>['M15','H1','H4','D1','W1'].includes(r.timeframe)&&time(r.closedAt)===time(report.planLevels.stop.structureAt)),'preexisting Stop must already exist at M15 confirmation');
      if(d.risk.stopTiming==='TRIGGER_FORMED_STOP')ok(d.trigger.state==='OBSERVED'&&time(report.planLevels.stop.structureAt)>=time(primary.m15Confirmation.evidence.at(-1).closedAt),'trigger-formed Stop requires the actual subsequent trigger');
      if(isRebaselineSetup(primary)){
        const tr=primary.baselineTransition;
        ok(tr&&tr.toBaselineId===b.id&&tr.fromBaselineId!==b.id&&b.mode==='REFRESH'&&time(tr.confirmedAt)<=time(b.createdAt),'actual recovery/reversal requires a proven refreshed baseline');
        references(tr.criticalLevel?.evidence,snapshot);
        for(const signal of tr.signals||[])references(signal.evidence,snapshot);
        ok(rebaselineReasons({dailySR:{levels:[tr.criticalLevel]},rebaseline:{signals:tr.signals||[]}},report.newsEvents).length>0,'baseline transition needs existing Re-baseline evidence');
      }
      if(primary.trendRelationship==='COUNTERTREND_SCALP'){
        ok(d.risk.targetPolicy==='NEAREST_OPPOSING_STRUCTURE','scalp needs a conservative opposing target');
        const c=locationCandidates(d.locationMatrix).find(c=>c.id===primary.candidateId);
        ok(c?.targetAnchorAvailable&&report.planLevels.targets.length===1&&report.planLevels.targets[0].price===c.targetAnchor.price,'scalp target must be the verified nearest opposing location');
      }
    }
    ok(d.risk?.stopBasis==='STRUCTURE_FIRST' && d.risk.stopEvidence && d.risk.targetEvidence, 'risk must cite structure before R optimization');
    references(d.risk.stopEvidence,snapshot); references(d.risk.targetEvidence,snapshot);
    const p=report.planLevels;
    ok(d.risk.stopEvidence.some(r=>time(r.closedAt)===time(p.stop.structureAt) && (p.side==='BUY'?r.bar.low:r.bar.high)===p.stop.structurePrice), 'Stop anchor must match an observed swing');
    ok(p.targets.every(t=>d.risk.targetEvidence.some(r=>r.bar.high===t.price || r.bar.low===t.price)), 'targets must match observed opposing levels');
    ok(d.setup.opposingLiquidity==='CLEAR','WATCH needs clear opposing liquidity');
  }
  if(isAlignedDesk(report)&&report.reviewRules?.version===3){
    validateScenarioReviewRules(report);
  }else if(report.reviewRules){
    ok(!location||isBreakSetup(scenarios[0])&&(!d.activeScenarioRole||d.activeScenarioRole==='PRIMARY'),'new archetypes use explicit unsupported/manual replay; do not retrofit retest rules');
    const rules=report.reviewRules;
    ok(rules.version===2 && rules.side===scenarios[0]?.side && rules.confirmation==='RETEST_THEN_CLOSE' && price(rules.confirmationPrice) && rules.entry==='NEXT_M5_OPEN_WITHIN_ZONE' && rules.exit==='FULL_AT_TP1_OR_STOP', 'V4 replay needs original version 2 primary rules');
    ok(rules.invalidation && ['M5','M15','H1'].includes(rules.invalidation.timeframe) && ['ABOVE','BELOW'].includes(rules.invalidation.direction) && price(rules.invalidation.price), 'replay invalidation required');
  }
  validateEnrichment(report,references);
  return readiness;
}
function validateLocationArchitecture(report,snapshot){
  const d=report.desk,m=d.locationMatrix,expected=scanLocations(report);
  ok(text(report.candidateEntryZone)&&['LEGACY_BREAK_RETEST','UNSUPPORTED_MANUAL',...(isAlignedDesk(report)?['ARCHETYPE_REPLAY_V3']:[])].includes(report.reviewSupport?.mode)&&text(report.reviewSupport.reason),'separate candidate output and explicit replay support required');
  ok(m&&m.state===expected.state&&text(m.reason),'location scan required before scenario selection');
  ok(m.currentPrice===expected.currentPrice&&m.quoteAt===expected.quoteAt,'location current price must match quote');
  for(const key of ['aboveCandidates','atCandidates','belowCandidates','continuationLevels','criticalLevels']){
    ok(Array.isArray(m[key])&&m[key].length===expected[key].length,'location scan must include all observed candidates: '+key);
    m[key].forEach((c,i)=>{
      const e=expected[key][i];
      for(const field of ['id','side','low','high','price','sourceFrame','sourceLayer','sourceId','type','status','distance','htfAlignment','phaseAlignment','relationToCurrentPrice','purpose','opposingLiquidity','stopAnchorAvailable','targetAnchorAvailable'])
        ok(c[field]===e[field],'location candidate differs from source: '+field);
      ok(JSON.stringify(c.evidence)===JSON.stringify(e.evidence),'location evidence differs from source');
      if(c.evidence?.length)references(c.evidence,snapshot);
      if(c.stopAnchor)references(c.stopAnchor.evidence,snapshot);
      if(c.targetAnchor)references(c.targetAnchor.evidence,snapshot);
      ok(JSON.stringify(c.stopAnchor)===JSON.stringify(e.stopAnchor)&&JSON.stringify(c.targetAnchor)===JSON.stringify(e.targetAnchor),'candidate anchors must match the location scan');
    });
  }
  ok(['PRIMARY','ALTERNATIVE'].includes(d.activeScenarioRole||'PRIMARY')&&['AUTO','ANALYST'].includes(d.scenarioSelection?.mode)&&text(d.scenarioSelection.reason),'explicit scenario selection required');
  const selected=selectedScenario(report);
  for(const s of report.scenarioPlan?.scenarios||[]){
    if(s.setupType==='SUPPORT_REACTION_SCALP')ok(s.side==='BUY','support reaction is a BUY scalp');
    if(s.setupType==='RESISTANCE_REACTION_SCALP')ok(s.side==='SELL','resistance reaction is a SELL scalp');
    if(isBreakSetup(s)){
      ok(s.m15Confirmation.type==='BREAK_CLOSE','break/retest needs BREAK_CLOSE confirmation');
      const z=scenarioZone(s);ok(z.low===s.retestLow&&z.high===s.retestHigh,'break retest zone mismatch');
    }else{
      const c=locationCandidates(m).find(c=>c.id===s.candidateId),z=scenarioZone(s);
      ok(c&&c.side===s.side&&c.low===z.low&&c.high===z.high,'location scenario needs a scanned observed candidate');
      ok(s.sourceFrame===c.sourceFrame&&s.sourceLayer===c.sourceLayer,'scenario source must match the candidate');
      if(c.sourceLayer==='AMM')ok(c.purpose!=='FILTER_ONLY','filter-only AMM cannot become an entry scenario');
    }
    if(s.m15Confirmation.state==='OBSERVED'){
      references(s.m15Confirmation.evidence,snapshot);ok(confirmsM15(s),'claimed M15 confirmation is not supported by closed candles');
    }else ok(!s.m15Confirmation.evidence.length,'pending confirmation must not contain observed-confirmation claims');
    if(isRebaselineSetup(s)&&s.m15Confirmation.type==='BREAK_CLOSE'){
      const critical=s.baselineTransition?.criticalLevel||d.dailySR.levels.find(l=>l.id===s.criticalZoneId&&l.type==='CRITICAL'&&active(l));
      ok(critical&&price(s.acceptancePrice)&&s.acceptancePrice===(s.side==='BUY'?critical.high:critical.low),'rebaseline M15 acceptance threshold must match a cited Critical Zone');
    }
    if(s.trendRelationship==='WITH_TREND')ok(s.side===d.baseline.bias,'WITH_TREND must follow baseline');
    if(s.trendRelationship==='COUNTERTREND_SCALP'){
      const c=locationCandidates(m).find(c=>c.id===s.candidateId);
      ok(s.role==='ALTERNATIVE'&&s.side!==d.baseline.bias&&['SUPPORT_REACTION_SCALP','RESISTANCE_REACTION_SCALP'].includes(s.setupType),'countertrend scalp can only be the opposing Alternative');
      ok(c&&c.sourceLayer==='DAILY_SR'&&['STRUCTURAL','CRITICAL'].includes(c.type)&&['H1','H4','D1','W1'].includes(c.sourceFrame),'countertrend scalp needs a major structural opposing zone');
      ok(s.activateWhen==='COUNTERTREND_CONFIRMED','countertrend Alternative needs explicit M15 activation');
    }
    if(s.trendRelationship==='REVERSAL_REQUIRES_REBASELINE')ok(isRebaselineSetup(s),'reversal classification requires a re-baseline archetype');
    if(s.role==='PRIMARY')ok(s.trendRelationship!=='COUNTERTREND_SCALP','countertrend cannot become Primary');
  }
  if(selected){
    ok(d.setup.locationRelation===zoneRelation(selected.side,scenarioZone(selected),m.currentPrice,selected.setupType,selected.breakState),'setup location relationship disagrees with selected archetype');
    ok(d.setup.side===selected.side,'M15 setup must belong to selected scenario');
  }
  if(report.status!=='WAIT')ok(d.risk.quality===(report.planLevels.netR>=reportPolicy(report).preferredNetR?'PREFERRED':'CONDITIONAL'),'risk quality must match versioned net R policy');
  if(selected&&(!isBreakSetup(selected)||d.activeScenarioRole==='ALTERNATIVE'))ok(isAlignedDesk(report)&&report.reviewSupport.mode==='ARCHETYPE_REPLAY_V3'&&report.reviewRules?.version===3 || report.reviewSupport.mode==='UNSUPPORTED_MANUAL'&&!report.reviewRules,'new setup replay needs explicit V3 rules or manual/unscored review');
  for(const z of d.waitZones){
    ok(['BUY','SELL'].includes(z.side)&&['PRIMARY','ALTERNATIVE','CANDIDATE'].includes(z.priority)&&text(z.purpose)&&text(z.sourceLayer)&&text(z.setupType),'typed wait zone required');
    ok(['ABOVE','BELOW','AT_ZONE','PASSED','UNKNOWN'].includes(z.relationToCurrentPrice),'wait-zone position required');
    if(m.state==='AVAILABLE')ok(z.relationToCurrentPrice===(m.currentPrice<z.low?'ABOVE':m.currentPrice>z.high?'BELOW':'AT_ZONE'),'wait-zone relationship must match snapshot');
  }
  if(report.status==='WAIT'&&report.priceMap){
    ok(!report.priceMap.levels.some(l=>['ENTRY','STOP','TARGET'].includes(l.kind)),'WAIT must not label candidates as executable entry/stop/targets');
    ok(JSON.stringify(report.priceMap.levels)===JSON.stringify(locationPriceLevels(report)),'WAIT price map must retain exactly the observed location levels');
  }
  validateDeskContext(report,references);
  for(const s of d.opportunityInputs?.continuationScenarios||[]){
    validateScenarioPlan({...report,scenarioPlan:{symbol:'PEPPERSTONE:XAUUSD',asOf:report.snapshotAt,scenarios:[{...s,role:'PRIMARY'}]}});
    ok(isBreakSetup(s),'continuation input must be a break/retest archetype');references(s.levelEvidence,snapshot);
    ok(s.levelEvidence.some(r=>[r.bar.high,r.bar.low,r.bar.close].includes(s.breakPrice)),'continuation level must match an observed structural price');
  }
  for(const z of d.amm.zones){
    ok(['PULLBACK_SELL','PULLBACK_BUY','BREAKDOWN_RETEST','BREAKOUT_RETEST','DEEP_REACTION','FILTER_ONLY'].includes(z.purpose),'AMM purpose required');
    if(['PULLBACK_SELL','BREAKDOWN_RETEST'].includes(z.purpose))ok(z.side==='SELL','AMM purpose/side mismatch');
    if(['PULLBACK_BUY','BREAKOUT_RETEST'].includes(z.purpose))ok(z.side==='BUY','AMM purpose/side mismatch');
    ok(z.low>=Math.min(...z.evidence.map(r=>r.bar.low))&&z.high<=Math.max(...z.evidence.map(r=>r.bar.high)),'AMM zone outside observed source range');
  }
  if(d.scenarioSelection.mode==='ANALYST'&&isBreakSetup(report.scenarioPlan?.scenarios?.[0])&&['PULLBACK','RETEST'].includes(d.phase.name)){
    const side=d.baseline.bias,c=(side==='SELL'?m.aboveCandidates:m.belowCandidates).find(c=>c.side===side&&c.sourceLayer==='DAILY_SR');
    if(c)ok(text(d.scenarioSelection.rejectedLocationReason),'explain why continuation outranks the observed pullback location');
  }
}
// All references are checked against the private immutable pack by the existing publisher.
export function deskEvidenceReferences(desk) {
  const refs=[];
  const visit = value => { if (!value || typeof value !== 'object') return; if(value.symbol==='PEPPERSTONE:XAUUSD' && value.bar && value.closedAt) refs.push(value); else Object.values(value).forEach(visit); };
  visit(desk); return refs;
}
