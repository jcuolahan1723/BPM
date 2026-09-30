-- Client initials used as the code prefix for processes a client adds (e.g. ACM → 10.05.ACM010.000).
ALTER TABLE projects ADD COLUMN prefix TEXT;
-- The iCatalyst master library is a project too: its custom processes and default decisions are
-- copied into every new client project. Only iCatalyst (vendor key) can read or change it.
ALTER TABLE projects ADD COLUMN is_master INTEGER NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX projects_prefix ON projects (prefix) WHERE prefix IS NOT NULL;

-- Custom processes (level 3) and scenarios (level 4) added on top of Microsoft's catalogue.
-- source: 'master' = from the iCatalyst library (i-prefixed codes), 'client' = added in the project.
CREATE TABLE nodes (
  project_id  INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  code        TEXT NOT NULL,
  level       INTEGER NOT NULL CHECK (level IN (3, 4)),
  parent_code TEXT NOT NULL,
  title       TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  products    TEXT NOT NULL DEFAULT '',
  source      TEXT NOT NULL CHECK (source IN ('master', 'client')),
  created_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (project_id, code)
);

INSERT INTO projects (slug, name, prefix, is_master) VALUES ('icatalyst-master', 'iCatalyst master library', 'i', 1);
