import * as v from "valibot";
import { json } from "../lib/json.js";
import { verifyTurnstile } from "../lib/turnstile.js";
import { checkRateLimit } from "../lib/rate-limit.js";
import { resolveUserId } from "../lib/session.js";
import { SUBMISSION_SECTIONS } from "../../shared/submission-sections.js";
import { resolvePublicUser } from "./public-profile.js";

const SECTIONS = Object.keys(SUBMISSION_SECTIONS);

const RATE_LIMIT_PER_HOUR = 5;

// Rate limit first: the cheapest rejection, before parsing or Turnstile.
// A report can point at a public logbook, and at one climb in it. Anything that doesn't resolve is dropped, so a
// report can't be used to find out whether a private logbook or a climb exists.
/**
 * @param {any} env
 * @param {{ reportedUsername?: string, reportedEntryId?: string }} reported
 */
async function resolveReported(env, reported) {
  const { reportedUsername, reportedEntryId } = reported;
  const user = reportedUsername ? await resolvePublicUser(env, reportedUsername) : null;
  if (!user) return { userId: null, entryId: null };
  const entry = reportedEntryId
    ? await env.LOGBOOK_DB.prepare(`SELECT id FROM entries WHERE id = ? AND user_id = ? AND deleted_at IS NULL`)
        .bind(reportedEntryId, user.id)
        .first()
    : null;
  return { userId: user.id, entryId: entry?.id ?? null };
}

function createSubmissionHandler({ table, rateLimitPrefix, tooManyMessage, emptyMessage, acceptsReported = false }) {
  const schema = v.object({
    message: v.pipe(v.string(), v.trim(), v.minLength(1, emptyMessage)),
    contactEmail: v.optional(v.pipe(v.string(), v.trim())),
    sourcePage: v.optional(v.pipe(v.string(), v.trim())),
    section: v.optional(v.picklist(SECTIONS)),
    turnstileToken: v.string(),
    reportedUsername: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(64))),
    reportedEntryId: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(64))),
    errorRef: v.optional(v.pipe(v.string(), v.regex(/^[A-Za-z0-9-]{1,64}$/))),
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

    const values = [
      crypto.randomUUID(),
      result.output.message,
      result.output.contactEmail || null,
      userId,
      result.output.sourcePage || null,
      result.output.section || null,
    ];
    if (acceptsReported) {
      const reported = await resolveReported(env, result.output);
      await env.LOGBOOK_DB.prepare(
        `INSERT INTO ${table} (id, message, contact_email, user_id, source_page, section, reported_user_id, reported_entry_id, error_ref, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      )
        .bind(...values, reported.userId, reported.entryId, result.output.errorRef ?? null)
        .run();
    } else {
      await env.LOGBOOK_DB.prepare(
        `INSERT INTO ${table} (id, message, contact_email, user_id, source_page, section, created_at)
         VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
      )
        .bind(...values)
        .run();
    }

    return json({ ok: true }, 201);
  };
}

export const handleReportIssue = createSubmissionHandler({
  table: "issue_reports",
  rateLimitPrefix: "report-issue",
  tooManyMessage: "Too many reports from this connection. Please try again later.",
  emptyMessage: "Please describe the issue.",
  acceptsReported: true,
});

export const handleFeedback = createSubmissionHandler({
  table: "feedback_submissions",
  rateLimitPrefix: "feedback",
  tooManyMessage: "Too much feedback from this connection. Please try again later.",
  emptyMessage: "Please tell us what you think.",
});
