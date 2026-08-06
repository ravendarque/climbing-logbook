import { escapeHtml } from "../lib/html-escape.js";

// #113 -- my.<domain>/:username, a read-only public page for one user's
// Logbook. Server-rendered HTML, not a JSON API + client hydration: the
// data is already in hand by the time this handler responds, so a second
// round-trip (and a client-side renderer to maintain alongside
// client/logbook-view.js) would be pure overhead for what's currently a
// simple listing. World Map isn't included yet -- client/map-view.js's
// interactive pan/zoom/drag state isn't something to fork into a
// read-only variant for a first cut; Grade Pyramid is never included here
// at all, full stop, matching #8's decision that it stays owner-only even
// on the owner's own public page.

function statusLabel(statusId, firstAttempt) {
  if (statusId === "send") return firstAttempt ? "Flash" : "Send";
  if (statusId === "project") return "Project";
  if (statusId === "abandoned") return "Abandoned";
  if (statusId === "wishlist") return "Wishlist";
  return statusId;
}

// Deliberately the same response (404, generic copy) for "no such
// username" and "username exists but logbook_public is off" -- telling
// them apart would let a visitor enumerate registered usernames just by
// comparing responses, same anti-enumeration reasoning already documented
// on the password-reset flow (public/login/login.js).
async function resolvePublicUser(env, username) {
  // Better Auth's username plugin normalizes to lowercase in the
  // `username` column and keeps original casing in `displayUsername`
  // (migrations/0001_better_auth_core.sql) -- looking up by the raw path
  // segment would miss any user whose real username has uppercase
  // characters.
  const user = await env.LOGBOOK_DB
    .prepare(`SELECT "id", "displayUsername" FROM "user" WHERE "username" = ?`)
    .bind(username.toLowerCase())
    .first();
  if (!user) return null;

  const settings = await env.LOGBOOK_DB
    .prepare(`SELECT logbook_public FROM settings WHERE user_id = ?`)
    .bind(user.id)
    .first();
  // No settings row yet means this user has never PATCHed settings, which
  // means the schema default still applies (logbook_public = 1, #21) --
  // same "missing row falls back to defaults" reasoning as
  // src/api/settings.js's handleGetSettings.
  const isPublic = settings ? !!settings.logbook_public : true;
  if (!isPublic) return null;

  return { id: user.id, displayUsername: user.displayUsername };
}

async function loadPublicEntries(env, userId) {
  const { results } = await env.LOGBOOK_DB
    .prepare(`
      SELECT e.name, e.grade, e.status_id, e.first_attempt, e.date,
             p.area, l.id AS location_id, l.name AS location_name, l.country
      FROM entries e
      JOIN places p ON e.place_id = p.id
      JOIN locations l ON p.location_id = l.id
      WHERE e.user_id = ?
      ORDER BY l.created_at, e.created_at
    `)
    .bind(userId)
    .all();
  return results;
}

function renderShell(title, bodyHtml) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)}</title>
<style>
  /* Same token subset as public/login/index.html -- see that
     file's own comment for why this is duplicated rather than shared. */
  :root {
    --color-bg: #0f0f0f; --color-surface: #1a1a1a; --color-text: #f0f0f0;
    --color-text-muted: #a0a0a0; --color-accent: #ff2727; --color-border: #2e2e2e;
    --font-body: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    --font-display: "Bebas Neue", sans-serif;
  }
  @media (prefers-color-scheme: light) {
    :root { --color-bg:#f5f5f5; --color-surface:#fff; --color-text:#1a1a1a; --color-text-muted:#6b6b6b; --color-border:#dcdcdc; }
  }
  * { box-sizing: border-box; }
  body { background: var(--color-bg); color: var(--color-text); font-family: var(--font-body); margin: 0; padding: 2rem 1rem; }
  main { max-width: 640px; margin: 0 auto; }
  h1 { font-family: var(--font-display); letter-spacing: .03em; margin: 0 0 1.5rem; }
  h2 { font-size: 1.1rem; margin: 2rem 0 .5rem; color: var(--color-text-muted); }
  .location:first-of-type h2 { margin-top: 0; }
  table { width: 100%; border-collapse: collapse; background: var(--color-surface); border: 1px solid var(--color-border); border-radius: 8px; overflow: hidden; }
  th, td { text-align: left; padding: .5rem .75rem; border-bottom: 1px solid var(--color-border); font-size: .9rem; }
  tr:last-child td { border-bottom: none; }
  th { color: var(--color-text-muted); font-weight: 500; }
  .empty { color: var(--color-text-muted); }
</style>
</head>
<body>
<main>${bodyHtml}</main>
</body>
</html>`;
}

function renderMessage(message) {
  return renderShell("Climbing Logbook", `<p class="empty">${escapeHtml(message)}</p>`);
}

function renderProfilePage(displayUsername, rows) {
  const groups = new Map();
  for (const row of rows) {
    if (!groups.has(row.location_id)) {
      groups.set(row.location_id, { name: row.location_name, country: row.country, entries: [] });
    }
    groups.get(row.location_id).entries.push(row);
  }

  const body = rows.length
    ? [...groups.values()].map(group => `
      <section class="location">
        <h2>${escapeHtml(group.name)}${group.country ? `, ${escapeHtml(group.country)}` : ""}</h2>
        <table>
          <thead><tr><th>Grade</th><th>Name</th><th>Area</th><th>Status</th><th>Date</th></tr></thead>
          <tbody>
            ${group.entries.map(e => `
            <tr>
              <td>${escapeHtml(e.grade)}</td>
              <td>${escapeHtml(e.name)}</td>
              <td>${escapeHtml(e.area)}</td>
              <td>${escapeHtml(statusLabel(e.status_id, !!e.first_attempt))}</td>
              <td>${escapeHtml(e.date ?? "")}</td>
            </tr>`).join("")}
          </tbody>
        </table>
      </section>`).join("")
    : `<p class="empty">No sends logged yet.</p>`;

  return renderShell(`${displayUsername} — Climbing Logbook`, `<h1>${escapeHtml(displayUsername)}</h1>${body}`);
}

export async function handlePublicProfile(request, env, username) {
  const target = await resolvePublicUser(env, username);
  if (!target) {
    return new Response(renderMessage("This logbook doesn't exist or isn't public."), {
      status: 404,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  const rows = await loadPublicEntries(env, target.id);
  return new Response(renderProfilePage(target.displayUsername, rows), {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}
