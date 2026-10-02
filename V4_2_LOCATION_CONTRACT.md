# XAU Desk V4.2 — location first, multiple setup archetypes

Historical 4.2 contract retained for compatible reports. New runs use [V4_3_SOURCE_ALIGNMENT.md](V4_3_SOURCE_ALIGNMENT.md); its source verification, M15 extensions and explicit replay V3 override the matching 4.2-only sections here.

Historical 4.2 contract. Incremental extension of V4; collection, freshness, private immutable evidence, journal, plan review and publisher remain required. Reports originally generated under this version keep schemaVersion 4 and desk.architectureVersion "4.2", policyId XAU_V4_2. Current new reports use 4.3 as specified above. Do not convert historical reports. Keep existing schedules and GPT-6.1 Sol xhigh.

## Decision order

XAU HTF W1/D1/H4/H1 → Daily SR → AMM → M15 setup → M5 fine entry → DXY filter. SPDR medium-term flow, news regime, EBW secondary. Carry HTF with original timestamps/hash and fresh H1 invalidation checks.

Before choosing a scenario, scan ABOVE / AT / BELOW current Pepperstone Bid/Ask midpoint. Supply active Daily SR levels and optional observed AMM zones; Historical/Broken/Invalidated are excluded. Daily SR ranges must be within their cited source candles. Include nearest and better structural locations, continuation and Critical levels. Collector counts are starting targets: expand to verify an overhead resistance or underlying support when necessary. Do not repeatedly reread all HTF candles.

desk.locationMatrix is deterministically derived from verified quote and layers, including candidate ranges, source frame/layer, distance, status, HTF and phase fit, observed extremum stop candidates, opposing target candidates and selected role. Extremum candidates require analyst confirmation as genuine structural swings before actual Stop use. UNKNOWN opposing liquidity cannot be advertised as CLEAR. Missing source remains UNAVAILABLE. Never construct guessed prices to fill the matrix.

Use desk.scenarioSelection.mode AUTO for a deterministic candidate selection (M15 stays PENDING), or ANALYST with an explicit reason. In PULLBACK / RETEST, selecting a primary break despite a verified trend-aligned pullback zone requires rejectedLocationReason. AUTO considers the structural trend-side pullback location first and continuation second. It does not promote touch to WATCH or invent an opposing scalp.

## Scenarios and M15 confirmation

Maximum PRIMARY plus ALTERNATIVE. Each scenario declares setupType, trendRelationship, setupFrame M15, triggerFrame M5, structuralReason, levelEvidence and m15Confirmation {type,state,evidence}. Non-break scenarios use zone, candidateId, sourceFrame/sourceLayer and must match a scanned candidate. Break scenarios additionally retain original breakFrame/retestFrame/breakPrice/retestLow/retestHigh/breakState fields. Do not add meaningless break fields to reaction plans.

| setupType | Meaning |
| --- | --- |
| PULLBACK_CONTINUATION | Trend pullback: sell higher / buy lower |
| BREAK_RETEST_CONTINUATION | Confirmed break then retest |
| DEEP_RETRACE_CONTINUATION | Deeper trend location, independently justified |
| SUPPORT_REACTION_SCALP | Major support reaction, limited target |
| RESISTANCE_REACTION_SCALP | Major resistance reaction, limited target |
| RECOVERY_REBASELINE | Recovery requires refreshed HTF baseline |
| REVERSAL_REBASELINE | Genuine reversal requires refreshed HTF baseline |

M15 closed OHLC definitions (conservative operational checks, not a claimed universal trading edge):

- BREAK_CLOSE: close beyond declared break level. For recovery/reversal use acceptancePrice equal to the cited Critical Zone boundary (baselineTransition.criticalLevel or criticalZoneId); the threshold is distinct from the entry/retest zone.
- REJECTION_CLOSE: touch zone, directional body and favorable close outside zone.
- SWEEP_RECLAIM: wick sweeps outer boundary, directional body, favorable close outside zone.
- ZONE_HOLD: touch but retain outer boundary, directional body and favorable close outside zone.
- STRUCTURE_RESUMPTION / BOS_CONFIRMATION: at least two ordered M15 observations, zone touched, last directional close beyond first cited extreme. Analyst must cite real structure; these tests alone do not identify all BOS patterns.

WATCH requires the selected scenario's observed M15 confirmation also cited by desk.setup, fresh evidence, usable entry geometry, observed structural Stop and target, clear opposing liquidity, normal spread and news checks. M5 may be pending; an OBSERVED M5 must occur after M15. Pullback/scalp do not require an unrelated break. No M5 primary setup.

WITH_TREND follows baseline. COUNTERTREND_SCALP is only an opposing ALTERNATIVE at major H1/H4/D1/W1 structural/critical SR, activateWhen COUNTERTREND_CONFIRMED, explicit transition, own structural Stop and exactly the nearest verified opposing target (risk.targetPolicy NEAREST_OPPOSING_STRUCTURE). It does not flip baseline. REVERSAL_REQUIRES_REBASELINE uses a recovery/reversal archetype; WATCH requires baselineTransition with from/to IDs, confirmedAt, criticalLevel and existing proven rebaseline signals, and a new REFRESH baseline.

