# XAU/USD Trading Desk V4 — authoritative reasoning contract

## Current V4.2 location extension

For new runs read [V4_2_LOCATION_CONTRACT.md](V4_2_LOCATION_CONTRACT.md) before selecting a scenario. Use schemaVersion 4 with desk.architectureVersion "4.2" and policy XAU_V4_2. Scan above/current/below first, choose a setup archetype, preserve candidate zones in WAIT, and confirm M15 by that archetype. The original break/retest format below describes the legacy branch only. Keep source/evidence/journal/publication gates and existing schedules/model.


This contract supersedes earlier indicator-led reasoning instructions. It extends the existing desk; it does not replace collection, evidence, freshness, review, journal or publication controls. Historical V3 reports retain their original interpretation. Schedule times and models remain unchanged.

## Hierarchy and source roles

**XAU HTF structure → Daily SR → AMM → M15 setup/confirmation → M5 trigger/fine entry → DXY filter.**

- Establish W1, D1, H4, H1 baseline from closed PEPPERSTONE:XAUUSD candles. Describe structure, location, directional bias and critical zones. A missing baseline is an explicit information-limited WAIT; still deliver all verified information.
- Daily SR is a structural/location map, with STRUCTURAL / TACTICAL / CRITICAL levels and ACTIVE / FRESH / TESTED / BROKEN / INVALIDATED / HISTORICAL states. It cannot create an entry signal.
- AMM means an **observed tactical zone and scenario refinement**, filtered through HTF direction. Countertrend information may be retained as FILTERED with a filter reason, but cannot become an active entry zone. The supplied mandate does not specify an AMM formula or proprietary algorithm. Record the observed method and evidence; do not invent an AMM calculation or static signal. An unverified AMM is an empty zone list with explanation.
- M15 is the minimum setup/entry confirmation. M5 is a subsequent trigger, retest and fine entry. M1, if present, is DETAIL_ONLY. A strong M5 score cannot create or reverse the primary setup.
- EBW / All Indy, RSI and Stochastic are secondary confirmation only. Preserve their verified source, inputs, lifecycle and raw values when available. They are not independent votes or a substitute for structure.
- DXY uses CONFIRM / NEUTRAL / CONTRADICT / UNAVAILABLE with `symbol:TVC:DXY`, observed timeframe, structure, source and time. It cannot trigger XAU. Contradiction is explained; it does not automatically veto a structurally valid plan. EURUSD cannot substitute for DXY.
- SPDR is dated medium-term flow: `measure:GOLD_HOLDINGS_TONNES`, holdings, prior holdings/date, daily difference, documented medium-term direction and flow bias when available, from spdrgoldshares.com. GLD price cannot substitute. It cannot override M15 confirmation. Missing data stays unknown. Missing HTF bias and market phase are UNAVAILABLE, not neutral or zero.
- News is a regime/event-risk layer. Forex Factory remains the primary calendar, FMP supplemental, and disputed Actuals require the original publisher. Keep UTC conversion, future-Actual suppression and credential isolation.

## Baseline lifecycle

`desk.baseline` has identity, INITIAL / REFRESH / CARRY_FORWARD mode, ACTIVE / SUSPENDED / UNAVAILABLE status, bias, creation/check/refresh times, four frame structures with closed-bar references, current H1 check evidence, refresh reason and structural invalidation.

Carry-forward must preserve the original baseline fields, reference its immutable original report by plan ID, snapshot and SHA-256, and perform a fresh H1 invalidation check. The local evidence verifier checks the original archive. Old W1/D1/H4 candles retain their real timestamps; never relabel them as freshly read. Reread when the configured maximum baseline age, refresh time, structural trigger or documented session change requires it. An active carried baseline is not continuous monitoring.

`src/desk-policy.js` is the only numerical policy authority. Historical XAU_V4_1 defaults (new XAU_V4_2 uses the versioned policy in the current extension): seven-day maximum baseline lifetime, H1 check within two hours, minimum estimated net R 1.5, high-impact USD embargo 30 minutes before and after **including released results**, post-news structural review window one hour, displacement body/range ≥0.7 and abnormal range ≥1.5× the cited prior same-frame bar. These are transparent configurable desk rules, not claims of an optimal trading edge. Change the policy ID when changing semantics; regenerate/tests must follow.

## Re-baseline vs ordinary invalidation

`rebaseline.signals` supplies closed evidence, critical level ID and direction. The engine derives, not merely trusts, four transition reasons:

1. H1 acceptance: at least two ordered H1 closes beyond an active Critical Zone.
2. Displacement plus retest: H1/H4 displacement beyond the zone, then a separate M15/H1 retest holding outside it.
3. Structure shift: ordered H1/H4 evidence closing beyond the critical zone and the cited earlier swing extreme.
4. Post-news abnormal displacement: a closed M15/H1 candle fully after a high-impact USD release, expanded versus the earlier same-frame range and beyond the critical zone.

These explicit conservative operational definitions require the analyst to identify genuine structural anchors. They do not claim to reconstruct all market structure from two bars. Triggered re-baseline suspends the old baseline, setup and tactical state; tactical SR/AMM become HISTORICAL; ready plan and actionable scenario diagram are removed; WAIT retains explanations and next steps. A new REFRESH baseline is required before resuming. Ordinary trigger failure or tactical cancellation does not itself rewrite HTF bias.

## Scenarios, locations and risk

