import { reportPolicy } from './desk-policy.js';
import {selectedScenario,isAlignedDesk} from './scenario-archetypes.js';
export const TOOLKIT = ['EMA','RSI','STOCHASTIC','FVG','OB','EQH','EQL','DIVERGENCE','SWEEP','ABSORPTION','DISPLACEMENT','HH_HL','LH_LL','BOS','CHOCH','ONE_TWO_THREE','PREMIUM_DISCOUNT','EQUILIBRIUM','SUPPLY_DEMAND','SWING_HIGH','SWING_LOW'];
const ok=(value,message)=>{if(!value)throw new Error('V4.2 context: '+message);};
const text=v=>typeof v==='string'&&v.trim();
// Optional observations never become substitutes for the structural setup.
export function validateDeskContext(report,references){
  const d=report.desk,at=Date.parse(report.snapshotAt),policy=reportPolicy(report);
  for(const item of d.toolkit?.observations||[]){
    ok(TOOLKIT.includes(item.name)&&['OBSERVED','UNAVAILABLE'].includes(item.state)&&text(item.reason),'toolkit name/state/reason required');
    if(item.state==='UNAVAILABLE'){ok(item.value==null&&!(item.evidence||[]).length,'unavailable toolkit cannot supply values');continue;}
    references(item.evidence,at);
    ok(item.value!=null&&text(item.method)&&item.symbol==='PEPPERSTONE:XAUUSD'&&['M5','M15','H1','H4','D1','W1'].includes(item.timeframe)&&item.evidence.every(r=>r.timeframe===item.timeframe),'toolkit requires same-provider closed-bar provenance');
    ok(item.observedAt&&Date.parse(item.observedAt)<=at&&Date.parse(item.observedAt)>=Math.max(...item.evidence.map(r=>Date.parse(r.closedAt))),'toolkit observation chronology');
    if(item.name==='EMA')ok([25,50,100,200].includes(item.parameters?.period)&&Number.isFinite(item.value),'EMA period/value');
    if(item.name==='RSI')ok(item.parameters?.period===14&&item.value>=0&&item.value<=100,'RSI14 value');
    if(item.name==='STOCHASTIC'){
      const p=item.parameters,verified=report.desk.indicatorVerification;
      const canonical=p?.k===9&&p?.smooth===3&&p?.d===3;
      const actual=isAlignedDesk(report)&&['INPUTS_VERIFIED','EXACT_SOURCE_VERIFIED'].includes(verified?.state)&&p?.k===verified.inputs.combo_kLength&&p?.smooth===verified.inputs.combo_kSmooth&&p?.d===verified.inputs.combo_dLength;
      ok((canonical||actual)&&[item.value?.k,item.value?.d].every(v=>Number.isFinite(v)&&v>=0&&v<=100),'Stochastic parameters must be 9-3-3 or actually verified chart Inputs');
    }
    if(['EQH','EQL'].includes(item.name))ok(item.parameters?.tolerance===policy.equalLevelTolerance,'equal-level tolerance must use desk policy');
  }
  const frames=d.dxy.frames;
  if(frames==null)return; // Historical single-frame DXY is preserved.
  ok(Array.isArray(frames)&&new Set(frames.map(f=>f.timeframe)).size===frames.length,'DXY frames must be unique');
  for(const f of frames){
    ok(['D1','H4','H1','M15','M5'].includes(f.timeframe)&&['UP','DOWN','RANGE','UNAVAILABLE'].includes(f.direction)&&text(f.reason),'DXY frame context');
    if(f.direction==='UNAVAILABLE'){ok(!f.evidence?.length,'missing DXY is not evidence');continue;}
    ok(/^https:\/\//.test(f.sourceUrl||'')&&f.evidence?.length>=2,'DXY structure needs two closed observations');
    let prior=-Infinity;
    for(const r of f.evidence){const t=Date.parse(r.closedAt),b=r.bar;
      ok(r.symbol==='TVC:DXY'&&r.timeframe===f.timeframe&&Number.isFinite(t)&&t<=at&&t>prior&&b&&['open','high','low','close'].every(k=>Number.isFinite(b[k])&&b[k]>0)&&b.high>=Math.max(b.open,b.close)&&b.low<=Math.min(b.open,b.close),'DXY evidence chronology/OHLC');prior=t;
    }
    const delta=f.evidence.at(-1).bar.close-f.evidence[0].bar.close;
    ok(f.direction==='RANGE'?Math.abs(delta)<=Number(f.rangeTolerance||0):f.direction==='UP'?delta>0:delta<0,'DXY direction contradicts observations');
  }
  const assessment=d.dxy.assessment;
  ok(assessment&&text(assessment.reason)&&['BUY','SELL'].includes(assessment.xauSide)&&Array.isArray(assessment.supportingFrames)&&Array.isArray(assessment.contradictoryFrames),'explicit DXY filter assessment required');
  ok(assessment.xauSide===(selectedScenario(report)?.side||d.baseline.bias),'DXY assessment belongs to the selected XAU scenario');
  for(const f of frames)if(f.direction==='RANGE')ok(Number.isFinite(f.rangeTolerance)&&f.rangeTolerance>=0,'DXY range tolerance required');
  const desired=assessment.xauSide==='SELL'?'UP':'DOWN';
  const support=frames.filter(f=>f.direction===desired).map(f=>f.timeframe),contra=frames.filter(f=>['UP','DOWN'].includes(f.direction)&&f.direction!==desired).map(f=>f.timeframe);
  ok(JSON.stringify(support)===JSON.stringify(assessment.supportingFrames)&&JSON.stringify(contra)===JSON.stringify(assessment.contradictoryFrames),'DXY assessment must account for every frame');
  const state=!frames.some(f=>f.direction!=='UNAVAILABLE')?'UNAVAILABLE':contra.length?'CONTRADICT':support.length?'CONFIRM':'NEUTRAL';
  ok(d.dxy.state===state,'DXY filter differs from its structural observations');
}
