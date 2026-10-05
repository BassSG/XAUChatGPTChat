import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { validateEvidencePack, matchReportEvidence, sameRecordedContext } from '../src/analysis-evidence.js';
import {alignedReport,alignedPack} from './fixtures/desk-v43-fixture.mjs';
import { decisionView } from '../src/analysis-readiness.js';
import { deliveryState } from '../src/report-state.js';
const at = '2026-09-25T10:00:00+07:00';
const bar = { closedAt: at, open: 4200, high: 4205, low: 4198, close: 4201 };
const pack = () => ({ version: 1, symbol: 'PEPPERSTONE:XAUUSD', capturedAt: at, chartUrl: 'https://www.tradingview.com/chart/?symbol=PEPPERSTONE%3AXAUUSD', method: 'DATA_WINDOW', frames: { M5: [{...bar}] }, gaps: [] });

test('evidence rejects provider mixing, forming bars, duplicates and impossible OHLC', () => {
  assert.ok(validateEvidencePack(pack()));
  for (const change of [p => p.symbol = 'OANDA:XAUUSD', p => p.frames.M5.push({...bar}), p => p.frames.M5[0].closedAt = '2026-09-25T10:05:00+07:00', p => p.frames.M5[0].high = 4199]) {
    const p = pack(); change(p); assert.throws(() => validateEvidencePack(p));
  }
});
test('report values and observed break must match saved observations', () => {
  const report = { snapshotAt: at, evidence: { bars: { M5: {...bar} } } };
  assert.equal(matchReportEvidence(report, pack()), true);
  report.evidence.bars.M5.close = 4202; assert.throws(() => matchReportEvidence(report, pack()), /differs/);
  report.evidence.bars.M5.close = 4201;
  report.scenarioPlan = { scenarios: [{ breakState: 'OBSERVED', breakFrame: 'M5', breakClosedAt: at, side: 'BUY', breakPrice: 4203 }] };
  assert.throws(() => matchReportEvidence(report, pack()), /Observed break/);
});
test('private checkpoint survives, matches report, and tampering is rejected before publishing', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'xau-evidence-test-'));
  try {
    const input = join(dir, 'input.json'), reportPath = join(dir, 'report.json');
    await writeFile(input, JSON.stringify(pack()));
    await writeFile(reportPath, JSON.stringify({ snapshotAt: at, evidence: { bars: { M5: {...bar} } } }));
    const record = spawnSync(process.execPath, ['scripts/record-analysis-evidence.mjs', '--input', input, '--report', reportPath, '--output-root', dir], {encoding:'utf8'});
    assert.equal(record.status, 0, record.stderr);
    const verify = () => spawnSync(process.execPath, ['scripts/verify-recorded-evidence.mjs','--input',reportPath,'--archive-root',dir], {encoding:'utf8'});
    assert.equal(verify().status, 0);
    const report = JSON.parse(await readFile(reportPath, 'utf8'));
    await writeFile(join(dir, report.evidenceArchive.sha256 + '.json'), JSON.stringify({...pack(),gaps:['changed']}));
    assert.notEqual(verify().status, 0);
  } finally { await rm(dir, {recursive:true,force:true}); }
});
test('missing data and waiting for a signal have different user-facing explanations', () => {
  assert.notEqual(decisionView({decision:{reason:'DATA_MISSING',nextAction:'ตรวจแท่ง'}}).title, decisionView({decision:{reason:'SIGNAL_PENDING',nextAction:'รอเบรก'}}).title);
});
test('missed scheduled report is identified without claiming a failure cause', () => {
  const report={snapshotAt:'2026-09-28T10:35:08+07:00'};
  assert.equal(deliveryState(report, Date.parse('2026-09-28T14:45:00+07:00')), null);
  assert.match(deliveryState(report, Date.parse('2026-09-28T15:01:00+07:00')).title, /ยังไม่มีรายงาน/);
  assert.equal(deliveryState({snapshotAt:'2026-09-25T19:03:00+07:00'}, Date.parse('2026-09-27T12:00:00+07:00')),null);
});
test('PowerShell ISO fraction trimming and JSON key order preserve exact dated evidence',()=>{
  const r=alignedReport(),p=alignedPack(r);
  const time=new Date(Date.parse(r.snapshotAt)-10000);time.setUTCMilliseconds(630);
  r.desk.news.context[0].checkedAt=time.toISOString();
  p.context.newsContext=structuredClone(r.desk.news.context);
  p.context.newsContext[0]=Object.fromEntries(Object.entries(p.context.newsContext[0]).reverse());
  p.context.newsContext[0].checkedAt=time.toISOString().replace('.630Z','.63Z');
  assert.equal(matchReportEvidence(r,p),true);
  const equivalent=new Date(time).toISOString().replace('.630Z','.630+00:00');
  assert.equal(sameRecordedContext({checkedAt:time.toISOString()},{checkedAt:equivalent}),true);
  p.context.newsContext[0].fact+=' altered';assert.throws(()=>matchReportEvidence(r,p),/newsContext/);
  p.context.newsContext=structuredClone(r.desk.news.context);
  p.context.newsContext[0].checkedAt=new Date(+time+1).toISOString();assert.throws(()=>matchReportEvidence(r,p),/newsContext/);
  assert.equal(sameRecordedContext([{fact:'a'},{fact:'b'}],[{fact:'b'},{fact:'a'}]),false);
});
