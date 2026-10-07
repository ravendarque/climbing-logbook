import { json, parseJsonBody } from "../lib/json.js";
import {
  createD1ResourceHandlers,
  findOwnedRow,
  listChangedForUser,
  listForUser,
  nextCursorSql,
} from "../lib/d1-resource.js";
import { validateEntryShape } from "../../shared/entry-schema.js";
import { intParam } from "../lib/params.js";

// Must match migrations/0016_add_grade_scale.sql's backfill WHERE clause.
const LEGACY_SPORT_NON_STANDARD_GRADES = new Set(["1", "1+", "2", "2+", "3", "3+"]);
function defaultGradeScale(entry) {
  if (entry.type === "boulder") return "font-non-standard";
  return LEGACY_SPORT_NON_STANDARD_GRADES.has(entry.grade) ? "french-non-standard" : "french";
}

async function validateFields(entry, env, userId) {
  const shapeErr = validateEntryShape(entry);
  if (shapeErr) return shapeErr;
  const owned = await findOwnedRow(env, "places", entry.placeId, userId);
  if (!owned) return "placeId does not reference one of your places";
  return null;
}

export function buildRow(entry, id, userId) {
  return {
    id,
    user_id: userId,
    place_id: entry.placeId,
    name: entry.name,
    grade: entry.grade,
    grade_scale: entry.gradeScale ?? defaultGradeScale(entry),
    discipline_id: entry.type,
    status_id: entry.status,
    first_attempt: entry.status === "send" && entry.firstAttempt ? 1 : 0,
    sport_style: entry.sportStyle ?? null,
    date: entry.date || null,
    video: entry.video || null,
    notes: entry.notes || null,
    attempts_to_send: entry.attemptsToSend ?? null,
    rpe: entry.rpe ?? null,
  };
}

export function rowToJson(row) {
  return {
    id: row.id,
    name: row.name,
    grade: row.grade,
    gradeScale: row.grade_scale,
    placeId: row.place_id,
    type: row.discipline_id,
    status: row.status_id,
    firstAttempt: !!row.first_attempt,
    sportStyle: row.sport_style,
    date: row.date,
    video: row.video,
    notes: row.notes,
    attemptsToSend: row.attempts_to_send,
    rpe: row.rpe,
    hidden: !!row.hidden_at,
  };
}

// An allow-list, so a new private field fails closed. No rpe, attempts or move tags.
export function publicRowToJson(row) {
  return {
    id: row.id,
    name: row.name,
    grade: row.grade,
    gradeScale: row.grade_scale,
    placeId: row.place_id,
    type: row.discipline_id,
    status: row.status_id,
    firstAttempt: !!row.first_attempt,
    sportStyle: row.sport_style,
    date: row.date,
    video: row.video,
    notes: row.notes,
  };
}

function rowToJsonWithDeleted(row) {
  return { ...rowToJson(row), deleted: !!row.deleted_at };
}

function buildMoveRow(record, id, entryId) {
  return {
    id,
    entry_id: entryId,
    difficulty: record.difficulty,
    limb: record.limb,
    side: record.side,
    hold_type: record.holdType,
    movement_style: record.movementStyle,
    wall_angle: record.wallAngle,
  };
}
function buildPainMoveRow(record, id, entryId) {
  return {
    id,
    entry_id: entryId,
    limb: record.limb,
    side: record.side,
    hold_type: record.holdType,
    movement_style: record.movementStyle,
    wall_angle: record.wallAngle,
  };
}
function moveRowToJson(row) {
  return {
    id: row.id,
    difficulty: row.difficulty,
    limb: row.limb,
    side: row.side,
    holdType: row.hold_type,
    movementStyle: row.movement_style,
    wallAngle: row.wall_angle,
  };
}
function painMoveRowToJson(row) {
  return {
    id: row.id,
    limb: row.limb,
    side: row.side,
    holdType: row.hold_type,
    movementStyle: row.movement_style,
    wallAngle: row.wall_angle,
  };
}

function replaceChildRowStatements(env, table, entryId, records, buildRow) {
  return [
    env.LOGBOOK_DB.prepare(`DELETE FROM ${table} WHERE entry_id = ?`).bind(entryId),
    ...records.map(record => {
      const row = buildRow(record, crypto.randomUUID(), entryId);
      const columns = Object.keys(row);
      return env.LOGBOOK_DB.prepare(
        `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`,
      ).bind(...columns.map(c => row[c]));
    }),
  ];
}

