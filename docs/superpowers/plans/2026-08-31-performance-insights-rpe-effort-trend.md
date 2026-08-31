# Performance Insights: RPE / Effort Trend (#38) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task, working directly in this session (no subagent dispatch — see this plan's own Global Constraints). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `/:username/performance/rpe` — the final Phase 2 view of epic #5, a compound chart showing average Exertion % per time bucket (bars) against max grade sent per bucket (line), with a confidence-gated headline interpreting the relationship between effort and grade progress, and a "Peer-reviewed" evidence-tier citation with an explicit lower-reliability-for-newer-climbers caveat.

**Architecture:** Same compound bar+line pattern as #15, reusing `client/combo-chart.js` and `client/time-window.js` as-is (no new shared chart infrastructure needed — this view needs exactly one bar series + one line series, the same shape #15 already established). Reuses `client/evidence-tier.js` (#14) for its "peer" tier chip/overlay — the tier's own generic description already exists from `climbing-grade-pyramid.js`'s original definition, reused unmodified. Server-side aggregation (`shared/effort-stats.js`) reuses `shared/volume-stats.js`'s own `volumeByBucket` directly for the grade-line computation (identical "sends only, max grade per bucket" logic already built and tested), adding only the new average-Exertion-per-bucket computation on top. New in this deliverable: a genuine confidence gate (the first of the three remaining bar/line views to need one) and trend-based headline logic comparing early-window vs. late-window data.

**Tech Stack:** Cloudflare Workers + D1, Vitest, Playwright, esbuild, Tailwind v4, the existing hand-rolled SVG combo-chart.

**Spec:** `docs/superpowers/specs/2026-08-27-performance-insights-ui-design.md` (the "#38 RPE / effort trend: interaction design" section) and `docs/climbing-analytics-research.md` (the Gajdošík, Baláš & Draper 2020 discussion, "Implication" paragraph, and Areas of Disagreement item 4, for the exact citation and lower-confidence-for-newer-climbers framing).

## Global Constraints

