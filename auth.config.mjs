// CLI-only config, used solely by `better-auth generate` (via `pnpm run
// auth:generate`) to produce migrations/0001_better_auth_core.sql -- not
// imported by the Worker itself (see src/lib/auth.js for the real runtime
// factory). better-auth's CLI needs a live, directly-importable `auth`
// export (not env-dependent) to introspect for schema generation, and a
// real SQLite-shaped driver to diff migrations against -- an in-memory
// better-sqlite3 instance stands in for the real D1 binding here, since
// D1 and better-sqlite3 are both plain SQLite and produce identical DDL.
// See package.json's `auth:generate` script -- better-sqlite3 is a
// generation-time-only devDependency, not used at runtime.
import { betterAuth } from "better-auth";
import { username } from "better-auth/plugins";
import Database from "better-sqlite3";

export const auth = betterAuth({
  database: new Database(":memory:"),
  basePath: "/logbook/api/auth",
  secret: "cli-schema-generation-only",
  emailAndPassword: { enabled: true },
  plugins: [username()],
});
