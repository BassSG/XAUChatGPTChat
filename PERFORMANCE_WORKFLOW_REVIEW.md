# Scheduled analysis efficiency review

## Current runtime repair — 2026-10-02

The prior 2026-09-30 changes below are historical. The genuine latest run took 3,642 seconds including publication verification; the old timer only returned advice and did not persist a closed collection phase. Repeated assembly/freshness reads and an HTTP413 Worker repair extended that live-report run. The transport repair is already deployed; it is separate from the runtime changes here.

- RUN_POLICY version 2 and STEP claims persist completion of collection batches and close collection at eight minutes or CONTEXT/FINALIZING. Completed batches cannot silently start again. One source retry, one final snapshot refresh, two assembly attempts, one publication and two verification checks are bounded independently.
- changedContracts lists only changed documents. CONTRACTS_READ acknowledges actual reading before publication; READY remains supported for older runs. V1 acknowledged hashes migrate from their matching private context. Preparing a context alone never acknowledges unread rules.
- Expired/due-soon baselines require refresh upfront. Hash-verified historical W1/D1 observations are available for context with original timestamps and carryApproved=false; no expired baseline, quote or current confirmation is silently reused.
- finalize-analysis-run.mjs combines existing assembly/comparison, immutable archive, evidence/replay/publication validation and deterministic PNG rendering. Successful identical input reuses the same image but rechecks current freshness. Identical failed input is not repeatedly executed. Visual inspection and journal updates remain required before the unchanged publisher.
- Analysis schedules do not repair repository code, run development suites or redeploy old commits while preparing live reports. A publication failure still produces the verified report/image in Codex with the real failure stated.

Verification: npm run test:all passed 176 tests (157 main, 3 manual, 11 release, 5 transport), zero failures; npm run build passed. Sixteen added runtime/bundle regression cases include real private WAIT/WATCH PNG generation, unchanged-image reuse, fixture rejection, evidence mismatch, finite repair loops and original V1 acknowledgement migration. Existing V3/V4 rendering, news, risk, replay and Worker gates remain intact.

Measured private smoke checks during concurrent regression tests: startup 416 ms; WAIT artifact bundle 4,767 ms; WATCH artifact bundle 4,938 ms; reused bundle verification 1,463 / 1,380 ms. These exclude live browser collection, analyst draft preparation, visual review, journal and deployment. A genuine historical production report was rejected by the original 15-minute publication freshness gate. No test report or image was published.

All three existing weekday schedules retain 09:00 / 14:30 / 19:00, the same target chat, and gpt-6.1-sol / xhigh. Existing-chat scheduling follows [OpenAI scheduled-task documentation](https://learn.chatgpt.com/docs/automations?surface=app).

Remaining limit: task claims guide and guard the scheduled agent's execution but cannot forcibly interrupt a model or an already-running browser tool. End-to-end timing and token savings still require the next genuine run; do not guarantee a twelve-minute finish from these utility timings.

## Historical review — 2026-09-30

## Findings and changes

The previous three automations were standalone cron runs. Each started a separate projectless chat, repeated a long prompt and full operating documents, and consulted a growing journal/memory. The inspected evening run also retried blocked chart controls repeatedly and waited for future news. These are avoidable workflow costs; the FMP requests alone did not explain a 20+ minute run.

- The three existing automation IDs were updated through the Codex automation tool to continue in one existing analysis chat. Original weekday times 09:00 / 14:30 / 19:00 are unchanged. At the time of this optimization the selected chat's recorded model setting was `gpt-6-sol` / `high`. Heartbeats inherit their target chat's model; they do not store a separate model override. The subsequent authorized model update below supersedes that model snapshot.
- `FAST_RUN_WORKFLOW.md` is the compact entry contract. Full contracts are read on first use/change, with hashes acknowledged at READY rather than merely when a preparation script runs.
- `prepare-analysis-run.mjs` loads a compact latest-report pointer, immutable structural evidence and baseline candidate, original report identity, journal index (including legacy sections), browser URL hints and deadlines. It does not approve carry automatically or cache current market confirmation.
- The current closed H1 check remains mandatory before carry. Expiry, suspension, re-baseline, missing original archive or hash/reference mismatch require refresh. Original W1/D1/H4 dates/OHLC remain unchanged. No quote is copied into the structural carry file.
- Current Pepperstone H1/M15/M5, quote/spread, DXY and Forex Factory checks remain required. Existing browser tabs are reused after inventory/source verification. Retry accounting allows one focused retry per blocked source and stops optional retries after the collection budget.
- Scheduled reports do not wait for future news/closed candles. Upcoming events are reported as upcoming; normal V4 embargo and publication gates still apply.
- Private FMP caching preserves original fetchedAt: calendar 5 minutes, news 10 minutes, Treasury 6 hours. Thai-day changes, release crossings and changed calendar query windows invalidate relevant cached results. Expired responses cannot become OK after a failed request. A compact session summary is emitted alongside the complete private supplement; no credentials enter either public output or logs.
- Historical automation memory was preserved privately and replaced with short workflow pointers. No daemon, extra timer or continuously open terminal was introduced.

## Checks performed

- `npm run test:all`: **111 passed**, 0 failed (97 main + 3 manual + 11 release).
- 17 new runtime tests cover original evidence integrity, canonical baseline origin hashes, mandatory current H1 check, expiry/suspension, first/change contract acknowledgement, journal location/review separation, collection budget/retry limit, private path guards, TTL/provenance, release/day/query invalidation and compact news scope.
- `npm run build`: passed. Existing V3/V4 rendering and publication/Worker regression tests passed. No frontend/schema/risk/news policy changes were required.
- Prepared against the actual latest report and private evidence: startup **234–357 ms** in two measured invocations. Baseline returned `CANDIDATE_NEEDS_CURRENT_H1`, not an approved live decision.
- Real FMP supplemental smoke checks: cold collection **3,180 ms**; subsequent all-cache-hit check **785 ms**, with original fetchedAt retained. These are one-shot utility measurements, not full analysis timings.
- Automation prompt lengths: 09:00 1,903 → 837 characters; 14:30 1,903 → 831; 19:00 2,184 → 857. Character reduction is not a measured token/cost saving.
- No production report/image was changed or published by these checks. Fixtures remained in temporary/private test workspaces.

## Remaining limits

The 8-minute collection / 12-minute report-ready budget is an operating target, not a measured guarantee. Browser access, structural refresh, model latency and Pages deployment can still add time. Full end-to-end runtime and token savings must be measured on subsequent genuine scheduled runs. The progress file records stage times and explicitly leaves token usage unavailable.

Browser hints are URLs, not authenticated sessions or proof that a chart is live. A closed application or inaccessible primary source still requires an honest, useful information-limited report under the existing workflow.

OpenAI documents the distinction between new-chat standalone tasks and existing-chat schedules in [Scheduled tasks](https://learn.chatgpt.com/docs/automations?surface=app).

## Subsequent user-requested model update — 2026-09-30

The user requested GPT-6.1 Sol Extra High for every scheduled analysis. All three existing heartbeat schedules now target the same existing chat whose recorded setting is `gpt-6.1-sol` / `xhigh`. Prompts, active workflow headers and private automation memories were updated to match. Weekday recurrence, scheduled times, report/evidence gates and the efficient startup workflow remain unchanged. No market analysis was triggered by this settings update. The model supports `xhigh` according to [OpenAI Docs](https://developers.openai.com/api/docs/models/gpt-6.1-sol).