- **Work directly in this session — no subagent dispatch for any part of this plan.** A prior deliverable in this same epic (#14) had a browser-verification subagent leak into the user's real desktop browser instead of the sandboxed preview pane; the user explicitly asked to stop using subagent-driven-development and develop directly in-session instead. This plan is written for `superpowers:executing-plans`-style direct execution, not `superpowers:subagent-driven-development`.
- **Route is `/performance/rpe`**, per the design doc's own Routes table (`| /performance/rpe | RPE / effort trend (#38) | new |`).
- **Sends only** — `rpe` is only ever set on `status === "send"` entries (confirmed in `client/entry-form.js`: `rpe: selectedStatus === "send" ? Number(exertionSlider.value) : null`), matching every prior aggregate in this epic's own "sends only" convention.
- **Reuse `shared/volume-stats.js`'s `volumeByBucket` for the grade-line computation** rather than reimplementing max-grade-per-bucket logic a third time — it's identical logic (same "sends only, per-discipline, gradeRank-based max" computation `#15` and `#14` both already established).
- **`rpe` field range**: integer, 0–100, multiples of 10 (`shared/entry-schema.js`'s own validation). Bar values are the average across qualifying sends in a bucket, rounded to one decimal place (same convention `#14`'s `avgAttemptsByBucket` established) — a bucket with no RPE data reports `0` for the bar (consistent with every other bar series in this epic), but the confidence-gate and trend logic (below) must NOT treat a `0` bar value as a real zero-effort reading — they use a separate `rpeCountByBucket` array to distinguish "no data" from "genuinely low effort."
- **Confidence gate — new for this deliverable.** `MIN_SEND_SAMPLE = 5` (same placeholder value as `#13`/`#39`'s own `MIN_TAG_COUNT`, but a distinctly-named local constant — this gates on total qualifying *send count* in the window, a different concept from those two modules' tag-frequency gating, so it does not reuse or import their `MIN_TAG_COUNT` export). Below the threshold, `effortHeadline` returns `null` and the composition root renders a "not enough data yet" message in the headline slot instead of a confident interpretation — but the chart itself (bars + line) still renders with whatever real data exists; only the *interpretive sentence* is gated, not the raw chart, since a sparse chart is still real, useful information (matching how `#13`'s own confidence gate only withholds the ranked interpretation, never the underlying data collection process itself).
- **Ruling — headline decision logic.** The design doc gives three illustrative outcomes without exact thresholds; this plan's own ruling: compare the *first* and *last* buckets that have real data (not a strict half-split of the window, which is fragile against sparse/gappy months) for both series independently. `gradeTrendUp` = last-with-data's grade ranks higher than first-with-data's (any positive `gradeRank` delta counts — grade is coarse/ordinal, no threshold needed). `exertionTrendUp` = last-with-data's average Exertion % exceeds first-with-data's by at least `EXERTION_RISE_MARGIN = 5` points (a floor against noise-level wobble on the continuous 0–100 scale). `overallAvgExertion ≥ HIGH_EXERTION_THRESHOLD = 80` counts as "high" effort. Decision order (first match wins): (1) `gradeTrendUp && exertionTrendUp` → the "paying off" message; (2) `overallAvgExertion >= 80 && !gradeTrendUp` → the "maxing out effort" message; (3) otherwise → the "room to push harder" message. A window with only one bucket of real data can't have a rising trend by construction (first-with-data equals last-with-data), so it falls through to case 3 without special-casing.
- **Ruling — discipline-specific terminology for the default "room to push harder" message.** The design doc's own example text ("There's room to push harder on your redpoint attempts") uses lead-specific vocabulary; matching `#14`'s established discipline-aware-terminology precedent, this plan swaps in the discipline-appropriate word (`"send"` for boulder, `"redpoint"` for lead) via a small local lookup in `shared/effort-stats.js` — not by importing `client/status.js` from a `shared/*.js` module (same shared/client layering boundary `#14`'s own `FLASH_TERM`/`SEND_TERM` ruling already established). The other two messages ("paying off" / "maxing out effort") don't reference send/redpoint vocabulary and need no discipline branching.
- **Evidence-tier chip: "Peer-reviewed"**, reusing `client/evidence-tier.js`'s existing `peer` tier definition unmodified (`evidenceOverlayHtml(["peer"])`). The lower-confidence-for-newer-climbers caveat is **not** baked into the shared `peer` tier's own generic description (that description is shared, reusable text — `climbing-grade-pyramid.js`'s own existing "8-4-2-1 ratio" claim also cites the `peer` tier and doesn't carry this caveat, so mutating the shared text would incorrectly attach this view's own caveat everywhere `peer` is used). Instead, this page's own shell HTML carries its own dedicated caveat paragraph, matching `#15`'s own `#trends-caveat` precedent exactly.
- **Citation** (from `docs/climbing-analytics-research.md`): Gajdošík, Baláš & Draper (2020), "Effect of Height on Perceived Exertion and Physiological Responses for Climbers of Differing Ability Levels," *Frontiers in Psychology*, Vol. 11, Article 997 — found RPE was a reasonably good proxy for physiological demand in advanced climbers but not in intermediate or lower-grade climbers.
- **`entries.deleted_at IS NULL` filtering already handled** via `listForUser(env, "entries", userId, rowToJson, {excludeDeleted: true})`, same call every other `performance.js` handler already makes.
- **Security**: this endpoint gets the same anonymous-caller, cross-user-isolation, date-shape, and 120-month span-cap validation every performance endpoint in this epic has had since `#15`'s own final review found the gap — built in from the start here, reusing the same shared `MAX_WINDOW_MONTHS` constant `#14` already centralized. The final review re-verifies `server/api/public-data.js` has no route to it.
- **Test commands**: `pnpm test` (Vitest), `pnpm exec playwright test` (Playwright, run twice for idempotency).
- **Deploy classification: beta-only, no migrations touched.** Do **not** run `promote.yml` after merge — this is the final Phase 2 view; once it's merged, discuss with the user whether the whole epic is ready to promote, rather than promoting unilaterally.

---

## Task 1: `shared/effort-stats.js` — pure exertion/grade-trend aggregation

**Files:**
- Create: `shared/effort-stats.js`
- Test: `test/shared/effort-stats.test.js`

**Interfaces:**
- Consumes: `shared/volume-stats.js`'s existing `volumeByBucket` (reused directly for the grade-line computation), `shared/grade-data.js`'s `gradeRank`.
- Produces: `effortByBucket(entries, buckets)` → `{ maxGradeByBucket: Array<string|null>, avgExertionByBucket: number[], rpeCountByBucket: number[], overallAvgExertion: number|null, totalSends: number }`. `effortHeadline(maxGradeByBucket, avgExertionByBucket, rpeCountByBucket, overallAvgExertion, totalSends, type)` → `string|null` (`null` when `totalSends < MIN_SEND_SAMPLE`).

- [ ] **Step 1: Write the failing tests**

Create `test/shared/effort-stats.test.js`:

```js
import { describe, expect, it } from "vitest";
import { effortByBucket, effortHeadline } from "../../shared/effort-stats.js";

function entry(overrides = {}) {
  return { date: "2026-01-15", status: "send", grade: "6B", type: "boulder", rpe: 70, ...overrides };
}

describe("effortByBucket", () => {
  it("ignores non-send entries entirely", () => {
    const { maxGradeByBucket, avgExertionByBucket } = effortByBucket([entry({ status: "project" })], ["2026-01"]);
    expect(maxGradeByBucket).toEqual([null]);
    expect(avgExertionByBucket).toEqual([0]);
  });

  it("tracks the highest send grade per bucket, matching volumeByBucket's own logic", () => {
    const entries = [entry({ grade: "6B" }), entry({ grade: "7A", date: "2026-01-20" })];
    const { maxGradeByBucket } = effortByBucket(entries, ["2026-01"]);
    expect(maxGradeByBucket).toEqual(["7A"]);
  });

  it("averages rpe per bucket, ignoring entries with no rpe value", () => {
    const entries = [entry({ rpe: 60 }), entry({ rpe: 80, date: "2026-01-20" }), entry({ rpe: null, date: "2026-01-25" })];
    const { avgExertionByBucket, rpeCountByBucket } = effortByBucket(entries, ["2026-01"]);
    expect(avgExertionByBucket).toEqual([70]);
    expect(rpeCountByBucket).toEqual([2]);
  });

  it("rounds a bucket's average to one decimal place", () => {
    const entries = [entry({ rpe: 60 }), entry({ rpe: 70, date: "2026-01-20" }), entry({ rpe: 80, date: "2026-01-25" })];
    const { avgExertionByBucket } = effortByBucket(entries, ["2026-01"]);
    expect(avgExertionByBucket).toEqual([70]);
  });

  it("reports 0 average and 0 count for a bucket with sends but no rpe data", () => {
    const { avgExertionByBucket, rpeCountByBucket } = effortByBucket([entry({ rpe: null })], ["2026-01"]);
    expect(avgExertionByBucket).toEqual([0]);
    expect(rpeCountByBucket).toEqual([0]);
  });

  it("computes overallAvgExertion across every qualifying send in the window, not just one bucket", () => {
    const entries = [entry({ rpe: 60, date: "2026-01-10" }), entry({ rpe: 100, date: "2026-02-10" })];
    const { overallAvgExertion } = effortByBucket(entries, ["2026-01", "2026-02"]);
    expect(overallAvgExertion).toBe(80);
  });

  it("reports overallAvgExertion as null when no entry has rpe data", () => {
    const { overallAvgExertion } = effortByBucket([entry({ rpe: null })], ["2026-01"]);
    expect(overallAvgExertion).toBeNull();
  });

  it("counts totalSends across the whole window regardless of rpe presence", () => {
    const entries = [entry({ rpe: null }), entry({ rpe: 50, date: "2026-01-20" })];
    const { totalSends } = effortByBucket(entries, ["2026-01"]);
    expect(totalSends).toBe(2);
  });

  it("ignores an entry whose date falls outside every given bucket", () => {
    const { totalSends } = effortByBucket([entry({ date: "2020-01-01" })], ["2026-01"]);
    expect(totalSends).toBe(0);
  });

  it("places each entry in its own correct bucket across multiple buckets", () => {
    const entries = [entry({ date: "2026-01-05", rpe: 60 }), entry({ date: "2026-02-10", rpe: 80, grade: "7A" })];
    const { avgExertionByBucket, maxGradeByBucket } = effortByBucket(entries, ["2026-01", "2026-02"]);
    expect(avgExertionByBucket).toEqual([60, 80]);
    expect(maxGradeByBucket).toEqual(["6B", "7A"]);
  });
});

describe("effortHeadline", () => {
  it("returns null below the minimum sample size", () => {
    const text = effortHeadline([null], [0], [0], null, 4, "boulder");
    expect(text).toBeNull();
  });

  it("returns the 'paying off' message when both grade and exertion rise from first to last data point", () => {
    // buckets: grade 6B->7A (rising), exertion 60->80 (rising by 20, over the margin)
    const text = effortHeadline(["6B", "7A"], [60, 80], [2, 2], 70, 5, "boulder");
    expect(text).toContain("paying off");
  });

  it("returns the 'maxing out effort' message for high average exertion with no grade progress", () => {
    const text = effortHeadline(["6B", "6B"], [85, 85], [2, 2], 85, 5, "boulder");
    expect(text).toContain("technique work");
  });

  it("returns the discipline-aware 'room to push harder' message as the default case", () => {
    const boulderText = effortHeadline(["6B", "6B"], [40, 40], [2, 2], 40, 5, "boulder");
    expect(boulderText).toContain("send attempts");
    const leadText = effortHeadline(["6a", "6a"], [40, 40], [2, 2], 40, 5, "lead");
    expect(leadText).toContain("redpoint attempts");
  });

  it("does not report a rising exertion trend for a sub-margin fluctuation", () => {
    // exertion only rises by 3 (< EXERTION_RISE_MARGIN of 5), grade rises -- should NOT hit the "paying off" branch
    const text = effortHeadline(["6B", "7A"], [70, 73], [2, 2], 71, 5, "boulder");
    expect(text).not.toContain("paying off");
  });

  it("falls through to the default case with only one bucket of real data (no possible trend)", () => {
    const text = effortHeadline(["6B"], [50], [3], 50, 5, "boulder");
    expect(text).toContain("room to push harder");
  });
});
```

- [ ] **Step 2: Run the tests, confirm they fail**

Run: `pnpm exec vitest run test/shared/effort-stats.test.js`
Expected: FAIL — `shared/effort-stats.js` doesn't exist yet.

- [ ] **Step 3: Implement `shared/effort-stats.js`**

```js
// #38 (epic #5 Phase 2) -- pure, DOM-free aggregation over entries data,
// computed server-side (server/api/performance.js), same convention as
// every other shared/*-stats.js module in this epic. Reuses shared/
// volume-stats.js's own volumeByBucket() directly for the grade-line
// computation -- identical "sends only, max grade per bucket" logic
// already built and tested there, no reason to reimplement it here.
import { volumeByBucket } from "./volume-stats.js";
import { gradeRank } from "./grade-data.js";

// Same placeholder value as shared/tag-stats-helpers.js's own
// MIN_TAG_COUNT, but a distinctly-named local constant -- this gates on
// total qualifying *send count* in the window, a different concept from
// that module's tag-frequency gating (see this plan's own Global
// Constraints for the full reasoning), not the same threshold reused
// under a name that would misdescribe what it's counting here.
const MIN_SEND_SAMPLE = 5;
const HIGH_EXERTION_THRESHOLD = 80;
const EXERTION_RISE_MARGIN = 5;

export function effortByBucket(entries, buckets) {
  const { maxGradeByBucket } = volumeByBucket(entries, buckets);

  const bucketIndex = Object.fromEntries(buckets.map((b, i) => [b, i]));
  const rpeSumByBucket = buckets.map(() => 0);
  const rpeCountByBucket = buckets.map(() => 0);
  let totalRpeSum = 0;
  let totalRpeCount = 0;
  let totalSends = 0;

  for (const entry of entries) {
    if (entry.status !== "send" || !entry.date) continue;
    const idx = bucketIndex[entry.date.slice(0, 7)];
    if (idx === undefined) continue;
    totalSends++;
    if (entry.rpe === null || entry.rpe === undefined) continue;
    rpeSumByBucket[idx] += entry.rpe;
    rpeCountByBucket[idx]++;
    totalRpeSum += entry.rpe;
    totalRpeCount++;
  }

  const avgExertionByBucket = rpeCountByBucket.map((count, i) =>
    count ? Math.round((rpeSumByBucket[i] / count) * 10) / 10 : 0
  );
  const overallAvgExertion = totalRpeCount ? Math.round((totalRpeSum / totalRpeCount) * 10) / 10 : null;

  return { maxGradeByBucket, avgExertionByBucket, rpeCountByBucket, overallAvgExertion, totalSends };
}

// Small, self-contained vocabulary duplication of client/status.js's own
// sendLabel -- this function is server-computed (like every other
// headline generator in this epic), and a shared/*.js module computed
// server-side can't import a client/*.js module (see this plan's own
// Global Constraints; same tradeoff shared/gap-stats.js's own
// FLASH_TERM/SEND_TERM already made).
const SEND_TERM = { boulder: "send", lead: "redpoint" };

function firstLastIndicesWithData(hasDataFlags) {
  const indices = [];
  hasDataFlags.forEach((hasData, i) => { if (hasData) indices.push(i); });
  return indices.length >= 2 ? [indices[0], indices[indices.length - 1]] : null;
}

export function effortHeadline(maxGradeByBucket, avgExertionByBucket, rpeCountByBucket, overallAvgExertion, totalSends, type) {
  if (totalSends < MIN_SEND_SAMPLE) return null;

  const gradeRange = firstLastIndicesWithData(maxGradeByBucket.map(g => g !== null));
  const gradeTrendUp = gradeRange !== null && gradeRank(maxGradeByBucket[gradeRange[1]]) > gradeRank(maxGradeByBucket[gradeRange[0]]);

  const rpeRange = firstLastIndicesWithData(rpeCountByBucket.map(c => c > 0));
  const exertionTrendUp = rpeRange !== null && (avgExertionByBucket[rpeRange[1]] - avgExertionByBucket[rpeRange[0]]) >= EXERTION_RISE_MARGIN;

  if (gradeTrendUp && exertionTrendUp) {
    return "Your effort is rising alongside your grade -- sounds like it's paying off.";
  }
  if (overallAvgExertion !== null && overallAvgExertion >= HIGH_EXERTION_THRESHOLD && !gradeTrendUp) {
    return "You're maxing out effort without much grade movement -- technique work might unlock more than pushing harder would.";
  }
  return `There's room to push harder on your ${SEND_TERM[type]} attempts.`;
}
```

- [ ] **Step 4: Run the tests, confirm they pass**

Run: `pnpm exec vitest run test/shared/effort-stats.test.js`
Expected: PASS (17 tests)

- [ ] **Step 5: Run the full suite to confirm no regressions**

Run: `pnpm test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add shared/effort-stats.js test/shared/effort-stats.test.js
git commit -m "Add shared/effort-stats.js: avg-exertion + grade-trend bucketing"
```

---

## Task 2: `server/api/performance.js` — the effort endpoint

**Files:**
- Modify: `server/api/performance.js`
- Modify: `server/index.js` (route registration)
- Test: `test/performance.test.js` (existing file — add a new `describe("handleGetEffort", ...)` block alongside the five existing ones)

**Interfaces:**
- Consumes: Task 1's `shared/effort-stats.js` (`effortByBucket`, `effortHeadline`).
- Produces: `handleGetEffort(request, env, userId)` → `{ boulder: { buckets, maxGradeByBucket, avgExertionByBucket, headline }, lead: {...} }` for `?start=YYYY-MM-DD&end=YYYY-MM-DD` (same validation as `handleGetVolume`/`handleGetGap`: missing → 400, malformed → 400, span over `MAX_WINDOW_MONTHS` → 400). Registered at `/logbook/api/performance/rpe` in `server/index.js`'s `PUBLIC_GET_ROUTES`.

- [ ] **Step 1: Write the failing tests**

Read the real, current `test/performance.test.js` file first to confirm the exact helper names/signatures (`fetchJson`, `postEntry`, `del`, `createAuthedSession`, `cookie`), then append a new block after the existing `describe("handleGetGap", ...)` block:

```js
const EFFORT_URL = "/logbook/api/performance/rpe";
function getEffort(params, extraCookie = cookie) {
  const qs = new URLSearchParams(params).toString();
  return fetchJson(`${EFFORT_URL}?${qs}`, { headers: { Cookie: extraCookie } });
}

describe("handleGetEffort", () => {
  it("returns 400 when start or end is missing", async () => {
    expect((await getEffort({ end: "2026-03-01" })).status).toBe(400);
    expect((await getEffort({ start: "2026-01-01" })).status).toBe(400);
  });

  it("returns 400 for a malformed date", async () => {
    expect((await getEffort({ start: "not-a-date", end: "2026-03-01" })).status).toBe(400);
  });

  it("returns 400 for a span exceeding 120 months", async () => {
    expect((await getEffort({ start: "0001-01-01", end: "9999-12-31" })).status).toBe(400);
  });

  it("returns a null headline for a user below the confidence gate", async () => {
    await postEntry({ date: "2026-02-10", rpe: 70 });
    const { boulder } = await (await getEffort({ start: "2026-01-01", end: "2026-03-01" })).json();
    expect(boulder.headline).toBeNull();
    expect(boulder.avgExertionByBucket).toEqual([0, 70, 0]);
  });

  it("reflects real sends within the window, split by discipline", async () => {
    await postEntry({ type: "boulder", grade: "6B", date: "2026-02-10", rpe: 60 });
    await postEntry({ type: "lead", grade: "6a", date: "2026-02-15", rpe: 80 });
    const body = await (await getEffort({ start: "2026-01-01", end: "2026-03-01" })).json();
    expect(body.boulder.avgExertionByBucket).toEqual([0, 60, 0]);
    expect(body.lead.avgExertionByBucket).toEqual([0, 80, 0]);
  });

  it("excludes a soft-deleted entry", async () => {
    const created = await (await postEntry({ date: "2026-02-10" })).json();
    await del(created.entries[0].id);
    const { boulder } = await (await getEffort({ start: "2026-01-01", end: "2026-03-01" })).json();
    expect(boulder.avgExertionByBucket).toEqual([0, 0, 0]);
  });

  it("returns empty per-bucket data for an anonymous caller", async () => {
    const res = await fetchJson(`${EFFORT_URL}?start=2026-01-01&end=2026-03-01`);
    expect(res.status).toBe(200);
    const { boulder } = await res.json();
    expect(boulder.avgExertionByBucket).toEqual([0, 0, 0]);
  });

  it("a second user's own request never reflects the first user's sends", async () => {
    await postEntry({ date: "2026-02-10", rpe: 90 });
    const userB = await createAuthedSession();
    const { boulder } = await (await getEffort({ start: "2026-01-01", end: "2026-03-01" }, userB.cookie)).json();
    expect(boulder.avgExertionByBucket).toEqual([0, 0, 0]);
  });
});
```

- [ ] **Step 2: Run the tests, confirm they fail**

Run: `pnpm exec vitest run test/performance.test.js -t "handleGetEffort"`
Expected: FAIL — `handleGetEffort` doesn't exist and isn't routed yet.

- [ ] **Step 3: Implement `handleGetEffort`**

In `server/api/performance.js`, add the import (alongside the existing `gap-stats.js` import line):

```js
import { effortByBucket, effortHeadline } from "../../shared/effort-stats.js";
```

Add the handler after `handleGetGap`, reusing the existing `DATE_SHAPE`/`MAX_WINDOW_MONTHS` constants:

```js
// #38 -- same online-only, server-computed, start/end-validated
// convention as handleGetVolume/handleGetGap immediately above (also in
// PUBLIC_GET_ROUTES with no session required, same date-shape + span-cap
// validation).
export async function handleGetEffort(request, env, userId) {
  const url = new URL(request.url);
  const start = url.searchParams.get("start");
  const end = url.searchParams.get("end");
  if (!start || !end) return json({ error: "Missing required field: start and end" }, 400);
  if (!DATE_SHAPE.test(start) || !DATE_SHAPE.test(end)) {
    return json({ error: "start and end must be YYYY-MM-DD dates" }, 400);
  }

  const buckets = monthBuckets(start, end);
  if (buckets.length > MAX_WINDOW_MONTHS) {
    return json({ error: `start and end must span at most ${MAX_WINDOW_MONTHS} months` }, 400);
  }

  const rows = await listForUser(env, "entries", userId, rowToJson, { excludeDeleted: true });

  function forDiscipline(type) {
    const { maxGradeByBucket, avgExertionByBucket, rpeCountByBucket, overallAvgExertion, totalSends } =
      effortByBucket(rows.filter(e => e.type === type), buckets);
    return {
      buckets: buckets.map(bucketLabel),
      maxGradeByBucket,
      avgExertionByBucket,
      headline: effortHeadline(maxGradeByBucket, avgExertionByBucket, rpeCountByBucket, overallAvgExertion, totalSends, type),
    };
  }

  return json({ boulder: forDiscipline("boulder"), lead: forDiscipline("lead") }, 200, { "Cache-Control": "no-store" });
}
```

Note: `rpeCountByBucket`/`overallAvgExertion`/`totalSends` from `effortByBucket` are only used internally to compute `headline` — they're not part of the response shape, matching how `handleGetGap` doesn't expose its own internal-only fields either.

Update `server/index.js`'s import (currently `import { handleGetGap, handleGetInjuryLog, handleGetPyramid, handleGetStrengthsWeaknesses, handleGetVolume } from "./api/performance.js";`):

```js
import { handleGetEffort, handleGetGap, handleGetInjuryLog, handleGetPyramid, handleGetStrengthsWeaknesses, handleGetVolume } from "./api/performance.js";
```

Add the route to `PUBLIC_GET_ROUTES`, directly after the existing gap entry:

```js
  "/logbook/api/performance/gap": handleGetGap,
  // #38 -- same public-GET + server-side-computed convention as the five
  // routes above.
  "/logbook/api/performance/rpe": handleGetEffort,
```

- [ ] **Step 4: Run the tests, confirm they pass**

Run: `pnpm exec vitest run test/performance.test.js -t "handleGetEffort"`
Expected: PASS (8 tests)

- [ ] **Step 5: Run the full unit suite to confirm no regressions**

Run: `pnpm test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add server/api/performance.js server/index.js test/performance.test.js
git commit -m "Add the /performance/rpe endpoint (#38)"
```

---

## Task 3: Route plumbing — hub tile, shell, composition-root skeleton

**Files:**
- Create: `public/performance/rpe/index.html`
- Create: `client/performance-rpe-main.js`
- Modify: `client/performance-hub-main.js` (add to `INSIGHTS`)
- Modify: `server/api/owned-routes.js` (add to `SHELL_PATHS`)
- Modify: `server/index.js` (extend the owned-route regex, both occurrences)
- Modify: `package.json` (new `performance-rpe:build`/`:watch` scripts, `pages:build`, `dev:raw`/`dev:vite`, `e2e:build-fixtures`)
- Modify: `scripts/dev.mjs` (add to the `-n`/`-c`/command lists)
- Modify: `.gitignore` (new bundle-output entry + comment enumeration)
- Modify: `client/store.js` (add `"performance-rpe"` to the documented `activeView` union)
- Test: `test/owned-routes.test.js` (new shell-serving test, following the existing tests' exact two-assertion pattern)

**Interfaces:**
- Consumes: Task 2's `/logbook/api/performance/rpe` endpoint, `client/combo-chart.js`'s `renderComboChartHtml`, `client/time-window.js`'s `createTimeWindowControl`, `client/evidence-tier.js`'s `evidenceOverlayHtml`/`evidenceTierButtonHtml` (all pre-existing, reused as-is).
- Produces: a real, navigable `/:username/performance/rpe` route. Task 4 fills in this composition root's actual rendering logic (currently a placeholder shell in this task, matching the established Task N/N+1 split every prior route-plumbing task in this epic has used).

- [ ] **Step 1: Add the hub tile**

In `client/performance-hub-main.js`, add to the `INSIGHTS` array (after the existing gap entry):

```js
  {
    id: "insight-rpe",
    title: "Effort / RPE Trend",
    description: "See how hard you're pushing relative to your grade progress, and whether there's room to try harder.",
    route: "rpe",
  },
```

- [ ] **Step 2: Register the shell path and extend the owned-route regex**

In `server/api/owned-routes.js`, add to `SHELL_PATHS` (directly after the existing `"performance/gap"` entry):

```js
  "performance/gap": "/performance/gap/index.html",
  "performance/rpe": "/performance/rpe/index.html",
```

In `server/index.js`, change **both** occurrences of the owned-route regex (currently `performance(?:\/(?:pyramid|injury|strengths|trends|gap))?`) to:

```js
performance(?:\/(?:pyramid|injury|strengths|trends|gap|rpe))?
```

- [ ] **Step 3: Create the static shell**

Create `public/performance/rpe/index.html` — copy `public/performance/trends/index.html` verbatim (the simpler single-caveat precedent, not `public/performance/gap/index.html`'s three-container structure — this view needs a time-window control, a chart root, and a caveat paragraph, the same three-element shape `#15`'s own shell already has, not an evidence-overlay placeholder container since it reuses the existing `evidence-tier.js` the same way `#14` did). Read the real, current `public/performance/trends/index.html` in full first (confirm its exact current structure before copying — do not assume the structure described in this step from memory).

Make these changes: `<title>` becomes `Effort / RPE Trend – Climbing Logbook`, the header comment's own file-path/route references get updated to say `client/performance-rpe-main.js`/this page's own route, the `#performance-offline` message's second `<p>` becomes "Reconnect and reload this page to see your effort trend.", replace `id="trends-caveat"`'s own paragraph text with: "RPE readings tend to be less reliable for newer or lower-grade climbers (Gajdošík et al., 2020) -- take this trend as a loose signal, not a precise measure." and its `id` with `id="effort-caveat"`, replace `<div id="trends-root"></div>` with two containers: `<div id="rpe-root"></div><div id="evidence-overlay-root"></div>` (the second is an empty placeholder this task's own composition root fills via `evidenceOverlayHtml()` at boot, same convention `#14`'s own gap page already established), and change the closing `<script>` tag's `src` to `/logbook/performance-rpe-app.js`.

- [ ] **Step 4: Create the composition-root skeleton**

Create `client/performance-rpe-main.js` — copy `client/performance-gap-main.js` verbatim as a starting point (the most current precedent for a page that both fetches a time-windowed chart endpoint AND wires the evidence-tier overlay), then make these changes: rename every `gap`-specific identifier to its `rpe`/`effort` equivalent (`gapRootEl` → `rpeRootEl`, `latestGapData`/`latestGapRequestId` → `latestEffortData`/`latestEffortRequestId`, `renderGap` → `renderEffort`, `fetchGap` → `fetchEffort`), update the file's own header comment to reference `#38` instead of `#14` and describe the RPE/effort trend instead of the onsight/redpoint gap, change `/logbook/api/performance/gap` to `/logbook/api/performance/rpe` in the fetch URL, change `store.setActiveView("performance-gap")` to `store.setActiveView("performance-rpe")`.

Remove the imports this task's skeleton doesn't need yet (`renderComboChartHtml`, `flashLabel`/`sendLabel` from `./status.js`, `gradeDisplayLabel` from `../shared/volume-stats.js`, `BOULDER_GRADES`/`LEAD_GRADES` from `../shared/grade-data.js`, and the `positionOrderFor` function itself — this view has only ONE line series, not two, so `positionOrderFor`'s existing shape from the gap/trends precedent is still needed by Task 4, but the two-line-specific `flashLabel`/`sendLabel` import is gap-specific residue that should NOT carry over here). Keep `evidenceOverlayHtml`, `evidenceTierButtonHtml`, `createModalHelpers`, `modalHelpers` module state, and the evidence-overlay wiring in `boot()` exactly as-is (this view also needs the evidence-tier chip, just for the "peer" tier instead of "community" — change `evidenceOverlayHtml(["community"])` to `evidenceOverlayHtml(["peer"])`).

For this task (Task 3), stub `renderEffort` as a currently-empty function, matching every prior view's own Task N/N+1 split:

```js
let latestEffortData = null;

function renderEffort() {
  // Task 4 fills this in.
  if (!latestEffortData) return;
  rpeRootEl.textContent = JSON.stringify(latestEffortData[store.getActiveType()]);
}

function render() {
  headerChrome.updateDisciplinePicker();
  updateAdminBar();
  renderEffort();
}
```

Update the `boot()` try block's `onChange` callback to call `fetchEffort(start, end)` and assign to `latestEffortData` (mirroring the gap page's own `onChange` callback exactly, just with the renamed identifiers).

- [ ] **Step 5: Add build scripts**

In `package.json`'s `scripts`, add directly after the existing `performance-gap:build`/`:watch` pair:

```json
    "performance-rpe:build": "esbuild client/performance-rpe-main.js --bundle --format=esm --outfile=public/logbook/performance-rpe-app.js --minify --external:./escape-html.js --external:./floating-ui-dom.js",
    "performance-rpe:watch": "esbuild client/performance-rpe-main.js --bundle --format=esm --outfile=public/logbook/performance-rpe-app.js --watch --external:./escape-html.js --external:./floating-ui-dom.js",
```

Add `pnpm run performance-rpe:build` to the `pages:build` chain, directly after `pnpm run performance-gap:build`.

Change `dev:raw` — insert `performance-rpe` after `performance-gap` in both the `-n` and `-c` lists. The full, hand-computed correct lists (verified against the existing repeating 6-color cycle `blue,magenta,yellow,cyan,white,gray`, position-by-position):

```json
"dev:raw": "concurrently -n wrangler,tailwind,map,performance-pyramid,performance-hub,performance-injury,performance-strengths,performance-trends,performance-gap,performance-rpe,log,profile,account,account-edit,account-import,sync,beta-gate -c blue,magenta,yellow,cyan,white,gray,blue,magenta,yellow,cyan,white,gray,blue,magenta,yellow,cyan,white \"wrangler dev\" \"tailwindcss -i ./styles/tailwind.css -o ./public/logbook/tailwind.css --watch\" \"pnpm run map:watch\" \"pnpm run performance-pyramid:watch\" \"pnpm run performance-hub:watch\" \"pnpm run performance-injury:watch\" \"pnpm run performance-strengths:watch\" \"pnpm run performance-trends:watch\" \"pnpm run performance-gap:watch\" \"pnpm run performance-rpe:watch\" \"pnpm run log:watch\" \"pnpm run profile:watch\" \"pnpm run account:watch\" \"pnpm run account-edit:watch\" \"pnpm run account-import:watch\" \"pnpm run sync:watch\" \"pnpm run beta-gate:watch\"",
```

Change `dev:vite` the same way (only the `-n` list's first entry and the first quoted command differ, `vite`/`"vite dev"` instead of `wrangler`/`"wrangler dev"`):

```json
"dev:vite": "concurrently -n vite,tailwind,map,performance-pyramid,performance-hub,performance-injury,performance-strengths,performance-trends,performance-gap,performance-rpe,log,profile,account,account-edit,account-import,sync,beta-gate -c blue,magenta,yellow,cyan,white,gray,blue,magenta,yellow,cyan,white,gray,blue,magenta,yellow,cyan,white \"vite dev\" \"tailwindcss -i ./styles/tailwind.css -o ./public/logbook/tailwind.css --watch\" \"pnpm run map:watch\" \"pnpm run performance-pyramid:watch\" \"pnpm run performance-hub:watch\" \"pnpm run performance-injury:watch\" \"pnpm run performance-strengths:watch\" \"pnpm run performance-trends:watch\" \"pnpm run performance-gap:watch\" \"pnpm run performance-rpe:watch\" \"pnpm run log:watch\" \"pnpm run profile:watch\" \"pnpm run account:watch\" \"pnpm run account-edit:watch\" \"pnpm run account-import:watch\" \"pnpm run sync:watch\" \"pnpm run beta-gate:watch\"",
```

In `scripts/dev.mjs`, change the `-n`/`-c` lists and the spawn args array (this file has no `beta-gate` entry — a pre-existing, already-accepted drift, not something this task fixes):

```js
  "-n", "vite,tailwind,map,performance-pyramid,performance-hub,performance-injury,performance-strengths,performance-trends,performance-gap,performance-rpe,log,profile,account,account-edit,account-import,sync",
  "-c", "blue,magenta,yellow,cyan,white,gray,blue,magenta,yellow,cyan,white,gray,blue,magenta,yellow,cyan",
  "vite dev",
  "tailwindcss -i ./styles/tailwind.css -o ./public/logbook/tailwind.css --watch",
  "pnpm run map:watch",
  "pnpm run performance-pyramid:watch",
  "pnpm run performance-hub:watch",
  "pnpm run performance-injury:watch",
  "pnpm run performance-strengths:watch",
  "pnpm run performance-trends:watch",
  "pnpm run performance-gap:watch",
  "pnpm run performance-rpe:watch",
  "pnpm run log:watch",
  "pnpm run profile:watch",
  "pnpm run account:watch",
  "pnpm run account-edit:watch",
  "pnpm run account-import:watch",
  "pnpm run sync:watch",
```

- [ ] **Step 6: Update `.gitignore`, `e2e:build-fixtures`, and `store.js`**

In `.gitignore`, add `client/performance-rpe-main.js` to the explanatory comment's enumeration list, and add directly after the existing `public/logbook/performance-gap-app.js` line:

```
public/logbook/performance-rpe-app.js
```

In `package.json`'s `e2e:build-fixtures` script, add a `cp` clause copying `public/performance/rpe/index.html` to `public/e2e-fixtures/pages/performance-rpe.html`, following the exact pattern the other `performance*.html` clauses use, placed directly after the gap clause. Do **not** add a separate esbuild-bundling clause for `client/performance-rpe-main.js`.

In `client/store.js`, find the comment documenting the `activeView` union (currently ending `"performance-gap"`) and add `"performance-rpe"` to it.

- [ ] **Step 7: Write the failing shell-serving test**

In `test/owned-routes.test.js`, add directly after the existing `"serves the real static shell for performance/gap"` test:

```js
  it("serves the real static shell for performance/rpe", async () => {
    const { cookie } = await createAuthedSession({ username: "rpeshelluser", hostname: "climbinglogbook.com" });
    const res = await fetchOwnedRoute("rpeshelluser", "performance/rpe", { cookie });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('id="rpe-root"');
    expect(html).toContain('src="/logbook/performance-rpe-app.js"');
  });
```

- [ ] **Step 8: Run the test, confirm it passes** (after Steps 1-6's file changes are in place)

Run: `pnpm exec vitest run test/owned-routes.test.js -t "performance/rpe"`
Expected: PASS

- [ ] **Step 9: Run the full unit suite**

Run: `pnpm test`
Expected: PASS

- [ ] **Step 10: Commit**

```bash
git add client/performance-hub-main.js client/performance-rpe-main.js client/store.js public/performance/rpe/index.html server/api/owned-routes.js server/index.js package.json scripts/dev.mjs .gitignore test/owned-routes.test.js
git commit -m "Wire up the /performance/rpe route (#38): hub tile, shell, composition root skeleton"
```

---

## Task 4: Chart + evidence-tier + confidence-gate rendering

**Files:**
- Modify: `client/performance-rpe-main.js` (replace Task 3's `renderEffort` stub)
- Test: manual verification (pure DOM-rendering logic operating on already-tested data from Tasks 1-2 — no new pure-logic unit tests needed here; e2e coverage is Task 5)

**Interfaces:**
- Consumes: `client/combo-chart.js`'s `renderComboChartHtml`, `client/evidence-tier.js`'s `evidenceTierButtonHtml` (already wired into `boot()` by Task 3), Task 2's endpoint response shape.

- [ ] **Step 1: Implement the real `renderEffort`**

In `client/performance-rpe-main.js`, add the imports:

```js
import { renderComboChartHtml } from "./combo-chart.js";
import { gradeDisplayLabel } from "../shared/volume-stats.js";
import { BOULDER_GRADES, LEAD_GRADES } from "../shared/grade-data.js";
```

(`evidenceOverlayHtml` and `evidenceTierButtonHtml` are already imported together on one line from Task 3's carry-over of the gap page's own import — Task 3 explicitly kept both, even though the Task 3 skeleton itself only used `evidenceOverlayHtml`. Do NOT add a second `evidenceTierButtonHtml` import here — that would duplicate the existing one. Just use it in `renderEffort` below.)

Add back a `positionOrderFor` helper (removed in Task 3 since the skeleton didn't need it yet):

```js
function positionOrderFor(type) {
  return (type === "boulder" ? BOULDER_GRADES : LEAD_GRADES).map(x => x.g);
}
```

Replace Task 3's stub `renderEffort` with:

```js
function renderEffort() {
  if (!latestEffortData) return;
  const type = store.getActiveType();
  const { buckets, maxGradeByBucket, avgExertionByBucket, headline } = latestEffortData[type];
  const positionOrder = positionOrderFor(type);

  const points = maxGradeByBucket.map(grade => grade
    ? { positionKey: grade, displayLabel: gradeDisplayLabel(grade, type) }
    : null);

  const headlineText = headline ?? "Not enough data yet for a reliable read -- log a few more sends and check back.";

  const chartHtml = renderComboChartHtml({
    bucketLabels: buckets,
    bars: [{ label: "Avg exertion %", values: avgExertionByBucket }],
    lines: [{ label: "Max grade", points, positionOrder }],
    headline: headlineText,
  });

  // Same reasoning as client/performance-gap-main.js's own renderGap():
  // renderComboChartHtml's headline slot escapeHtml()s its input
  // internally, so the "Peer-reviewed" evidence-tier chip (real HTML)
  // is rendered as a sibling element after the chart's own markup, not
  // smuggled inside the headline string.
  rpeRootEl.innerHTML = chartHtml + `<p class="text-[.82rem] text-muted mt-2">Reference: ${evidenceTierButtonHtml("Peer-reviewed", "peer")}</p>`;

  rpeRootEl.querySelectorAll("[data-evidence-tier]").forEach(btn =>
    btn.addEventListener("click", () => modalHelpers.openModal(document.getElementById("evidence-overlay")))
  );
}
```

- [ ] **Step 2: Manual verification**

Run: `pnpm dev`, log in via `http://my.localhost:<port>/login/` (not plain `localhost`), navigate to `/performance/rpe`. Expected: with fewer than 5 sends in the default 3-month window, the headline reads "Not enough data yet for a reliable read..." even though the chart itself (bars/line) still renders with whatever real data exists. Log enough sends (5+) across different months with varying Exertion % and grades to clear the confidence gate — try constructing scenarios for each of the three headline branches (e.g., log several high-RPE sends with no grade progress to see the "technique work" message; log rising-grade sends with rising RPE to see the "paying off" message; log low-RPE sends to see the "room to push harder" message, confirming it says "send attempts" for boulder and "redpoint attempts" for lead). Confirm the `#effort-caveat` paragraph is visible with the Gajdošík et al. citation text. Click the "Peer-reviewed" chip, confirm the evidence overlay opens showing the peer-tier definition (the same generic text `climbing-grade-pyramid.js`'s own overlay shows), and closes via the ✕ button. Switch the discipline picker, confirm the chart re-renders without a new network request.

- [ ] **Step 3: Run the full unit suite to confirm no regressions**

Run: `pnpm test`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add client/performance-rpe-main.js public/performance/rpe/index.html
git commit -m "Render the RPE/effort trend chart + confidence-gated headline (#38)"
```

---

## Task 5: End-to-end coverage

**Files:**
- Create: `e2e/performance-rpe-page.spec.js` (new file, following `e2e/performance-gap-page.spec.js`'s exact established pattern)
- Modify: `e2e/mock-api.js` (a new `effortData` option)
- Test: itself

**Interfaces:**
- Consumes: the full Task 1-4 stack, end-to-end, through the real UI and a mocked `/logbook/api/*`.

- [ ] **Step 1: Read `e2e/performance-gap-page.spec.js` and the real, current `e2e/mock-api.js` in full to confirm the exact pattern to extend**

Add an `effortData` option, defaulting to a response below the confidence gate (null headline):

```js
  effortData = {
    boulder: { buckets: ["Jan 2026", "Feb 2026", "Mar 2026"], maxGradeByBucket: [null, null, null], avgExertionByBucket: [0, 0, 0], headline: null },
    lead: { buckets: ["Jan 2026", "Feb 2026", "Mar 2026"], maxGradeByBucket: [null, null, null], avgExertionByBucket: [0, 0, 0], headline: null },
  },
```

Route it the same simple fixed-response way `gapData`/`volumeData` are routed:

```js
  await page.route("**/logbook/api/performance/rpe**", route => route.fulfill({ json: effortData }));
```

- [ ] **Step 2: Write the failing e2e tests**

Create `e2e/performance-rpe-page.spec.js`:

```js
// #38 (epic #5 Phase 2) -- composition-root-wiring coverage for
// /:username/performance/rpe, same fixture-harness pattern as e2e/
// performance-gap-page.spec.js. athleteMode: true is required in the
// mocked settings response -- client/performance-rpe-main.js redirects
// to /log otherwise (#151's rule).
import { expect, test } from "@playwright/test";
import { mockApi } from "./mock-api.js";

test("shows the confidence-gate message, time-window control, and peer-reviewed chip below the sample threshold", async ({ page }) => {
  await mockApi(page, { settings: { athleteMode: true, activeDiscipline: "boulder" } });
  await page.goto("/e2e-fixtures/pages/performance-rpe.html");

  await expect(page.locator("climbing-header h1")).toHaveText("Climbing Logbook");
  await expect(page.locator("climbing-tab-bar a", { hasText: "Performance Insights" })).toHaveAttribute("aria-current", "page");
  await expect(page.locator("#effort-caveat")).toContainText("less reliable");
  await expect(page.locator('[data-window="3mo"]')).toBeVisible();
  await expect(page.locator("#rpe-root")).toContainText("Not enough data yet for a reliable read");
  await expect(page.locator("#rpe-root [data-evidence-tier]")).toContainText("Peer-reviewed");
});

test("renders the exertion bars and grade-labeled line once the confidence gate clears", async ({ page }) => {
  await mockApi(page, {
    settings: { athleteMode: true, activeDiscipline: "boulder" },
    effortData: {
      boulder: {
        buckets: ["Jan 2026", "Feb 2026", "Mar 2026"],
        maxGradeByBucket: [null, "6B", "6C"],
        avgExertionByBucket: [0, 70, 85],
        headline: "Your effort is rising alongside your grade -- sounds like it's paying off.",
      },
      lead: { buckets: ["Jan 2026", "Feb 2026", "Mar 2026"], maxGradeByBucket: [null, null, null], avgExertionByBucket: [0, 0, 0], headline: null },
    },
  });
  await page.goto("/e2e-fixtures/pages/performance-rpe.html");

  await expect(page.locator("#rpe-root")).toContainText("sounds like it's paying off");
  await expect(page.locator("#rpe-root svg")).toBeVisible();
  await expect(page.locator("#rpe-root")).toContainText("V4"); // gradeDisplayLabel("6B", "boulder")
  await expect(page.locator("#rpe-root")).toContainText("V5"); // gradeDisplayLabel("6C", "boulder")
});

test("opens and closes the evidence-tier overlay", async ({ page }) => {
  await mockApi(page, { settings: { athleteMode: true, activeDiscipline: "boulder" } });
  await page.goto("/e2e-fixtures/pages/performance-rpe.html");

  await page.locator("[data-evidence-tier]").click();
  await expect(page.locator("#evidence-overlay")).toBeVisible();
  await expect(page.locator("#evidence-overlay")).toContainText("Peer-reviewed");
  await page.locator("#evidence-close").click();
  await expect(page.locator("#evidence-overlay")).toBeHidden();
});

test("switching the time window to 12mo re-fetches with a wider range", async ({ page }) => {
  let lastRequestUrl = null;
  await mockApi(page, { settings: { athleteMode: true, activeDiscipline: "boulder" } });
  await page.route("**/logbook/api/performance/rpe**", route => {
    lastRequestUrl = route.request().url();
    return route.fulfill({ json: { boulder: { buckets: [], maxGradeByBucket: [], avgExertionByBucket: [], headline: null }, lead: { buckets: [], maxGradeByBucket: [], avgExertionByBucket: [], headline: null } } });
  });
  await page.goto("/e2e-fixtures/pages/performance-rpe.html");
  // Same race #15's own performance-trends-page.spec.js documents.
  await expect.poll(() => lastRequestUrl).not.toBeNull();
  const initialUrl = lastRequestUrl;

  await page.locator('[data-window="12mo"]').click();
  await expect.poll(() => lastRequestUrl).not.toBe(initialUrl);

  const initialStart = new URL(initialUrl).searchParams.get("start");
  const twelveMoStart = new URL(lastRequestUrl).searchParams.get("start");
  expect(new Date(twelveMoStart).getTime()).toBeLessThan(new Date(initialStart).getTime());
});

test("shows the offline message instead of the chart when the fetch fails", async ({ page }) => {
  await mockApi(page, { settings: { athleteMode: true, activeDiscipline: "boulder" } });
  await page.route("**/logbook/api/performance/rpe**", route => route.fulfill({ status: 500 }));
  await page.goto("/e2e-fixtures/pages/performance-rpe.html");

  await expect(page.locator("#performance-offline")).toBeVisible();
  await expect(page.locator("#rpe-root")).toBeHidden();
});

test("redirects to /log when Athlete Mode is off", async ({ page }) => {
  await mockApi(page, { settings: { athleteMode: false, activeDiscipline: "boulder" } });
  await page.goto("/e2e-fixtures/pages/performance-rpe.html");

  await page.waitForURL(/\/log$/);
});
```

- [ ] **Step 3: Run the tests, confirm they fail**

Run: `pnpm run e2e:build-fixtures && pnpm exec playwright test e2e/performance-rpe-page.spec.js`
Expected: FAIL until Step 1's `mockApi()` extension is correctly connected — fix any real mismatch before treating this as a real product-code failure.

- [ ] **Step 4: Fix any real issues, re-run until green**

Run: `pnpm exec playwright test e2e/performance-rpe-page.spec.js`
Expected: PASS (6 tests)

- [ ] **Step 5: Run the full e2e suite twice**

Run: `pnpm exec playwright test` (twice)
Expected: PASS both times (modulo the one known pre-existing, unrelated `register.spec.js` Turnstile/Resend flake, already root-caused in #588).

- [ ] **Step 6: Run the full unit suite one final time**

Run: `pnpm test`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add e2e/mock-api.js e2e/performance-rpe-page.spec.js
git commit -m "Add e2e coverage for the RPE/effort trend view (#38)"
```

CRITICAL: run every command in this task directly and synchronously (in the foreground, or via a tracked background invocation whose completion you actually wait for before proceeding) — never fire-and-forget an e2e run.

---

## Final Verification

- [ ] `pnpm test` — full pass
- [ ] `pnpm exec playwright test` — full pass, twice (modulo the one known pre-existing, unrelated flake in `register.spec.js`)
- [ ] Manual: `pnpm dev`, log in, add sends across a few different months/grades with varying Exertion % values, confirm the chart and confidence-gated headline both behave correctly for both disciplines and all three window modes, and confirm all three headline branches are individually reachable with constructed test data.
- [ ] Confirm the hub page (`/performance`) now shows all six tiles, and the new tile's "View" link navigates to `/performance/rpe`.
- [ ] Confirm `server/api/public-data.js` has no route to `/logbook/api/performance/rpe` (same check every prior deliverable's final review has run).
- [ ] Confirm `git log --oneline` shows 5 task commits, each independently reviewable.
- [ ] This is epic #5 Phase 2's final view — once merged, confirm with the user whether the whole epic (and any deferred items like `#579`) should be closed out, rather than assuming unilaterally.
