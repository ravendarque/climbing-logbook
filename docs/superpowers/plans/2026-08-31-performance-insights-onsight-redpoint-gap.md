# Performance Insights: Onsight-to-Redpoint Gap Tracking (#14) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `/:username/performance/gap` — a compound chart showing two overlaid grade trend lines (first-attempt-success max grade vs. eventual-send max grade) with an attempts-to-send bar layer behind them, framed as a soft personal benchmark rather than a hard target, with an explicit "Community data" evidence-tier citation.

**Architecture:** Reuses `client/combo-chart.js` and `client/time-window.js` (#15) as-is — this is exactly the second consumer those modules were built to serve, validating their genuinely-generic N-bar/M-line design (this view is the first to actually use M > 1 line series). Server-side aggregation (`shared/gap-stats.js`, mirroring `shared/volume-stats.js`'s own structure and reusing its `monthBuckets`/`bucketLabel`/`gradeDisplayLabel` helpers directly rather than duplicating them) computed in a new `handleGetGap` handler in `server/api/performance.js`. New shared UI infrastructure: `client/evidence-tier.js`, a small evidence-tier chip/overlay generator extracted on its own second real consumer (`client/components/climbing-grade-pyramid.js`'s hand-rolled version is the first; #38 will be the third) — matching this exact codebase's own stated philosophy for when a shared component earns its keep (see that file's own header comment). Discipline-specific terminology (flash/onsight, send/redpoint) reuses `client/status.js`'s existing `flashLabel`/`sendLabel` helpers directly — no new terminology lookup needed.

**Tech Stack:** Cloudflare Workers + D1, Vitest, Playwright, esbuild, Tailwind v4, the existing hand-rolled SVG combo-chart (no charting library).

**Spec:** `docs/superpowers/specs/2026-08-27-performance-insights-ui-design.md` (the "#14 onsight/redpoint gap: interaction design" section, plus the general "Chart legibility principles" and "Shared combo-chart component"/"Shared time-window control" sections already implemented by #15) and `docs/climbing-analytics-research.md` (§"A related, weaker data point: onsight-to-redpoint gap" for the exact community-data framing and citations).

## Global Constraints

- **Route is `/performance/gap`**, per the design doc's own Routes table (`| /performance/gap | Onsight-to-redpoint gap (#14) | new |`).
- **Sends only, per-discipline** — matches every prior Performance Insights aggregate in this epic. The "first-attempt-success" line is a strict subset of sends (`status === "send" && firstAttempt === true`); the "eventual-send" line is the full sends population (`status === "send"`, regardless of `firstAttempt`) — identical scoping to `shared/volume-stats.js`'s own `maxGradeByBucket`.
- **Monthly bucketing, `start`/`end` query params, date-shape + 120-month span validation from the start** — this endpoint is in `PUBLIC_GET_ROUTES` (no session required) exactly like `handleGetVolume`, so it needs the same unauthenticated-amplification guard `handleGetVolume` has (added there in #15's own final-review fix wave) applied from the outset here, not discovered again in a second review cycle.
- **Discipline-specific terminology via `client/status.js`'s existing `flashLabel(type, plural)`/`sendLabel(type, plural)`** — boulder: Flash/Send; lead: Onsight/Redpoint. Do not build a new lookup; import and reuse these directly. `shared/gap-stats.js`'s own server-computed headline text needs the same two words but cannot import a `client/*.js` module from a `shared/*.js` module computed server-side (breaks this codebase's established shared/client layering) — it gets its own small, self-contained two-entry lookup (`{boulder: "flash", lead: "onsight"}` / `{boulder: "send", lead: "redpoint"}`), the same "duplicate a tiny fixed vocabulary rather than reach across a layer boundary" tradeoff `shared/strengths-stats.js`'s own `WALL_ANGLE_ADJECTIVE` already made.
- **Two line series on one ordinal grade axis, one bar series behind them** — validates `client/combo-chart.js`'s genuinely-generic `lines: Array<{...}>` support (#15 only ever passed one line series; this is the first real M > 1 consumer). Both lines share the same `positionOrder` (the discipline's full grade list) since both represent grade values on the same axis. The bar series (average attempts-to-send per bucket) gets the y-axis #15's fix wave already added to `client/combo-chart.js` — no chart-component changes needed for this task, it's pure reuse.
- **Evidence-tier chip: "Community data"** (the pink `--color-tier-community` design token, already defined in `styles/tailwind.css` but unused by any real component until this task) — the 8a.nu/Climbstat reference data is a single data-analysis layer, not peer-reviewed research, so it must not be presented as settled fact. Citations (from `docs/climbing-analytics-research.md`'s own reference list): "Onsights up to four grades harder than redpoint." 8a.nu News, `https://www.8a.nu/news/onsight-49849`; "How much harder is onsighting vs redpointing?" Climbstat, `http://climbstat.blogspot.com/2020/02/how-much-harder-is-onsighting-vs.html`.
- **`client/evidence-tier.js` is new shared infrastructure, built on its second real consumer** — `client/components/climbing-grade-pyramid.js`'s existing hand-rolled tier-chip/evidence-overlay markup is the first consumer and is explicitly **not** retrofitted to use this new module as part of this plan (it works today, retrofitting it is unrelated scope creep for this deliverable — a candidate follow-up issue, not built here). `client/evidence-tier.js` lives in `client/` (not `shared/`) — it's presentational HTML generation, the same granularity as `client/combo-chart.js`/`client/row-card.js`, never needed server-side.
- **Ruling — headline sentence.** The design doc's own "#14" subsection doesn't give exact headline copy (unlike #38's worked examples) — only the general principle that every time-series view needs one. This plan's own wording: compare the window's single best first-attempt-success grade against its single best eventual-send grade (not a per-bucket comparison — flash and send bests can legitimately occur in different months, and the headline is about what's been demonstrated across the whole window, not forcing a same-bucket pairing). If the gap is zero or negative (best flash/onsight already matches or beats best send/redpoint), say so plainly rather than reporting a nonsensical negative gap.
- **Ruling — attempts-to-send bar values are the average, rounded to one decimal place**, not a raw integer count (unlike #15's send-count bars, which are naturally integers) — `Math.round(x * 10) / 10`. A bucket with no `attemptsToSend` data at all reports `0` (consistent with `shared/volume-stats.js`'s own "no data = 0" convention for its bar series).
- **`entries.deleted_at IS NULL` filtering already handled** via `listForUser(env, "entries", userId, rowToJson, {excludeDeleted: true})`, same call every other `performance.js` handler already makes.
- **Security**: this endpoint gets the same anonymous-caller and cross-user-isolation tests every performance endpoint in this epic has had since #584/#585, and the final review re-verifies `server/api/public-data.js` has no route to it.
- **Test commands**: `pnpm test` (Vitest), `pnpm exec playwright test` (Playwright, run twice for idempotency).
- **Deploy classification: beta-only, no migrations touched.** Do **not** run `promote.yml` after merge — stays on beta same as every prior deliverable in this epic.

---

## Task 1: `client/evidence-tier.js` — shared evidence-tier chip + overlay component

**Files:**
- Create: `client/evidence-tier.js`
- Test: `test/client/evidence-tier.test.js` (pure string generation, no DOM — runs on the plain "workers" Vitest project, same reasoning as `client/combo-chart.js`'s own tests)

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: `evidenceOverlayHtml(tierKeys)` → an HTML string for the `#evidence-overlay` dialog, listing only the given tier keys (`"peer" | "heuristic" | "community"`), same DOM structure/ids/classes `climbing-grade-pyramid.js`'s own hand-rolled version already uses (so it participates in the same `createModalHelpers(["evidence-overlay"])` wiring convention). `evidenceTierButtonHtml(text, tierKey)` → an inline clickable-text trigger, same markup shape as the pyramid component's own `evidenceTierText()` but parameterized by tier (that one is hardcoded to "heuristic" since it only ever needed one tier).

- [ ] **Step 1: Write the failing tests**

Create `test/client/evidence-tier.test.js`:

```js
import { describe, expect, it } from "vitest";
import { evidenceOverlayHtml, evidenceTierButtonHtml } from "../../client/evidence-tier.js";

describe("evidenceOverlayHtml", () => {
  it("renders the dialog shell with the required id and ARIA attributes", () => {
    const html = evidenceOverlayHtml(["community"]);
    expect(html).toContain('id="evidence-overlay"');
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('id="evidence-close"');
  });

  it("renders only the requested tiers, not every tier", () => {
    const html = evidenceOverlayHtml(["community"]);
    expect(html).toContain("Community data");
    expect(html).not.toContain("Peer-reviewed");
    expect(html).not.toContain("Coaching heuristic");
  });

  it("renders multiple requested tiers", () => {
    const html = evidenceOverlayHtml(["peer", "community"]);
    expect(html).toContain("Peer-reviewed");
    expect(html).toContain("Community data");
    expect(html).not.toContain("Coaching heuristic");
  });

  it("renders an empty tier list without throwing", () => {
    expect(() => evidenceOverlayHtml([])).not.toThrow();
  });

  it("throws on an unrecognized tier key rather than silently omitting it", () => {
    expect(() => evidenceOverlayHtml(["not-a-real-tier"])).toThrow();
  });
});

describe("evidenceTierButtonHtml", () => {
  it("renders the given text as the button's own label", () => {
    const html = evidenceTierButtonHtml("community data", "community");
    expect(html).toContain(">community data<");
  });

  it("marks the button with data-evidence-tier for click-delegation wiring", () => {
    const html = evidenceTierButtonHtml("community data", "community");
    expect(html).toContain("data-evidence-tier");
  });

  it("escapes HTML-significant characters in the button text", () => {
    const html = evidenceTierButtonHtml("<script>", "community");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
```

- [ ] **Step 2: Run the tests, confirm they fail**

Run: `pnpm exec vitest run test/client/evidence-tier.test.js`
Expected: FAIL — `client/evidence-tier.js` doesn't exist yet.

- [ ] **Step 3: Implement `client/evidence-tier.js`**

```js
// Shared evidence-tier chip + overlay component (#14, epic #5 Phase 2) --
// extracted on its second real consumer. client/components/climbing-
// grade-pyramid.js's own hand-rolled tier-chip/evidence-overlay markup
// (peer + heuristic tiers, #516) is the first consumer -- this codebase's
// own established rule (see that file's header comment) is that a shared
// component earns its keep on a second real consumer, not speculatively
// ahead of one. #38 (RPE/effort trend) is the confirmed third consumer
// (its own "Peer-reviewed" chip, per the design doc). Deliberately NOT
// retrofitting climbing-grade-pyramid.js to use this module as part of
// this task -- that component works today; retrofitting it is unrelated
// scope, a candidate follow-up, not built here.
//
// Same client/-not-shared/ placement as client/combo-chart.js/client/
// row-card.js -- pure presentational HTML generation, never needed
// server-side. Pure string generation, no DOM dependency, same "tests
// run on the plain workers Vitest project" property client/combo-
// chart.js's own tests already have.
import { escapeHtml } from "./escape-html.js";

const PEER_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3Z"></path><path d="M9.5 12l1.8 1.8L15 10"></path></svg>`;
const HEURISTIC_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5v-15Z"></path><path d="M4 20.5A2.5 2.5 0 0 1 6.5 18H20"></path></svg>`;
const COMMUNITY_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>`;

// Same three-part shape (label/svg/description) climbing-grade-
// pyramid.js's own overlay markup already encodes inline -- peer/
// heuristic text copied verbatim from there for consistency (same claim,
// same wording, wherever it appears). "community" is new: the 8a.nu/
// Climbstat reference data this epic's #14 needs is a single data-
// analysis layer, not peer-reviewed research or an established coaching
// rule of thumb -- a third, weaker tier, not a synonym for either.
const TIER_DEFINITIONS = {
  peer: {
    className: "tier-peer",
    label: "Peer-reviewed",
    icon: PEER_ICON,
    description: "Backed by published, peer-reviewed research.",
  },
  heuristic: {
    className: "tier-heuristic",
    label: "Coaching heuristic",
    icon: HEURISTIC_ICON,
    description: "A widely used rule of thumb from coaching practice, not (yet) validated by peer-reviewed research.",
  },
  community: {
    className: "tier-community",
    label: "Community data",
    icon: COMMUNITY_ICON,
    description: "Derived from self-reported community logging data (e.g. 8a.nu), not a controlled or peer-reviewed study.",
  },
};

function tierListItemHtml(tierKey) {
  const tier = TIER_DEFINITIONS[tierKey];
  if (!tier) throw new Error(`Unknown evidence tier: ${tierKey}`);
  return `<li>
    <span class="tier-chip inline-flex items-center gap-[.35rem] py-[.3rem] pr-[.7rem] pl-[.55rem] rounded-full text-[.74rem] font-semibold border border-[color-mix(in_srgb,var(--color-${tier.className})_35%,transparent)] text-${tier.className} bg-[color-mix(in_srgb,var(--color-${tier.className})_14%,var(--color-surface))] [&_svg]:w-[.95rem] [&_svg]:h-[.95rem] [&_svg]:shrink-0 mb-2">
      ${tier.icon}
      ${escapeHtml(tier.label)}
    </span>
    <p class="text-[.82rem] leading-[1.5] text-foreground m-0">${escapeHtml(tier.description)}</p>
  </li>`;
}

export function evidenceOverlayHtml(tierKeys) {
  const itemsHtml = tierKeys.map(tierListItemHtml).join("");
  return `<div class="fixed inset-0 z-[100] bg-[color-mix(in_srgb,black_60%,transparent)] flex items-center justify-center px-4 py-6 overflow-y-auto" id="evidence-overlay" hidden role="dialog" aria-modal="true" aria-labelledby="evidence-title" tabindex="-1">
    <div class="bg-background border border-border rounded-app p-5 w-full max-w-[380px]">
      <div class="flex items-center justify-between mb-[14px]">
        <span class="text-[1.05rem] font-bold text-accent" id="evidence-title">Evidence tiers</span>
        <button type="button" class="inline-flex items-center justify-center w-8 h-8 border-none bg-transparent text-muted text-[1.1rem] leading-none cursor-pointer hover:text-foreground" id="evidence-close" aria-label="Close evidence tiers dialog">✕</button>
      </div>
      <p class="text-[.82rem] text-muted leading-[1.5] mb-4">Claims in the app are tagged by how well-supported they are, so nothing reads as more authoritative than it actually is.</p>
      <ul class="m-0 p-0 list-none [&>li+li]:mt-4">${itemsHtml}</ul>
    </div>
  </div>`;
}

const TIER_TEXT_COLOR = { peer: "text-tier-peer", heuristic: "text-tier-heuristic", community: "text-tier-community" };

export function evidenceTierButtonHtml(text, tierKey) {
  const colorClass = TIER_TEXT_COLOR[tierKey];
  if (!colorClass) throw new Error(`Unknown evidence tier: ${tierKey}`);
  const tierLabel = TIER_DEFINITIONS[tierKey].label;
  return `<button type="button" class="text-[.82rem] font-bold ${colorClass} bg-transparent border-0 p-0 m-0 cursor-pointer hover:brightness-90" data-evidence-tier aria-label="${escapeHtml(text)} -- evidence tier: ${escapeHtml(tierLabel.toLowerCase())}, tap to learn more">${escapeHtml(text)}</button>`;
}
```

- [ ] **Step 4: Run the tests, confirm they pass**

Run: `pnpm exec vitest run test/client/evidence-tier.test.js`
Expected: PASS (9 tests)

- [ ] **Step 5: Run the full suite to confirm no regressions**

Run: `pnpm test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add client/evidence-tier.js test/client/evidence-tier.test.js
git commit -m "Add client/evidence-tier.js: shared evidence-tier chip + overlay component"
```

---

## Task 2: `shared/gap-stats.js` — pure onsight/redpoint gap aggregation

**Files:**
- Create: `shared/gap-stats.js`
- Test: `test/shared/gap-stats.test.js`

**Interfaces:**
- Consumes: `shared/volume-stats.js`'s existing `monthBuckets`, `bucketLabel`, `gradeDisplayLabel` (all already exported, reused directly rather than duplicated); `shared/grade-data.js`'s `gradeRank`.
- Produces: `gapByBucket(entries, buckets)` → `{ flashMaxByBucket: Array<string|null>, sendMaxByBucket: Array<string|null>, avgAttemptsByBucket: number[] }` (raw internal grade codes in both grade arrays, same "positionKey stays raw, display formatting happens at the client" convention `shared/volume-stats.js` already established). `gapHeadline(flashMaxByBucket, sendMaxByBucket, type)` → `string`.

- [ ] **Step 1: Write the failing tests**

Create `test/shared/gap-stats.test.js`:

```js
import { describe, expect, it } from "vitest";
import { gapByBucket, gapHeadline } from "../../shared/gap-stats.js";

function entry(overrides = {}) {
  return { date: "2026-01-15", status: "send", grade: "6B", type: "boulder", firstAttempt: false, attemptsToSend: null, ...overrides };
}

describe("gapByBucket", () => {
  it("ignores non-send entries entirely", () => {
    const { sendMaxByBucket } = gapByBucket([entry({ status: "project" })], ["2026-01"]);
    expect(sendMaxByBucket).toEqual([null]);
  });

  it("tracks the highest send grade per bucket regardless of firstAttempt", () => {
    const entries = [entry({ grade: "6B", firstAttempt: false }), entry({ grade: "7A", firstAttempt: true, date: "2026-01-20" })];
    const { sendMaxByBucket } = gapByBucket(entries, ["2026-01"]);
    expect(sendMaxByBucket).toEqual(["7A"]);
  });

  it("tracks the highest first-attempt-success grade per bucket separately", () => {
    const entries = [entry({ grade: "6B", firstAttempt: true }), entry({ grade: "7A", firstAttempt: false, date: "2026-01-20" })];
    const { flashMaxByBucket, sendMaxByBucket } = gapByBucket(entries, ["2026-01"]);
    expect(flashMaxByBucket).toEqual(["6B"]);
    expect(sendMaxByBucket).toEqual(["7A"]);
  });

  it("reports null flashMax for a bucket with sends but no first-attempt sends", () => {
    const { flashMaxByBucket } = gapByBucket([entry({ firstAttempt: false })], ["2026-01"]);
    expect(flashMaxByBucket).toEqual([null]);
  });

  it("averages attemptsToSend per bucket, ignoring entries with no value", () => {
    const entries = [entry({ attemptsToSend: 2 }), entry({ attemptsToSend: 4, date: "2026-01-20" }), entry({ attemptsToSend: null, date: "2026-01-25" })];
    const { avgAttemptsByBucket } = gapByBucket(entries, ["2026-01"]);
    expect(avgAttemptsByBucket).toEqual([3]);
  });

  it("rounds the average attempts to one decimal place", () => {
    const entries = [entry({ attemptsToSend: 1 }), entry({ attemptsToSend: 2, date: "2026-01-20" }), entry({ attemptsToSend: 2, date: "2026-01-25" })];
    const { avgAttemptsByBucket } = gapByBucket(entries, ["2026-01"]);
    expect(avgAttemptsByBucket).toEqual([1.7]);
  });

  it("reports 0 average attempts for a bucket with no attemptsToSend data", () => {
    const { avgAttemptsByBucket } = gapByBucket([entry({ attemptsToSend: null })], ["2026-01"]);
    expect(avgAttemptsByBucket).toEqual([0]);
  });

  it("ignores an entry whose date falls outside every given bucket", () => {
    const { sendMaxByBucket } = gapByBucket([entry({ date: "2020-01-01" })], ["2026-01"]);
    expect(sendMaxByBucket).toEqual([null]);
  });

  it("places each entry in its own correct bucket across multiple buckets", () => {
    const entries = [entry({ date: "2026-01-05", grade: "6B" }), entry({ date: "2026-02-10", grade: "7A", firstAttempt: true })];
    const { flashMaxByBucket, sendMaxByBucket } = gapByBucket(entries, ["2026-01", "2026-02"]);
    expect(sendMaxByBucket).toEqual(["6B", "7A"]);
    expect(flashMaxByBucket).toEqual([null, "7A"]);
  });
});

describe("gapHeadline", () => {
  it("reports no sends when the window is empty", () => {
    expect(gapHeadline([null, null], [null, null], "boulder")).toBe("No sends logged in this window yet.");
  });

  it("reports no flash/onsight sends yet when only sendMax data exists", () => {
    const text = gapHeadline([null, null], ["6B", "7A"], "boulder");
    expect(text).toContain("No flash sends logged in this window yet");
    expect(text).toContain("V4"); // gradeDisplayLabel("7A", "boulder")
  });

  it("uses lead terminology for a lead entry", () => {
    const text = gapHeadline([null], ["6a"], "lead");
    expect(text).toContain("onsight");
    expect(text).toContain("redpoint");
  });

  it("reports the gap in grade-steps when both series have data", () => {
    // "5" and "7A" are 6 ranks apart in GRADE_ORDER
    const text = gapHeadline(["5"], ["7A"], "boulder");
    expect(text).toMatch(/grade-steps? ahead/);
  });

  it("reports a matched/beaten gap when flash max is at or above send max", () => {
    const text = gapHeadline(["7A"], ["7A"], "boulder");
    expect(text).toContain("matches or beats");
  });
});
```

- [ ] **Step 2: Run the tests, confirm they fail**

Run: `pnpm exec vitest run test/shared/gap-stats.test.js`
Expected: FAIL — `shared/gap-stats.js` doesn't exist yet.

- [ ] **Step 3: Implement `shared/gap-stats.js`**

```js
// #14 (epic #5 Phase 2) -- pure, DOM-free aggregation over entries data,
// computed server-side (server/api/performance.js), same convention as
// every other shared/*-stats.js module in this epic. Reuses shared/
// volume-stats.js's own monthBuckets/bucketLabel/gradeDisplayLabel
// directly rather than duplicating them -- both modules bucket by
// calendar month over the same entries shape, no reason to reimplement
// that here.
import { gradeDisplayLabel } from "./volume-stats.js";
import { gradeRank } from "./grade-data.js";

export function gapByBucket(entries, buckets) {
  const bucketIndex = Object.fromEntries(buckets.map((b, i) => [b, i]));
  const flashMaxByBucket = buckets.map(() => null);
  const sendMaxByBucket = buckets.map(() => null);
  const attemptsSumByBucket = buckets.map(() => 0);
  const attemptsCountByBucket = buckets.map(() => 0);

  for (const entry of entries) {
    if (entry.status !== "send" || !entry.date) continue;
    const idx = bucketIndex[entry.date.slice(0, 7)];
    if (idx === undefined) continue;

    if (sendMaxByBucket[idx] === null || gradeRank(entry.grade) > gradeRank(sendMaxByBucket[idx])) {
      sendMaxByBucket[idx] = entry.grade;
    }
    if (entry.firstAttempt && (flashMaxByBucket[idx] === null || gradeRank(entry.grade) > gradeRank(flashMaxByBucket[idx]))) {
      flashMaxByBucket[idx] = entry.grade;
    }
    if (entry.attemptsToSend !== null && entry.attemptsToSend !== undefined) {
      attemptsSumByBucket[idx] += entry.attemptsToSend;
      attemptsCountByBucket[idx]++;
    }
  }

  const avgAttemptsByBucket = attemptsCountByBucket.map((count, i) =>
    count ? Math.round((attemptsSumByBucket[i] / count) * 10) / 10 : 0
  );

  return { flashMaxByBucket, sendMaxByBucket, avgAttemptsByBucket };
}

// Small, self-contained vocabulary duplication of client/status.js's own
// flashLabel/sendLabel -- this function is server-computed (like every
// other headline generator in this epic), and a shared/*.js module
// computed server-side can't import a client/*.js module without
// breaking this codebase's established shared/client layering. See this
// plan's own Global Constraints for the full reasoning -- same tradeoff
// shared/strengths-stats.js's own WALL_ANGLE_ADJECTIVE already made.
const FLASH_TERM = { boulder: "flash", lead: "onsight" };
const SEND_TERM = { boulder: "send", lead: "redpoint" };

// Compares the window's single best first-attempt-success grade against
// its single best eventual-send grade -- not a per-bucket comparison,
// since the two bests can legitimately land in different months and the
// headline is about what's been demonstrated across the whole window.
export function gapHeadline(flashMaxByBucket, sendMaxByBucket, type) {
  const flashTerm = FLASH_TERM[type];
  const sendTerm = SEND_TERM[type];

  const sendGrades = sendMaxByBucket.filter(g => g !== null);
  if (sendGrades.length === 0) return "No sends logged in this window yet.";
  const bestSend = sendGrades.reduce((best, g) => (gradeRank(g) > gradeRank(best) ? g : best));

  const flashGrades = flashMaxByBucket.filter(g => g !== null);
  if (flashGrades.length === 0) {
    return `No ${flashTerm} sends logged in this window yet -- your best ${sendTerm} is ${gradeDisplayLabel(bestSend, type)}.`;
  }
  const bestFlash = flashGrades.reduce((best, g) => (gradeRank(g) > gradeRank(best) ? g : best));

  const gap = gradeRank(bestSend) - gradeRank(bestFlash);
  if (gap <= 0) {
    return `Your best ${flashTerm} (${gradeDisplayLabel(bestFlash, type)}) matches or beats your best ${sendTerm} (${gradeDisplayLabel(bestSend, type)}) this window.`;
  }
  return `Your best ${sendTerm} (${gradeDisplayLabel(bestSend, type)}) is ${gap} grade-step${gap === 1 ? "" : "s"} ahead of your best ${flashTerm} (${gradeDisplayLabel(bestFlash, type)}) this window.`;
}
```

- [ ] **Step 4: Run the tests, confirm they pass**

Run: `pnpm exec vitest run test/shared/gap-stats.test.js`
Expected: PASS (14 tests)

- [ ] **Step 5: Run the full suite to confirm no regressions**

Run: `pnpm test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add shared/gap-stats.js test/shared/gap-stats.test.js
git commit -m "Add shared/gap-stats.js: flash/send max-grade + avg-attempts bucketing"
```

---

## Task 3: `server/api/performance.js` — the gap endpoint

**Files:**
- Modify: `server/api/performance.js`
- Modify: `server/index.js` (route registration)
- Test: `test/performance.test.js` (existing file — add a new `describe("handleGetGap", ...)` block alongside the four existing ones)

**Interfaces:**
- Consumes: Task 2's `shared/gap-stats.js` (`gapByBucket`, `gapHeadline`).
- Produces: `handleGetGap(request, env, userId)` → `{ boulder: { buckets, flashMaxByBucket, sendMaxByBucket, avgAttemptsByBucket, headline }, lead: {...} }` for `?start=YYYY-MM-DD&end=YYYY-MM-DD` (same validation as `handleGetVolume`: missing → 400, malformed → 400, span over 120 months → 400). Registered at `/logbook/api/performance/gap` in `server/index.js`'s `PUBLIC_GET_ROUTES`.

- [ ] **Step 1: Write the failing tests**

Read the real, current `test/performance.test.js` file first to confirm the exact helper names/signatures (`fetchJson`, `postEntry`, `del`, `createAuthedSession`, `cookie`) already established by the four existing `describe` blocks, then append a new block after `describe("handleGetVolume", ...)` following that file's own real conventions exactly. The test cases below use those same helper names as a starting point — adapt them to match whatever the real file actually has if anything differs:

```js
const GAP_URL = "/logbook/api/performance/gap";
function getGap(params, extraCookie = cookie) {
  const qs = new URLSearchParams(params).toString();
  return fetchJson(`${GAP_URL}?${qs}`, { headers: { Cookie: extraCookie } });
}

describe("handleGetGap", () => {
  it("returns 400 when start or end is missing", async () => {
    expect((await getGap({ end: "2026-03-01" })).status).toBe(400);
    expect((await getGap({ start: "2026-01-01" })).status).toBe(400);
  });

  it("returns 400 for a malformed date", async () => {
    expect((await getGap({ start: "not-a-date", end: "2026-03-01" })).status).toBe(400);
  });

  it("returns 400 for a span exceeding 120 months", async () => {
    expect((await getGap({ start: "0001-01-01", end: "9999-12-31" })).status).toBe(400);
  });

  it("returns empty per-bucket data for a user with no sends in the window", async () => {
    await postEntry({ date: "2020-01-01" }); // outside the window
    const { boulder } = await (await getGap({ start: "2026-01-01", end: "2026-03-01" })).json();
    expect(boulder.buckets).toEqual(["Jan 2026", "Feb 2026", "Mar 2026"]);
    expect(boulder.sendMaxByBucket).toEqual([null, null, null]);
    expect(boulder.headline).toBe("No sends logged in this window yet.");
  });

  it("reflects real sends within the window, split by discipline and firstAttempt", async () => {
    await postEntry({ type: "boulder", grade: "6B", date: "2026-02-10", firstAttempt: true });
    await postEntry({ type: "lead", grade: "6a", date: "2026-02-15", firstAttempt: false });
    const body = await (await getGap({ start: "2026-01-01", end: "2026-03-01" })).json();
    expect(body.boulder.flashMaxByBucket).toEqual([null, "6B", null]);
    expect(body.lead.flashMaxByBucket).toEqual([null, null, null]);
    expect(body.lead.sendMaxByBucket).toEqual([null, "6a", null]);
  });

  it("excludes a soft-deleted entry", async () => {
    const created = await (await postEntry({ date: "2026-02-10" })).json();
    await del(created.entries[0].id);
    const { boulder } = await (await getGap({ start: "2026-01-01", end: "2026-03-01" })).json();
    expect(boulder.sendMaxByBucket).toEqual([null, null, null]);
  });

  it("returns empty per-bucket data for an anonymous caller", async () => {
    const res = await fetchJson(`${GAP_URL}?start=2026-01-01&end=2026-03-01`);
    expect(res.status).toBe(200);
    const { boulder } = await res.json();
    expect(boulder.sendMaxByBucket).toEqual([null, null, null]);
  });

  it("a second user's own request never reflects the first user's sends", async () => {
    await postEntry({ date: "2026-02-10" });
    const userB = await createAuthedSession();
    const { boulder } = await (await getGap({ start: "2026-01-01", end: "2026-03-01" }, userB.cookie)).json();
    expect(boulder.sendMaxByBucket).toEqual([null, null, null]);
  });
});
```

- [ ] **Step 2: Run the tests, confirm they fail**

Run: `pnpm exec vitest run test/performance.test.js -t "handleGetGap"`
Expected: FAIL — `handleGetGap` doesn't exist and isn't routed yet.

- [ ] **Step 3: Implement `handleGetGap`**

In `server/api/performance.js`, add the import (alongside the existing `volume-stats.js` import line):

```js
import { gapByBucket, gapHeadline } from "../../shared/gap-stats.js";
```

Add the handler after `handleGetVolume`, reusing the exact same `DATE_SHAPE`/`MAX_VOLUME_MONTHS`-style validation already defined above it in the file (rename `MAX_VOLUME_MONTHS` to the more general `MAX_WINDOW_MONTHS` and reuse it for both handlers, rather than defining a second identical constant):

```js
// #14 -- same online-only, server-computed, start/end-validated
// convention as handleGetVolume immediately above (this route is also in
// PUBLIC_GET_ROUTES with no session required, so it needs the identical
// date-shape + span-cap validation from the start, not discovered again
// in a second review cycle).
export async function handleGetGap(request, env, userId) {
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
    const { flashMaxByBucket, sendMaxByBucket, avgAttemptsByBucket } = gapByBucket(rows.filter(e => e.type === type), buckets);
    return {
      buckets: buckets.map(bucketLabel),
      flashMaxByBucket,
      sendMaxByBucket,
      avgAttemptsByBucket,
      headline: gapHeadline(flashMaxByBucket, sendMaxByBucket, type),
    };
  }

  return json({ boulder: forDiscipline("boulder"), lead: forDiscipline("lead") }, 200, { "Cache-Control": "no-store" });
}
```

Rename the existing `MAX_VOLUME_MONTHS` constant (and its one use in `handleGetVolume`) to `MAX_WINDOW_MONTHS` so both handlers share the one constant rather than each defining their own copy of the same 120-month cap.

Update `server/index.js`'s import (currently `import { handleGetInjuryLog, handleGetPyramid, handleGetStrengthsWeaknesses, handleGetVolume } from "./api/performance.js";`):

```js
import { handleGetGap, handleGetInjuryLog, handleGetPyramid, handleGetStrengthsWeaknesses, handleGetVolume } from "./api/performance.js";
```

Add the route to `PUBLIC_GET_ROUTES`, directly after the existing volume entry:

```js
  "/logbook/api/performance/volume": handleGetVolume,
  // #14 -- same public-GET + server-side-computed convention as the four
  // routes above.
  "/logbook/api/performance/gap": handleGetGap,
```

- [ ] **Step 4: Run the tests, confirm they pass**

Run: `pnpm exec vitest run test/performance.test.js -t "handleGetGap"`
Expected: PASS (8 tests)

- [ ] **Step 5: Run the full unit suite to confirm no regressions**

Run: `pnpm test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add server/api/performance.js server/index.js test/performance.test.js
git commit -m "Add the /performance/gap endpoint (#14)"
```

---

## Task 4: Route plumbing — hub tile, shell, composition-root skeleton

**Files:**
- Create: `public/performance/gap/index.html`
- Create: `client/performance-gap-main.js`
- Modify: `client/performance-hub-main.js` (add to `INSIGHTS`)
- Modify: `server/api/owned-routes.js` (add to `SHELL_PATHS`)
- Modify: `server/index.js` (extend the owned-route regex, both occurrences)
- Modify: `package.json` (new `performance-gap:build`/`:watch` scripts, `pages:build`, `dev:raw`/`dev:vite`, `e2e:build-fixtures`)
- Modify: `scripts/dev.mjs` (add to the `-n`/`-c`/command lists)
- Modify: `.gitignore` (new bundle-output entry + comment enumeration)
- Modify: `client/store.js` (add `"performance-gap"` to the documented `activeView` union)
- Test: `test/owned-routes.test.js` (new shell-serving test, following the existing tests' exact two-assertion pattern)

**Interfaces:**
- Consumes: Task 3's `/logbook/api/performance/gap` endpoint, Task 1's `evidenceOverlayHtml`/`evidenceTierButtonHtml`, `client/combo-chart.js`'s `renderComboChartHtml` (#15), `client/time-window.js`'s `createTimeWindowControl` (#15).
- Produces: a real, navigable `/:username/performance/gap` route. Task 5 fills in this composition root's actual rendering/evidence-tier logic (currently a placeholder shell in this task, matching #15's own Task 5/Task 6 split).

- [ ] **Step 1: Add the hub tile**

In `client/performance-hub-main.js`, add to the `INSIGHTS` array (after the existing trends entry):

```js
  {
    id: "insight-gap",
    title: "Onsight / Redpoint Gap",
    description: "Compare your first-try sends against what you eventually send once you've worked a climb, and see how many attempts it typically takes.",
    route: "gap",
  },
```

- [ ] **Step 2: Register the shell path and extend the owned-route regex**

In `server/api/owned-routes.js`, add to `SHELL_PATHS` (directly after the existing `"performance/trends"` entry):

```js
  "performance/trends": "/performance/trends/index.html",
  "performance/gap": "/performance/gap/index.html",
```

In `server/index.js`, change **both** occurrences of the owned-route regex (currently `performance(?:\/(?:pyramid|injury|strengths|trends))?`) to:

```js
performance(?:\/(?:pyramid|injury|strengths|trends|gap))?
```

- [ ] **Step 3: Create the static shell**

Create `public/performance/gap/index.html` — copy `public/performance/trends/index.html` verbatim, then make exactly these changes: `<title>` becomes `Onsight / Redpoint Gap – Climbing Logbook`, the header comment's own file-path/route references get updated to say `client/performance-gap-main.js`/this page's own route, the `#performance-offline` message's second `<p>` becomes "Reconnect and reload this page to see your onsight/redpoint gap.", replace `<div id="trends-root"></div>` with three containers in this order: `<div id="time-window-root" class="mb-4"></div><div id="gap-root"></div><div id="evidence-overlay-root"></div>` (the third is an empty placeholder Task 5's composition root fills via `evidenceOverlayHtml()` at boot, not static content — same "container the JS module owns" convention `#time-window-root`/`#gap-root` already use), and change the closing `<script>` tag's `src` to `/logbook/performance-gap-app.js`.

- [ ] **Step 4: Create the composition-root skeleton**

Create `client/performance-gap-main.js` — copy `client/performance-trends-main.js` verbatim as a starting point, then make these changes: rename every `trends`-specific identifier to its `gap` equivalent (`trendsRootEl` → `gapRootEl`, `latestVolumeData`/`latestVolumeRequestId` → `latestGapData`/`latestGapRequestId`, `renderTrends` → `renderGap`, `fetchVolume` → `fetchGap`, `positionOrderFor` stays as-is since it's still needed unchanged), update the file's own header comment to reference `#14` instead of `#15` and describe the onsight/redpoint gap instead of volume/intensity, change `/logbook/api/performance/volume` to `/logbook/api/performance/gap` in the fetch URL, change `store.setActiveView("performance-trends")` to `store.setActiveView("performance-gap")`.

Remove the imports this task's skeleton doesn't need yet (`gradeDisplayLabel`, `volumeHeadline` from `../shared/volume-stats.js`) — Task 5 adds the real imports this view actually needs. For this task (Task 4), stub `renderGap` as a currently-empty function, matching #15's own Task 5/Task 6 split:

```js
let latestGapData = null;

function renderGap() {
  // Task 5 fills this in.
  if (!latestGapData) return;
  gapRootEl.textContent = JSON.stringify(latestGapData[store.getActiveType()]);
}

function render() {
  headerChrome.updateDisciplinePicker();
  updateAdminBar();
  renderGap();
}
```

Update the `boot()` try block's `onChange` callback to call `fetchGap(start, end)` and assign to `latestGapData` (mirroring #15's own `onChange` callback exactly, just with the renamed identifiers).

- [ ] **Step 5: Add build scripts**

In `package.json`'s `scripts`, add directly after the existing `performance-trends:build`/`:watch` pair:

```json
    "performance-gap:build": "esbuild client/performance-gap-main.js --bundle --format=esm --outfile=public/logbook/performance-gap-app.js --minify --external:./escape-html.js --external:./floating-ui-dom.js",
    "performance-gap:watch": "esbuild client/performance-gap-main.js --bundle --format=esm --outfile=public/logbook/performance-gap-app.js --watch --external:./escape-html.js --external:./floating-ui-dom.js",
```

Add `pnpm run performance-gap:build` to the `pages:build` chain, directly after `pnpm run performance-trends:build`.

Change `dev:raw` — insert `performance-gap` after `performance-trends` in both the `-n` and `-c` lists. The full, hand-computed correct lists (verified against the existing repeating 6-color cycle `blue,magenta,yellow,cyan,white,gray`, position-by-position, so the new entry and everything after it stays correctly aligned):

```json
"dev:raw": "concurrently -n wrangler,tailwind,map,performance-pyramid,performance-hub,performance-injury,performance-strengths,performance-trends,performance-gap,log,profile,account,account-edit,account-import,sync,beta-gate -c blue,magenta,yellow,cyan,white,gray,blue,magenta,yellow,cyan,white,gray,blue,magenta,yellow,cyan \"wrangler dev\" \"tailwindcss -i ./styles/tailwind.css -o ./public/logbook/tailwind.css --watch\" \"pnpm run map:watch\" \"pnpm run performance-pyramid:watch\" \"pnpm run performance-hub:watch\" \"pnpm run performance-injury:watch\" \"pnpm run performance-strengths:watch\" \"pnpm run performance-trends:watch\" \"pnpm run performance-gap:watch\" \"pnpm run log:watch\" \"pnpm run profile:watch\" \"pnpm run account:watch\" \"pnpm run account-edit:watch\" \"pnpm run account-import:watch\" \"pnpm run sync:watch\" \"pnpm run beta-gate:watch\"",
```

Change `dev:vite` the same way (only the `-n` list's first entry and the first quoted command differ, `vite`/`"vite dev"` instead of `wrangler`/`"wrangler dev"`):

```json
"dev:vite": "concurrently -n vite,tailwind,map,performance-pyramid,performance-hub,performance-injury,performance-strengths,performance-trends,performance-gap,log,profile,account,account-edit,account-import,sync,beta-gate -c blue,magenta,yellow,cyan,white,gray,blue,magenta,yellow,cyan,white,gray,blue,magenta,yellow,cyan \"vite dev\" \"tailwindcss -i ./styles/tailwind.css -o ./public/logbook/tailwind.css --watch\" \"pnpm run map:watch\" \"pnpm run performance-pyramid:watch\" \"pnpm run performance-hub:watch\" \"pnpm run performance-injury:watch\" \"pnpm run performance-strengths:watch\" \"pnpm run performance-trends:watch\" \"pnpm run performance-gap:watch\" \"pnpm run log:watch\" \"pnpm run profile:watch\" \"pnpm run account:watch\" \"pnpm run account-edit:watch\" \"pnpm run account-import:watch\" \"pnpm run sync:watch\" \"pnpm run beta-gate:watch\"",
```

In `scripts/dev.mjs`, change the `-n`/`-c` lists and the spawn args array (this file has no `beta-gate` entry — a pre-existing, already-accepted drift, not something this task fixes):

```js
  "-n", "vite,tailwind,map,performance-pyramid,performance-hub,performance-injury,performance-strengths,performance-trends,performance-gap,log,profile,account,account-edit,account-import,sync",
  "-c", "blue,magenta,yellow,cyan,white,gray,blue,magenta,yellow,cyan,white,gray,blue,magenta,yellow",
  "vite dev",
  "tailwindcss -i ./styles/tailwind.css -o ./public/logbook/tailwind.css --watch",
  "pnpm run map:watch",
  "pnpm run performance-pyramid:watch",
  "pnpm run performance-hub:watch",
  "pnpm run performance-injury:watch",
  "pnpm run performance-strengths:watch",
  "pnpm run performance-trends:watch",
  "pnpm run performance-gap:watch",
  "pnpm run log:watch",
  "pnpm run profile:watch",
  "pnpm run account:watch",
  "pnpm run account-edit:watch",
  "pnpm run account-import:watch",
  "pnpm run sync:watch",
```

- [ ] **Step 6: Update `.gitignore`, `e2e:build-fixtures`, and `store.js`**

In `.gitignore`, add `client/performance-gap-main.js` to the explanatory comment's enumeration list, and add directly after the existing `public/logbook/performance-trends-app.js` line:

```
public/logbook/performance-gap-app.js
```

In `package.json`'s `e2e:build-fixtures` script, add a `cp` clause copying `public/performance/gap/index.html` to `public/e2e-fixtures/pages/performance-gap.html`, following the exact pattern the other `performance*.html` clauses already use, placed directly after the trends clause. Do **not** add a separate esbuild-bundling clause for `client/performance-gap-main.js`.

In `client/store.js`, find the comment documenting the `activeView` union (currently ending `"performance-trends"`) and add `"performance-gap"` to it.

- [ ] **Step 7: Write the failing shell-serving test**

In `test/owned-routes.test.js`, add directly after the existing `"serves the real static shell for performance/trends"` test:

```js
  it("serves the real static shell for performance/gap", async () => {
    const { cookie } = await createAuthedSession({ username: "gapshelluser", hostname: "climbinglogbook.com" });
    const res = await fetchOwnedRoute("gapshelluser", "performance/gap", { cookie });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('id="gap-root"');
    expect(html).toContain('src="/logbook/performance-gap-app.js"');
  });
```

- [ ] **Step 8: Run the test, confirm it passes** (after Steps 1-6's file changes are in place)

Run: `pnpm exec vitest run test/owned-routes.test.js -t "performance/gap"`
Expected: PASS

- [ ] **Step 9: Run the full unit suite**

Run: `pnpm test`
Expected: PASS

- [ ] **Step 10: Commit**

```bash
git add client/performance-hub-main.js client/performance-gap-main.js client/store.js public/performance/gap/index.html server/api/owned-routes.js server/index.js package.json scripts/dev.mjs .gitignore test/owned-routes.test.js
git commit -m "Wire up the /performance/gap route (#14): hub tile, shell, composition root skeleton"
```

---

## Task 5: Chart + evidence-tier rendering

**Files:**
- Modify: `client/performance-gap-main.js` (replace Task 4's `renderGap` stub, wire up the evidence overlay)
- Test: manual verification (pure DOM-rendering logic operating on already-tested data from Tasks 1-3 — no new pure-logic unit tests needed here; e2e coverage is Task 6)

**Interfaces:**
- Consumes: Task 1's `evidenceOverlayHtml`/`evidenceTierButtonHtml`, `client/combo-chart.js`'s `renderComboChartHtml` (#15), `client/modal-utils.js`'s `createModalHelpers` (pre-existing), Task 3's endpoint response shape.

- [ ] **Step 1: Implement the real `renderGap`**

In `client/performance-gap-main.js`, add the imports:

```js
import { renderComboChartHtml } from "./combo-chart.js";
import { evidenceOverlayHtml, evidenceTierButtonHtml } from "./evidence-tier.js";
import { createModalHelpers } from "./modal-utils.js";
import { flashLabel, sendLabel } from "./status.js";
import { gradeDisplayLabel } from "../shared/volume-stats.js";
```

(Task 4's own skeleton removed `gradeDisplayLabel` from its copy of the `volume-stats.js` import since it wasn't used yet — this task's `renderGap` needs it back, for the same `positionKey`/`displayLabel` mapping #15's own `renderTrends` uses.)

Replace Task 4's stub `renderGap` with:

```js
function renderGap() {
  if (!latestGapData) return;
  const type = store.getActiveType();
  const { buckets, flashMaxByBucket, sendMaxByBucket, avgAttemptsByBucket, headline } = latestGapData[type];
  const positionOrder = positionOrderFor(type);

  const flashPoints = flashMaxByBucket.map(grade => grade
    ? { positionKey: grade, displayLabel: gradeDisplayLabel(grade, type) }
    : null);
  const sendPoints = sendMaxByBucket.map(grade => grade
    ? { positionKey: grade, displayLabel: gradeDisplayLabel(grade, type) }
    : null);

  const chartHtml = renderComboChartHtml({
    bucketLabels: buckets,
    bars: [{ label: "Avg attempts to send", values: avgAttemptsByBucket }],
    lines: [
      { label: flashLabel(type), points: flashPoints, positionOrder },
      { label: sendLabel(type), points: sendPoints, positionOrder },
    ],
    headline,
  });

  // renderComboChartHtml's own headline slot runs the string through
  // escapeHtml() internally (see client/combo-chart.js's real current
  // implementation) -- the "Community data" evidence-tier chip (real
  // HTML, a real <button>) can't be smuggled inside that string, it
  // would come out as escaped literal text. Rendered as a sibling
  // element directly after the chart's own markup instead -- no change
  // to the already-shipped, already-reviewed combo-chart component.
  gapRootEl.innerHTML = chartHtml + `<p class="text-[.82rem] text-muted mt-2">Reference: ${evidenceTierButtonHtml("Community data", "community")}</p>`;

  gapRootEl.querySelectorAll("[data-evidence-tier]").forEach(btn =>
    btn.addEventListener("click", () => modalHelpers.openModal(document.getElementById("evidence-overlay")))
  );
}
```

Add the evidence-overlay wiring to `boot()`, injecting the overlay markup into its placeholder container and creating the modal helpers, right after the existing `Athlete Mode` redirect check and before `render()`:

```js
  document.getElementById("evidence-overlay-root").outerHTML = evidenceOverlayHtml(["community"]);
  const modalHelpers = createModalHelpers(["evidence-overlay"]);
  document.getElementById("evidence-close").addEventListener("click", () =>
    modalHelpers.closeModal(document.getElementById("evidence-overlay"))
  );
```

`modalHelpers` needs to be declared at module scope (`let modalHelpers;` near the top alongside the other module-level state) so `renderGap()` can reference it — assign it in `boot()` as shown above.

- [ ] **Step 2: Manual verification**

Run: `pnpm dev`, log in via `http://my.localhost:<port>/login/` (not plain `localhost`), navigate to `/performance/gap`. Expected: with no sends in the default 3-month window, the chart shows a "No sends logged in this window yet." headline with a "Community data" chip next to it, and zero-height bars for each of the 3 months. Log a few sends across different months at different grades, some with "first attempt" checked and some without, plus some with an Attempts value set, reload, confirm: the bar heights/labels reflect average attempts-to-send per month, both line series render with correct grade-text point labels (flash/onsight points only appear on buckets with a first-attempt send; send/redpoint points appear on every bucket with any send), the headline correctly describes the gap using boulder terminology. Switch the discipline picker to Lead, confirm the headline and line labels switch to onsight/redpoint terminology and the chart re-renders without a new network request. Click the "Community data" chip, confirm the evidence overlay opens showing the community-tier definition, and closes via the ✕ button or Escape.

- [ ] **Step 3: Run the full unit suite to confirm no regressions**

Run: `pnpm test`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add client/performance-gap-main.js public/performance/gap/index.html
git commit -m "Render the onsight/redpoint gap chart + evidence-tier chip (#14)"
```

---

## Task 6: End-to-end coverage

**Files:**
- Create: `e2e/performance-gap-page.spec.js` (new file, following `e2e/performance-trends-page.spec.js`'s exact established pattern)
- Modify: `e2e/mock-api.js` (a new `gapData` option)
- Test: itself

**Interfaces:**
- Consumes: the full Task 1-5 stack, end-to-end, through the real UI and a mocked `/logbook/api/*`.

- [ ] **Step 1: Read `e2e/performance-trends-page.spec.js` and the real, current `e2e/mock-api.js` in full to confirm the exact pattern to extend**

Add a `gapData` option, defaulting to a response with zero sends across a 3-bucket window:

```js
  gapData = {
    boulder: { buckets: ["Jan 2026", "Feb 2026", "Mar 2026"], flashMaxByBucket: [null, null, null], sendMaxByBucket: [null, null, null], avgAttemptsByBucket: [0, 0, 0], headline: "No sends logged in this window yet." },
    lead: { buckets: ["Jan 2026", "Feb 2026", "Mar 2026"], flashMaxByBucket: [null, null, null], sendMaxByBucket: [null, null, null], avgAttemptsByBucket: [0, 0, 0], headline: "No sends logged in this window yet." },
  },
```

Route it the same simple fixed-response way `volumeData` is routed (`handleGetGap` doesn't branch on query-string content beyond validation, same as `handleGetVolume`):

```js
  await page.route("**/logbook/api/performance/gap**", route => route.fulfill({ json: gapData }));
```

- [ ] **Step 2: Write the failing e2e tests**

Create `e2e/performance-gap-page.spec.js`:

```js
// #14 (epic #5 Phase 2) -- composition-root-wiring coverage for
// /:username/performance/gap, same fixture-harness pattern as e2e/
// performance-trends-page.spec.js. athleteMode: true is required in the
// mocked settings response -- client/performance-gap-main.js redirects
// to /log otherwise (#151's rule).
import { expect, test } from "@playwright/test";
import { mockApi } from "./mock-api.js";

test("shows the zero-sends headline, time-window control, and community-data chip with no data", async ({ page }) => {
  await mockApi(page, { settings: { athleteMode: true, activeDiscipline: "boulder" } });
  await page.goto("/e2e-fixtures/pages/performance-gap.html");

  await expect(page.locator("climbing-header h1")).toHaveText("Climbing Logbook");
  await expect(page.locator("climbing-tab-bar a", { hasText: "Performance Insights" })).toHaveAttribute("aria-current", "page");
  await expect(page.locator('[data-window="3mo"]')).toBeVisible();
  await expect(page.locator("#gap-root")).toContainText("No sends logged in this window yet.");
  await expect(page.locator("#gap-root [data-evidence-tier]")).toContainText("Community data");
});

test("renders both grade-labeled line series and the attempts bar", async ({ page }) => {
  await mockApi(page, {
    settings: { athleteMode: true, activeDiscipline: "boulder" },
    gapData: {
      boulder: {
        buckets: ["Jan 2026", "Feb 2026", "Mar 2026"],
        flashMaxByBucket: [null, "6B", null],
        sendMaxByBucket: [null, "6B", "6C"],
        avgAttemptsByBucket: [0, 1.5, 3],
        headline: "Your best send (V5) is 1 grade-step ahead of your best flash (V4) this window.",
      },
      lead: { buckets: ["Jan 2026", "Feb 2026", "Mar 2026"], flashMaxByBucket: [null, null, null], sendMaxByBucket: [null, null, null], avgAttemptsByBucket: [0, 0, 0], headline: "No sends logged in this window yet." },
    },
  });
  await page.goto("/e2e-fixtures/pages/performance-gap.html");

  await expect(page.locator("#gap-root")).toContainText("1 grade-step ahead");
  await expect(page.locator("#gap-root svg")).toBeVisible();
  await expect(page.locator("#gap-root")).toContainText("V4"); // gradeDisplayLabel("6B", "boulder")
  await expect(page.locator("#gap-root")).toContainText("V5"); // gradeDisplayLabel("6C", "boulder")
});

test("opens and closes the evidence-tier overlay", async ({ page }) => {
  await mockApi(page, { settings: { athleteMode: true, activeDiscipline: "boulder" } });
  await page.goto("/e2e-fixtures/pages/performance-gap.html");

  await page.locator("[data-evidence-tier]").click();
  await expect(page.locator("#evidence-overlay")).toBeVisible();
  await expect(page.locator("#evidence-overlay")).toContainText("Community data");
  await page.locator("#evidence-close").click();
  await expect(page.locator("#evidence-overlay")).toBeHidden();
});

test("switching the time window to 12mo re-fetches with a wider range", async ({ page }) => {
  let lastRequestUrl = null;
  await mockApi(page, { settings: { athleteMode: true, activeDiscipline: "boulder" } });
  await page.route("**/logbook/api/performance/gap**", route => {
    lastRequestUrl = route.request().url();
    return route.fulfill({ json: { boulder: { buckets: [], flashMaxByBucket: [], sendMaxByBucket: [], avgAttemptsByBucket: [], headline: "No sends logged in this window yet." }, lead: { buckets: [], flashMaxByBucket: [], sendMaxByBucket: [], avgAttemptsByBucket: [], headline: "No sends logged in this window yet." } } });
  });
  await page.goto("/e2e-fixtures/pages/performance-gap.html");
  const initialUrl = lastRequestUrl;

  await page.locator('[data-window="12mo"]').click();
  await expect.poll(() => lastRequestUrl).not.toBe(initialUrl);

  const initialStart = new URL(initialUrl).searchParams.get("start");
  const twelveMoStart = new URL(lastRequestUrl).searchParams.get("start");
  expect(new Date(twelveMoStart).getTime()).toBeLessThan(new Date(initialStart).getTime());
});

test("shows the offline message instead of the chart when the fetch fails", async ({ page }) => {
  await mockApi(page, { settings: { athleteMode: true, activeDiscipline: "boulder" } });
  await page.route("**/logbook/api/performance/gap**", route => route.fulfill({ status: 500 }));
  await page.goto("/e2e-fixtures/pages/performance-gap.html");

  await expect(page.locator("#performance-offline")).toBeVisible();
  await expect(page.locator("#gap-root")).toBeHidden();
});

test("redirects to /log when Athlete Mode is off", async ({ page }) => {
  await mockApi(page, { settings: { athleteMode: false, activeDiscipline: "boulder" } });
  await page.goto("/e2e-fixtures/pages/performance-gap.html");

  await page.waitForURL(/\/log$/);
});
```

- [ ] **Step 3: Run the tests, confirm they fail**

Run: `pnpm run e2e:build-fixtures && pnpm exec playwright test e2e/performance-gap-page.spec.js`
Expected: FAIL until Step 1's `mockApi()` extension is correctly connected — fix any real mismatch before treating this as a real product-code failure. Check for the same initial-request race #15's own Task 7 found (`page.goto()` resolving before `boot()`'s auth/settings/fetch chain completes) — if the 12mo re-fetch test races the same way, apply the same `expect.poll` fix that task used, adapted to this file.

- [ ] **Step 4: Fix any real issues, re-run until green**

Run: `pnpm exec playwright test e2e/performance-gap-page.spec.js`
Expected: PASS (6 tests)

- [ ] **Step 5: Run the full e2e suite twice**

Run: `pnpm exec playwright test` (twice)
Expected: PASS both times (modulo the one known pre-existing, unrelated `register.spec.js` Turnstile/Resend flake, already root-caused in #588).

- [ ] **Step 6: Run the full unit suite one final time**

Run: `pnpm test`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add e2e/mock-api.js e2e/performance-gap-page.spec.js
git commit -m "Add e2e coverage for the onsight/redpoint gap view (#14)"
```

CRITICAL for whoever executes this task: run every command in this task directly and synchronously, in the foreground. Do NOT use Bash `run_in_background` or `Monitor` for the e2e suite runs, even though they're slow — this exact mistake has stranded implementer subagents multiple times already in this epic, each time leaving real uncommitted work behind that a second dispatch had to recover. Wait for the actual command output inline before moving to the next step.

---

## Final Verification

- [ ] `pnpm test` — full pass
- [ ] `pnpm exec playwright test` — full pass, twice (modulo the one known pre-existing, unrelated flake in `register.spec.js`)
- [ ] Manual: `pnpm dev`, log in, add sends across a few different months/grades with a mix of first-attempt and multi-attempt sends, confirm the chart renders correctly for both disciplines, both terminology sets, and all three window modes.
- [ ] Confirm the hub page (`/performance`) now shows five tiles, and the new tile's "View" link navigates to `/performance/gap`.
- [ ] Confirm `server/api/public-data.js` has no route to `/logbook/api/performance/gap` (same check every prior deliverable's final review has run).
- [ ] Confirm `git log --oneline` shows 6 task commits, each independently reviewable.
