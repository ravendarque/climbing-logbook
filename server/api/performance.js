import { json } from "../lib/json.js";
import { listForUser } from "../lib/d1-resource.js";
import { attachChildRows, rowToJson } from "./entries.js";
import {
  buildEffortReport,
  buildGapReport,
  buildInjuryReport,
  buildPyramidReport,
  buildStrengthsReport,
  buildVolumeReport,
} from "../../shared/reports.js";

const NO_STORE = { "Cache-Control": "no-store" };

function listEntries(env, userId) {
  return listForUser(env, "entries", userId, rowToJson, { excludeDeleted: true });
}

async function listEntriesWithChildRows(env, userId) {
  return attachChildRows(await listEntries(env, userId), env);
}

export async function handleGetPyramid(request, env, userId) {
  const url = new URL(request.url);
  const scales = { boulderScale: url.searchParams.get("boulderScale"), sportScale: url.searchParams.get("sportScale") };
  return json(buildPyramidReport(await listEntries(env, userId), scales), 200, NO_STORE);
}

export async function handleGetInjuryLog(_request, env, userId) {
  return json(buildInjuryReport(await listEntriesWithChildRows(env, userId)), 200, NO_STORE);
}

export async function handleGetStrengthsWeaknesses(request, env, userId) {
  const url = new URL(request.url);
  const anchor = { dimension: url.searchParams.get("dimension"), value: url.searchParams.get("value") };
  return json(buildStrengthsReport(await listEntriesWithChildRows(env, userId), anchor), 200, NO_STORE);
}

const DATE_SHAPE = /^\d{4}-\d{2}-\d{2}$/;
// About ten years. Checked before any D1 work: these routes are reachable anonymously.
const MAX_WINDOW_DAYS = 3653;

// Round-trips through ISO, so 2026-99-99 and 2026-02-30 are rejected rather than read as NaN.
function isValidCalendarDate(s) {
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function daysBetween(start, end) {
  return Math.round((new Date(`${end}T00:00:00Z`).getTime() - new Date(`${start}T00:00:00Z`).getTime()) / 86400000) + 1;
}

function validateDateRange(start, end) {
  if (!start || !end) return "Missing required field: start and end";
  if (!DATE_SHAPE.test(start) || !DATE_SHAPE.test(end) || !isValidCalendarDate(start) || !isValidCalendarDate(end)) {
    return "start and end must be YYYY-MM-DD dates";
  }
  if (daysBetween(start, end) < 1) return "start must not be after end";
  if (daysBetween(start, end) > MAX_WINDOW_DAYS) return `start and end must span at most ${MAX_WINDOW_DAYS} days`;
  return null;
}

function windowedReport(build) {
  return async (request, env, userId) => {
    const url = new URL(request.url);
    const start = url.searchParams.get("start");
    const end = url.searchParams.get("end");
    const dateError = validateDateRange(start, end);
    if (dateError) return json({ error: dateError }, 400);
    return json(build(await listEntries(env, userId), { start, end }), 200, NO_STORE);
  };
}

export const handleGetVolume = windowedReport(buildVolumeReport);
export const handleGetGap = windowedReport(buildGapReport);
export const handleGetEffort = windowedReport(buildEffortReport);
