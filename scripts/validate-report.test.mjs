import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const base = {
  snapshotAt: "2026-09-28T19:00:00+07:00",
  status: "WAIT",
  headline: "รอเงื่อนไขยืนยัน",
  summary: "WAIT — รอข้อมูลยืนยันก่อนวางแผน",
  bias: "รอ",
  entryZone: "ยังไม่มี",
  trigger: "รอแท่งปิด",
  invalidation: "โครงสร้างเปลี่ยน",
  stop: "ยังไม่มี",
  targets: [],
  riskReward: "ยังคำนวณไม่ได้",
  newsRisk: "รอข่าวสำคัญ",
  body: "รายงานทดสอบ",
  sources: [],
  dataQuality: { status: "PARTIAL", detail: "ข้อมูลบางส่วนไม่ครบ" }
};

async function validate(report, chartDatasets = null) {
  const folder = await mkdtemp(join(tmpdir(), "xau-report-test-"));
  try {
    const path = join(folder, "report.json");
    await writeFile(path, JSON.stringify(report), "utf8");
    const args = [fileURLToPath(new URL("./validate-report.mjs", import.meta.url)), "--input", path];
    if (chartDatasets) {
      const chartDirectory = join(folder, "chart-data");
      await mkdir(chartDirectory);
      for (const [frame, dataset] of Object.entries(chartDatasets)) await writeFile(join(chartDirectory, `${frame}.json`), JSON.stringify(dataset), "utf8");
      args.push("--chart-data-dir", chartDirectory);
    }
    return spawnSync(process.execPath, args, { encoding: "utf8" });
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
}

test("accepts an evidence-limited WAIT report", async () => {
  assert.equal((await validate(base)).status, 0);
});

test("rejects a future Actual result", async () => {
  const report = { ...base, newsEvents: [{ title: "USD release", at: "2026-09-28T19:30:00+07:00", state: "RELEASED", actual: "1.0%" }] };
  assert.notEqual((await validate(report)).status, 0);
});

test("rejects a detailed watch status when the primary price feed is unavailable", async () => {
  const report = { ...base, status: "WATCH BUY", dataQuality: { status: "UNAVAILABLE" } };
  assert.notEqual((await validate(report)).status, 0);
});

test("rejects provider wording in the short summary", async () => {
  const report = { ...base, summary: "WAIT — Pepperstone quote pending" };
  assert.notEqual((await validate(report)).status, 0);
});

test("rejects timezone wording in the notification condition", async () => {
  const report = { ...base, waitFor: "รอแท่งปิดตามเวลา Asia/Bangkok" };
  assert.notEqual((await validate(report)).status, 0);
});

test("accepts verified EBW context for the three analysis timeframes", async () => {
  const report = {
    ...base,
    indicatorContext: {
      status: "OK",
      name: "EBW V10.4.4",
      symbol: "PEPPERSTONE:XAUUSD",
      observedAt: "2026-09-28T18:59:00+07:00",
      summary: "M5 เป็นกลาง ขณะที่ M15 และ H1 ยังไม่ยืนยันฝั่งซื้อ",
      frames: [
        { timeframe: "M5", side: "NEUTRAL", buyScore: 51, sellScore: 49, phase: "Recovery" },
        { timeframe: "M15", side: "NO TRADE", support: 4280.5, resistance: 4289.2 },
        { timeframe: "H1", side: "SELL", finalSignal: "ไม่มีสัญญาณใหม่" }
      ]
    }
  };
  assert.equal((await validate(report)).status, 0);
});

test("rejects EBW context from another price symbol", async () => {
  const report = { ...base, indicatorContext: { status: "PARTIAL", name: "EBW V10.4.4", symbol: "OANDA:XAUUSD", summary: "ทดสอบ", frames: [] } };
  assert.notEqual((await validate(report)).status, 0);
});

test("validates a chart plan together with its immutable candle asset", async () => {
  const snapshotAt = base.snapshotAt;
  const report = {
    ...base,
    planId: "20260928-1900-A",
    chartPlan: {
      version: 1,
      mode: "SNAPSHOT",
      snapshotKey: "20260928-120000-a1",
      planId: "20260928-1900-A",
      symbol: "PEPPERSTONE:XAUUSD",
      asOf: snapshotAt,
      side: "NONE",
      entryZone: null,
      stop: { kind: "STRUCTURAL_PENDING", price: null, note: "รอโครงสร้าง" },
      targets: [],
      datasets: { M5: { url: "reports/chart-data/20260928-120000-a1/M5.json", source: "PEPPERSTONE:XAUUSD", capturedAt: snapshotAt, lastClosedAt: "2026-09-28T12:00:00.000Z", count: 2 } }
    }
  };
  const candles = {
    symbol: "PEPPERSTONE:XAUUSD", timeframe: "M5", capturedAt: snapshotAt, asOf: snapshotAt, lastClosedAt: "2026-09-28T12:00:00.000Z",
    candles: [{ time: 1790596200, open: 4290, high: 4294, low: 4288, close: 4292 }, { time: 1790596500, open: 4292, high: 4295, low: 4291, close: 4294 }]
  };
  const result = await validate(report, { M5: candles });
  assert.equal(result.status, 0, result.stderr);
  const mismatch = structuredClone(candles);
  mismatch.lastClosedAt = "2026-09-28T11:55:00.000Z";
  assert.notEqual((await validate(report, { M5: mismatch })).status, 0);
});

test("renders a readable WAIT map without primary price levels", async () => {
  const folder = await mkdtemp(join(tmpdir(), "xau-map-test-"));
  try {
    const input = join(folder, "report.json");
    const output = join(folder, "map.png");
    const report = { ...base, dataQuality: { status: "UNAVAILABLE", detail: "ยังตรวจแหล่งราคาหลักไม่ได้" }, waitFor: "รอตรวจแท่งที่ปิดแล้ว", priceMap: { levels: [], scenarios: [] } };
    await writeFile(input, JSON.stringify(report), "utf8");
    const rendered = spawnSync(process.execPath, [fileURLToPath(new URL("./render-analysis-image.mjs", import.meta.url)), "--input", input, "--output", output], { encoding: "utf8" });
    assert.equal(rendered.status, 0, rendered.stderr);
    const image = await sharp(output).metadata();
    assert.equal(image.format, "png");
    assert.equal(image.width, 1200);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});
