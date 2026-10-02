# XAU Desk 4.3 — align sources, locations and usable plans

This is the current additive contract for new reports (`schemaVersion:4`, `desk.architectureVersion:"4.3"`, `policyId:"XAU_V4_2"`). Read V4_REASONING_CONTRACT.md and V4_2_LOCATION_CONTRACT.md for unchanged structural/location rules. Historical V3, original V4 and 4.2 retain their own definitions. Schedules 09:00 / 14:30 / 19:00 and gpt-6.1-sol / xhigh are unchanged.

## Reasoning and the original examples

XAU HTF W1/D1/H4/H1 → location above/current/below → Daily SR / observed AMM → archetype → its M15 confirmation → M5 → DXY filter → SPDR/news context → structural Stop / targets / costs → Primary + conditional Alternative. EBW remains secondary. No indicator score or extra confluence creates an entry. Existing freshness, private archive, baseline/rebaseline, journal and publisher gates remain authoritative.

The original Web examples have sell-higher, buy-lower, reaction, pullback, recovery and break/retest paths. Select by location and structure, not always break/retest. Original examples also explicitly say AMM is pending when its output is unavailable. Do not copy historical prices, claim a proprietary AMM formula, or equate Supply/Demand with AMM.

## 1. Verify the actual Pine once, read current outputs each run

`src/indicator-profile.js` fingerprints the user-supplied EBW V10.4.4 Fix 1 file, normalized by BOM removal, CRLF→LF and one final newline. Actual Inputs and source must be read from the attached indicator's Settings / Source code. `scripts/verify-indicator-profile.mjs --input <observed-verification.json> --output <private/indicator-verification.json> [--source <actual-chart-export.pine>]` never fills defaults as observations.

States: UNAVAILABLE / NAME_ONLY / INPUTS_VERIFIED / EXACT_SOURCE_VERIFIED / SOURCE_MISMATCH. Exact requires actual chart source hash **and** all critical actual Inputs. The name alone is not an exact match. Verification is cached privately for at most 7 days for verified Inputs; reread after script/layout/input changes or an inconsistent output. Each run still checks symbol/title and uses H1/M15/M5 **closed-bar** Data Window outputs with their actual times. Missing values stay absent, not zero. No saved-layout/input changes without user authorization.

Critical distinctions: observed/default Pine Stochastic 14-3-3 is not a separately observed 9-3-3 study; raw pane outputs are 0–100 (plotted Stochastic is offset +100). Pine phase EMA20/50 is not the desk's separate EMA25/50/100/200 toolkit. Workspace `Confirmation` suspends Limit Planner; do not expect Limit entries from it or enable `Both` silently. `i_costTicks:0` means costs were not modeled, not free trading. The desk uses real spread and its declared cost assumption independently. Pine edge scores are not probabilities.

Put the observed profile in `desk.indicatorVerification` and private `pack.context.indicatorVerification`. AMM uses `desk.amm.source` UNAVAILABLE / OBSERVED_OUTPUT / FORMULA_VERIFIED. If unavailable, zones=[] and explain. Real output records sourceName, observedAt, method DATA_WINDOW / CHART_LABEL / PERMITTED_EXPORT, source timeframe and closed-bar refs; formula verification requires actual formula hash + Inputs. Never relabel arbitrary candle ranges as AMM.

Verified source/Inputs must belong to the same actual chart layout URL as report.evidence.chartUrl (timeframe/query changes may differ). Startup prefers the verified profile's chart URL for finding the existing tab. A profile checked on another layout cannot authenticate the current chart's outputs.

## 2. Confluence with evidence, not a voting system

Read only technical features relevant to the selected locations: actual Supply/Demand boundaries/status/source timeframe, nearest support/resistance, protective swing / BSL / SSL, EMA location, FVG/OB, BOS/CHOCH, HH/HL/LH/LL. Prefer attached EBW Data Window/chart labels on the same closed candle. EMA100/200 or a separate study not present on the chart stays UNAVAILABLE. An EBW point resistance does not supply invented zone boundaries.

