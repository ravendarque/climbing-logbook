// CLI-only: better-auth generate reads this to write the auth schema migration. The CLI isn't a
// dependency (it pins an old, vulnerable better-auth), so install it only while regenerating:
//   pnpm add -D @better-auth/cli better-sqlite3
//   pnpm exec better-auth generate --config auth.config.mjs --output migrations/<next>_<name>.sql -y
//   pnpm remove @better-auth/cli better-sqlite3
import { betterAuth } from "better-auth";
import { username } from "better-auth/plugins";
import Database from "better-sqlite3";

export const auth = betterAuth({
  database: new Database(":memory:"),
  basePath: "/-/api/auth",
  secret: "cli-schema-generation-only",
  emailAndPassword: { enabled: true },
  // Mirrors server/lib/auth.js.
  rateLimit: { enabled: true, storage: "database" },
  plugins: [username()],
});
