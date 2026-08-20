// CLI-only config, used solely by `better-auth generate` to produce
// migrations/0001_better_auth_core.sql -- not imported by the Worker
// itself (see server/lib/auth.js for the real runtime factory). better-auth's
// CLI needs a live, directly-importable `auth` export (not env-dependent)
// to introspect for schema generation, and a real SQLite-shaped driver to
// diff migrations against -- an in-memory better-sqlite3 instance stands
// in for the real D1 binding here, since D1 and better-sqlite3 are both
// plain SQLite and produce identical DDL.
//
// @better-auth/cli and better-sqlite3 are deliberately NOT permanent
// devDependencies (#305) -- @better-auth/cli hard-pins its own internal
// better-auth@1.4.21 (an old, vulnerable version, entirely separate from
// this project's real better-auth dependency) plus a wide unrelated
// transitive tree (drizzle-orm, lodash, @prisma/client via chevrotain/
// @mrleebo/prisma-ast) that generated 14 Dependabot alerts the one time it
// was left installed, none of which are reachable from anything this app
// actually runs -- not worth carrying permanently for a tool used maybe
// once every few months. Regenerate like this instead, only when the auth
// config in server/lib/auth.js actually changes shape (a new plugin, a new
// field):
//
//   pnpm add -D @better-auth/cli better-sqlite3
//   pnpm exec better-auth generate --config auth.config.mjs --output migrations/000N_<name>.sql -y
//   pnpm remove @better-auth/cli better-sqlite3
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
