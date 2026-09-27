import assert from "node:assert/strict";
import test from "node:test";
import { validatePublicationEvidence } from "../src/report-accuracy.js";
import { chooseLatestReport } from "../src/report-selection.js";
import { validateChartPlan } from "../src/chart-data.js";

const at = (offset = 0) => new Date(Date.now() - 30_000 + offset).toISOString();
const bangkok = (iso) => new Date(Date.parse(iso) + 7 * 3600_000).toISOString().replace("Z", "+07:00");
const snapshotAt = bangkok(at());

function waitReport() {
  return {
    schemaVersion: 2, snapshotAt, status: "WAIT", planId: "TEST-WAIT", waitFor: "รอราคาเปิด", entryZone: "รอ", stop: "รอ", targets: [],
    sources: ["TradingView PEPPERSTONE:XAUUSD"],
    dataQuality: { status: "PARTIAL", priceSource: "PEPPERSTONE:XAUUSD" },
    evidence: { symbol: "PEPPERSTONE:XAUUSD", chartUrl: "https://www.tradingview.com/chart/?symbol=PEPPERSTONE%3AXAUUSD", observedAt: snapshotAt, marketState: "CLOSED", newsCheck: { status: "UNAVAILABLE", checkedAt: snapshotAt }, bars: {} },
    indicatorContext: { status: "UNAVAILABLE", frames: [] },
    planLevels: null
  };
}

function watchReport() {
  const report = waitReport();
  report.status = "WATCH BUY";
  report.dataQuality = { status: "OK", priceSource: "PEPPERSTONE:XAUUSD", priceAt: snapshotAt };
  report.evidence.marketState = "OPEN";
  report.evidence.spreadAssessment = "NORMAL";
  report.evidence.quote = { symbol: "PEPPERSTONE:XAUUSD", bid: 4280, ask: 4280.12, spread: 0.12, at: snapshotAt };
  report.evidence.newsCheck = { status: "OK", checkedAt: snapshotAt, sourceUrl: "https://www.forexfactory.com/calendar" };
  report.evidence.bars = Object.fromEntries([["M5", 5], ["M15", 15], ["H1", 60]].map(([frame, minutes]) => [frame, {
    closedAt: at(-minutes * 60_000), open: 4281, high: 4282, low: 4280, close: 4281.5
  }]));
  report.entryZone = "4,281–4,282";
  report.stop = "4,278";
  report.targets = ["4,290"];
  report.riskReward = "ประมาณ 1.86R หลังต้นทุนที่กำหนด";
  report.planLevels = { side: "BUY", entry: { low: 4281, high: 4282, reference: 4282 }, stop: { kind: "FIXED_VERIFIED", price: 4278, structurePrice: 4278.5, structureAt: at(-5 * 60_000), buffer: 0.5 }, targets: [{ label: "TP1", price: 4290 }], costPerUnit: 0.2, costNote: "spread 0.12 + slippage allowance 0.08", netR: 1.86 };
  report.priceMap = { levels: [{ kind: "ENTRY", price: "4,281–4,282" }, { kind: "STOP", price: "4,278" }, { kind: "TARGET", price: "4,290" }] };
  return report;
}

test("a closed market publishes an honest WAIT, while a complete open-market WATCH passes", () => {
  assert.equal(validatePublicationEvidence(waitReport()), true);
  assert.equal(validatePublicationEvidence(watchReport()), true);
});

test("WATCH requires verified and fresh primary price, candles and news", () => {
  for (const mutate of [
    (r) => { r.dataQuality = undefined; },
    (r) => { r.evidence.symbol = "OANDA:XAUUSD"; },
    (r) => { r.evidence.quote.at = at(-30 * 24 * 3600_000); r.dataQuality.priceAt = r.evidence.quote.at; },
    (r) => { delete r.evidence.bars.M5; },
    (r) => { r.evidence.bars.M15.closedAt = at(60_000); },
    (r) => { r.evidence.newsCheck.status = "UNAVAILABLE"; }
  ]) {
    const report = watchReport(); mutate(report);
    assert.throws(() => validatePublicationEvidence(report));
  }
});

