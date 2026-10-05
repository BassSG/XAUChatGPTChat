CREATE TABLE IF NOT EXISTS analysis_run_status (
  run_id TEXT PRIMARY KEY,
  started_at TEXT NOT NULL,
  code TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_analysis_run_status_started ON analysis_run_status(started_at DESC);
CREATE TABLE IF NOT EXISTS push_deliveries (
  notification_key TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  state TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  lease_until_ms INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (notification_key, endpoint)
);