function moveStatements(env, entryId, record) {
  return [
    ...replaceChildRowStatements(env, "entry_moves", entryId, record.moves ?? [], buildMoveRow),
    ...replaceChildRowStatements(env, "entry_pain_moves", entryId, record.painMoves ?? [], buildPainMoveRow),
  ];
}

// D1 allows at most 100 bound parameters per statement.
const CHUNK_SIZE = 90;

function chunk(array, size) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) chunks.push(array.slice(i, i + size));
  return chunks;
}

async function fetchChildRowsChunked(env, table, ids) {
  const results = [];
  for (const idChunk of chunk(ids, CHUNK_SIZE)) {
    const placeholders = idChunk.map(() => "?").join(",");
    const res = await env.LOGBOOK_DB.prepare(`SELECT * FROM ${table} WHERE entry_id IN (${placeholders})`)
      .bind(...idChunk)
      .all();
    results.push(...res.results);
  }
  return results;
}

export async function attachChildRows(rows, env) {
  if (rows.length === 0) return rows;
  const ids = rows.map(r => r.id);
  const [movesRows, painRows] = await Promise.all([
    fetchChildRowsChunked(env, "entry_moves", ids),
    fetchChildRowsChunked(env, "entry_pain_moves", ids),
  ]);
  const movesByEntry = Object.groupBy(movesRows, row => row.entry_id);
  const painByEntry = Object.groupBy(painRows, row => row.entry_id);
  return rows.map(row => ({
    ...row,
    moves: (movesByEntry[row.id] ?? []).map(moveRowToJson),
    painMoves: (painByEntry[row.id] ?? []).map(painMoveRowToJson),
  }));
}

const entryResource = createD1ResourceHandlers({
  table: "entries",
  resourceKey: "entries",
  rowKey: "entry",
  validateFields,
  buildRow,
  rowToJson,
  excludeDeleted: true,
  childStatements: moveStatements,
  decorateRows: (env, _userId, rows) => attachChildRows(rows, env),
});

export const { handlePost } = entryResource;

const PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 500;
const MAX_CHUNK_SIZE = 1000;

// A climb the admin has hidden stays in its owner's logbook but never reaches a public one.
const VISIBLE = "deleted_at IS NULL AND hidden_at IS NULL";

async function handleDelta(url, env, userId, { includeChildRows }) {
  const since = intParam(url, "since");
  if (since.response) return since.response;
  if (!userId) return json({ entries: [], cursor: since.value }, 200, { "Cache-Control": "no-store" });
  const { rows, cursor } = await listChangedForUser(env, "entries", userId, rowToJsonWithDeleted, since.value);
  const decorated = includeChildRows ? await attachChildRows(rows, env) : rows;
  return json({ entries: decorated, cursor }, 200, { "Cache-Control": "no-store" });
}

// e.user_id scopes the join, so a foreign locationId just returns nothing.
async function handleByLocation(locationId, url, env, userId, { shapeRow, includeChildRows, publicOnly }) {
  if (!userId) return json({ entries: [] }, 200, { "Cache-Control": "no-store" });

  const limit = intParam(url, "limit", { min: 1, max: MAX_PAGE_SIZE, fallback: PAGE_SIZE });
  if (limit.response) return limit.response;
  const offset = intParam(url, "offset", { fallback: 0 });
  if (offset.response) return offset.response;
  const { results } = await env.LOGBOOK_DB.prepare(`
      SELECT e.* FROM entries e JOIN places p ON e.place_id = p.id
      WHERE e.user_id = ? AND p.location_id = ? AND e.deleted_at IS NULL${publicOnly ? " AND e.hidden_at IS NULL" : ""}
      ORDER BY e.created_at LIMIT ? OFFSET ?
    `)
    .bind(userId, locationId, limit.value, offset.value)
    .all();

  const shaped = results.map(shapeRow);
  const decorated = includeChildRows ? await attachChildRows(shaped, env) : shaped;
  return json({ entries: decorated }, 200, { "Cache-Control": "no-store" });
}