test("a stopped market cannot publish detailed WAIT entry, stop or target prices", () => {
  const report = waitReport(); report.entryZone = "4,284–4,285";
  assert.throws(() => validatePublicationEvidence(report), /detailed/);
});

test("entry, stop, targets, costs and net R must agree", () => {
  for (const mutate of [
    (r) => { r.planLevels.stop.price = 4290; },
    (r) => { r.planLevels.targets[0].price = 4270; },
    (r) => { r.planLevels.costPerUnit = 0; },
    (r) => { r.planLevels.netR = 8; },
    (r) => { r.stop = "4,280"; },
    (r) => { r.priceMap.levels[1].price = "4,277"; }
  ]) {
    const report = watchReport(); mutate(report);
    assert.throws(() => validatePublicationEvidence(report));
  }
});

test("nearby high impact USD releases pause WATCH", () => {
  const report = watchReport();
  report.newsEvents = [{ title: "USD release", currency: "USD", impact: "HIGH", state: "UPCOMING", at: at(15 * 60_000) }];
  assert.throws(() => validatePublicationEvidence(report), /high-impact/);
  report.newsEvents[0].at = at(-15 * 60_000);
  report.newsEvents[0].state = "UNVERIFIED";
  assert.throws(() => validatePublicationEvidence(report), /high-impact/);
});

test("EBW OK requires all three closed frames and raw 0–100 oscillator values", () => {
  const report = waitReport(); report.indicatorContext = { status: "OK", frames: [] };
  assert.throws(() => validatePublicationEvidence(report), /M5, M15 and H1/);
  report.indicatorContext.frames = ["M5", "M15", "H1"].map((timeframe) => ({ timeframe, side: "NEUTRAL", buyScore: 50, sellScore: 50, rsi: 55, stochK: 70, stochD: 65, closedAt: at(-5 * 60_000) }));
  assert.equal(validatePublicationEvidence(report), true);
  report.indicatorContext.frames[0].stochK = 170;
  assert.throws(() => validatePublicationEvidence(report), /0–100/);
});

test("proven prior outcomes require a closed-bar sequence", () => {
  const report = waitReport(); report.priorReview = { outcome: "ยกเลิก", checkedAt: snapshotAt };
  assert.throws(() => validatePublicationEvidence(report), /timeline/);
  report.priorReview.outcome = "ตรวจไม่ได้";
  assert.equal(validatePublicationEvidence(report), true);
});

test("Pages wins an equal-time tie and newer Worker reports win otherwise", () => {
  const pages = { snapshotAt, indicatorContext: { status: "UNAVAILABLE" } };
  const worker = { snapshotAt: new Date(snapshotAt).toISOString() };
  assert.equal(chooseLatestReport({ worker, pages }), pages);
  const newer = { snapshotAt: at(60_000) };
  assert.equal(chooseLatestReport({ worker: newer, pages }), newer);
});

test("chart plan compares equivalent UTC and Bangkok instants and rejects wrong-side levels", () => {
  const chart = { snapshotAt, planId: "A", chartPlan: { version: 1, mode: "SNAPSHOT", snapshotKey: "TEST-CHART", planId: "A", symbol: "PEPPERSTONE:XAUUSD", asOf: new Date(snapshotAt).toISOString(), side: "BUY", entryZone: { low: 4281, high: 4282 }, stop: { kind: "FIXED_VERIFIED", price: 4278 }, targets: [{ label: "TP1", price: 4290 }], datasets: { M5: { url: "reports/chart-data/TEST-CHART/M5.json", source: "PEPPERSTONE:XAUUSD", count: 1, capturedAt: snapshotAt, lastClosedAt: snapshotAt } } } };
  assert.equal(validateChartPlan(chart).available, true);
  chart.chartPlan.stop.price = 4290;
  assert.throws(() => validateChartPlan(chart), /Stop/);
});
