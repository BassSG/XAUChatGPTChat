CREATE TABLE IF NOT EXISTS manual_analysis_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  pairing_code_hash TEXT,
  pairing_expires_at_ms INTEGER,
  device_token_hash TEXT,
  browser_token_hash TEXT,
  agent_last_seen_at_ms INTEGER,
  codex_open INTEGER NOT NULL DEFAULT 0,
  cooldown_until_ms INTEGER,
  active_request_id TEXT,
  active_status TEXT,
  active_message TEXT,
  active_thread_id TEXT,
  active_updated_at_ms INTEGER,
  last_request_at_ms INTEGER
);

INSERT OR IGNORE INTO manual_analysis_state (id, codex_open) VALUES (1, 0);

CREATE TABLE IF NOT EXISTS manual_analysis_queue (
  id TEXT PRIMARY KEY,
  requested_at_ms INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'done', 'failed', 'cancelled')),
  message TEXT,
  thread_id TEXT,
  started_at_ms INTEGER,
  updated_at_ms INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_manual_analysis_queue_status
  ON manual_analysis_queue(status, requested_at_ms);

CREATE TRIGGER IF NOT EXISTS manual_analysis_enqueue_after_gate
AFTER UPDATE OF active_request_id ON manual_analysis_state
WHEN NEW.active_request_id IS NOT NULL AND NEW.active_request_id IS NOT OLD.active_request_id
BEGIN
  INSERT INTO manual_analysis_queue (id, requested_at_ms, status, message, updated_at_ms)
  VALUES (NEW.active_request_id, NEW.last_request_at_ms, 'queued', 'รอ Codex รับงาน', NEW.active_updated_at_ms);
END;
