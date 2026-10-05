// Operational status is separate from market reports. Public text is allowlisted;
// raw errors, local paths, credentials and unvalidated prices never enter it.
export const RUN_FAILURE_TEXT = Object.freeze({
  EVIDENCE_MISMATCH: 'รายงานรอบล่าสุดยังเผยแพร่ไม่ได้ เพราะการตรวจหลักฐานไม่ผ่าน',
  VALIDATION_FAILED: 'รายงานรอบล่าสุดยังเผยแพร่ไม่ได้ เพราะการตรวจรายงานไม่ผ่าน',
  SOURCE_UNAVAILABLE: 'รายงานรอบล่าสุดยังเผยแพร่ไม่ได้ เพราะเข้าถึงแหล่งข้อมูลที่จำเป็นไม่ได้',
  PUBLICATION_FAILED: 'รายงานรอบล่าสุดส่งขึ้นเว็บไม่สำเร็จ',
  DELIVERY_FAILED: 'รายงานรอบล่าสุดมีปัญหาในขั้นส่งแจ้งเตือน'
});
export function validateRunFailure(value, now = Date.now()) {
  if (!value || value.status !== 'FAILED' || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{5,100}$/.test(value.runId || '') ||
      !Object.hasOwn(RUN_FAILURE_TEXT, value.code || '') ||
      typeof value.startedAt !== 'string' || !/(Z|[+-]\d\d:\d\d)$/.test(value.startedAt) ||
      !Number.isFinite(Date.parse(value.startedAt)) || Date.parse(value.startedAt) > now + 60000 ||
      now - Date.parse(value.startedAt) > 7 * 86400000 ||
      Object.keys(value).some(k => !['runId','startedAt','status','code'].includes(k))) {
    throw new Error('Invalid analysis run status.');
  }
  return {runId:value.runId,startedAt:new Date(value.startedAt).toISOString(),status:'FAILED',code:value.code};
}
export function runFailureView(run, report) {
  const delivery=run?.code==='DELIVERY_FAILED';
  if (!run || run.status !== 'FAILED' || !Object.hasOwn(RUN_FAILURE_TEXT,run.code || '') ||
      !Number.isFinite(Date.parse(run.startedAt)) ||
      (delivery?Date.parse(report?.snapshotAt || '')>Date.parse(run.startedAt):Date.parse(report?.snapshotAt || '')>=Date.parse(run.startedAt))) return null;
  if(delivery)return {title:'ส่งแจ้งเตือนไม่ครบ',message:'รายงานพร้อมอ่านแล้ว แต่ระบบส่งแจ้งเตือนไม่ครบทุกอุปกรณ์ ตรวจสถานะแจ้งเตือนบนอุปกรณ์ที่ใช้งาน'};
  return {title:'รอบล่าสุดยังเผยแพร่ไม่สำเร็จ',message:RUN_FAILURE_TEXT[run.code]+'. รายงานที่แสดงอยู่ยังเป็นรอบก่อน ดูรายละเอียดรอบนี้ได้ใน Codex'};
}
