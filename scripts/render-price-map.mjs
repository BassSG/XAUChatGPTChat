import sharp from "sharp";
import { readFile } from "node:fs/promises";
import path from "node:path";

const args = process.argv.slice(2);
const option = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
};
const inputPath = option("--input");
const outputPath = option("--output");
if (!inputPath || !outputPath) {
  throw new Error("Usage: node scripts/render-analysis-image.mjs --input report.json --output report.png");
}
const report = JSON.parse(await readFile(inputPath, "utf8"));
const map = report.priceMap || {};

const escapeXml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[character]
);
const text = (x, y, value, size, color = "#eef3f2", weight = 400, extra = "") =>
  '<text x="' + x + '" y="' + y + '" fill="' + color + '" font-family="Arial, Noto Sans Thai, sans-serif" font-size="' +
  size + '" font-weight="' + weight + '" ' + extra + '>' + escapeXml(value) + "</text>";
const rect = (x, y, width, height, radius, fill, stroke = "none", strokeWidth = 1) =>
  '<rect x="' + x + '" y="' + y + '" width="' + width + '" height="' + height + '" rx="' + radius +
  '" fill="' + fill + '" stroke="' + stroke + '" stroke-width="' + strokeWidth + '"/>';
const circle = (x, y, radius, fill, stroke = "none", strokeWidth = 1) =>
  '<circle cx="' + x + '" cy="' + y + '" r="' + radius + '" fill="' + fill +
  '" stroke="' + stroke + '" stroke-width="' + strokeWidth + '"/>';
const line = (x1, y1, x2, y2, color, width = 1) =>
  '<line x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 +
  '" stroke="' + color + '" stroke-width="' + width + '"/>';
