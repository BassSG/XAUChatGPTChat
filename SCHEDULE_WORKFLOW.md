# XAU Desk: shared scheduled report workflow

This file is the shared contract for the weekday 09:00, 14:30, and 19:00 Codex schedules. Keep the scheduled times and GPT-6 Sol High settings. At every run, send the Thai report and image in Codex, update the journal, and publish the same report to XAU Desk.

## Session focus

- 09:00: overnight developments, the current structure, and important events ahead.
- 14:30: review the morning plan, update the structure, and prepare for the European session. Account for daylight saving time when discussing regional market opens.
- 19:00: review the afternoon plan, prepare for US data and the evening session. Do not state an Actual result for a future release.
- Friday 19:00: also add a brief weekly review from the journal. Count proven, pending, invalidated, and unverifiable plans separately. Explain one lesson supported by the records. Do not imply a win rate from unverifiable plans.

## Evidence and decision rules

1. Use live PEPPERSTONE:XAUUSD on TradingView for H1, M15, and M5. Preserve provider and snapshot timestamp in the body, source list, and journal. Never combine price levels from another broker. Check Bid, Ask, and spread when available. If the primary price source or closed bars needed for a setup cannot be verified, report WAIT and omit detailed entry/stop/target levels that require those bars.
2. Compare the previous report and journal first. State what changed, which prior plan is still pending, and which plan was invalidated or expired. Review earlier plans using closed Pepperstone candles. Record the evidence time and one of: no signal, signal observed, invalidated, pending, or unverifiable. Count an R result only after proving the trigger, entry, stop, and TP/SL order. Call it a simulated plan review, never a result from the user's account.
3. Treat every plan as conditional. Explain exactly what WAIT is waiting for. Provide a plan ID, current plan state, and expiry/invalidation condition. Stops must follow an observed price structure and the spread; do not treat an example number as a live stop. State whether any R:R calculation is hypothetical or fully supported by an actual proposed entry and stop.
4. Check DXY and the user-provided Forex Factory calendar. Check relevant USD releases due before the next scheduled report and releases since the prior report. For each material release, distinguish scheduled/upcoming, released, and unverified. Include Actual, Forecast, Previous, and revisions only when available and published. Verify disputed Actuals or release timing against the original publisher, such as BLS, BEA, the Federal Reserve, Census, ISM, or the University of Michigan. Never fill a future Actual. Include only the few releases that affect the current plan, with a concise explanation of why they matter for gold.
5. Check US Treasury yields and SPDR Gold Shares holdings when accessible, with each data date. These and DXY are context, not M5 triggers. Separate facts from interpretation. For significant unscheduled headlines, use a verifiable source and say when the causal effect on gold is uncertain.

## Report and app data

Write plain, natural Thai. The headline and summary should say the current status, why, and the one next condition. Keep summary at most 500 characters. Do not include the broker name, timezone wording, or snapshot time in the headline or summary; these remain in the full body, sources, and journal. Use the broker name and precise timestamps there for auditability. Mobile notification text is generated from these short fields and should remain concise.

Create one UTF-8 JSON report in the machine's temporary folder. The existing required fields remain: `snapshotAt`, `status` (`WAIT`, `WATCH BUY`, `WATCH SELL`), `headline`, `summary`, `bias`, `entryZone`, `trigger`, `invalidation`, `stop`, `targets` (array), `riskReward`, `newsRisk`, `body`, and `sources` (array). Add these fields:

- `planId`: stable human-readable ID for the conditional plan, e.g. `20260928-0900-A`. Reuse this ID in later reports while reviewing the same pending plan. The journal uses the same ID.
- `planState`: concise Thai state such as `รอสัญญาณ`, `พบสัญญาณยืนยัน`, `ยกเลิก`, `หมดอายุ`, or `ตรวจไม่ได้`.
- `validUntil`: ISO 8601 time with offset when a time expiry is justified, or a short Thai structural expiry condition. Do not invent a time expiry.
- `changeSinceLast`: a short, evidence-backed statement about the previous report. If it cannot be checked, say so.
- `waitFor`: one clear next condition, especially for WAIT.
- `dataQuality`: object with `status` (`OK`, `PARTIAL`, `UNAVAILABLE`), `detail`, `priceSource`, and `priceAt`. `priceAt` is the observed price timestamp when available. Do not call an older quote live.
- `newsEvents`: up to five objects with `title`, `at` (ISO 8601 with the correct offset), `state` (`UPCOMING`, `RELEASED`, `UNVERIFIED`), optional `actual`, `forecast`, `previous`, `impact`, and `sourceUrl`. Omit unsupported values. `actual` requires the release to have happened and its source to be checked.
- `contextSignals`: concise Thai text separating observed DXY/yield/holdings values from the inference. If unavailable, say so.
- `priorReview`: object with `planId`, `outcome`, `evidence`, and `checkedAt` for the prior plan. Use `unverifiable` in Thai when the evidence is incomplete; do not claim it won.
- `weeklyReview`: on Friday 19:00, object with `summary` and `lesson` from the week's journal. Mention how many results could not be verified.

Use the same JSON to render the existing price map PNG. The image is a level diagram, not a real price chart. Use `priceMap` with `banner`, up to seven `levels` ordered high to low, up to three `scenarios`, and `context`. Levels in the map must match the report. If reliable levels are unavailable, show an honest WAIT map without invented numbers. Inspect the PNG before publication. Use only real prices you can verify; never reuse a previous report's numbers as current.

Publish via `scripts/render-analysis-image.mjs` and `scripts/publish-report.ps1` at the absolute paths in the scheduled task. After publication, inspect the deployment and Worker result when accessible. A push request accepted by the service does not prove that the user read it. If publication fails, still send the full report and image in Codex and state what failed.

Never submit a trading order. Never alter a persistent TradingView layout. Never include personal information or secrets in the public report, image, or repository.
