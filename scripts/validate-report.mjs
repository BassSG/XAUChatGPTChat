import { readFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import { validateCandleDataset, validateChartPlan } from "../src/chart-data.js";

const args = process.argv.slice(2);
const valueFor = (flag) => args[args.indexOf(flag) + 1];
const reportPath = args.includes("--input") ? valueFor("--input") : "";
const imagePath = args.includes("--image") ? valueFor("--image") : "";
const chartDataDirectory = args.includes("--chart-data-dir") ? valueFor("--chart-data-dir") : "";
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
    if (event.actual && event.state !== "RELEASED") throw new Error("Actual requires RELEASED state.");
    if (event.actual && (!event.at || Date.parse(event.at) > Date.parse(report.snapshotAt))) throw new Error("Actual cannot precede the release time.");
  }
}
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