function wrap(value, maxChars, maxLines = 2) {
  const words = String(value ?? "").replace(/\s+/g, " ").trim().split(" ");
  const parts = [];
  for (const word of words) {
    const chars = Array.from(word);
    if (chars.length <= maxChars) parts.push(word);
    else while (chars.length) parts.push(chars.splice(0, maxChars).join(""));
  }
  const lines = [];
  let current = "";
  for (const part of parts) {
    const next = current ? current + " " + part : part;
    if (Array.from(next).length <= maxChars) current = next;
    else {
      if (current) lines.push(current);
      current = part;
    }
  }
  if (current) lines.push(current);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    const chars = Array.from(kept[maxLines - 1]);
    kept[maxLines - 1] = chars.slice(0, maxChars - 1).join("") + "…";
    return kept;
  }
  return lines.length ? lines : ["—"];
}
function block(x, y, value, size, color, weight, maxChars, maxLines, lineHeight) {
  return wrap(value, maxChars, maxLines).map((part, index) =>
    text(x, y + index * lineHeight, part, size, color, weight)
  ).join("");
}
const tones = {
  gold: { border: "#f1c36f", fill: "#2b2419", glow: "#9f752e", dot: "#ffe29c" },
  teal: { border: "#49c9c8", fill: "#082c33", glow: "#1d8e99", dot: "#65dedb" },
  red: { border: "#f26877", fill: "#381b27", glow: "#a83a4d", dot: "#ff8290" },
  silver: { border: "#cbd8e6", fill: "#263549", glow: "#849cb5", dot: "#e2ebf4" }
};
const status = String(report.status || "WAIT").toUpperCase();
const statusTone = status.includes("BUY") ? tones.teal : status.includes("SELL") ? tones.red : tones.gold;
const pricePattern = /\d{1,2},\d{3}(?:\.\d+)?(?:\s*[–-]\s*\d{1,2},\d{3}(?:\.\d+)?)?/g;
const firstPrice = (value) => String(value ?? "").match(pricePattern)?.[0] || "";
function priceSort(value) {
  const numbers = String(value).match(/\d{1,2},\d{3}(?:\.\d+)?/g) || [];
  const values = numbers.map((item) => Number(item.replaceAll(",", "")));
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : -Infinity;
}
function fallbackLevels() {
  const result = [];
  for (const target of Array.isArray(report.targets) ? report.targets : []) {
    const price = firstPrice(target);
    if (price) result.push({ price, label: "เป้าหมาย", tone: "teal" });
  }
  const trigger = firstPrice(report.trigger);
  if (trigger) result.push({ price: trigger, label: "ระดับยืนยันแท่งปิด", tone: "gold" });
  const quote = String(report.summary || "").match(/Bid\s+([\d,.]+)\s*\/\s*Ask\s+([\d,.]+)/i);
  if (quote) result.push({ price: quote[1] + " / " + quote[2], label: "Bid / Ask ในรายงาน", tone: "silver" });
  const entry = firstPrice(report.entryZone);
  if (entry) result.push({ price: entry, label: "โซนเฝ้าเข้า", tone: "teal" });
  const invalid = firstPrice(report.invalidation);
  if (invalid) result.push({ price: invalid, label: "ยกเลิกแผน", tone: "red" });
  return result.sort((a, b) => priceSort(b.price) - priceSort(a.price)).slice(0, 7);
}
const unavailable = report.dataQuality?.status === "UNAVAILABLE";
const levels = unavailable ? [] : (Array.isArray(map.levels) && map.levels.length ? map.levels.slice(0, 7) : fallbackLevels());
const scenarios = unavailable ? [
  { title: "สถานะ: WAIT", tone: "gold", bullets: [report.summary || "รอข้อมูลยืนยัน"] },
  { title: "ข้อมูลที่ยังขาด", tone: "red", bullets: [report.dataQuality.detail || "ยังตรวจราคาแหล่งหลักไม่ได้"] },
  { title: "รอตรวจใหม่", tone: "teal", bullets: [report.waitFor || "ตรวจกราฟและแท่งที่ปิดแล้วในรอบถัดไป"] }
] : Array.isArray(map.scenarios) && map.scenarios.length ? map.scenarios.slice(0, 3) : [
  { title: "สถานะปัจจุบัน", tone: "gold", bullets: [report.summary || "รอข้อมูลยืนยัน"] },
  { title: "เงื่อนไขเฝ้าเข้า", tone: "teal", bullets: [report.entryZone, report.trigger, report.stop, (report.targets || []).join(" → ")].filter(Boolean) },
  { title: "ยกเลิก / ความเสี่ยง", tone: "red", bullets: [report.invalidation, report.riskReward, report.newsRisk].filter(Boolean) }
];
const reportText = [report.summary, report.bias, report.entryZone, report.trigger, report.invalidation,
  report.stop, ...(Array.isArray(report.targets) ? report.targets : []), report.riskReward,
  report.newsRisk, report.body].filter(Boolean).join(" ");