`toolkit.observations` has unique id, name, state, value, parameters, method, observedAt, same-provider frame/bar evidence and reason. Supply/Demand also has sourceName/sourceUrl and range/side/status. `scripts/prepare-desk-context.mjs --evidence <actual-observations> --output <private/context-technical.json> [--frames H1,M15]` derives ONLY 2-left/2-right confirmed pivots, three-wick FVG and EQH/EQL within policy tolerance, using at most 64 already collected candles per frame. It is DESK_CLOSED_OHLC_V1, not an automatic reimplementation of Pine, proprietary AMM, or an assertion that an old FVG is fresh. Do not reread many bars merely to fill every optional feature.

`desk.zoneEvidence` exact-matches available observation overlaps by candidate id, marking opposing observations as context/conflict. Historical/broken Supply/Demand cannot strengthen a location. Renderer shows what supports a location and what is missing without changing the HTF hierarchy.

## 3. M15 confirmation appropriate to the location

Preserve the six 4.2 definitions. Add typed, contiguous-closed-M15 definitions:

- ENGULFING_CLOSE: opposite prior body; current directional body engulfs it and closes past zone midpoint in the chosen direction.
- FAILED_RECLAIM: prior close within/across the inner boundary, current zone touch plus directional close outside favorable boundary. Not a mere wick or unfinished close.
- SWING_RESUMPTION: two confirmed 2-left/2-right pivots produce HL (BUY) / LH (SELL); second pivot touches the zone; final directional close passes intervening opposite structure.

Evidence must prove the chosen definition. Engulfing can be a reaction inside a zone; do not force a separate break-retest first. M5 cannot create the primary setup. Recovery/reversal still requires a proven refreshed XAU baseline; a DXY change is a filter, not XAU rebaseline. H1-break scenarios still prove H1 first, then M15, then M5.

## 4. Useful WAIT planning

`desk.planning.rows` covers only Primary and Alternative: plan, confirmation/transition, wait/entry zone, candidate structural targets, Stop anchor / cancellation. WAIT keeps observed location/anchors while `planLevels:null`, actualStop:null and no numerical R. A confirmed 5-bar pivot is VERIFIED_STRUCTURAL_ANCHOR; a lone observed extreme is EXTREMUM_CANDIDATE and explicitly needs confirmation. Neither is a ready Stop. State the buffer/spread/nearby liquidity still needed. If an already observed structural Stop suffices for the selected setup, use it; do not always require a future retest swing. Do not optimize Stop inward to improve R.

## 5. Context across runs

Startup reads a bounded maximum of 24 previous locally archived reports, verifies private evidence hashes and exact auxiliary context, and returns `supplemental.indicatorVerification`, `spdrHistory`, candidate `dxyBaseline`, gaps. No background polling, no quote carry, no copied news Actual. SPDR series keeps official URL, dataDate, holdings and original checkedAt; conflicting same-date holdings are excluded until reconciled. Fewer than five verified dates spanning four days, stale series, or missing dates do not produce an invented medium-term flow.

`node scripts/collect-spdr-history.mjs [--output <private/history.json>]` reads the official GLD XLSX archive through read-only standard-library Python. It verifies Date / Tonnes of Gold headers, explicit dates or Excel serial date system, last 35 days, positive tonnes and original checkedAt. Official holidays/missing cells are omitted, never zero or forward-filled. A 6-hour cache and at most 7-day dated fallback avoid repeated downloads; failures are explicit. Startup combines this private cache with verified archived series, excluding conflicts. No raw workbook or collector output is committed/publicly hosted. `XAU_PYTHON_PATH` can select an installed Python; the bundled Codex Python is used when available.

