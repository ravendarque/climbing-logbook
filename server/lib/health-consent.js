import { PAIN_INJURY, PAIN_INJURY_OLDEST_VALID_VERSION } from "../../shared/health-consent.js";
import { nextCursorSql } from "./d1-resource.js";
import { json, parseJsonBody } from "./json.js";
import { createEmailSender } from "./email.js";
import { ownedPageUrl } from "./hosts.js";

export const CURRENT = "superseded_at IS NULL AND withdrawn_at IS NULL";

const IN_FORCE = "consents.superseded_at IS NULL AND consents.withdrawn_at IS NULL AND consents.wording_version >= ?";

export const CONSENT_REQUIRED = {
  error:
    "Pain and injury details can't be saved until you've agreed to the Health Data Agreement. You can do that in My account.",
  code: "HEALTH_CONSENT_REQUIRED",
};

export async function hasConsent(env, userId, purpose = PAIN_INJURY.purpose) {
  const row = await env.LOGBOOK_DB.prepare(`SELECT 1 FROM consents WHERE user_id = ? AND purpose = ? AND ${IN_FORCE}`)
    .bind(userId, purpose, PAIN_INJURY_OLDEST_VALID_VERSION)
    .first();
  return row !== null;
}

// The same check inside a write batch; binds the entry id, the purpose, then the oldest valid version.
export const ENTRY_OWNER_CONSENTED = `EXISTS (SELECT 1 FROM consents JOIN entries ON entries.user_id = consents.user_id
  WHERE entries.id = ? AND consents.purpose = ? AND ${IN_FORCE})`;
export const ENTRY_OWNER_CONSENTED_BINDS = entryId => [entryId, PAIN_INJURY.purpose, PAIN_INJURY_OLDEST_VALID_VERSION];

const ENTRIES_WITH_PAIN = `SELECT DISTINCT p.entry_id FROM entry_pain_moves p JOIN entries e ON e.id = p.entry_id
  WHERE e.user_id = ? AND e.deleted_at IS NULL`;

export async function handleGetPainInjuryConsent(_request, env, userId) {
  const [current, affected] = await env.LOGBOOK_DB.batch([
    env.LOGBOOK_DB.prepare(
      `SELECT wording_version, granted_at FROM consents WHERE user_id = ? AND purpose = ? AND ${CURRENT}`,
    ).bind(userId, PAIN_INJURY.purpose),
    env.LOGBOOK_DB.prepare(`SELECT COUNT(*) AS n FROM (${ENTRIES_WITH_PAIN})`).bind(userId),
  ]);
  const row = current.results[0];
  return json(
    {
      granted: Boolean(row),
      version: row?.wording_version ?? null,
      grantedAt: row?.granted_at ?? null,
      currentVersion: PAIN_INJURY.version,
      entriesWithPain: affected.results[0].n,
    },
    200,
    { "Cache-Control": "no-store" },
  );
}

export async function handleGrantPainInjuryConsent(request, env, userId, log) {
  const parsed = await parseJsonBody(request);
  if (!parsed.ok) return parsed.response;
  if (typeof parsed.body?.version !== "string") return json({ error: "version must be a string" }, 400);
  if (parsed.body.version !== PAIN_INJURY.version) {
    return json(
      {
        error: "The consent wording has changed. Reload the page to see it.",
        code: "CONSENT_WORDING_CHANGED",
      },
      409,
    );
  }
  const now = new Date().toISOString();
  const { purpose, version } = PAIN_INJURY;
  const [, granted] = await env.LOGBOOK_DB.batch([
    env.LOGBOOK_DB.prepare(
      `UPDATE consents SET superseded_at = ? WHERE user_id = ? AND purpose = ? AND ${CURRENT} AND wording_version != ?`,
    ).bind(now, userId, purpose, version),
    env.LOGBOOK_DB.prepare(
      `INSERT INTO consents (id, user_id, purpose, wording_version, granted_at) SELECT ?, ?, ?, ?, ?
       WHERE NOT EXISTS (SELECT 1 FROM consents WHERE user_id = ? AND purpose = ? AND ${CURRENT})`,
    ).bind(crypto.randomUUID(), userId, purpose, version, now, userId, purpose),
  ]);
  log?.info("consent.pain_injury.granted", { userId });
  if (granted.meta.changes > 0) await noticeHealthData(request, env, userId, log, "healthDataOn");
  return new Response(null, { status: 204 });
}

async function noticeHealthData(request, env, userId, log, kind) {
  const user = await env.LOGBOOK_DB.prepare(`SELECT email, username FROM "user" WHERE id = ?`).bind(userId).first();
  if (!user) return;
  const url = ownedPageUrl(request.url, user.username, "account/health");
  await createEmailSender(env, log).sendAccountNotice(user.email, kind, { url });
}

// Withdrawal deletes the data it covered, and bumps each entry's cursor so other devices drop their copy.
export async function handleWithdrawPainInjuryConsent(request, env, userId, log) {
  const [touched, , withdrawn] = await env.LOGBOOK_DB.batch([
    env.LOGBOOK_DB.prepare(
      `UPDATE entries SET sync_cursor = ${nextCursorSql("entries")}, updated_at = datetime('now')
       WHERE user_id = ? AND id IN (${ENTRIES_WITH_PAIN})`,
    ).bind(userId, userId, userId),
    env.LOGBOOK_DB.prepare(
      `DELETE FROM entry_pain_moves WHERE entry_id IN (SELECT id FROM entries WHERE user_id = ?)`,
    ).bind(userId),
    env.LOGBOOK_DB.prepare(
      `UPDATE consents SET withdrawn_at = ? WHERE user_id = ? AND purpose = ? AND ${CURRENT}`,
    ).bind(new Date().toISOString(), userId, PAIN_INJURY.purpose),
  ]);
  const deleted = touched.meta.changes;
  log?.info("consent.pain_injury.withdrawn", { userId, count: deleted });
  if (withdrawn.meta.changes > 0) await noticeHealthData(request, env, userId, log, "healthDataOff");
  return json({ deleted });
}