Alternative activation: PRIMARY_INVALIDATED / PRIMARY_NOT_REACHED / COUNTERTREND_CONFIRMED / REBASELINE_REQUIRED, with an explicit transition. desk.activeScenarioRole selects which scenario owns the confirmed M15 and numeric plan.

## Location, WAIT and risk

Typed waitZones include side, purpose, priority PRIMARY/ALTERNATIVE/CANDIDATE, sourceLayer, setupType, relationToCurrentPrice and evidence. AMM purpose: PULLBACK_SELL / PULLBACK_BUY / BREAKDOWN_RETEST / BREAKOUT_RETEST / DEEP_REACTION / FILTER_ONLY; HTF filter still applies.

desk.setup.locationRelation: BELOW_SELL_ZONE, ABOVE_BUY_ZONE, WAITING_BREAK_BELOW, WAITING_BREAK_ABOVE, IN_ZONE, PASSED_ZONE or UNKNOWN. Existing priceLocation is retained for compatibility. Break relation uses the break threshold, not an unrelated pullback.

WAIT retains current price, observed candidate buy/sell zones, Critical, numeric no-trade and continuation levels in priceMap. candidateEntryZone is explicitly separate from executable entryZone. Never label WAIT candidates ENTRY/STOP/TARGET. Missing primary quote means no numbered location map. No fabricated R when Entry/Stop/Target incomplete.

Structural Stop first; risk.stopTiming PREEXISTING_STRUCTURAL_STOP or TRIGGER_FORMED_STOP. risk.quality is PREFERRED / CONDITIONAL / UNAVAILABLE based on the versioned policy. The latter requires an actually observed subsequent M5 trigger. Do not postpone every Stop to a future retest; do not tighten a Stop to improve R.

Single policy authority src/desk-policy.js:

- New XAU_V4_2: netR minimum 1.10, preferred 1.50; 1.10–1.49 conditional lower quality. Below minimum WAIT.
- New XAU_V4_2: HIGH USD embargo 120 minutes before **and after**, including RELEASED results. This documented conservative symmetric interpretation follows the original two-hour skip direction; it is an engineering policy, not evidence of optimal duration. Reasoning, validator, publisher, frontend use reportPolicy.
- Historical XAU_V4_1 retains 1.50 minimum and 30/30 news windows. Never reinterpret old reports as 4.2.
- Baseline/rebaseline thresholds are unchanged. Entry zone, Trigger, Trigger failure, Tactical invalidation, Structural invalidation, Actual Stop and Re-baseline invalidation remain distinct.

## Optional tools and DXY

toolkit.observations is optional; each item names state OBSERVED/UNAVAILABLE, method, reason, symbol, frame, observedAt, parameters, value and closed-bar evidence. Supported: EMA25/50/100/200, RSI14, Stochastic9-3-3, FVG, OB, EQH/EQL tolerance0.0012 (0.12%), divergence, sweep, absorption, displacement, HH/HL, LH/LL, BOS, CHOCH, 1-2-3, premium/discount, equilibrium. This records verified readings, not an automatic Pine implementation or indicator voting engine.

DXY optional frames D1/H4/H1/M15/M5 each carry direction UP/DOWN/RANGE/UNAVAILABLE, sourceUrl, reason and at least two ordered closed TVC:DXY OHLC references. UP/DOWN must agree with cited closes; RANGE has an explicit nonnegative rangeTolerance. assessment lists xauSide, supportingFrames, contradictoryFrames and reason. Contradictory directional evidence → CONTRADICT, only supporting → CONFIRM, only range → NEUTRAL, none → UNAVAILABLE. Explain mixed structure; DXY cannot create or flip a setup.

Archive OBSERVED toolkit items as pack.context.toolkitObservations and available DXY frames as pack.context.dxyFrames. Publisher exact-matches these against the private immutable evidence pack. Preserve screenshot/export provenance privately. This support does not claim optional data is currently accessible.

## Rendering, journal and review

Show location, primary/alternative, no-trade and next M15/M5 action promptly on desktop/tablet/mobile. Draw the selected archetype, not a forced break path. Dashed paths are conditional, not forecasts. JSON/body/PNG share the same fields; snapshot and the schematic disclaimer remain visible.

Journal every plan including WAIT, location choice/rejected alternatives, archetype, structural anchors and missing information. Rebaseline suspends old tactical plans and makes them historical. Normal scenario failure does not change HTF.

Original break/retest replay is preserved. New non-break or selected Alternative declares reviewSupport UNSUPPORTED_MANUAL; original rules are never retrofitted. Manual review needs closed candles and full sequence; ambiguous or incomplete evidence is unscored. Do not count unsupported setups as wins.

## Release gates

Fixtures stay in scripts/fixtures or private .test-artifacts, never public/reports. Run npm run test:all, npm run build, npm run test:browser. Generate/validate/render private V4.2 WAIT/WATCH, verify old V3/V4, all archetypes, confirmation types, policy boundaries, missing anchors, countertrend, recovery, replay limitations, private evidence and Worker fixture rejection. Verify public report hashes unchanged.
