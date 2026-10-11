import * as v from "valibot";
import { json } from "../lib/json.js";
import { verifyTurnstile } from "../lib/turnstile.js";
import { clientKey } from "../lib/rate-limits.js";
import { hourlyLimitResponse } from "../lib/email-limit.js";

const FORM_LIMITS = { perHour: 5, perDay: 5 * 24 };
import { resolveUserId } from "../lib/session.js";
import { SUBMISSION_SECTIONS } from "../../shared/submission-sections.js";
import { notifySupport } from "../lib/support-notify.js";
import { resolvePublicUser } from "./public-profile.js";
import { FIELD_LIMITS, tooLongMessage } from "../../shared/field-limits.js";

const SECTIONS = Object.keys(SUBMISSION_SECTIONS);

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const OWN_HOST = /(^|\.)(climbinglogbook\.com|localhost|ravendarque\.workers\.dev)$/;

// The referrer, kept only when it's one of our own pages: anything else says nothing about where the problem is.
function ownPageOrNothing(url) {
  if (!url || url.length > FIELD_LIMITS.sourcePage) return undefined;
  try {
    const parsed = new URL(url);
    return /^https?:$/.test(parsed.protocol) && OWN_HOST.test(parsed.hostname) ? url : undefined;
  } catch {
    return undefined;
  }
}

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
    message: v.pipe(
      v.string(),
      v.trim(),
      v.minLength(1, emptyMessage),
      v.maxLength(FIELD_LIMITS.message, tooLongMessage("message")),
    ),
    contactEmail: v.optional(
      v.pipe(
        v.string(),
        v.trim(),
        v.maxLength(FIELD_LIMITS.contactEmail, tooLongMessage("contactEmail")),
        v.check(email => email === "" || EMAIL.test(email), "Enter a valid email address, or leave it blank."),
      ),
    ),
    sourcePage: v.optional(v.pipe(v.string(), v.trim(), v.transform(ownPageOrNothing))),
    section: v.optional(v.picklist(SECTIONS)),
    turnstileToken: v.string(),
    reportedUsername: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(64))),
    reportedEntryId: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(64))),
    errorRef: v.optional(v.pipe(v.string(), v.regex(/^[A-Za-z0-9-]{1,64}$/))),
  });

  return async function handleSubmission(request, env, ctx, log) {
    const limited = await hourlyLimitResponse(env, `${rateLimitPrefix}:${clientKey(request)}`, FORM_LIMITS, {
      message: tooManyMessage,
      surface: rateLimitPrefix,
      log,
    });
    if (limited) return limited;

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
    const reported = acceptsReported ? await resolveReported(env, result.output) : null;
    if (reported) {
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

    ctx?.waitUntil(
      notifySupport(env, log, {
        table,
        id: values[0],
        section: result.output.section,
        aboutLogbook: !!reported?.userId,
        aboutEntry: !!reported?.entryId,
        errorRef: result.output.errorRef,
      }),
    );
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
