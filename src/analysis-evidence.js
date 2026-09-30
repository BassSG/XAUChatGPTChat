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
    const refs = [...deskEvidenceReferences(report.desk), ...deskEvidenceReferences(report.scenarioPlan)];
    for (const ref of refs) {
      const source = pack.frames[ref.timeframe]?.find(b=>instant(b.closedAt)===instant(ref.closedAt));
      requireValue(source && ['open','high','low','close'].every(k=>source[k]===ref.bar[k]), 'V4 structure differs from archived evidence');
    }
  }
  return true;
}
