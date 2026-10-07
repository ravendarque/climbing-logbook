import * as v from "valibot";
import { json } from "../lib/json.js";
import { verifyTurnstile } from "../lib/turnstile.js";
import { checkRateLimit } from "../lib/rate-limit.js";
import { resolveUserId } from "../lib/session.js";
import { SUBMISSION_SECTIONS } from "../../shared/submission-sections.js";

const SECTIONS = Object.keys(SUBMISSION_SECTIONS);

const RATE_LIMIT_PER_HOUR = 5;

// Rate limit first: the cheapest rejection, before parsing or Turnstile.
function createSubmissionHandler({ table, rateLimitPrefix, tooManyMessage, emptyMessage }) {
  const schema = v.object({
    message: v.pipe(v.string(), v.trim(), v.minLength(1, emptyMessage)),
    contactEmail: v.optional(v.pipe(v.string(), v.trim())),
    sourcePage: v.optional(v.pipe(v.string(), v.trim())),
    section: v.optional(v.picklist(SECTIONS)),
    turnstileToken: v.string(),
  });

  return async function handleSubmission(request, env) {
    const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
    const allowed = await checkRateLimit(env, `${rateLimitPrefix}:${ip}`, RATE_LIMIT_PER_HOUR);
    if (!allowed) return json({ error: tooManyMessage }, 429);

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "Invalid request body." }, 400);
    }

    const result = v.safeParse(schema, body);
    if (!result.success) return json({ error: result.issues[0].message }, 400);

    const verified = await verifyTurnstile(env, result.output.turnstileToken);
    if (!verified) return json({ error: "Bot verification failed. Please try again." }, 403);

    // Optional: the form works logged out.
    const userId = await resolveUserId(request, env);

    await env.LOGBOOK_DB.prepare(
      `INSERT INTO ${table} (id, message, contact_email, user_id, source_page, section, created_at)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
    )
      .bind(
        crypto.randomUUID(),
        result.output.message,
        result.output.contactEmail || null,
        userId,
        result.output.sourcePage || null,
        result.output.section || null,
      )
      .run();

    return json({ ok: true }, 201);
  };
}

export const handleReportIssue = createSubmissionHandler({
  table: "issue_reports",
  rateLimitPrefix: "report-issue",
  tooManyMessage: "Too many reports from this connection. Please try again later.",
  emptyMessage: "Please describe the issue.",
});

export const handleFeedback = createSubmissionHandler({
  table: "feedback_submissions",
  rateLimitPrefix: "feedback",
  tooManyMessage: "Too much feedback from this connection. Please try again later.",
  emptyMessage: "Please tell us what you think.",
});
