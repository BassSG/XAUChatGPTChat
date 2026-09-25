import sharp from "sharp";
import { readFile } from "node:fs/promises";
import path from "node:path";

const args = process.argv.slice(2);
function option(name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
}

const inputPath = option("--input");
const outputPath = option("--output");
if (!inputPath || !outputPath) {
  throw new Error("Usage: node scripts/render-analysis-image.mjs --input report.json --output report.png");
}
const report = JSON.parse(await readFile(inputPath, "utf8"));

function escapeXml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;"
  })[character]);
}

function wrap(value, maxLength, maxLines) {
  const words = String(value || "—").replace(/\s+/g, " ").trim().split(" ");
  const tokens = [];
  for (const word of words) {
    const chars = Array.from(word);
    if (chars.length <= maxLength) tokens.push(word);
    else while (chars.length) tokens.push(chars.splice(0, maxLength).join(""));
  }

  const lines = [];
  let current = "";
  let consumed = 0;
  for (const token of tokens) {
    const candidate = current ? current + " " + token : token;
    if (Array.from(candidate).length <= maxLength) current = candidate;
    else {
      if (current) lines.push(current);
      current = token;
    }
    consumed += 1;
    if (lines.length === maxLines) break;
  }
  if (current && lines.length < maxLines) lines.push(current);
  if (consumed < tokens.length && lines.length) {
    const last = Array.from(lines[lines.length - 1]);
    last.splice(Math.max(0, maxLength - 1));
    lines[lines.length - 1] = last.join("") + "…";
  }
  return lines.length ? lines : ["—"];
}
function lineText(x, y, value, size, color, weight = 400, family = "Arial, sans-serif") {
  return '<text x="' + x + '" y="' + y + '" fill="' + color + '" font-family="' + family +
    '" font-size="' + size + '" font-weight="' + weight + '">' + escapeXml(value) + "</text>";
}

function rightText(x, y, value, size, color, weight = 400) {
  return '<text x="' + x + '" y="' + y + '" text-anchor="end" fill="' + color +
    '" font-family="Arial, sans-serif" font-size="' + size + '" font-weight="' + weight + '">' +
    escapeXml(value) + "</text>";
}
function fieldCard(x, label, value) {
  const width = 250;
  const y = 302;
  const lines = wrap(value, 18, 4);
  const text = lines.map((line, index) => lineText(x + 19, y + 88 + index * 25, line, 17, "#e9eee7", 600)).join("");
  return '<rect x="' + x + '" y="' + y + '" width="' + width + '" height="165" rx="12" fill="#111d21" stroke="#2b3a3e"/>' +
    lineText(x + 19, y + 32, label, 10, "#91a1a2", 500, "Arial, sans-serif") + text;
}

const status = String(report.status || report.bias || "WAIT").toUpperCase();
const statusColor = status.includes("BUY") ? "#70d69d" : status.includes("SELL") ? "#ff9085" : "#e4bd71";
const snapshot = report.snapshotAt
  ? new Intl.DateTimeFormat("th-TH", { timeZone: "Asia/Bangkok", dateStyle: "medium", timeStyle: "short", hour12: false }).format(new Date(report.snapshotAt)) + " ICT"
  : "TIME NOT PROVIDED";
const summaryLines = wrap(report.summary || report.headline || "No summary provided.", 89, 2);
const summaryText = summaryLines.map((line, index) => lineText(88, 218 + index * 28, line, 20, "#e8ede6", 500)).join("");
const contextLines = wrap(report.newsRisk || report.risk || report.context || "Review the full report for session and event risk.", 142, 2);
const contextText = contextLines.map((line, index) => lineText(88, 570 + index * 22, line, 14, "#c0cbc4", 400)).join("");
const sources = Array.isArray(report.sources) ? report.sources.join(" · ") : (report.sources || "PEPPERSTONE:XAUUSD · TradingView");
const sourceLine = wrap(sources, 135, 1)[0];
const targets = Array.isArray(report.targets) ? report.targets.join(" · ") : (report.targets || report.takeProfit || "Targets depend on confirmed structure.");
const rr = report.riskReward || report.rr || "";
const targetValue = rr ? String(targets) + " · R " + String(rr) : String(targets);

const svg = [
  '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675" viewBox="0 0 1200 675">',
  '<rect width="1200" height="675" fill="#081014"/>',
  '<rect x="32" y="28" width="1136" height="619" rx="18" fill="#0c161a" stroke="#26363b"/>',
  '<rect x="32" y="28" width="1136" height="5" rx="2" fill="#d9af62"/>',
  '<circle cx="78" cy="75" r="23" fill="#dcb364"/>',
  lineText(78, 80, "Au", 16, "#172126", 700),
  lineText(118, 70, "XAU DESK", 13, "#e9eee7", 700),
  lineText(118, 91, "PEPPERSTONE · GOLD SPOT", 9, "#91a1a2", 500),
  '<rect x="892" y="56" width="108" height="31" rx="6" fill="#18272a" stroke="#354449"/>',
  lineText(946, 76, status, 10, statusColor, 700),
  rightText(1140, 76, snapshot, 10, "#b5c1bb", 500),
  lineText(64, 137, "XAU/USD MARKET PLAN", 27, "#f0f0e9", 700),
  lineText(64, 158, report.headline || "Structured analysis · conditional scenarios", 10, "#899a9c", 400),
  '<rect x="64" y="178" width="1072" height="98" rx="11" fill="#142226" stroke="#304145"/>',
  '<rect x="64" y="178" width="4" height="98" rx="2" fill="#d9af62"/>',
  lineText(88, 203, "DESK SUMMARY", 9, "#cba85e", 600),
  summaryText,
  fieldCard(64, "BIAS", report.bias || status),
  fieldCard(338, "CONDITIONAL ENTRY ZONE", report.entryZone || report.entry || "No active entry zone"),
  fieldCard(612, "TRIGGER", report.trigger || "Wait for a confirmed candle close"),
  fieldCard(886, "STOP / INVALIDATION", report.invalidation || report.stop || "See the full report"),
  '<rect x="64" y="490" width="1072" height="111" rx="11" fill="#101c20" stroke="#293a3e"/>',
  lineText(88, 520, "TARGETS & SESSION CONTEXT", 9, "#cba85e", 600),
  lineText(88, 545, wrap(targetValue, 132, 1)[0], 13, "#e6ebe4", 600),
  contextText,
  '<line x1="64" y1="617" x2="1136" y2="617" stroke="#253439"/>',
  lineText(64, 637, "PRICE MAP · NOT AN ACTUAL PRICE CHART", 9, "#e0b96a", 600),
  rightText(1136, 637, sourceLine, 8, "#819194", 400),
  "</svg>"
].join("");

await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toFile(path.resolve(outputPath));
process.stdout.write("Rendered XAU Desk analysis image.");




