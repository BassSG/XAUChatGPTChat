import { validateEvidencePack, FRAME_MS, PRIMARY_SYMBOL } from './analysis-evidence.js';
import { validateScenarioPlan } from './scenario-plan.js';

// Replay only rules published with the original plan. No rules are inferred from prose.
export function reviewPlan(report, evidence) {
  validateEvidencePack(evidence);
  validateScenarioPlan(report);
  const result = { planId: report.planId, checkedAt: evidence.capturedAt, outcome: 'ตรวจไม่ได้', evidence: '', timeline: [], simulatedR: null, resultStatus: 'UNVERIFIABLE' };
  const fail = text => ({ ...result, outcome: 'ตรวจไม่ได้', resultStatus: 'UNVERIFIABLE', evidence: text });
  const rules = report.reviewRules;
  const scenario = report.scenarioPlan?.scenarios?.find(s => s.side === rules?.side);
  const v4 = report.schemaVersion === 4;
  if (!rules || !(v4 ? rules.version === 2 : rules.version === 1) || !scenario || !Number.isFinite(rules.confirmationPrice) || scenario.retestFrame !== 'M5') return fail('แผนเดิมไม่มีเงื่อนไขทบทวนอัตโนมัติครบ ห้ามกำหนดกติกาย้อนหลัง');
  if (rules.confirmation !== 'RETEST_THEN_CLOSE' || !rules.invalidation || !FRAME_MS[rules.invalidation.timeframe] || !Number.isFinite(rules.invalidation.price) || !['ABOVE','BELOW'].includes(rules.invalidation.direction)) return fail('เงื่อนไขยกเลิกหรือยืนยันของแผนเดิมไม่รองรับ ต้องทบทวนด้วยหลักฐานเอง');
  const snapshot = Date.parse(report.snapshotAt);
  const strictPublication = report.schemaVersion >= 3;
  const published = Date.parse(evidence.publication?.publishedAt);
  if (strictPublication && (!Number.isFinite(published) || published < snapshot || evidence.publication.planId !== report.planId)) return fail('ยังไม่มีหลักฐานเวลาเผยแพร่จริง จึงไม่เริ่ม replay จาก snapshot');
  if (v4 && scenario.role !== 'PRIMARY') return fail('ทบทวนเฉพาะแผนหลักที่เผยแพร่ ไม่เปิดแผนสำรองย้อนหลัง');
  const start = Math.ceil((strictPublication ? published : snapshot) / FRAME_MS.M5) * FRAME_MS.M5;
  const expiry = /^\d{4}-\d\d-\d\dT/.test(report.validUntil || '') ? Date.parse(report.validUntil) : Infinity;
  const end = strictPublication ? Date.parse(evidence.capturedAt) : Math.min(Date.parse(evidence.capturedAt), expiry);
  if (!Number.isFinite(start) || end <= start) return fail('ยังไม่มีช่วงเวลาหลังแผนให้ตรวจ');
  result.reviewFrom = new Date(start).toISOString();
  result.reviewTo = new Date(end).toISOString();
  const frames = [...new Set([scenario.breakFrame, 'M5', rules.invalidation.timeframe])];
  const gaps = [];
  for (const frame of frames) {
    const available = new Set((evidence.frames[frame] || []).map(b => Date.parse(b.closedAt)));
    const first = Math.floor(start / FRAME_MS[frame]) * FRAME_MS[frame] + FRAME_MS[frame];
    for (let at = first; at <= end; at += FRAME_MS[frame]) {
      if (!available.has(at)) { gaps.push(frame); break; }
    }
  }
  if (gaps.length || evidence.gaps.length) return fail('แท่งปิดไม่ต่อเนื่องหรือมีช่วงขาดหาย จึงยังสรุปผลไม่ได้: ' + (gaps.join(', ') || evidence.gaps.join('; ')));
  const direction = rules.side === 'BUY' ? 1 : -1;
  const crosses = price => direction * (price - scenario.breakPrice) > 0;
  const event = (type, bar, frame, price, at = bar.closedAt) => ({ type, at, closedAt: bar.closedAt, timeframe: frame, symbol: PRIMARY_SYMBOL, price, bar: { ...bar } });
  let brokenAt = null;
  if (scenario.breakState === 'OBSERVED') {
    const prior = evidence.frames[scenario.breakFrame]?.find(b => Date.parse(b.closedAt) === Date.parse(scenario.breakClosedAt));
    if (!prior || !crosses(prior.close) || Date.parse(prior.closedAt) > snapshot) return fail('ไม่พบหลักฐานแท่งที่รายงานเดิมระบุว่าเบรกแล้ว');
    brokenAt = Date.parse(prior.closedAt);
    result.timeline.push(event('BREAK', prior, scenario.breakFrame, prior.close));
  }
  let touched = false, confirmed = null;
  const events = frames.flatMap(frame => (evidence.frames[frame] || [])
    .filter(b => Date.parse(b.closedAt) > start && Date.parse(b.closedAt) <= end)
    .map(bar => ({ frame, bar, time: Date.parse(bar.closedAt) })))
    .sort((a,b) => a.time - b.time || (a.frame === rules.invalidation.timeframe ? -1 : b.frame === rules.invalidation.timeframe ? 1 : 0));
  if (!events.some(e => e.frame === 'M5')) return { ...result, outcome: 'รอตรวจ', resultStatus: 'PENDING', evidence: 'ยังไม่มี M5 ที่เริ่มและปิดหลังเผยแพร่แผน' };
  for (const { frame, bar, time } of events) {
    if (strictPublication && time > expiry) break;
    const invalid = frame === rules.invalidation.timeframe && (rules.invalidation.direction === 'ABOVE' ? bar.close > rules.invalidation.price : bar.close < rules.invalidation.price);
    if (invalid) { result.timeline.push(event('INVALIDATED', bar, frame, bar.close)); return { ...result, outcome: 'ยกเลิก', resultStatus: 'INVALIDATED', evidence: 'แท่งปิดผ่านเงื่อนไขยกเลิกที่ประกาศไว้ก่อนมีราคาเข้า' }; }
    if (!brokenAt && frame === scenario.breakFrame && crosses(bar.close)) {
      brokenAt = time; result.timeline.push(event('BREAK', bar, frame, bar.close));
    }
    if (brokenAt && frame === 'M5' && time - FRAME_MS.M5 >= Math.max(brokenAt, start)) {
      touched ||= bar.high >= scenario.retestLow && bar.low <= scenario.retestHigh;
      if (touched && direction * (bar.close - rules.confirmationPrice) > 0) { confirmed = time; result.timeline.push(event('TRIGGER', bar, frame, bar.close)); break; }
    }
  }
  if (!confirmed) return { ...result, outcome: 'ไม่เกิดสัญญาณ', resultStatus: 'NO_SIGNAL', evidence: 'ตรวจช่วงแท่งปิดครบแล้ว ยังไม่เกิดลำดับยืนยันตามกติกาในช่วงนี้' };
  result.outcome = 'เกิดสัญญาณ';
  const levels = report.planLevels;
  const validLevels = levels?.side === rules.side && Number.isFinite(levels?.entry?.low) && Number.isFinite(levels?.entry?.high) && levels.entry.low <= levels.entry.high && Number.isFinite(levels?.stop?.price) && Number.isFinite(levels?.targets?.[0]?.price) && Number.isFinite(levels?.costPerUnit) && levels.costPerUnit >= 0;
  if (rules.entry !== 'NEXT_M5_OPEN_WITHIN_ZONE' || rules.exit !== 'FULL_AT_TP1_OR_STOP' || !validLevels) return { ...result, resultStatus: 'SIGNAL_ONLY', evidence: 'พบการยืนยัน แต่แผนเดิมไม่มีราคา/กติกาเข้าหรือออกครบ จึงไม่คำนวณ R' };
  const subsequent = (evidence.frames.M5 || []).filter(b => Date.parse(b.closedAt) > confirmed && Date.parse(b.closedAt) <= end);
  if (!subsequent.length) return { ...result, resultStatus: 'SIGNAL_ONLY', evidence: 'พบการยืนยัน ยังไม่มีแท่งถัดไปให้พิสูจน์การเข้า' };
  const entryBar = subsequent[0], entry = entryBar.open;
  if (strictPublication && confirmed >= expiry) return { ...result, resultStatus: 'NO_FILL', evidence: 'หมดเวลารับ entry ก่อนเปิดแท่งถัดไป จึงไม่เปิดสถานะจำลอง' };
  if (Date.parse(entryBar.closedAt) !== confirmed + FRAME_MS.M5) return fail('ขาดแท่งถัดจากแท่งยืนยัน จึงพิสูจน์ราคาเข้าไม่ได้');
  if (entry < levels.entry.low || entry > levels.entry.high || direction * (entry - levels.stop.price) <= 0 || direction * (levels.targets[0].price - entry) <= 0) return { ...result, resultStatus: 'NO_FILL', evidence: 'เปิดแท่งถัดไปอยู่นอกโซนเข้าหรือเลย Stop/เป้า จึงไม่มีการเข้าตามกติกา' };
  result.timeline.push(event('ENTRY', entryBar, 'M5', entry, new Date(confirmed).toISOString()));
  for (const bar of subsequent) {
    const stopped = direction === 1 ? bar.low <= levels.stop.price : bar.high >= levels.stop.price;
    const targeted = direction === 1 ? bar.high >= levels.targets[0].price : bar.low <= levels.targets[0].price;
    const stopGap = direction * (bar.open - levels.stop.price) <= 0;
    const targetGap = direction * (bar.open - levels.targets[0].price) >= 0;
    if (stopped && targeted && !stopGap && !targetGap) return { ...result, resultStatus: 'AMBIGUOUS', evidence: 'แท่งเดียวแตะทั้ง TP1 และ Stop ไม่ทราบลำดับ ไม่นับชนะและไม่คำนวณ R' };
    if (stopped || targeted) {
      const stopFirst = stopGap || (!targetGap && stopped);
      const exit = stopFirst ? (stopGap ? bar.open : levels.stop.price) : levels.targets[0].price;
      result.timeline.push(event(stopFirst ? 'STOP' : 'TARGET', bar, 'M5', exit));
      const risk = direction * (entry - levels.stop.price);
      return { ...result, resultStatus: stopFirst ? 'SIMULATED_STOP' : 'SIMULATED_TP1', simulatedR: Math.round(((direction * (exit - entry) - levels.costPerUnit) / (risk + levels.costPerUnit)) * 100) / 100, evidence: 'ผลจำลองตามกติกาเข้าเปิดแท่งถัดไปและออกเต็มจำนวนที่ TP1/Stop พร้อมต้นทุนที่ประกาศไว้ ไม่ใช่ผลบัญชีผู้ใช้' };
    }
  }
  return { ...result, resultStatus: 'OPEN_SIMULATION', evidence: 'มีการเข้าจำลอง ยังไม่พบ TP1/Stop ในช่วงข้อมูลที่ตรวจ' };
}
