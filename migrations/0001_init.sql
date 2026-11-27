-- Recipes and cocktails share one table; `data` holds ingredients, steps and notes as JSON.
CREATE TABLE entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('recipe', 'cocktail')),
  name TEXT NOT NULL,
  data TEXT NOT NULL DEFAULT '{}',
  photo TEXT,
  thumb TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX idx_entries_user ON entries (user, kind, created_at DESC);

CREATE TABLE shots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user TEXT NOT NULL,
  method TEXT NOT NULL CHECK (method IN ('espresso', 'pourover')),
  bean TEXT NOT NULL DEFAULT '',
  roast_date TEXT,
  grind REAL,
  dose REAL,
  time_s REAL,
  yield_g REAL,
  pressure REAL,
  temp REAL,
  score INTEGER,
  taste INTEGER,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX idx_shots_user ON shots (user, method, created_at DESC);

-- Per-user daily counter so one user cannot burn the whole free AI allowance.
CREATE TABLE ai_usage (
  user TEXT NOT NULL,
  day TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user, day)
);
