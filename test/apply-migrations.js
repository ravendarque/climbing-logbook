// Runs once per test file (Vitest setupFiles, inside the Workers pool --
// see vitest.config.js for TEST_D1_MIGRATIONS/why this can't just be a
// plain top-level await in a regular test file). D1 storage is isolated
// per test file the same way KV's own resetKv() comment documents, so
// every file's D1 instance starts genuinely empty and needs migrations
// applied before any test that touches Better Auth's tables can run.
import { applyD1Migrations, env } from "cloudflare:test";

await applyD1Migrations(env.LOGBOOK_DB, env.TEST_D1_MIGRATIONS);
