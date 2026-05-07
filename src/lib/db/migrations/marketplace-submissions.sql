CREATE TABLE IF NOT EXISTS marketplace_submissions (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT,
  phase TEXT NOT NULL,
  title TEXT NOT NULL,
  pitch TEXT NOT NULL,
  links TEXT,
  target_session_date DATE,
  submitter_user_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS marketplace_submissions_status_idx
  ON marketplace_submissions(status, created_at DESC);
