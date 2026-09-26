import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

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

async function validate(report) {
  const folder = await mkdtemp(join(tmpdir(), "xau-report-test-"));
  try {
    const path = join(folder, "report.json");
    await writeFile(path, JSON.stringify(report), "utf8");
    return spawnSync(process.execPath, [fileURLToPath(new URL("./validate-report.mjs", import.meta.url)), "--input", path], { encoding: "utf8" });
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
