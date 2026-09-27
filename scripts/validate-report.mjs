import { readFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import { validateCandleDataset, validateChartPlan } from "../src/chart-data.js";
import { validatePublicationEvidence } from "../src/report-accuracy.js";

const args = process.argv.slice(2);
const valueFor = (flag) => args[args.indexOf(flag) + 1];
const reportPath = args.includes("--input") ? valueFor("--input") : "";
const imagePath = args.includes("--image") ? valueFor("--image") : "";
const chartDataDirectory = args.includes("--chart-data-dir") ? valueFor("--chart-data-dir") : "";
const publishing = args.includes("--publish");
if (!reportPath) throw new Error("Usage: node validate-report.mjs --input report.json [--image report.png]");

const report = JSON.parse(await readFile(reportPath, "utf8"));
const required = ["snapshotAt", "status", "headline", "summary", "bias", "entryZone", "trigger", "invalidation", "stop", "targets", "riskReward", "newsRisk", "body", "sources"];
for (const field of required) {
  if (!(field in report)) throw new Error(`Missing required report field: ${field}`);
}
if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?\+07:00$/.test(report.snapshotAt) || !Number.isFinite(Date.parse(report.snapshotAt))) {
  throw new Error("snapshotAt must be an ISO 8601 timestamp with +07:00 offset.");
}
if (!["WAIT", "WATCH BUY", "WATCH SELL"].includes(report.status)) throw new Error("Invalid status.");
if (typeof report.summary !== "string" || [...report.summary].length > 500 || !report.summary.trim()) throw new Error("summary must contain 1–500 characters.");
if ([report.headline, report.summary, report.waitFor, report.newsRisk].some((value) =>
  /pepperstone|Asia\/Bangkok|UTC\+?7|\bICT\b|เวลาไทย/i.test(String(value || "")))) {
  throw new Error("Keep provider and timezone details out of headlines, summaries, and notification fields.");
}
if (!Array.isArray(report.targets) || !Array.isArray(report.sources)) throw new Error("targets and sources must be arrays.");
if (report.dataQuality) {
  if (!["OK", "PARTIAL", "UNAVAILABLE"].includes(report.dataQuality.status)) throw new Error("Invalid dataQuality.status.");
  if (report.dataQuality.status === "UNAVAILABLE" && report.status !== "WAIT") throw new Error("Unavailable primary price data requires WAIT.");
}
if (report.newsEvents) {
  if (!Array.isArray(report.newsEvents) || report.newsEvents.length > 5) throw new Error("newsEvents must contain at most five items.");
  for (const event of report.newsEvents) {
    if (!event.title || !["UPCOMING", "RELEASED", "UNVERIFIED"].includes(event.state)) throw new Error("Invalid news event.");
    if (event.at && (!/^\d{4}-\d{2}-\d{2}T.*\+07:00$/.test(event.at) || !Number.isFinite(Date.parse(event.at)))) throw new Error("News event time must use +07:00.");
    if (Object.hasOwn(event, "actual")) {
      if (event.actual === null || event.actual === "") throw new Error("Actual must contain a published value.");
      if (event.state !== "RELEASED") throw new Error("Actual requires RELEASED state.");
      if (!event.at || Date.parse(event.at) > Date.parse(report.snapshotAt)) throw new Error("Actual cannot precede the release time.");
      if (publishing && !/^https:\/\//.test(event.sourceUrl || "")) throw new Error("Published Actual needs a source URL.");
    }
  }
}
if (report.indicatorContext) {
  const indicator = report.indicatorContext;
  if (!["OK", "PARTIAL", "UNAVAILABLE"].includes(indicator.status)) throw new Error("Invalid indicatorContext.status.");
  if (!/^EBW\b/i.test(indicator.name || "")) throw new Error("indicatorContext.name must identify EBW.");
  if (indicator.symbol !== "PEPPERSTONE:XAUUSD") throw new Error("EBW indicator must use PEPPERSTONE:XAUUSD.");
  if (indicator.status !== "UNAVAILABLE" && !indicator.observedAt) throw new Error("Verified EBW context requires observedAt.");
  if (indicator.observedAt && (!/^\d{4}-\d{2}-\d{2}T.*\+07:00$/.test(indicator.observedAt) || !Number.isFinite(Date.parse(indicator.observedAt)))) throw new Error("indicatorContext.observedAt must use +07:00.");
  if (indicator.observedAt && Date.parse(indicator.observedAt) > Date.parse(report.snapshotAt)) throw new Error("EBW observation cannot be later than the report snapshot.");
  if (indicator.frames) {
    if (!Array.isArray(indicator.frames) || indicator.frames.length > 3) throw new Error("indicatorContext.frames must contain at most three items.");
    if (indicator.status === "UNAVAILABLE" && indicator.frames.length) throw new Error("Unavailable EBW context cannot contain timeframe values.");
    const seen = new Set();
    for (const frame of indicator.frames) {
      if (!["M5", "M15", "H1"].includes(frame.timeframe) || seen.has(frame.timeframe)) throw new Error("Invalid or duplicate EBW timeframe.");
      seen.add(frame.timeframe);
      if (frame.side && !["BUY", "SELL", "NEUTRAL", "NO TRADE", "UNAVAILABLE"].includes(String(frame.side).toUpperCase())) throw new Error("Invalid EBW side.");
      for (const key of ["buyScore", "sellScore"]) {
        if (frame[key] !== undefined && (!Number.isFinite(frame[key]) || frame[key] < 0 || frame[key] > 100)) throw new Error(`Invalid EBW ${key}.`);
      }
      for (const key of ["rsi", "stochK", "stochD"]) {
        if (frame[key] !== undefined && (!Number.isFinite(frame[key]) || frame[key] < 0 || frame[key] > 100)) throw new Error(`Invalid EBW ${key}; use actual 0–100 values.`);
      }
      if (frame.netR !== undefined && frame.costConfigured !== true) throw new Error("EBW netR requires configured costs.");
      for (const key of ["support", "resistance", "entry", "stop", "target", "netR"]) {
        if (frame[key] !== undefined && frame[key] !== null && !Number.isFinite(frame[key])) throw new Error(`Invalid EBW ${key}.`);
      }
    }
  }
}
if (publishing) validatePublicationEvidence(report);
if (report.priceMap) {
  if (!Array.isArray(report.priceMap.levels) || report.priceMap.levels.length > 7) throw new Error("priceMap must have up to seven levels.");
  if (!Array.isArray(report.priceMap.scenarios) || report.priceMap.scenarios.length > 3) throw new Error("priceMap must have up to three scenarios.");
  if (report.dataQuality?.status === "UNAVAILABLE" && report.priceMap.levels.length) throw new Error("Unavailable primary price data cannot support numbered map levels.");
}
if (report.chartPlan) {
  const result = validateChartPlan(report);
  if (!result.available) throw new Error(result.reason);
  for (const frame of result.frames) {
    const meta = result.plan.datasets[frame];
    const expectedUrl = `reports/chart-data/${result.plan.snapshotKey}/${frame}.json`;
    if (String(meta.url).replace(/^\.\//, "") !== expectedUrl) throw new Error(`${frame}.url ต้องเป็น ${expectedUrl}`);
    if (chartDataDirectory) {
      const dataset = JSON.parse(await readFile(join(chartDataDirectory, `${frame}.json`), "utf8"));
      validateCandleDataset(dataset, { timeframe: frame, snapshotAt: report.snapshotAt, expectedCount: meta.count });
      if (dataset.capturedAt !== meta.capturedAt || dataset.lastClosedAt !== meta.lastClosedAt) throw new Error(`${frame} metadata ไม่ตรงกับรายงาน`);
    }
  }
}
if (imagePath) {
  const image = await sharp(await readFile(imagePath)).metadata();
  if (image.format !== "png" || image.width < 800 || image.height < 800) throw new Error("The report image must be a readable PNG of at least 800×800.");
  console.log(`Report and PNG validated: ${image.width}×${image.height}`);
} else {
  console.log("Report JSON validated.");
}
