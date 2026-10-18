-- Two-step sign-in (#1436): Better Auth's twoFactor plugin schema, and self-service recovery with a 7-day wait.
ALTER TABLE "user" ADD COLUMN "twoFactorEnabled" integer DEFAULT 0;

create table "twoFactor" ("id" text not null primary key, "secret" text not null, "backupCodes" text not null, "userId" text not null references "user" ("id") on delete cascade, "verified" integer DEFAULT 1, "failedVerificationCount" integer DEFAULT 0, "lockedUntil" date);
create index "twoFactor_secret_idx" on "twoFactor" ("secret");
create index "twoFactor_userId_idx" on "twoFactor" ("userId");

CREATE TABLE two_step_recoveries (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  token_hash   TEXT NOT NULL UNIQUE,
  origin       TEXT NOT NULL,
  requested_at INTEGER NOT NULL,
  started_at   INTEGER,
  effective_at INTEGER,
  cancelled_at INTEGER,
  completed_at INTEGER
);
CREATE INDEX idx_two_step_recoveries_due ON two_step_recoveries (effective_at)
  WHERE started_at IS NOT NULL AND cancelled_at IS NULL AND completed_at IS NULL;
