import { SUBMISSION_SECTIONS } from "../../shared/submission-sections.js";

const ADMIN_ORIGIN = "https://admin.climbinglogbook.com";
const KINDS = {
  issue_reports: { label: "New report", page: "reports" },
  feedback_submissions: { label: "New feedback", page: "feedback" },
};

// No submitted text or identity reaches Discord; the submission itself stays behind Access on the admin host.
export function supportMessage({ table, id, section, aboutLogbook, aboutEntry, errorRef }) {
  const kind = KINDS[table];
  const lines = [`**${kind.label}**${section ? ` · ${SUBMISSION_SECTIONS[section] ?? section}` : ""}`];
  if (aboutEntry) lines.push("About an entry in a public logbook");
  else if (aboutLogbook) lines.push("About a public logbook");
  if (errorRef) lines.push(`Error reference: \`${errorRef}\``);
  lines.push(`${ADMIN_ORIGIN}/${kind.page}?id=${encodeURIComponent(id)}`);
  return { content: lines.join("\n"), allowed_mentions: { parse: [] } };
}

export async function notifySupport(env, log, submission) {
  if (!env.DISCORD_SUPPORT_WEBHOOK) return;
  try {
    const res = await fetch(env.DISCORD_SUPPORT_WEBHOOK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(supportMessage(submission)),
    });
    if (!res.ok) log.warn("support.notify.failed", { status: res.status });
  } catch (err) {
    log.warn("support.notify.failed", { err });
  }
}
