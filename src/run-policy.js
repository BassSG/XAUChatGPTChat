// Collection efficiency only. Trading/news/freshness gates remain in desk-policy.js.
export const RUN_POLICY = Object.freeze({
  version: 2,
  collectMinutes: 8,
  targetMinutes: 12,
  retryPerSource: 1,
  finalizeAttempts: 2,
  snapshotRefreshes: 1,
  publicationAttempts: 1,
  publicationChecks: 2,
  toolTimeoutMs: 45 * 1000,
  fmpTtlMs: { calendar: 5 * 60000, news: 10 * 60000, treasury: 6 * 3600000 }
});