async function handleChunked(url, env, userId, { shapeRow, includeChildRows, publicOnly }) {
  if (!userId) return json({ entries: [], total: 0, cursor: 0 }, 200, { "Cache-Control": "no-store" });

  const limitParam = intParam(url, "limit", { min: 1, max: MAX_CHUNK_SIZE });
  if (limitParam.response) return limitParam.response;
  const limit = limitParam.value;
  const afterCreatedAt = url.searchParams.get("afterCreatedAt") ?? "";
  const afterId = url.searchParams.get("afterId") ?? "";
  const live = publicOnly ? VISIBLE : "deleted_at IS NULL";
  // Keyset, not offset: a delete mid-sync would shift later rows past the next page.
  const { results } = await env.LOGBOOK_DB.prepare(`
      SELECT *,
        (SELECT COUNT(*) FROM entries WHERE user_id = ? AND ${live}) AS total,
        (SELECT MAX(sync_cursor) FROM entries WHERE user_id = ?) AS max_cursor
      FROM entries
      WHERE user_id = ? AND ${live} AND (created_at, id) > (?, ?)
      ORDER BY created_at, id LIMIT ?
    `)
    .bind(userId, userId, userId, afterCreatedAt, afterId, limit)
    .all();
  const total = results[0]?.total ?? 0;
  const cursor = results[0]?.max_cursor ?? 0;
  const last = results.at(-1);
  const next = results.length === limit ? { createdAt: last.created_at, id: last.id } : null;
  const shaped = results.map(shapeRow);
  const decorated = includeChildRows ? await attachChildRows(shaped, env) : shaped;
  return json({ entries: decorated, total, cursor, next }, 200, { "Cache-Control": "no-store" });
}

async function handleAll(env, userId, { shapeRow, includeChildRows, publicOnly }) {
  const live = await listForUser(env, "entries", userId, row => row, { excludeDeleted: true });
  const rows = (publicOnly ? live.filter(row => !row.hidden_at) : live).map(shapeRow);
  const decorated = includeChildRows ? await attachChildRows(rows, env) : rows;
  return json({ entries: decorated }, 200, { "Cache-Control": "no-store" });
}

/**
 * @param {Request} request
 * @param {any} env
 * @param {string} userId
 * @param {{ shapeRow?: (row: any) => object, includeChildRows?: boolean, publicOnly?: boolean }} [options]
 */
export async function handleGet(
  request,
  env,
  userId,
  { shapeRow = rowToJson, includeChildRows = true, publicOnly = false } = {},
) {
  const url = new URL(request.url);
  const opts = { shapeRow, includeChildRows, publicOnly };

  const since = url.searchParams.get("since");
  if (since !== null) return handleDelta(url, env, userId, opts);

  const locationId = url.searchParams.get("locationId");
  if (locationId) return handleByLocation(locationId, url, env, userId, opts);

  if (url.searchParams.get("limit") !== null) return handleChunked(url, env, userId, opts);
  return handleAll(env, userId, opts);
}

export function handlePublicGet(request, env, userId) {
  return handleGet(request, env, userId, { shapeRow: publicRowToJson, includeChildRows: false, publicOnly: true });
}

export async function handlePut(request, env, userId) {
  const parsed = await parseJsonBody(request);
  if (!parsed.ok) return parsed.response;
  const entry = parsed.body;

  if (!entry.id) return json({ error: "Missing required field: id" }, 400);
  const err = await validateFields(entry, env, userId);
  if (err) return json({ error: err }, 400);

  // excludeDeleted, or an edit would resurrect a deleted entry.
  const existing = await findOwnedRow(env, "entries", entry.id, userId, { excludeDeleted: true });
  if (!existing) return json({ error: "Entry not found" }, 404);

  const row = buildRow(entry, entry.id, userId);
  const columns = Object.keys(row).filter(c => c !== "id" && c !== "user_id");
  await env.LOGBOOK_DB.batch([
    env.LOGBOOK_DB.prepare(
      `UPDATE entries SET ${columns.map(c => `${c} = ?`).join(", ")}, sync_cursor = ${nextCursorSql("entries")}, updated_at = datetime('now') WHERE id = ? AND user_id = ?`,
    ).bind(...columns.map(c => row[c]), userId, entry.id, userId),
    ...moveStatements(env, entry.id, entry),
  ]);

  return entryResource.respondWithRow(env, userId, entry.id, 200);
}

// Soft delete: a delta sync can only learn about a deletion from a tombstone.
export async function handleDelete(request, env, userId) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return json({ error: "Missing required field: id" }, 400);

  await env.LOGBOOK_DB.prepare(
    `UPDATE entries SET deleted_at = ?, sync_cursor = ${nextCursorSql("entries")}, updated_at = datetime('now') WHERE id = ? AND user_id = ?`,
  )
    .bind(Date.now(), userId, id, userId)
    .run();

  return new Response(null, { status: 204 });
}
