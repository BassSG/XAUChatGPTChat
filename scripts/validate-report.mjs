import { readFile } from "node:fs/promises";
import sharp from "sharp";

const args = process.argv.slice(2);
const valueFor = (flag) => args[args.indexOf(flag) + 1];
const reportPath = args.includes("--input") ? valueFor("--input") : "";
const imagePath = args.includes("--image") ? valueFor("--image") : "";
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
if (/pepperstone|Asia\/Bangkok|UTC\+?7|\bICT\b|เวลาไทย/i.test(report.summary)) {
  throw new Error("Keep provider and timezone details out of the short summary.");
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
if (imagePath) {
  const image = await sharp(await readFile(imagePath)).metadata();
  if (image.format !== "png" || image.width < 800 || image.height < 800) throw new Error("The report image must be a readable PNG of at least 800×800.");
  console.log(`Report and PNG validated: ${image.width}×${image.height}`);
} else {
  console.log("Report JSON validated.");
}
