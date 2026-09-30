// Collection efficiency only. Trading/news/freshness gates remain in desk-policy.js.
export const RUN_POLICY = Object.freeze({
  version: 1,
  collectMinutes: 8,
  targetMinutes: 12,
  retryPerSource: 1,
  fmpTtlMs: { calendar: 5 * 60000, news: 10 * 60000, treasury: 6 * 3600000 }
});
