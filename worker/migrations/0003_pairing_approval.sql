ALTER TABLE manual_analysis_state ADD COLUMN connect_id TEXT;
ALTER TABLE manual_analysis_state ADD COLUMN connect_hash TEXT;
ALTER TABLE manual_analysis_state ADD COLUMN connect_number TEXT;
ALTER TABLE manual_analysis_state ADD COLUMN connect_status TEXT;
ALTER TABLE manual_analysis_state ADD COLUMN connect_expires INTEGER;
ALTER TABLE manual_analysis_state ADD COLUMN connect_requested INTEGER;
