export function reportState(report, now = Date.now()) {
  const age = now - Date.parse(report.snapshotAt);
  const expiry = /^\d{4}-\d\d-\d\dT/.test(report.validUntil || "") ? Date.parse(report.validUntil) : NaN;
  const planState = String(report.planState || "");
  if (!Number.isFinite(age) || age < -300000) return { title: "เวลารายงานไม่ชัดเจน", detail: "ตรวจวันเวลาและข้อมูลราคาก่อนใช้แผน", tone: "warning" };
  if (report.dataQuality?.status === "UNAVAILABLE") return { title: "ข้อมูลราคาหลักไม่พร้อม", detail: "รายงานนี้ไม่มีราคาหลักที่ตรวจสอบได้ จึงไม่มีจุดเข้าแบบละเอียด", tone: "warning" };
  if (/ยกเลิก/.test(planState)) return { title: "แผนถูกยกเลิก", detail: "ดูหลักฐานและเงื่อนไขในรายงานฉบับเต็มก่อนวางแผนใหม่", tone: "warning" };
  if (/หมดอายุ/.test(planState)) return { title: "แผนหมดอายุ", detail: "ต้องตรวจโครงสร้างราคาใหม่ก่อนวางแผน", tone: "warning" };
  if (Number.isFinite(expiry) && now > expiry) return { title: "แผนพ้นเวลาที่ระบุ", detail: "เงื่อนไขและระดับราคาในรายงานนี้ต้องตรวจใหม่", tone: "warning" };
  if (age >= 24 * 60 * 60 * 1000) return { title: "รายงานย้อนหลัง", detail: "ระดับราคาเป็นข้อมูลจากรอบก่อน ต้องตรวจราคาและข่าวใหม่ก่อนใช้", tone: "warning" };
  if (age >= 4 * 60 * 60 * 1000) return { title: "ต้องตรวจราคาใหม่", detail: "สถานะนี้อ้างอิงเวลาที่บันทึกรายงาน ยังไม่ใช่สัญญาณใหม่", tone: "warning" };
  if (/ตรวจไม่ได้/.test(planState)) return { title: "ยังตรวจสัญญาณไม่ได้", detail: "รอข้อมูลและแท่งปิดที่ตรวจสอบได้", tone: "warning" };
  if (/พบสัญญาณ/.test(planState)) return { title: "รายงานระบุว่าพบสัญญาณ", detail: "ตรวจราคาเข้าและความเสี่ยงล่าสุดก่อนตัดสินใจ", tone: "active" };
  return { title: "รอเงื่อนไขยืนยัน", detail: report.waitFor || "รอแท่งปิดตามเงื่อนไขในแผน", tone: "waiting" };
}

export function newsEventState(event, now = Date.now()) {
  if (event.state === "RELEASED") return { className: "released", text: "ประกาศแล้ว" };
  if (event.state === "UNVERIFIED") return { className: "unverified", text: "รอยืนยันผล" };
  const eventTime = Date.parse(event.at || "");
  if (Number.isFinite(eventTime) && now >= eventTime) return { className: "unverified", text: "ถึงเวลาแล้ว · ยังไม่ยืนยันผล" };
  if (Number.isFinite(eventTime) && eventTime - now <= 30 * 60 * 1000) return { className: "upcoming", text: "ใกล้ประกาศ" };
  return { className: "upcoming", text: "รอประกาศ" };
}
