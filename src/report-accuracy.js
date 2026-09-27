const SYMBOL = "PEPPERSTONE:XAUUSD";
const FRAMES = { M5: 5 * 60_000, M15: 15 * 60_000, H1: 60 * 60_000 };

function check(condition, message) {
  if (!condition) throw new Error(message);
}

function number(value) { return typeof value === "number" && Number.isFinite(value); }

function time(value, label) {
  check(typeof value === "string" && /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value), `${label} needs an ISO timestamp`);
  const result = Date.parse(value);
  check(Number.isFinite(result), `${label} is invalid`);
  return result;
}

function age(then, now, maximum, label) {
  const elapsed = now - time(then, label);
  check(elapsed >= 0 && elapsed <= maximum, `${label} is stale or later than snapshot`);
}

function hasPrice(value) { return /(?:\b\d{1,2},\d{3}|\b4\d{3})(?:\.\d+)?/.test(String(value ?? "")); }

function containsPrice(value, expected) {
  const found = String(value ?? "").match(/\d[\d,]*(?:\.\d+)?/g) || [];
  return found.some((part) => Math.abs(Number(part.replaceAll(",", "")) - expected) < 0.001);
}

export function validatePublicationEvidence(report) {
  check(report.schemaVersion === 2, "New reports require schemaVersion 2 and verified evidence");
  const snapshot = time(report.snapshotAt, "snapshotAt");
  check(snapshot <= Date.now() + 60_000, "snapshotAt cannot be in the future");
  check(Date.now() - snapshot <= 15 * 60_000, "A new report must be published within 15 minutes of its snapshot");
  check(typeof report.planId === "string" && report.planId.trim(), "planId is required");
  check(typeof report.waitFor === "string" && report.waitFor.trim(), "waitFor is required");
  check(report.dataQuality && ["OK", "PARTIAL", "UNAVAILABLE"].includes(report.dataQuality.status), "dataQuality is required");
  check(report.dataQuality.priceSource === SYMBOL, "dataQuality.priceSource must be PEPPERSTONE:XAUUSD");
  check(report.evidence?.symbol === SYMBOL, "evidence.symbol must be PEPPERSTONE:XAUUSD");
  check(/^https:\/\/(?:www\.|th\.)?tradingview\.com\/chart\//.test(report.evidence.chartUrl || ""), "evidence.chartUrl must link to the direct TradingView chart");
  check(["OPEN", "CLOSED", "UNAVAILABLE"].includes(report.evidence.marketState), "evidence.marketState is required");
  age(report.evidence.observedAt, snapshot, 15 * 60_000, "evidence.observedAt");
  check(Array.isArray(report.sources) && report.sources.some((source) => /pepperstone/i.test(JSON.stringify(source))), "A Pepperstone source citation is required");

  const quote = report.evidence.quote;
  if (quote != null) {
    check(quote.symbol === SYMBOL, "quote source is not Pepperstone");
    check([quote.bid, quote.ask, quote.spread].every(number) && quote.bid > 0 && quote.ask >= quote.bid && quote.spread >= 0, "Invalid Bid/Ask/spread");
    check(Math.abs(quote.ask - quote.bid - quote.spread) < 0.011, "Spread disagrees with Bid/Ask");
    age(quote.at, snapshot, 2 * 60_000, "quote.at");
  }
  const bars = report.evidence.bars || {};
  check(bars && typeof bars === "object" && !Array.isArray(bars), "evidence.bars must be an object");
  for (const [frame, bar] of Object.entries(bars)) {
    check(frame in FRAMES, `Unknown evidence timeframe ${frame}`);
    const closed = time(bar.closedAt, `${frame}.closedAt`);
    check(closed <= snapshot, `${frame} bar was not closed at snapshot`);
    check([bar.open, bar.high, bar.low, bar.close].every(number), `${frame} OHLC must be numeric`);
    check(bar.high >= Math.max(bar.open, bar.close) && bar.low <= Math.min(bar.open, bar.close), `${frame} OHLC is inconsistent`);
  }
  const calendar = report.evidence.newsCheck;
  check(calendar && ["OK", "UNAVAILABLE"].includes(calendar.status), "A news check status is required");
  age(calendar.checkedAt, snapshot, 15 * 60_000, "newsCheck.checkedAt");
  if (calendar.status === "OK") check(/^https:\/\/www\.forexfactory\.com\/calendar/.test(calendar.sourceUrl || ""), "News check needs the Forex Factory calendar URL");

  check(report.indicatorContext && ["OK", "PARTIAL", "UNAVAILABLE"].includes(report.indicatorContext.status), "indicatorContext status is required");
  if (report.indicatorContext.status === "OK") {
    check(report.indicatorContext.frames?.length === 3, "EBW OK requires M5, M15 and H1");
    for (const frame of report.indicatorContext.frames) {
      check(["M5", "M15", "H1"].includes(frame.timeframe), "EBW timeframe is invalid");
      check(["BUY", "SELL", "NEUTRAL", "NO TRADE"].includes(frame.side), "EBW OK needs a verified side");
      check([frame.buyScore, frame.sellScore, frame.rsi, frame.stochK, frame.stochD].every(number), "EBW OK needs actual scores, RSI and Stochastic values");
      check([frame.rsi, frame.stochK, frame.stochD].every((value) => value >= 0 && value <= 100), "Raw RSI/Stochastic values must be 0–100");
      age(frame.closedAt, snapshot, FRAMES[frame.timeframe] * 2, `EBW ${frame.timeframe}.closedAt`);
      if (frame.netR !== undefined) check(frame.costConfigured === true, "EBW netR needs configured trading costs");
    }
  }
  if (report.priorReview) {
    check(report.priorReview.checkedAt && time(report.priorReview.checkedAt, "priorReview.checkedAt") <= snapshot, "priorReview.checkedAt is required");
    if (["ยกเลิก", "เกิดสัญญาณ"].includes(report.priorReview.outcome)) {
      check(Array.isArray(report.priorReview.timeline) && report.priorReview.timeline.length, "Proven prior outcomes need a closed-bar timeline");
      for (const event of report.priorReview.timeline) {
        check(["TRIGGER", "ENTRY", "INVALIDATED", "STOP", "TARGET"].includes(event.type), "Invalid prior-review event");
        check(time(event.closedAt, "priorReview.timeline.closedAt") <= snapshot, "Prior event needs a closed-bar time");
        check(event.symbol === SYMBOL, "Prior event must use Pepperstone");
      }
    }
  }

  const watching = report.status !== "WAIT";
  if (!watching) {
    check(report.planLevels == null, "WAIT cannot publish a ready numerical plan");
    if (report.evidence.marketState !== "OPEN" || report.dataQuality.status === "UNAVAILABLE") {
      check(!hasPrice(report.entryZone) && !hasPrice(report.stop) && !report.targets.some(hasPrice), "Closed or unavailable market cannot carry detailed entry/stop/target prices");
    }
    return true;
  }
  check(report.evidence.marketState === "OPEN" && report.dataQuality.status === "OK", "WATCH requires open market and verified primary price");
  check(quote, "WATCH requires fresh Pepperstone Bid/Ask/spread");
  check(report.evidence.spreadAssessment === "NORMAL", "WATCH requires a normal spread assessment");
  check(calendar.status === "OK", "WATCH requires a verified USD calendar check");
  check(time(report.dataQuality.priceAt, "dataQuality.priceAt") === time(quote.at, "quote.at"), "priceAt must match quote time");
  for (const [frame, maxAge] of [["M5", 10 * 60_000], ["M15", 30 * 60_000], ["H1", 120 * 60_000]]) {
    check(bars[frame], `WATCH requires a closed ${frame} candle`);
    age(bars[frame].closedAt, snapshot, maxAge, `${frame}.closedAt`);
  }
  for (const event of report.newsEvents || []) {
    if (["UPCOMING", "UNVERIFIED"].includes(event.state) && event.currency === "USD" && event.impact === "HIGH" && Math.abs(time(event.at, "newsEvent.at") - snapshot) <= 30 * 60_000) {
      throw new Error("WATCH cannot be published within 30 minutes around an unverified high-impact USD event");
    }
  }
  const plan = report.planLevels;
  check(plan && plan.side === (report.status === "WATCH BUY" ? "BUY" : "SELL"), "WATCH needs matching planLevels.side");
  check(plan.entry && [plan.entry.low, plan.entry.high, plan.entry.reference].every(number), "WATCH needs numeric entry zone and reference");
  check(plan.entry.low <= plan.entry.reference && plan.entry.reference <= plan.entry.high, "Reference entry must be inside the zone");
  check(plan.stop?.kind === "FIXED_VERIFIED" && number(plan.stop.price), "WATCH needs a verified structural stop");
  check(number(plan.stop.structurePrice) && number(plan.stop.buffer) && plan.stop.buffer >= quote.spread, "Stop needs a verified swing and spread buffer");
  check(time(plan.stop.structureAt, "stop.structureAt") <= snapshot, "Stop structure must precede the report");
  check(typeof plan.costNote === "string" && plan.costNote.trim(), "WATCH needs an explicit cost assumption");
  check(number(plan.costPerUnit) && plan.costPerUnit >= quote.spread, "WATCH cost must include observed spread");
  check(Array.isArray(plan.targets) && plan.targets.length > 0 && plan.targets.every((target) => number(target.price)), "WATCH needs numeric targets");
  const direction = plan.side === "BUY" ? 1 : -1;
  check(plan.entry.reference === (direction === 1 ? plan.entry.high : plan.entry.low), "Net R must use the least favorable entry in the zone");
  check(direction * (plan.stop.structurePrice - plan.stop.price) >= plan.stop.buffer - 0.001, "Stop buffer does not clear the structural swing");
  check(direction * (plan.entry.low - plan.stop.price) > 0 && direction * (plan.entry.high - plan.stop.price) > 0, "Stop is on the wrong side of entry zone");
  check(plan.targets.every((target) => direction * (target.price - plan.entry.high) > 0 && direction * (target.price - plan.entry.low) > 0), "Target is on the wrong side of entry zone");
  const risk = direction * (plan.entry.reference - plan.stop.price);
  const reward = direction * (plan.targets[0].price - plan.entry.reference);
  const netR = (reward - plan.costPerUnit) / (risk + plan.costPerUnit);
  check(netR > 0 && number(plan.netR) && Math.abs(netR - plan.netR) <= 0.015, "netR does not match entry, stop, target and costs");
  check(containsPrice(report.entryZone, plan.entry.low) && containsPrice(report.entryZone, plan.entry.high), "Entry text disagrees with planLevels");
  check(containsPrice(report.stop, plan.stop.price), "Stop text disagrees with planLevels");
  check(report.targets.length === plan.targets.length && report.targets.every((target, index) => containsPrice(target, plan.targets[index].price)), "Target text disagrees with planLevels");
  check(new RegExp(`(?:^|\\D)${plan.netR.toFixed(2)}\\s*R`, "i").test(report.riskReward), "R:R text disagrees with calculated net R");
  check(/ประมาณ|คาด|สมมติ/.test(report.riskReward), "R:R must be labelled as a conditional estimate");
  const mapLevels = report.priceMap?.levels;
  check(Array.isArray(mapLevels), "WATCH requires a price map from the same numerical plan");
  for (const [kind, values] of [["ENTRY", [plan.entry.low, plan.entry.high]], ["STOP", [plan.stop.price]], ["TARGET", [plan.targets[0].price]]]) {
    check(mapLevels.some((level) => level.kind === kind && values.every((value) => containsPrice(level.price, value))), `Price map ${kind} disagrees with planLevels`);
  }
  return true;
}