DXY structural context can use D1/H4 carried at original times plus freshly read H1. `scripts/prepare-dxy-context.mjs --context <run-context> --h1 <actual-H1-frame> --at <snapshot> --output <private/check>` checks cache expiry, contiguous/fresh H1, H1 acceptance outside carried range and abnormal displacement. CARRIED is context, not live prices. REFRESH_REQUIRED means read D1/H4 again; failed H1 means unavailable. Also refresh for an observed structure shift/critical failure not represented by the coarse range check. Every available 4.3 DXY filter needs fresh closed H1. `desk.dxy.conditions` has timeframe, ABOVE/BELOW price, CONFIRM/NEUTRAL/CONTRADICT effect, reason; each price must be anchored to a cited DXY closed high/low/close. No arbitrary live quote as structural level.

`desk.spdr.history/flowAssessment` derives dated direction and flow bias transparently. It never overrides M15. `desk.news.context` separates fact, interpretation, goldMechanism, monitor, checkedAt and sourceUrl; EVENT binds an existing verified newsEvents entry, YIELD/HEADLINE carries dataDate. Follow Forex Factory + original release sources for disputed Actuals; FMP supplemental cache/freshness/UTC rules unchanged. News embargo/minimum net R still comes exclusively from src/desk-policy.js.

## 6. Explicit review for each archetype

4.3 may publish `desk.reviewDefinition` with numeric M5 confirmation (`TOUCH_THEN_DIRECTIONAL_CLOSE`, `RETEST_THEN_CLOSE`, `STRUCTURE_BREAK`), zone/price/reason and a simple close-based tactical invalidation. This is an analyst-defined conditional desk simulation, not Pine fills. Assembly freezes `reviewRules.version:3`, selected scenario role/type/M15 definition, actual selectedAt, next-M5-open **inside published executable entry zone**, full TP1/Stop exit and original cost assumption. `reviewSupport:ARCHETYPE_REPLAY_V3`. No definition → UNSUPPORTED_MANUAL; never infer thresholds from prose retrospectively.

STRUCTURE_BREAK additionally requires five contiguous, already closed M5 references proving the 2-left/2-right high (BUY) or low (SELL); its threshold must equal that actual pivot. Archive these references with the desk. An arbitrary numeric threshold cannot be called a structure break.

Replay proves receipt, original numeric rules, closed M15 appropriate to the archetype, subsequent M5, actual next-bar entry, costs and TP/SL sequence. It can review an Alternative only if it was explicitly selected **at publication**; it cannot switch to the unselected Alternative later. A WAIT with no numeric execution geometry may prove a signal, never R. Gaps, no receipt, unsupported methods, or ambiguous same-bar TP/SL remain unscored. Recovery awaiting a future rebaseline needs a new published plan first. Old V3/V4/V4.2 review rules are unchanged.

## 7. Same data in text, app and PNG

`desk.practical` derives location, Thai phase, Primary/confirmation, Alternative transition, selected active plan, avoid/cancel/next and changed-since-last. `assemble-desk-report.mjs --input <draft> --previous <latest-original.json> --output <private/report.json>` compares validated snapshots without declaring a between-run signal. The overview shows the main action immediately; detail layers/Alternative expand on demand. A five-column desktop plan table becomes labeled cards on tablet/phone, wraps long values and uses touch-sized controls. JSON/body/PNG retain exact numbers; summary stays ≤500 characters and excludes provider/timezone clutter. The schematic disclaimer and snapshot remain on images.

## Per-run sequence and release gates

prepare-analysis-run → reuse existing tabs + verify fresh main inputs → collect relevant closed Pine outputs/source status → build private technical context if enough existing bars → DXY current H1 + dated SPDR history + fact/inference news → choose at most two location-driven scenarios → explicit reviewDefinition if applicable → assemble with --previous → archive exact context → validate → journal/review → render/inspect PNG → original publisher → verify Pages/Worker.

Preserve snapshot freshness; publish useful WAIT with all verified information when optional data is missing. Development fixtures stay private and are rejected by CLI/publisher/Worker. Run existing + new behavior tests, V3/original-V4/4.2/4.3 responsive rendering, WAIT/WATCH PNG, build, and production-report hash isolation. Passing software tests is not evidence of prediction accuracy or a win rate matching the original Web.
