import test from "node:test";
import assert from "node:assert/strict";
import { reportState, newsEventState } from "../src/report-state.js";

const snapshotAt = "2026-09-25T19:00:00+07:00";
const at = (time) => Date.parse(`2026-09-25T${time}:00+07:00`);

test("a pending plan becomes historical without implying a live signal", () => {
  const report = { snapshotAt, status: "WAIT", waitFor: "รอ M5 ปิดยืนยัน" };
  assert.equal(reportState(report, at("20:00")).title, "รอเงื่อนไขยืนยัน");
  assert.equal(reportState(report, at("20:00")).detail, "รอ M5 ปิดยืนยัน");
  assert.equal(reportState(report, at("23:01")).title, "ต้องตรวจราคาใหม่");
  assert.equal(reportState(report, Date.parse("2026-09-26T19:01:00+07:00")).title, "รายงานย้อนหลัง");
});

test("an explicit expiry and missing primary price override a recent WAIT", () => {
  const report = { snapshotAt, validUntil: "2026-09-25T19:30:00+07:00" };
  assert.equal(reportState(report, at("19:31")).title, "แผนพ้นเวลาที่ระบุ");
  assert.equal(reportState({ ...report, dataQuality: { status: "UNAVAILABLE" } }, at("19:31")).title, "ข้อมูลราคาหลักไม่พร้อม");
});

test("an elapsed news time never becomes a confirmed release by itself", () => {
  const event = { at: "2026-09-25T19:30:00+07:00", state: "UPCOMING" };
  assert.equal(newsEventState(event, at("18:59")).text, "รอประกาศ");
  assert.equal(newsEventState(event, at("19:10")).text, "ใกล้ประกาศ");
  assert.equal(newsEventState(event, at("19:31")).text, "ถึงเวลาแล้ว · ยังไม่ยืนยันผล");
  assert.equal(newsEventState({ ...event, state: "RELEASED" }, at("19:31")).text, "ประกาศแล้ว");
});
