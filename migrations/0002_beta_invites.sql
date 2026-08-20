-- Beta invite/registration gate (#296) -- a temporary layer in front of
-- Better Auth's sign-up/email endpoint (see server/lib/beta-gate.js), not
-- part of Better Auth's own schema. Codes are seeded by hand
-- (`wrangler d1 execute`), not through any UI -- see #296 for why.
CREATE TABLE beta_invites (
  code       TEXT PRIMARY KEY,
  email      TEXT,
  created_by TEXT REFERENCES "user"(id),
  used_by    TEXT REFERENCES "user"(id),
  used_at    TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
