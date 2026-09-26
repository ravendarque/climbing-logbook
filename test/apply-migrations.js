// Each test file gets its own empty D1, so migrations run once per file (Vitest setupFiles).
import { applyD1Migrations, env } from "cloudflare:test";

await applyD1Migrations(env.LOGBOOK_DB, env.TEST_D1_MIGRATIONS);
