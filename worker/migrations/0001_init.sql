CREATE TABLE IF NOT EXISTS push_subscriptions (
  endpoint TEXT PRIMARY KEY,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_test_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_updated_at
  ON push_subscriptions(updated_at);

CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  snapshot_at TEXT NOT NULL,
  status TEXT NOT NULL,
  headline TEXT NOT NULL,
  summary TEXT NOT NULL,
  report_json TEXT NOT NULL,
  image_url TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_reports_snapshot_at
  ON reports(snapshot_at DESC);
