import * as v from "valibot";
import { json } from "../lib/json.js";
import { verifyTurnstile } from "../lib/turnstile.js";
import { checkRateLimit } from "../lib/rate-limit.js";
import { resolveUserId } from "../lib/session.js";

// Matches the section options in views/help/{report-an-issue,feedback}/index.njk.
export const SECTIONS = ["logbook", "map", "performance", "account", "import_export", "help"];

const RATE_LIMIT_PER_HOUR = 5;

const reportSchema = v.object({
  message: v.pipe(v.string(), v.trim(), v.minLength(1, "Please describe the issue.")),
  contactEmail: v.optional(v.pipe(v.string(), v.trim())),
  sourcePage: v.optional(v.pipe(v.string(), v.trim())),
  section: v.optional(v.picklist(SECTIONS)),
  turnstileToken: v.string(),
});

// Rate limit first: the cheapest rejection, before parsing or Turnstile.
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

  // Optional: the form works logged out.
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
