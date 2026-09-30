-- One row per client project; the slug is the private link clients use.
CREATE TABLE projects (
  id         INTEGER PRIMARY KEY,
  slug       TEXT NOT NULL UNIQUE,
  name       TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Scoping decisions per catalogue item (L3 process or L4 scenario).
-- scope/priority/owner/notes are set by the client; fit/fit_notes by iCatalyst only.
CREATE TABLE items (
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  code       TEXT NOT NULL,
  scope      TEXT NOT NULL DEFAULT '',
  priority   TEXT NOT NULL DEFAULT '',
  owner      TEXT NOT NULL DEFAULT '',
  notes      TEXT NOT NULL DEFAULT '',
  fit        TEXT NOT NULL DEFAULT '',
  fit_notes  TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (project_id, code)
);
