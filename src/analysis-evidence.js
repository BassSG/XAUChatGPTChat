export const PRIMARY_SYMBOL = 'PEPPERSTONE:XAUUSD';
import { deskEvidenceReferences } from './desk-v4.js';
export const FRAME_MS = { M5: 300000, M15: 900000, H1: 3600000, H4:14400000, D1:86400000, W1:604800000 };
const requireValue = (ok, message) => { if (!ok) throw new Error(message); };
const instant = value => typeof value === 'string' && /(?:Z|[+-]\d\d:\d\d)$/.test(value) ? Date.parse(value) : NaN;

// Recorded observations remain separate from interpretations and public chart data.
export function validateEvidencePack(pack) {
  requireValue([1,2].includes(pack?.version) && pack.symbol === PRIMARY_SYMBOL, 'Evidence must use Pepperstone and version 1');
  const captured = instant(pack.capturedAt);
  requireValue(Number.isFinite(captured) && captured <= Date.now() + 60000, 'Invalid evidence capture time');
  requireValue(/^https:\/\/(?:www\.|th\.)?tradingview\.com\/chart\//.test(pack.chartUrl || ''), 'Evidence needs a direct chart URL');
  requireValue(['DATA_WINDOW', 'PERMITTED_EXPORT'].includes(pack.method), 'Record how the evidence was read');
  requireValue(pack.frames && typeof pack.frames === 'object' && !Array.isArray(pack.frames), 'Evidence needs frames');
  requireValue(Array.isArray(pack.gaps), 'Record evidence gaps, including an empty list when none');
  for (const [frame, bars] of Object.entries(pack.frames)) {
    requireValue(FRAME_MS[frame] && Array.isArray(bars), 'Invalid evidence timeframe');
    requireValue(!['H4','D1','W1'].includes(frame) || pack.version===2,'HTF session bars require evidence version 2');
    let previous = -Infinity;
    for (const bar of bars) {
      const closed = instant(bar.closedAt);
      requireValue(Number.isFinite(closed) && closed <= captured && closed > previous, `${frame}: bars must be closed, ordered and unique`);
      requireValue((['H4','D1','W1'].includes(frame) && pack.version === 2 ? Number.isFinite(instant(bar.openedAt)) && instant(bar.openedAt)<closed && closed-instant(bar.openedAt)<=FRAME_MS[frame] : closed % FRAME_MS[frame] === 0), `${frame}: close is not aligned to the timeframe`);
      requireValue(['open', 'high', 'low', 'close'].every(key => Number.isFinite(bar[key]) && bar[key] > 0), `${frame}: invalid OHLC`);
      requireValue(bar.high >= Math.max(bar.open, bar.close) && bar.low <= Math.min(bar.open, bar.close), `${frame}: inconsistent OHLC`);
      previous = closed;
    }
  }
  if (pack.quote) {
    const q = pack.quote;
    requireValue(q.symbol === PRIMARY_SYMBOL && Number.isFinite(instant(q.at)) && instant(q.at) <= captured, 'Invalid quote source/time');
    requireValue([q.bid, q.ask, q.spread].every(Number.isFinite) && q.bid > 0 && q.ask >= q.bid && q.spread >= 0 && Math.abs(q.ask - q.bid - q.spread) <= 0.011, 'Invalid quote/spread');
  }
  if (pack.publication) {
    const p=pack.publication;
    requireValue(typeof p.planId==='string' && /^[a-f0-9]{64}$/.test(p.originalReportSha256 || '') && Number.isFinite(instant(p.publishedAt)) && instant(p.publishedAt)<=captured && String(p.sourceUrl || '').startsWith('https://'), 'Invalid publication receipt');
  }
  if(pack.context){
    requireValue(typeof pack.context==='object'&&!Array.isArray(pack.context),'Invalid auxiliary context');
    for(const [key,symbol]of [['dxyFrames','TVC:DXY'],['toolkitObservations',PRIMARY_SYMBOL]]){
      if(pack.context[key]==null)continue;
      requireValue(Array.isArray(pack.context[key]),'Auxiliary observations must be arrays');
      for(const item of pack.context[key]){
        if(item.direction==='UNAVAILABLE'||item.state==='UNAVAILABLE')continue;
        if(key==='toolkitObservations')requireValue(Number.isFinite(instant(item.observedAt))&&instant(item.observedAt)<=captured,'Toolkit observation after evidence capture');
        requireValue(item.evidence?.length>0,'Auxiliary observation needs closed references');
        let previous=-Infinity;
        for(const r of item.evidence){const closed=instant(r.closedAt),b=r.bar;
          requireValue(r.symbol===symbol&&r.timeframe===item.timeframe&&FRAME_MS[r.timeframe]&&Number.isFinite(closed)&&closed<=captured&&closed>previous&&b&&['open','high','low','close'].every(k=>Number.isFinite(b[k])&&b[k]>0)&&b.high>=Math.max(b.open,b.close)&&b.low<=Math.min(b.open,b.close),'Invalid auxiliary closed evidence');
          previous=closed;
        }
      }
    }
    for(const key of ['spdrHistory','newsContext'])if(pack.context[key]!=null){
      requireValue(Array.isArray(pack.context[key]),'Auxiliary dated context must be an array');
      for(const row of pack.context[key])requireValue(Number.isFinite(instant(row.checkedAt))&&instant(row.checkedAt)<=captured,'Dated context check must precede capture');
    }
    for(const key of ['indicatorVerification','ammSource'])if(pack.context[key]!=null){
      const row=pack.context[key];requireValue(row&&typeof row==='object'&&!Array.isArray(row),'Invalid source verification context');
      const at=row.verifiedAt||row.checkedAt;
      if(row.state!=='UNAVAILABLE')requireValue(Number.isFinite(instant(at))&&instant(at)<=captured,'Source verification must precede capture');
    }
  }
  return pack;
}

export function matchReportEvidence(report, pack) {
  validateEvidencePack(pack);
  requireValue(instant(pack.capturedAt) <= instant(report.snapshotAt), 'Evidence was captured after the report');
  for (const [frame, bar] of Object.entries(report.evidence?.bars || {})) {
    const source = pack.frames[frame]?.find(item => instant(item.closedAt) === instant(bar.closedAt));
    requireValue(source && ['open', 'high', 'low', 'close'].every(key => source[key] === bar[key]), `${frame}: report differs from recorded evidence`);
  }
  if (report.evidence?.quote) {
    const q = report.evidence.quote;
    requireValue(pack.quote && instant(pack.quote.at) === instant(q.at) && ['bid', 'ask', 'spread', 'symbol'].every(key => pack.quote[key] === q[key]), 'Report quote differs from recorded evidence');
  }
  for (const scenario of report.scenarioPlan?.scenarios || []) {
    if (scenario.breakState !== 'OBSERVED') continue;
    const bar = pack.frames[scenario.breakFrame]?.find(item => instant(item.closedAt) === instant(scenario.breakClosedAt));
    requireValue(bar && (scenario.side === 'BUY' ? bar.close > scenario.breakPrice : bar.close < scenario.breakPrice), 'Observed break is not supported by the recorded candle');
  }
  if (report.schemaVersion === 4) {
    if(report.desk?.architectureVersion==='4.3'){
      for(const [field,value]of [['indicatorVerification',report.desk.indicatorVerification],['ammSource',report.desk.amm.source],['spdrHistory',report.desk.spdr.history||[]],['newsContext',report.desk.news.context||[]],['dxyConditions',report.desk.dxy.conditions||[]]]){
        if(value?.state==='UNAVAILABLE'||Array.isArray(value)&&!value.length)continue;
        requireValue(JSON.stringify(pack.context?.[field])===JSON.stringify(value),'Source/context differs from private archive: '+field);
      }
    }
    // Auxiliary context is archived privately; it never supplies XAU execution prices.
    for(const frame of report.desk?.dxy?.frames||[]){
      if(frame.direction==='UNAVAILABLE')continue;
      requireValue((pack.context?.dxyFrames||[]).some(f=>JSON.stringify(f)===JSON.stringify(frame)),'DXY structure differs from archived context');
    }
    for(const item of report.desk?.toolkit?.observations||[]){
      if(item.state!=='OBSERVED')continue;
      requireValue((pack.context?.toolkitObservations||[]).some(o=>JSON.stringify(o)===JSON.stringify(item)),'Toolkit observation differs from archived context');
    }
    const refs = [...deskEvidenceReferences(report.desk), ...deskEvidenceReferences(report.scenarioPlan)];
    for (const ref of refs) {
      const source = pack.frames[ref.timeframe]?.find(b=>instant(b.closedAt)===instant(ref.closedAt));
      requireValue(source && ['open','high','low','close'].every(k=>source[k]===ref.bar[k]), 'V4 structure differs from archived evidence');
    }
  }
  return true;
}
