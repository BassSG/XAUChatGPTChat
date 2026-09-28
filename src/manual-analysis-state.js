export function requestView(state, now = Date.now()) {
  if (!state) return { enabled: false, label: 'กำลังตรวจการเชื่อมต่อ', detail: 'ตรวจสถานะคอมก่อนส่งคำขอ' };
  if (state.error) return { enabled: false, label: 'ยังเชื่อมต่อไม่ได้', detail: state.error };
  if (!state.authorized) return { enabled: false, label: 'จับคู่อุปกรณ์ก่อน', detail: 'เชื่อมอุปกรณ์นี้กับคอมครั้งแรกที่ตั้งค่าแอป' };
  if (!state.online) return { enabled: false, label: 'คอมยังไม่เชื่อมต่อ', detail: 'เปิดคอมและตัวเชื่อมต่อ XAU Desk แล้วรอสักครู่' };
  if (!state.codexOpen) return { enabled: false, label: 'Codex ยังไม่พร้อม', detail: 'เปิด Codex บนคอมและตรวจว่าลงชื่อเข้าใช้แล้ว ระบบจะเปิดปุ่มเมื่อพร้อมรับงาน' };
  if (state.busy) return { enabled: false, label: state.request?.status === 'queued' ? 'ส่งคำขอแล้ว · รอรับงาน' : 'กำลังวิเคราะห์', detail: 'เมื่อเผยแพร่เสร็จ รายงานจะปรากฏบนแอปและแจ้งเตือนตามที่ตั้งไว้' };
  const remaining = Math.max(0, Math.ceil((state.cooldownUntil - now) / 1000));
  if (remaining) return { enabled: false, label: `กดได้อีกใน ${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}`, detail: state.request?.status === 'failed' ? 'งานรอบก่อนไม่สำเร็จ ตรวจรายละเอียดใน Codex ได้' : 'รับคำขอใหม่ได้หนึ่งครั้งทุก 15 นาที' };
  if (state.request?.status === 'failed') return { enabled: Boolean(state.ready), label: 'ลองวิเคราะห์อีกครั้ง', detail: 'รอบก่อนล้มเหลวและยังไม่มีรายงานใหม่ ตรวจข้อผิดพลาดใน Codex ก่อนลองอีกครั้ง' };
  return { enabled: Boolean(state.online && state.codexOpen && !state.busy), label: 'วิเคราะห์ตอนนี้', detail: state.request?.status === 'done' ? 'รายงานรอบที่ขอเผยแพร่แล้ว · Codex พร้อมรับงานใหม่' : 'Codex พร้อม · วิเคราะห์และเผยแพร่รายงานใหม่' };
}
