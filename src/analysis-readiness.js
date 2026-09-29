export const DECISION_REASONS = {
  DATA_MISSING: 'WAIT · ข้อมูลยังไม่ครบ',
  SIGNAL_PENDING: 'WAIT · รอสัญญาณตามแผน',
  STRUCTURE_PENDING: 'WAIT · จุดเข้าและความเสี่ยงยังไม่ครบ',
  NEWS_RISK: 'WAIT · รอผ่านช่วงข่าว',
  MARKET_CLOSED: 'WAIT · ตลาดปิด',
  CONDITIONAL_PLAN: 'แผนมีเงื่อนไข · ตรวจสัญญาณก่อนเข้า'
};

export function decisionView(report) {
  const decision = report.decision;
  if (!decision || !DECISION_REASONS[decision.reason]) return null;
  return { title: DECISION_REASONS[decision.reason], detail: decision.nextAction, tone: decision.reason === 'CONDITIONAL_PLAN' ? 'active' : decision.reason === 'DATA_MISSING' ? 'warning' : 'waiting' };
}

export function readinessItems(report) {
  const e = report.evidence || {};
  const bars = e.bars || {};
  return [
    { label: 'แท่งปิด H1 / M15 / M5', ready: ['H1','M15','M5'].every(frame => bars[frame]), detail: ['H1','M15','M5'].filter(frame => !bars[frame]).join(' / ') || 'มีครบสามกรอบในรายงาน' },
    { label: 'ราคาและ spread', ready: Boolean(e.quote && e.spreadAssessment === 'NORMAL'), detail: !e.quote ? 'ยังไม่มี Bid/Ask ที่บันทึกไว้' : e.spreadAssessment !== 'NORMAL' ? 'อ่านราคาได้ แต่ยังไม่ยืนยัน spread ปกติ' : 'ตรวจราคาและ spread ณ รอบวิเคราะห์แล้ว' },
    { label: 'ข่าว USD', ready: e.newsCheck?.status === 'OK', detail: e.newsCheck?.status === 'OK' ? 'ตรวจปฏิทิน ณ รอบวิเคราะห์แล้ว' : 'ยังไม่มีผลตรวจปฏิทินครบ' },
    { label: 'จุดเข้า · Stop · เป้า · R:R', ready: Boolean(report.planLevels), detail: report.planLevels ? 'มีแผนตัวเลขแบบมีเงื่อนไข' : 'ยังไม่มีแผนตัวเลขครบพร้อมประเมินเข้า' }
  ];
}
