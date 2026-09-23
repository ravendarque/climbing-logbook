import * as v from "valibot";
import { json } from "../lib/json.js";
import { verifyTurnstile } from "../lib/turnstile.js";
import { checkRateLimit } from "../lib/rate-limit.js";
import { resolveUserId } from "../lib/session.js";

// #924 -- kept in sync by hand with client/report-issue-main.js's own
// <select> options; the client list is authoritative for wording (what a
// user sees), this one for validation (what the server accepts) --
// same "resolve/validate once, format per output" split every other
// enum in this app already uses (e.g. shared/entry-schema.js's own
// discipline/status lists), just not worth sharing as its own module for
// one seven-item list used in exactly two places.
export const SECTIONS = ["logbook", "map", "performance", "account", "import_export", "help", "other"];

const RATE_LIMIT_PER_HOUR = 5;

const reportSchema = v.object({
  message: v.pipe(v.string(), v.trim(), v.minLength(1, "Please describe the issue.")),
  contactEmail: v.optional(v.pipe(v.string(), v.trim())),
  sourcePage: v.optional(v.pipe(v.string(), v.trim())),
  section: v.optional(v.picklist(SECTIONS)),
  turnstileToken: v.string(),
});

// Public, unauthenticated POST -- same bare-if routing shape as sign-up
// (server/index.js), not the ADMIN_ROUTES lookup table, which
// unconditionally requires a session this endpoint doesn't have. Rate
// limit checked BEFORE the body is even parsed -- the cheapest possible
// rejection for a flood of requests, before spending any work on JSON
// parsing, validation, or a real Turnstile round-trip.
export async function handleReportIssue(request, env) {
  const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
  const allowed = await checkRateLimit(env, `report-issue:${ip}`, RATE_LIMIT_PER_HOUR);
  if (!allowed) return json({ error: "Too many reports from this connection. Please try again later." }, 429);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid request body." }, 400);
  }

  const result = v.safeParse(reportSchema, body);
  if (!result.success) return json({ error: result.issues[0].message }, 400);

  const verified = await verifyTurnstile(env, result.output.turnstileToken);
  if (!verified) return json({ error: "Bot verification failed. Please try again." }, 403);

  // Best-effort, not required -- this form is reachable logged out
  // (same as /help generally), so a null userId here is a normal,
  // expected outcome, not an error state.
  const userId = await resolveUserId(request, env);

  await env.LOGBOOK_DB.prepare(
    `INSERT INTO issue_reports (id, message, contact_email, user_id, source_page, section, created_at)
     VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`
  ).bind(
    crypto.randomUUID(),
    result.output.message,
    result.output.contactEmail || null,
    userId,
    result.output.sourcePage || null,
    result.output.section || null,
  ).run();

  return json({ ok: true }, 201);
}
