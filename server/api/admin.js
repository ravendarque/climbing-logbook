import { json, parseJsonBody } from "../lib/json.js";
import { verifyAccessRequest } from "../lib/access.js";
import { actOnUser, listAuditLog, listUsers } from "./admin-users.js";
import { handleUsage } from "./admin-usage.js";

const TABLES = { reports: "issue_reports", feedback: "feedback_submissions" };
const PAGES = new Set(["/reports", "/feedback", "/users", "/usage", "/activity"]);
const LIST_LIMIT = 500;

export function isAdminHost(hostname) {
  return hostname.startsWith("admin.");
}

function toSubmission(row) {
  return {
    id: row.id,
    message: row.message,
    contactEmail: row.contact_email,
    sourcePage: row.source_page,
    section: row.section,
    username: row.username,
    createdAt: row.created_at,
    readAt: row.read_at,
    archivedAt: row.archived_at,
  };
}

async function listSubmissions(env, table, archived) {
  const { results } = await env.LOGBOOK_DB.prepare(
    `SELECT s.*, u.displayUsername AS username FROM ${table} s LEFT JOIN "user" u ON u.id = s.user_id
     WHERE s.archived_at IS ${archived ? "NOT NULL" : "NULL"}
     ORDER BY s.created_at DESC, s.id DESC LIMIT ?`,
  )
    .bind(LIST_LIMIT)
    .all();
  return json({ submissions: results.map(toSubmission) }, 200, { "Cache-Control": "no-store" });
}

async function unreadCounts(env) {
  const unread = table => `(SELECT count(*) FROM ${table} WHERE read_at IS NULL AND archived_at IS NULL)`;
  const row = await env.LOGBOOK_DB.prepare(
    `SELECT ${unread(TABLES.reports)} AS reports, ${unread(TABLES.feedback)} AS feedback`,
  ).first();
  return json({ reports: row.reports, feedback: row.feedback }, 200, { "Cache-Control": "no-store" });
}

async function updateSubmission(request, env, table, id) {
  const parsed = await parseJsonBody(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;
  if (typeof body !== "object" || body === null || Array.isArray(body)) return json({ error: "Invalid JSON" }, 400);

  const sets = [];
  for (const [field, column] of [
    ["read", "read_at"],
    ["archived", "archived_at"],
  ]) {
    if (!(field in body)) continue;
    if (typeof body[field] !== "boolean") return json({ error: `${field} must be a boolean` }, 400);
    sets.push(body[field] ? `${column} = COALESCE(${column}, datetime('now'))` : `${column} = NULL`);
  }
  if (!sets.length) return json({ error: "Nothing to change" }, 400);

  const row = await env.LOGBOOK_DB.prepare(
    `UPDATE ${table} SET ${sets.join(", ")} WHERE id = ? RETURNING *, (SELECT displayUsername FROM "user" WHERE id = user_id) AS username`,
  )
    .bind(id)
    .first();
  return row ? json(toSubmission(row)) : json({ error: "Not found" }, 404);
}

async function deleteSubmission(env, table, id) {
  const { meta } = await env.LOGBOOK_DB.prepare(`DELETE FROM ${table} WHERE id = ?`).bind(id).run();
  return meta.changes ? new Response(null, { status: 204 }) : json({ error: "Not found" }, 404);
}

function safeDecode(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

async function handleAdminApi(request, env, pathname) {
  const method = request.method;
  if (pathname === "/-/api/admin/counts") return method === "GET" ? unreadCounts(env) : null;
  if (pathname === "/-/api/admin/users") return method === "GET" ? listUsers(request, env) : null;
  if (pathname === "/-/api/admin/audit") return method === "GET" ? listAuditLog(env) : null;
  if (pathname === "/-/api/admin/usage") return method === "GET" ? handleUsage(env) : null;
  const userAction = pathname.match(/^\/-\/api\/admin\/users\/([^/]+)\/([a-z]+)$/);
  if (userAction) return method === "POST" ? actOnUser(request, env, safeDecode(userAction[1]), userAction[2]) : null;

  const match = pathname.match(/^\/-\/api\/admin\/(reports|feedback)(?:\/([^/]+))?$/);
  if (!match) return null;
  const [, kind, encodedId] = match;
  const id = encodedId && safeDecode(encodedId);
  const table = TABLES[kind];
  if (!id && method === "GET")
    return listSubmissions(env, table, new URL(request.url).searchParams.get("archived") === "1");
  if (id && method === "PATCH") return updateSubmission(request, env, table, id);
  if (id && method === "DELETE") return deleteSubmission(env, table, id);
  return null;
}

export async function handleAdminHost(request, env) {
  if (!(await verifyAccessRequest(request, env))) return new Response("Forbidden", { status: 403 });

  const { pathname } = new URL(request.url);
  const isRead = request.method === "GET" || request.method === "HEAD";

  if (pathname === "/" && isRead) return Response.redirect(new URL("/reports", request.url).href, 302);
  if (PAGES.has(pathname) && isRead) return env.ASSETS.fetch(new Request(new URL("/admin/", request.url), request));
  if (pathname.startsWith("/-/api/admin/")) {
    return (await handleAdminApi(request, env, pathname)) ?? json({ error: "Not found" }, 404);
  }
  if (pathname.startsWith("/-/") && isRead) return env.ASSETS.fetch(request);
  return new Response("Not found", { status: 404 });
}
