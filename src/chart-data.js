const FRAMES = Object.freeze({ M5: 5 * 60, M15: 15 * 60, H1: 60 * 60 });
const SIDES = new Set(["BUY", "SELL", "NONE"]);
const STOP_KINDS = new Set(["STRUCTURAL_PENDING", "FIXED_VERIFIED"]);

function finite(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function isoTime(value, label) {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) throw new Error(`${label} ต้องเป็นเวลา ISO 8601 ที่ถูกต้อง`);
  return time;
}

export function validateChartPlan(report) {
  const plan = report?.chartPlan;
  if (!plan) return { available: false, reason: "รายงานรอบนี้ยังไม่มีชุดแท่งราคาสำหรับกราฟแผน" };
  if (plan.version !== 1) throw new Error("รองรับ chartPlan.version เท่ากับ 1 เท่านั้น");
  if (plan.mode !== "SNAPSHOT") throw new Error("รายงานจริงต้องใช้ chartPlan.mode เป็น SNAPSHOT");
  if (!plan.snapshotKey || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{5,80}$/.test(plan.snapshotKey)) throw new Error("snapshotKey ไม่ถูกต้อง");
  if (plan.symbol !== "PEPPERSTONE:XAUUSD") throw new Error("กราฟแผนรองรับเฉพาะ PEPPERSTONE:XAUUSD");
  if (plan.asOf !== report.snapshotAt) throw new Error("chartPlan.asOf ต้องตรงกับ snapshotAt ของรายงาน");
  if (report.planId && plan.planId !== report.planId) throw new Error("chartPlan.planId ต้องตรงกับ planId ของรายงาน");
  if (!SIDES.has(plan.side)) throw new Error("chartPlan.side ไม่ถูกต้อง");

  if (plan.entryZone !== null) {
    if (!plan.entryZone || !finite(plan.entryZone.low) || !finite(plan.entryZone.high) || plan.entryZone.low > plan.entryZone.high) {
      throw new Error("entryZone ต้องมี low/high ที่ถูกต้อง");
    }
  }
  if (!plan.stop || !STOP_KINDS.has(plan.stop.kind)) throw new Error("stop.kind ไม่ถูกต้อง");
  if (plan.stop.kind === "STRUCTURAL_PENDING" && plan.stop.price !== null) throw new Error("Stop ที่รอโครงสร้างต้องไม่มีราคา");
  if (plan.stop.kind === "FIXED_VERIFIED" && !finite(plan.stop.price)) throw new Error("Stop ที่ยืนยันแล้วต้องมีราคา");
  if (!Array.isArray(plan.targets) || plan.targets.some((target) => !target?.label || !finite(target.price))) {
    throw new Error("targets ต้องเป็นรายการ label/price ที่ถูกต้อง");
  }

  const datasets = plan.datasets && typeof plan.datasets === "object" ? plan.datasets : {};
  const frames = Object.keys(datasets).filter((frame) => frame in FRAMES);
  for (const frame of frames) {
    const item = datasets[frame];
    if (!item || typeof item.url !== "string" || !item.url.trim()) throw new Error(`${frame} ไม่มี URL ชุดข้อมูล`);
    if (item.source !== "PEPPERSTONE:XAUUSD") throw new Error(`${frame} ใช้แหล่งราคาที่ไม่ถูกต้อง`);
    if (!Number.isInteger(item.count) || item.count < 1 || item.count > 300) throw new Error(`${frame} มีจำนวนแท่งไม่ถูกต้อง`);
    isoTime(item.capturedAt, `${frame}.capturedAt`);
    isoTime(item.lastClosedAt, `${frame}.lastClosedAt`);
  }
  if (!frames.length) return { available: false, reason: "รอบนี้ยังไม่มีกรอบเวลาที่ผ่านการตรวจข้อมูล" };
  return { available: true, plan, frames };
}

export function validateCandleDataset(dataset, { timeframe, snapshotAt, expectedCount } = {}) {
  if (!(timeframe in FRAMES)) throw new Error("กรอบเวลาไม่รองรับ");
  if (!dataset || dataset.symbol !== "PEPPERSTONE:XAUUSD") throw new Error("ชุดแท่งราคาใช้ symbol ไม่ถูกต้อง");
  if (dataset.timeframe !== timeframe) throw new Error("กรอบเวลาของชุดแท่งไม่ตรงกับรายงาน");
  const snapshotMs = isoTime(snapshotAt, "snapshotAt");
  const capturedMs = isoTime(dataset.capturedAt, "capturedAt");
  const asOfMs = isoTime(dataset.asOf, "asOf");
  const lastClosedMs = isoTime(dataset.lastClosedAt, "lastClosedAt");
  if (asOfMs !== snapshotMs) throw new Error("dataset.asOf ต้องตรงกับ snapshotAt");
  if (capturedMs < snapshotMs - 24 * 60 * 60 * 1000 || capturedMs > snapshotMs + 5 * 60 * 1000) throw new Error("capturedAt อยู่นอกช่วงที่ยอมรับได้");
  if (!Array.isArray(dataset.candles) || dataset.candles.length < 1 || dataset.candles.length > 300) throw new Error("จำนวนแท่งต้องอยู่ระหว่าง 1–300");
  if (expectedCount !== undefined && dataset.candles.length !== expectedCount) throw new Error("จำนวนแท่งไม่ตรงกับ metadata");

  let previous = -Infinity;
  for (const candle of dataset.candles) {
    if (!Number.isInteger(candle?.time) || candle.time <= previous) throw new Error("เวลาแท่งต้องเป็น UTC epoch seconds ที่เรียงและไม่ซ้ำ");
    if (![candle.open, candle.high, candle.low, candle.close].every(finite)) throw new Error("OHLC ต้องเป็นตัวเลข finite");
    if (candle.high < Math.max(candle.open, candle.close) || candle.low > Math.min(candle.open, candle.close) || candle.low > candle.high) {
      throw new Error("ค่า OHLC ไม่สัมพันธ์กัน");
    }
    if (candle.volume !== undefined && !finite(candle.volume)) throw new Error("volume ต้องเป็นตัวเลขเมื่อระบุ");
    const closeMs = (candle.time + FRAMES[timeframe]) * 1000;
    if (closeMs > snapshotMs) throw new Error("พบแท่งที่ยังไม่ปิด ณ snapshot");
    previous = candle.time;
  }
  const expectedLastClosed = new Date((dataset.candles.at(-1).time + FRAMES[timeframe]) * 1000).toISOString();
  if (Date.parse(expectedLastClosed) !== lastClosedMs) throw new Error("lastClosedAt ไม่ตรงกับแท่งสุดท้าย");
  return dataset.candles;
}

export function resolveDatasetUrl(value, { baseUrl, origin } = {}) {
  const raw = String(value || "").trim();
  const base = new URL(baseUrl || "/", origin || "https://localhost");
  const url = new URL(raw, base);
  const allowedRoot = new URL("reports/chart-data/", base);
  if (url.origin !== allowedRoot.origin || !url.pathname.startsWith(allowedRoot.pathname)) {
    throw new Error("URL ชุดแท่งราคาต้องอยู่ใน reports/chart-data ของแอป");
  }
  return url.href;
}

export const FRAME_SECONDS = FRAMES;
