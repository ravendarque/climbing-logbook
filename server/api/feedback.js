import * as v from "valibot";
import { json } from "../lib/json.js";
import { verifyTurnstile } from "../lib/turnstile.js";
import { checkRateLimit } from "../lib/rate-limit.js";
import { resolveUserId } from "../lib/session.js";
import { SECTIONS } from "./report-issue.js";

const RATE_LIMIT_PER_HOUR = 5;

const feedbackSchema = v.object({
  message: v.pipe(v.string(), v.trim(), v.minLength(1, "Please tell us what you think.")),
  contactEmail: v.optional(v.pipe(v.string(), v.trim())),
  sourcePage: v.optional(v.pipe(v.string(), v.trim())),
  section: v.optional(v.picklist(SECTIONS)),
  turnstileToken: v.string(),
});

export async function handleFeedback(request, env) {
  const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
  const allowed = await checkRateLimit(env, `feedback:${ip}`, RATE_LIMIT_PER_HOUR);
  if (!allowed) return json({ error: "Too much feedback from this connection. Please try again later." }, 429);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid request body." }, 400);
  }

  const result = v.safeParse(feedbackSchema, body);
  if (!result.success) return json({ error: result.issues[0].message }, 400);

  const verified = await verifyTurnstile(env, result.output.turnstileToken);
  if (!verified) return json({ error: "Bot verification failed. Please try again." }, 403);

  const userId = await resolveUserId(request, env);

  await env.LOGBOOK_DB.prepare(
    `INSERT INTO feedback_submissions (id, message, contact_email, user_id, source_page, section, created_at)
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
