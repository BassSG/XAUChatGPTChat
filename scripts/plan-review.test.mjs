import test from 'node:test';
import assert from 'node:assert/strict';
import { reviewPlan } from '../src/plan-review.js';
const at = minute => `2026-09-25T10:${String(minute).padStart(2,'0')}:00+07:00`;
const candle = (minute,open,high,low,close) => ({closedAt:at(minute),open,high,low,close});
// Explicitly synthetic local fixtures. These are never published as market reports.
function fixture() {
  const report={planId:'TEST-ONLY',snapshotAt:at(0),scenarioPlan:{symbol:'PEPPERSTONE:XAUUSD',asOf:at(0),scenarios:[{side:'BUY',breakFrame:'M5',retestFrame:'M5',breakPrice:101,retestLow:100.5,retestHigh:101,breakState:'WAITING',confirmation:'test close',invalidation:'test close below 99',evidence:'synthetic test'}]},reviewRules:{version:1,side:'BUY',confirmation:'RETEST_THEN_CLOSE',confirmationPrice:101,invalidation:{timeframe:'M5',direction:'BELOW',price:99},entry:'NEXT_M5_OPEN_WITHIN_ZONE',exit:'FULL_AT_TP1_OR_STOP'},planLevels:{side:'BUY',entry:{low:101,high:102},stop:{price:99},targets:[{price:105}],costPerUnit:0.2}};
  const evidence={version:1,symbol:'PEPPERSTONE:XAUUSD',capturedAt:at(15),chartUrl:'https://www.tradingview.com/chart/?symbol=PEPPERSTONE%3AXAUUSD',method:'DATA_WINDOW',gaps:[],frames:{M5:[candle(5,100,103,99.5,102),candle(10,102,102.5,100.8,101.5),candle(15,101.5,106,101,105.5)]}};
  return {report,evidence};
}
test('break then retest then next-bar entry yields cost-adjusted simulated TP1',()=>{
  const {report,evidence}=fixture();const r=reviewPlan(report,evidence);
  assert.equal(r.resultStatus,'SIMULATED_TP1');assert.equal(r.simulatedR,1.22);
  assert.deepEqual(r.timeline.map(e=>e.type),['BREAK','TRIGGER','ENTRY','TARGET']);
});
test('same entry candle touching stop and target is ambiguous, never a win',()=>{
  const {report,evidence}=fixture();evidence.frames.M5[2].low=98;
  const r=reviewPlan(report,evidence);assert.equal(r.resultStatus,'AMBIGUOUS');assert.equal(r.simulatedR,null);
});
test('a missing bar cannot become no-signal or a winning trade',()=>{
  const {report,evidence}=fixture();evidence.frames.M5.splice(1,1);
  const r=reviewPlan(report,evidence);assert.equal(r.outcome,'ตรวจไม่ได้');assert.equal(r.simulatedR,null);
});
test('old reports without published replay rules are not scored retrospectively',()=>{
  const {report,evidence}=fixture();delete report.reviewRules;
  assert.equal(reviewPlan(report,evidence).resultStatus,'UNVERIFIABLE');
});
test('a gap past the entry zone results in no fill, not a favorable assumed entry',()=>{
  const {report,evidence}=fixture();evidence.frames.M5[2]=candle(15,104,106,103,105);
  assert.equal(reviewPlan(report,evidence).resultStatus,'NO_FILL');
});
test('stop gaps include the worse opening price in simulated R',()=>{
  const {report,evidence}=fixture();evidence.frames.M5[2]=candle(15,101.5,103,101,102);
  evidence.frames.M5.push(candle(20,97,100,96,99.5));evidence.capturedAt=at(20);
  const r=reviewPlan(report,evidence);assert.equal(r.resultStatus,'SIMULATED_STOP');assert.equal(r.simulatedR,-1.74);
});
test('breakout and retest cannot be inferred inside the same candle',()=>{
  const {report,evidence}=fixture();evidence.frames.M5=evidence.frames.M5.slice(0,1);evidence.capturedAt=at(5);
  assert.equal(reviewPlan(report,evidence).resultStatus,'NO_SIGNAL');
});
test('invalidation is evaluated before a simultaneous confirmation',()=>{
  const {report,evidence}=fixture();report.reviewRules.invalidation={timeframe:'M5',direction:'ABOVE',price:101};
  assert.equal(reviewPlan(report,evidence).resultStatus,'INVALIDATED');
});
test('unfilled signals are not assigned R',()=>{
  const {report,evidence}=fixture();delete report.planLevels;
  const r=reviewPlan(report,evidence);assert.equal(r.resultStatus,'SIGNAL_ONLY');assert.equal(r.simulatedR,null);
});
test('a published expiry prevents using subsequent candles to manufacture a result',()=>{
  const {report,evidence}=fixture();report.validUntil=at(10);
  const r=reviewPlan(report,evidence);assert.equal(r.resultStatus,'SIGNAL_ONLY');assert.equal(r.simulatedR,null);
});

test('SELL replay mirrors BUY including costs and chronology',()=>{
  const {report,evidence}=fixture();
  const s=report.scenarioPlan.scenarios[0];
  Object.assign(s,{side:'SELL',breakPrice:99,retestLow:99,retestHigh:99.5});
  Object.assign(report.reviewRules,{side:'SELL',confirmationPrice:99,invalidation:{timeframe:'M5',direction:'ABOVE',price:101}});
  report.planLevels={side:'SELL',entry:{low:98,high:99},stop:{price:101},targets:[{price:95}],costPerUnit:0.2};
  evidence.frames.M5=evidence.frames.M5.map(b=>({...b,open:200-b.open,high:200-b.low,low:200-b.high,close:200-b.close}));
  const r=reviewPlan(report,evidence);
  assert.equal(r.resultStatus,'SIMULATED_TP1');assert.equal(r.simulatedR,1.22);
});

test('M15 break requires a later M5 retest, not an earlier M5 crossing',()=>{
  const {report,evidence}=fixture();
  report.scenarioPlan.scenarios[0].breakFrame='M15';
  evidence.frames.M15=[candle(15,100,106,99.5,105.5)];
  assert.equal(reviewPlan(report,evidence).resultStatus,'NO_SIGNAL');
  evidence.frames.M5.push(candle(20,102,103,100.8,101.5),candle(25,101.5,106,101,105.5));
  evidence.capturedAt=at(25);
  const r=reviewPlan(report,evidence);
  assert.equal(r.resultStatus,'SIMULATED_TP1');assert.equal(r.timeline[0].timeframe,'M15');
  assert.equal(r.timeline[1].closedAt,at(20));
});
