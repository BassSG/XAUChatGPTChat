import { newsEmbargo, DESK_POLICY,reportPolicy } from './desk-policy.js';
import { decisionView } from './analysis-readiness.js';
export function reportState(report, now = Date.now()) {
  const age = now - Date.parse(report.snapshotAt);
  const expiry = /^\d{4}-\d\d-\d\dT/.test(report.validUntil || "") ? Date.parse(report.validUntil) : NaN;
  const planState = String(report.planState || "");
  if (!Number.isFinite(age) || age < -300000) return { title: "เวลารายงานไม่ชัดเจน", detail: "ตรวจวันเวลาและข้อมูลราคาก่อนใช้แผน", tone: "warning" };
  if (report.dataQuality?.status === "UNAVAILABLE") return { title: "ข้อมูลราคาหลักไม่พร้อม", detail: "รายงานนี้ไม่มีราคาหลักที่ตรวจสอบได้ จึงไม่มีจุดเข้าแบบละเอียด", tone: "warning" };
  if ((report.newsEvents || []).some((event) => event.currency === "USD" && event.impact === "HIGH" && event.state !== "RELEASED" && Number.isFinite(Date.parse(event.at)) && now >= Date.parse(event.at) && now - Date.parse(event.at) <= 24 * 60 * 60 * 1000)) {
    return { title: "ข่าวถึงเวลาแล้ว ผลยังไม่ยืนยัน", detail: "ตรวจผลข่าวและราคาหลังข่าวก่อนใช้แผนเดิม", tone: "warning" };
  }
  if (report.status !== "WAIT" && report.evidence?.quote?.at && now - Date.parse(report.evidence.quote.at) > 2 * 60 * 1000) {
    return { title: "ต้องตรวจราคาล่าสุด", detail: "Bid/Ask และ spread ในแผนเป็นข้อมูล ณ รอบวิเคราะห์ ให้ตรวจกราฟใหม่ก่อนใช้", tone: "warning" };
  }
  if (newsEmbargo(report.newsEvents,now,reportPolicy(report)).length) return { title:'อยู่ในช่วงพักก่อน/หลังข่าว', detail:'ตรวจข่าวและโครงสร้างใหม่ก่อนใช้แผน', tone:'warning' };
  if (/ยกเลิก/.test(planState)) return { title: "แผนถูกยกเลิก", detail: "ดูหลักฐานและเงื่อนไขในรายงานฉบับเต็มก่อนวางแผนใหม่", tone: "warning" };
  if (/หมดอายุ/.test(planState)) return { title: "แผนหมดอายุ", detail: "ต้องตรวจโครงสร้างราคาใหม่ก่อนวางแผน", tone: "warning" };
  if (Number.isFinite(expiry) && now > expiry) return { title: "แผนพ้นเวลาที่ระบุ", detail: "เงื่อนไขและระดับราคาในรายงานนี้ต้องตรวจใหม่", tone: "warning" };
  if (age >= 24 * 60 * 60 * 1000) return { title: "รายงานย้อนหลัง", detail: "ระดับราคาเป็นข้อมูลจากรอบก่อน ต้องตรวจราคาและข่าวใหม่ก่อนใช้", tone: "warning" };
  if (age >= 4 * 60 * 60 * 1000) return { title: "ต้องตรวจราคาใหม่", detail: "สถานะนี้อ้างอิงเวลาที่บันทึกรายงาน ยังไม่ใช่สัญญาณใหม่", tone: "warning" };
  if (/ตรวจไม่ได้/.test(planState)) return { title: "ยังตรวจสัญญาณไม่ได้", detail: "รอข้อมูลและแท่งปิดที่ตรวจสอบได้", tone: "warning" };
  if (/พบสัญญาณ/.test(planState)) return { title: "รายงานระบุว่าพบสัญญาณ", detail: "ตรวจราคาเข้าและความเสี่ยงล่าสุดก่อนตัดสินใจ", tone: "active" };
  return decisionView(report) || { title: "รอเงื่อนไขยืนยัน", detail: report.waitFor || "รอแท่งปิดตามเงื่อนไขในแผน", tone: "waiting" };
}

// A missing report is observable; its cause (quota, PC, publication) is not.
export function deliveryState(report, now = Date.now()) {
  const local = new Date(now + 7 * 3600000);
  const midnight = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - 7 * 3600000;
  for (let day = 0; day < 8; day++) {
    const base = midnight - day * 86400000;
    const weekday = new Date(base + 7 * 3600000).getUTCDay();
    if (weekday === 0 || weekday === 6) continue;
    for (const [hour, minute] of [[19,0],[14,30],[9,0]]) {
      const slot = base + (hour * 60 + minute) * 60000;
      if (now < slot + 30 * 60000) continue;
      if (Date.parse(report?.snapshotAt || '') >= slot) return null;
      return { title: 'ยังไม่มีรายงานใหม่สำหรับรอบตามตารางล่าสุด', detail: 'กำลังแสดงรายงานรอบก่อน กรุณาตรวจผลการรันใน Codex; หน้าเว็บยังยืนยันสาเหตุไม่ได้' };
    }
  }
  return null;
}

export function newsEventState(event, now = Date.now(), policy=DESK_POLICY) {
  if (event.state === "RELEASED") return { className: "released", text: "ประกาศแล้ว" };
  if (event.state === "UNVERIFIED") return { className: "unverified", text: "รอยืนยันผล" };
  const eventTime = Date.parse(event.at || "");
  if (Number.isFinite(eventTime) && now >= eventTime) return { className: "unverified", text: "ถึงเวลาแล้ว · ยังไม่ยืนยันผล" };
  if (Number.isFinite(eventTime) && eventTime - now <= policy.newsBeforeMinutes * 60 * 1000) return { className: "upcoming", text: "ใกล้ประกาศ" };
  return { className: "upcoming", text: "รอประกาศ" };
}