At most one PRIMARY followed by one ALTERNATIVE. Each needs a structural reason and actual frame/level evidence. The primary follows HTF. Alternative states the transition from primary; a reversal alternative requires REBASELINE_REQUIRED. V4.2 permits a separately justified countertrend scalp Alternative without changing HTF. M15/H1 break → M5 retest is only the break archetype visual sequence.

Separate wait zones (approach and then inspect setup) from no-trade zones/reasons: consolidation midpoint, HTF/M15 conflict, spread abnormal/unverified, shared news embargo, extended entry, missing structural stop, nearby opposing liquidity, insufficient evidence and low net R. Market phase is top-level and independent of indicator phase: TREND_IMPULSE, PULLBACK, CONSOLIDATION, BREAKOUT, RETEST, TRANSITION, REVERSAL_CANDIDATE.

Represent separately: entry zone, trigger, trigger failure, tactical invalidation, structural invalidation, actual Stop, re-baseline invalidation. They may share a price only when the distinct conditions justify it; never alias all concepts to the stop.

Find an observed structural Stop **before** considering R:R. Verify the swing and target against archived OHLC; preserve spread buffer, worst entry, costs and estimated net R calculation. Never tighten Stop to pass the threshold. Below policy minimum → WAIT/no trade; incomplete entry/stop/target → no numerical R. WATCH requires an already confirmed M15 setup; the later M5 trigger may remain pending. This is a conditional plan, not a trade execution.

## Data contract and generation

`schemaVersion:4` retains all existing V3 fields and adds `desk`. `src/desk-v4.js:validateDeskV4` is the executable semantic schema. `schemas/report-v4.schema.json` describes the additive envelope; semantic constraints and cross-field calculations remain executable tests.

New desk fields: `policyId`, `hierarchy`, `baseline`, `tacticalState`, `xauSummary`, `dailySR`, `amm`, `phase`, `setup`, `trigger`, optional `execution`, `waitZones`, `noTradeZones`, `invalidation`, `dxy`, `spdr`, `news`, `risk`, `rebaseline`, `entryIdea`, `conclusion`. Existing `scenarioPlan.scenarios` gain `role`, `structuralReason`, `levelEvidence`, and alternative `transition` / `activateWhen`. Evidence references use `{symbol,timeframe,closedAt,bar:{open,high,low,close}}`.

1. Collect and archive real observations first. Evidence pack version 2 adds H4/D1/W1 with actual `openedAt` and `closedAt`; session/DST boundaries are preserved, not guessed from UTC midnight. Existing version 1 remains accepted. Include carried candles from the proven baseline without changing timestamps.
2. Draft desk layers from evidence, distinguish observed facts from inference, and write `observationsSummary` with source timestamps. Use `node scripts/assemble-desk-report.mjs --input <draft> --output <report>` to evaluate re-baseline/readiness and derive body and legacy display fields. Check the conclusion agrees with the derived WAIT/WATCH outcome. Never handwave missing layers as confirmed.
3. Attach evidence with the existing recorder. Private verifier checks V4 references too. Check `validate-report.mjs` and `--publish` as before. An evidence hash proves integrity, not market truth.
4. Render with the existing `render-analysis-image.mjs`. V4 uses the same structured sections as body/frontend; full text wraps without dropping risk rules. Existing V3 PNG path is preserved. Inspect image and responsive views.
5. Journal: record baseline origin, checks, refresh reason, phase, primary/alternative, no-trade reasons, re-baseline transitions, missing layers, existing completeness metrics and prior review. Update before publishing. No test fixtures, secrets or private journal in public/.
6. Existing publisher → Pages → Worker storage/push. Local journal/evidence checks remain; CLI, CI and Worker apply the shared semantic/freshness gate. Production fixtures marked `testOnly` / `TEST_FIXTURE` are rejected. Do not call push delivery proof of reading.

## Review and backward compatibility

V4 `reviewRules.version:2` preserves the existing break→retest→next-M5-open simulation rules, but requires an archived publication receipt `{planId,publishedAt,originalReportSha256,sourceUrl}` in the review evidence pack. Collect actual Worker publication time, not snapshot time. Entry starts at the first M5 opening at/after actual publication. Entry expiry does not truncate evidence needed to resolve an already-open simulated position. Missing bars or ambiguous same-bar TP/SL remain unscored. Review only the original PRIMARY; never activate an alternative retrospectively.

V3 reports render through the original path, receive no fabricated V4 fields, and are not rewritten. Original V1 review rules are retained. For schema 3/4 production reports, a missing actual publication receipt makes replay unverifiable rather than using a potentially premature snapshot start. Original rule semantics must not be retrofitted to manufacture a result. Unsupported review logic remains explicitly unverifiable.

## Completion gates

Run `npm run test:all` (existing/V4, manual connector and Worker release tests), `npm run build` and `npm run test:browser` with a local Vite server on 127.0.0.1:4178. Browser tests use Playwright (`XAU_PLAYWRIGHT_PATH` may select an existing installation, `XAU_BROWSER_CHANNEL=msedge` may select installed Edge), block external requests and intercept only the local report. Generate WAIT/WATCH only under a private temporary directory using `scripts/generate-v4-fixtures.mjs`. Validate/render V3 and V4, inspect PNGs, verify public report hashes unchanged, and search active instructions for contradictory roles. Development fixtures never become a live report.
