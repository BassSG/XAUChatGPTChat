import assert from "node:assert/strict";
import test from "node:test";
import { resolveDatasetUrl, validateCandleDataset, validateChartPlan } from "../src/chart-data.js";

const snapshotAt = "2026-09-28T19:00:00+07:00";
const report = {
  snapshotAt,
  planId: "20260928-1900-A",
  chartPlan: {
    version: 1,
    mode: "SNAPSHOT",
    snapshotKey: "20260928-120000-a1",
    planId: "20260928-1900-A",
    symbol: "PEPPERSTONE:XAUUSD",
    asOf: snapshotAt,
    side: "SELL",
    entryZone: { low: 4300, high: 4302 },
    stop: { kind: "STRUCTURAL_PENDING", price: null, note: "รอยอดจริง" },
    targets: [{ label: "TP1", price: 4280 }],
    datasets: {
      M5: { url: "reports/chart-data/20260928-120000-a1/M5.json", source: "PEPPERSTONE:XAUUSD", capturedAt: snapshotAt, lastClosedAt: "2026-09-28T12:00:00.000Z", count: 2 }
    }
  }
};

const dataset = {
  symbol: "PEPPERSTONE:XAUUSD",
  timeframe: "M5",
  capturedAt: snapshotAt,
  asOf: snapshotAt,
  lastClosedAt: "2026-09-28T12:00:00.000Z",
  candles: [
    { time: 1790596200, open: 4290, high: 4294, low: 4288, close: 4292 },
    { time: 1790596500, open: 4292, high: 4295, low: 4291, close: 4294 }
  ]
};

test("accepts a typed snapshot chart plan and closed Pepperstone candles", () => {
  assert.deepEqual(validateChartPlan(report).frames, ["M5"]);
  assert.equal(validateCandleDataset(dataset, { timeframe: "M5", snapshotAt, expectedCount: 2 }).length, 2);
});

test("rejects another price source", () => {
  const bad = structuredClone(report);
  bad.chartPlan.symbol = "OANDA:XAUUSD";
  assert.throws(() => validateChartPlan(bad), /PEPPERSTONE/);
});

test("rejects an unclosed candle and invalid OHLC", () => {
  const future = structuredClone(dataset);
  future.candles[1].time += 600;
  future.lastClosedAt = "2026-09-28T12:10:00.000Z";
  assert.throws(() => validateCandleDataset(future, { timeframe: "M5", snapshotAt }), /ยังไม่ปิด/);
  const invalid = structuredClone(dataset);
  invalid.candles[0].high = 4289;
  assert.throws(() => validateCandleDataset(invalid, { timeframe: "M5", snapshotAt }), /OHLC/);
});

test("rejects dataset URLs outside the immutable chart-data directory", () => {
  assert.equal(resolveDatasetUrl("reports/chart-data/key/M5.json", { baseUrl: "https://example.com/XAUChatGPTChat/" }), "https://example.com/XAUChatGPTChat/reports/chart-data/key/M5.json");
  assert.throws(() => resolveDatasetUrl("https://evil.example/M5.json", { baseUrl: "https://example.com/XAUChatGPTChat/" }), /reports\/chart-data/);
});
