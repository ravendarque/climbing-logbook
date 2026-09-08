# Coaching-Messaging Rules Across Performance Insights

Companion to `docs/climbing-analytics-research.md` (the evidence/citations
brief) and `docs/grade-pyramid-approach.md` (the pyramid's own window-
construction design). This doc exists to answer one question per view: **for
a given shape of the underlying data, what is the coaching message supposed
to say, and does the current code actually implement that rule?**

It was written after a real bug (#633): the Grade Pyramid told a climber
their pyramid shape was "good" when it was actually top-heavy (a narrow base
relative to the top tiers). The root cause was a message-selection check
that tested *presence* of data (does every tier have at least one send?)
where the message itself was making a *shape/ratio* claim ("no gaps," read
by a user as "healthy"). Presence and shape are different questions, and
conflating them is the specific failure mode this doc exists to prevent
from recurring, view by view.

## How to read each entry

For each view: where its message-generating logic actually lives, every
branch it has, the data condition that selects that branch, and whether the
condition is at the right "altitude" — does it test the actual thing the
message claims, or a proxy for it? A view is flagged **presence-only** if
any branch's message makes a shape/ratio/trend claim but the branch's
condition only checks whether data exists, not what shape it has.

## Grade Pyramid

**Where:** `client/components/climbing-grade-pyramid.js`, `#render()`
(health-card block). Notably, this is the *one* view whose coaching message
does not live in a pure `shared/*.js` function — `shared/pyramid-stats.js`
only produces structural data (`pyramidCounts`/`pyramidReadyToPromote`/
`pyramidSplitRows`), never a headline string. Every other view below
generates its message in a shared, unit-testable pure function; the pyramid
generates its inline, in a Web Component. This asymmetry is itself worth
noting for anyone extending this view — a future change should consider
moving this logic into `shared/pyramid-stats.js` for consistency, but that's
a refactor, not required by this fix.

Branches, in priority order:

1. **`hasSends` false** — no sends in the 12-month window at all. No
   coaching message; the view shows only "log a send to see your pyramid."
2. **`promotedGrade` truthy** — the climber has enough volume at their top
   real tiers to justify pushing into a new grade (`shared/pyramid-stats.js`'s
   own promotion algorithm, see `docs/grade-pyramid-approach.md`).
   - Sub-branch **`stillBuilding`** (some other displayed tier still has
     zero sends): "Still building your pyramid from the base up — but
     you've already got enough mileage to give X a go." Correct: the
     condition (`top4.some(r => r.count === 0 && r.grade !== promotedGrade)`)
     tests exactly what the message claims.
   - Sub-branch (no gaps elsewhere): "You've logged enough at every tier
     below to be ready to push into X." Same: condition matches claim.
3. **A literal gap** (`top4.find(r => r.count === 0)`, at least one displayed
   tier has zero sends): "No sends logged at [grade]... right in the middle
   of your pyramid window." Correct — the message claims exactly "a tier has
   zero," and the condition checks exactly that.
4. **Top-heavy** (added by #633; previously this case fell through to
   branch 5 below): a harder tier (`top4[i-1]`) has *more* sends than an
   easier tier beneath it (`top4[i]`), with no literal zero anywhere. "This
   pyramid is top-heavy — you've got fewer sends at [easier grade] than at
   the harder tier above it." This is the fix: `docs/climbing-analytics-
   research.md` §1 "Diagnosing plateau, overreaching, and
   under-consolidation from pyramid shape" names this exact shape
   ("a climber who has sent one route at their limit grade but very few at
   the grade(s) just below it") as a distinct, real coaching signal —
   distinct from a literal gap, and distinct from healthy. The condition
   (`top4.find((r, i) => i > 0 && r.count < top4[i - 1].count)`) tests the
   actual inversion the message describes, not mere presence.
5. **Healthy** (no literal gap, no inversion): "No gaps or inversions in
   this window — sends build up from your base to your max." **This was
   the bug before #633**: the old condition was just "no gapRow" (i.e. no
   branch-4 check existed at all), so this branch fired — and claimed
   health — for any pyramid with zero empty tiers, regardless of whether
   the counts actually formed a sane 8-4-2-1-ish shape. Fixed by adding
   branch 4 above; this branch now only fires once both the presence check
   *and* the shape check pass.

**Verdict pre-#633: presence-only** (branch 5 fired on presence alone).
**Post-#633: shape-checked.**

## Injury / Pain Log

**Where:** `shared/injury-stats.js`, `topPainCluster()` (data selection) +
`describeCluster()` (message).

One real branch: the highest-count pain-tag cluster (limb × side × hold
type × wall angle), gated by `MIN_TAG_COUNT` (5, `shared/
tag-stats-helpers.js`) so a cluster is only named once there's enough
sample size to trust it as a real pattern rather than noise. Below the
gate: "Not enough data yet to spot a pattern" (composition root, not the
shared function).

**Verdict: correctly reasoned, not presence-only.** The message is purely
descriptive ("your pain flags cluster on X") — it claims exactly the
ranked/counted value that was computed, not a derived shape or ratio.
`MIN_TAG_COUNT` here is a legitimate sample-size confidence gate (is there
enough data to trust *any* claim), not a stand-in for the claim itself —
that's the correct kind of check for what this message asserts.

## Strengths / Weaknesses

**Where:** `shared/strengths-stats.js`, `topWeakness()` + `describeWeakness()`.

Same shape as Injury: the highest-scoring cell (`hardestCount /
(hardestCount + easiestCount)`), gated by the same `MIN_TAG_COUNT`, named
directly ("Your [side] [limb] on [wall angle] [hold type] looks like a key
weakness"). Below the gate: "Not enough data yet."

**Verdict: correctly reasoned, not presence-only**, for the same reason as
Injury — the message states exactly the ratio that was computed, and the
sample-size gate is legitimate, not a proxy for the ratio.

## Volume / Intensity

**Where:** `shared/volume-stats.js`, `volumeHeadline()`.

Two branches: zero sends → "No sends logged in this window yet." Otherwise
→ a factual count ("N sends logged in this window, busiest period had M").

**Verdict: correctly reasoned, not presence-only** — the message makes no
shape/health claim at all, so there's no shape/presence distinction to get
wrong. Worth flagging separately (not the same bug class, but a related
consistency gap): **this view has no confidence/sample-size gate at all**,
unlike Injury/Strengths/Effort. A single send in the window still produces
a fully-worded, confident-sounding sentence. Not urgent, but inconsistent —
candidate for a future small fix if this view starts feeling noisy on
thin data.

## Gap (Onsight/Flash-to-Redpoint)

**Where:** `shared/gap-stats.js`, `gapHeadline()`.

Four branches: no sends at all → "No sends logged..."; sends exist but none
were flashed → reports best redpoint only, explicit about zero flashes;
best flash ties or beats best send (`gap <= 0`) → "matches or beats"; best
send ahead of best flash (`gap > 0`) → reports the exact grade-step gap.

**Verdict: correctly reasoned, not presence-only** — every branch computes
and states exactly the one quantity (the grade-step delta between two
specific best-grades) that its message claims. Same consistency gap as
Volume: **no confidence/sample-size gate** — a single send still produces a
confident "ahead of" sentence. Flagged for the same reason, not urgent.

## RPE / Effort

**Where:** `shared/effort-stats.js`, `effortHeadline()`.

Gated by `MIN_SEND_SAMPLE` (5 — numerically equal to `MIN_TAG_COUNT` but a
deliberately separate constant, since it gates a different concept: send-
sample size, not tag frequency). Three branches below the gate:

1. Grade trending up **and** average exertion rising by ≥5 points
   (`EXERTION_RISE_MARGIN`) over the window → "rising alongside your
   grade... paying off," backed by a real citation (Gajdošík et al.).
2. Overall average exertion ≥80% (`HIGH_EXERTION_THRESHOLD`) **and** grade
   is *not* trending up → "maxing out effort without much grade
   movement... technique work."
3. Fallback → "room to push harder," with an explicit reliability caveat
   for newer/lower-grade climbers (Gajdošík, Baláš & Draper, 2020).

**Verdict: correctly reasoned, not presence-only.** Every branch directly
compares two real computed quantities (grade-trend direction vs.
exertion-trend direction/magnitude, or an absolute threshold) rather than
substituting a presence check for the relationship the message describes —
structurally the same kind of check the pyramid's top-heavy branch now also
does.

## Cross-view confidence-gate constants (for reference)

| Constant | File | Value | Gates |
|---|---|---|---|
| `MIN_TAG_COUNT` | `shared/tag-stats-helpers.js` | 5 | Tag-cluster sample size (Injury, Strengths) |
| `MIN_SEND_SAMPLE` | `shared/effort-stats.js` | 5 | Send-sample size (RPE/Effort) |
| `HIGH_EXERTION_THRESHOLD` | `shared/effort-stats.js` | 80 | "Maxing out" cutoff |
| `EXERTION_RISE_MARGIN` | `shared/effort-stats.js` | 5 | Min point-rise to call exertion "rising" |
| `PYRAMID_IDEAL_BY_POSITION` | `shared/pyramid-stats.js` | `[1,2,4,8]` | Per-tier ideal counts (8-4-2-1) |

`MIN_TAG_COUNT` and `MIN_SEND_SAMPLE` being numerically equal is
deliberate, not duplication (see `shared/effort-stats.js`'s own comment) —
they gate genuinely different concepts and could diverge independently in
the future.

## Summary: presence-only vs. shape-checked, as of this doc

| View | Verdict |
|---|---|
| Grade Pyramid | **Fixed by #633** — was presence-only, now shape-checked |
| Injury / Pain Log | Correctly reasoned |
| Strengths / Weaknesses | Correctly reasoned |
| Volume / Intensity | Correctly reasoned (no shape claim to check) — no confidence gate, flagged separately |
| Gap | Correctly reasoned (no shape claim to check) — no confidence gate, flagged separately |
| RPE / Effort | Correctly reasoned |

Grade Pyramid was the only view exhibiting the "presence checked instead of
the shape the message actually claims" failure mode. If a future view's
coaching message makes a shape, ratio, or trend claim, use this checklist
before shipping it:

1. Does the condition test the *actual* relationship the message states
   (a ratio, an ordering, a trend direction/magnitude), not just whether
   data exists at all?
2. Is there a sample-size/confidence gate before making any claim at all,
   proportional to how confident-sounding the message text is?
3. Is the rule and its evidence backing (or explicit "heuristic, not
   proven" framing) documented here, so the next person auditing this view
   doesn't have to re-derive it from the code?