const supportedPrices = new Set(reportText.match(/\d{1,2},\d{3}(?:\.\d+)?/g) || []);
for (const item of [...levels.map((level) => level.price), ...scenarios.flatMap((scenario) => scenario.bullets || [])]) {
  for (const price of String(item).match(/\d{1,2},\d{3}(?:\.\d+)?/g) || []) {
    if (!supportedPrices.has(price)) throw new Error("Price map contains a level absent from the report: " + price);
  }
}
const svg = [
  '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1360" viewBox="0 0 1200 1360">',
  '<defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#142c49"/><stop offset=".58" stop-color="#0b192b"/><stop offset="1" stop-color="#061421"/></linearGradient><radialGradient id="halo"><stop offset="0" stop-color="#d4a95b" stop-opacity=".18"/><stop offset="1" stop-color="#d4a95b" stop-opacity="0"/></radialGradient></defs>',
  rect(0, 0, 1200, 1360, 0, "url(#bg)"),
  circle(1050, 80, 400, "url(#halo)"),
  line(40, 1230, 1160, 1230, "#60718b", 1),
  text(70, 105, "XAU/USD · แผนระดับราคา", 59, "#ffe3a2", 800),
  text(74, 150, "แผนผังระดับราคา ไม่ใช่กราฟราคาจริง", 25, "#b6c9d8", 500),
  rect(65, 185, 1070, 145, 37, "#111923", statusTone.border, 5),
  text(105, 281, status, 94, statusTone.dot, 900),
  block(420, 261, map.banner || report.headline || "รอเงื่อนไขยืนยัน", 42, "#f2f5f6", 700, 23, 2, 45),
  text(84, 394, "แนวโน้มขึ้น / เป้าหมาย", 25, "#d8e6f0", 700),
  text(84, 1194, "แนวโน้มลง / ยกเลิก", 25, "#d8e6f0", 700),
  line(87, 425, 87, 1110, "#d8e6f0", 5),
  '<path d="M87 413 L73 438 L101 438 Z" fill="#d8e6f0"/>',
  '<path d="M87 1124 L73 1099 L101 1099 Z" fill="#d8e6f0"/>',
  text(510, 390, "เงื่อนไขของแผน", 26, "#d8e6f0", 700)
];
const levelStart = 478;
const levelStep = levels.length > 1 ? Math.min(122, 640 / (levels.length - 1)) : 122;
levels.forEach((level, index) => {
  const y = levelStart + index * levelStep;
  const tone = tones[level.tone] || tones.gold;
  svg.push(line(87, y, 114, y, tone.border, 3));
  svg.push(circle(87, y, 12, tone.dot, "#f5f9fa", 3));
  svg.push(rect(114, y - 37, 346, 73, 11, tone.fill, tone.border, 2));
  const price = String(level.price || "—");
  const size = Array.from(price).length > 18 ? 24 : Array.from(price).length > 12 ? 28 : 36;
  svg.push(text(136, y + 12, price, size, "#f5f9fa", 800));
  svg.push(block(118, y + 66, level.label || "", 21, "#d7e4ed", 600, 28, 1, 24));
});
const cardPositions = [
  { y: 416, height: 188 },
  { y: 624, height: 345 },
  { y: 989, height: 220 }
];
scenarios.forEach((scenario, index) => {
  const position = cardPositions[index];
  const tone = tones[scenario.tone] || [tones.gold, tones.teal, tones.red][index];
  const x = 505, width = 630;
  svg.push(rect(x, position.y, width, position.height, 18, "#0c1b2b", tone.border, 2.5));
  svg.push(rect(x, position.y, width, 72, 16, tone.fill));
  svg.push(line(x, position.y + 72, x + width, position.y + 72, tone.border, 1));
  svg.push(circle(x + 37, position.y + 36, 24, tone.dot));
  svg.push(text(x + 29, position.y + 46, index + 1, 30, "#10212a", 800));
  svg.push(block(x + 78, position.y + 48, scenario.title || "เงื่อนไข", 29, "#f5f8f8", 700, 25, 1, 31));
  const bullets = (Array.isArray(scenario.bullets) ? scenario.bullets : []).slice(0, [2, 4, 2][index]);
  const available = position.height - 95;
  const gap = bullets.length ? available / bullets.length : available;
  bullets.forEach((bullet, bulletIndex) => {
    const yy = position.y + 112 + bulletIndex * gap;
    svg.push(circle(x + 34, yy - 8, 9, tone.dot));
    svg.push(block(x + 58, yy, bullet, 23, "#e9f0f3", 500, 43, 2, 29));
  });
});
svg.push(text(72, 1274, "ข่าวและความเสี่ยง", 24, "#f1c36f", 700));
svg.push(block(72, 1310, map.context || report.newsRisk || "ดูรายละเอียดข่าวในรายงานฉบับเต็ม", 22, "#dbe5eb", 500, 88, 2, 29));
svg.push("</svg>");
await sharp(Buffer.from(svg.join(""))).png({ compressionLevel: 9 }).toFile(path.resolve(outputPath));
process.stdout.write("Rendered XAU Desk price map.\n");
