-- A card or a project needs a status, but until now the default statuses were created only by the
-- development seed: a fresh Docker install, which only applies migrations, started with none, and
-- every card or project creation failed. Create them here, only on a database that has no status
-- yet, so existing installs keep the statuses they have. Keep in sync with DEFAULT_STATUSES in
-- packages/db/src/defaults.ts.
INSERT INTO "status" ("id", "name", "color", "order", "isDone")
SELECT gen_random_uuid()::text, d.name, d.color, d."order", d."isDone"
FROM (VALUES
  ('To do', '#64748b', 0, false),
  ('In progress', '#3b82f6', 1, false),
  ('Blocked', '#ef4444', 2, false),
  ('Done', '#22c55e', 3, true)
) AS d(name, color, "order", "isDone")
WHERE NOT EXISTS (SELECT 1 FROM "status");
