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

For each view: where its message-generating logic actually lives, then a
table with one row per branch — the **rule** (the data condition that
selects that branch) and the exact **templated copy** it produces, in
priority order (first matching rule wins). Below the table, a verdict on
whether each rule is checked at the right "altitude" — does it test the
actual thing the message claims, or a proxy for it? A view is flagged
**presence-only** if any branch's message makes a shape/ratio/trend claim
but the branch's condition only checks whether data exists, not what shape
it has.

Copy is quoted verbatim from source, with template placeholders shown as
`${...}`.

## Grade Pyramid

**Where:** branch selection is `shared/pyramid-stats.js`'s `pyramidHealth()`
(returns `{ kind, grade?, stillBuilding? }`, decision-only); rendering is
`client/components/climbing-grade-pyramid.js`'s `#render()` (health-card
block), which maps `kind` onto its own HTML/icon/copy. Until #687, this was
the *one* view whose coaching message didn't live in a pure `shared/*.js`
function — `shared/pyramid-stats.js` used to produce only structural data
(`pyramidCounts`/`pyramidReadyToPromote`/`pyramidSplitRows`), never a
decision. Every view below already followed the "resolve once in shared/,
render per consumer" split; #687 extracted `pyramidHealth()` out of the Web
Component so the pyramid now follows it too, with its own unit tests in
`test/shared/pyramid-stats.test.js` covering every branch below.

| # | Rule | Templated copy |
|---|---|---|
| 1 | `!hasSends` — no sends in the 12-month window at all (checked by the component itself, before `pyramidHealth()` is ever called — there's no health card at all to reason about yet) | "No ${disciplineLabel(type)} sends logged in the last 12 months yet -- log a send to see your pyramid." |
| 2a | `pyramidHealth()` returns `{ kind: "promoted", stillBuilding: true }` — `promotedGrade` truthy **and** some other displayed tier still has zero sends | "Still building your pyramid from the base up — but you've already got enough mileage to give ${grade} a go." / "Keep adding sends at your lower tiers too — a full 8-4-2-1 pyramid needs volume all the way down, not just at the top." |
| 2b | `{ kind: "promoted", stillBuilding: false }` — `promotedGrade` truthy, no other gaps | "You've logged enough at every tier below to be ready to push into ${grade}." / "Heuristic guidance, not diagnosis — only you know if the moves suit you." |
| 3 | `{ kind: "gap" }` — a literal gap: at least one displayed tier has zero sends (`top4.find(r => r.count === 0)`) | "No sends logged at ${grade} in the last 12 months, right in the middle of your pyramid window." / "Heuristic guidance, not diagnosis — might be worth spending more mileage there before pushing your top grade again." |
| 4 | `{ kind: "top-heavy" }` (added by #633) — no literal gap, but a harder tier has *more* sends than an easier tier beneath it (`top4.find((r, i) => i > 0 && r.count < top4[i - 1].count)`) | "This pyramid is top-heavy — you've got fewer sends at ${grade} than at the harder tier above it." / "Heuristic guidance, not diagnosis — a broader base at the easier tiers usually means a more sustainable base to build from." |
| 5 | `{ kind: "healthy" }` — none of the above match | "No gaps or inversions in this window — sends build up from your base to your max, the shape a healthy pyramid is expected to have." |

All five outcomes above are `pyramidHealth(top4, promotedGrade)`'s complete
return space (`shared/pyramid-stats.js`) except row 1, which never reaches
it. `climbing-grade-pyramid.js`'s `#render()` does nothing but switch on
`kind` to pick HTML/icon/copy — no coaching logic lives in the component
itself any more.

Row 4 is the fix: `docs/climbing-analytics-research.md` §1 "Diagnosing
plateau, overreaching, and under-consolidation from pyramid shape" names
this exact shape ("a climber who has sent one route at their limit grade
but very few at the grade(s) just below it") as a distinct, real coaching
signal — distinct from a literal gap (row 3), and distinct from healthy
(row 5). The condition tests the actual inversion the message describes,
not mere presence.

**This was the bug before #633**: row 5's old condition was just "no
gapRow" (i.e. row 4 didn't exist), so it fired — and claimed health — for
any pyramid with zero empty tiers, regardless of whether the counts
actually formed a sane 8-4-2-1-ish shape. Fixed by adding row 4; row 5 now
only fires once both the presence check *and* the shape check pass.

**Verdict pre-#633: presence-only** (row 5 fired on presence alone).
**Post-#633: shape-checked.**

## Injury / Pain Log

**Where:** `shared/injury-stats.js`, `topPainCluster()` (data selection) +
`describeCluster()` (message); the below-gate copy lives in the composition
root, `client/performance-injury-main.js`.

| # | Rule | Templated copy |
|---|---|---|
| 1 | Highest-count pain-tag cluster (limb × side × hold type × wall angle) has `count < MIN_TAG_COUNT` (3, `shared/tag-stats-helpers.js`) | "Not enough data yet to spot a pattern -- keep tagging pain moves as they come up." |
| 2 | Highest-count cluster clears the gate | "Your ${cluster.side} ${cluster.limb} ${pluralizeHoldType(cluster.holdType)}, ${cluster.wallAngle}." |

**Verdict: correctly reasoned, not presence-only.** Row 2's message is
purely descriptive ("your pain flags cluster on X") — it claims exactly the
ranked/counted value that was computed, not a derived shape or ratio.
`MIN_TAG_COUNT` here is a legitimate sample-size confidence gate (is there
enough data to trust *any* claim), not a stand-in for the claim itself —
that's the correct kind of check for what this message asserts.

## Strengths / Weaknesses

**Where:** `shared/strengths-stats.js`, `topWeakness()` + `describeWeakness()`;
the below-gate copy lives in the composition root,
`client/performance-strengths-main.js`.

| # | Rule | Templated copy |
|---|---|---|
| 1 | Highest-scoring cell (`hardestCount / (hardestCount + easiestCount)`) has `total < MIN_TAG_COUNT` (3, shared with Injury) | "Not enough data yet to spot a pattern -- keep tagging moves as you climb." |
| 2 | Highest-scoring cell clears the gate | "Your ${cell.side} ${cell.limb} on ${WALL_ANGLE_ADJECTIVE[cell.wallAngle]} ${pluralizeHoldType(cell.holdType)} looks like a key weakness." |

**Verdict: correctly reasoned, not presence-only**, for the same reason as
Injury — row 2 states exactly the ratio that was computed, and the
sample-size gate is legitimate, not a proxy for the ratio.

## Volume / Intensity

**Where:** `shared/volume-stats.js`, `volumeHeadline()`.

| # | Rule | Templated copy |
|---|---|---|
| 1 | `total === 0` — zero sends in the window | "No sends logged in this window yet." |
| 2 | `total > 0` | "${total} send${total === 1 ? "" : "s"} logged in this window, busiest period had ${busiest}." |

**Verdict: correctly reasoned, not presence-only** — neither row makes a
shape/health claim at all, so there's no shape/presence distinction to get
wrong. Worth flagging separately (not the same bug class, but a related
consistency gap): **this view has no confidence/sample-size gate at all**,
unlike Injury/Strengths/Effort. A single send in the window still produces
row 2's fully-worded, confident-sounding sentence. Not urgent, but
inconsistent — candidate for a future small fix if this view starts
feeling noisy on thin data.

## Gap (Onsight/Flash-to-Redpoint)

**Where:** `shared/gap-stats.js`, `gapHeadline()`.

| # | Rule | Templated copy |
|---|---|---|
| 1 | No sends at all in the window (`sendGrades.length === 0`) | "No sends logged in this window yet." |
| 2 | Sends exist, but no flash/onsight sends (`flashGrades.length === 0`) | "No ${flashTerm} sends logged in this window yet -- your best ${sendTerm} is ${gradeDisplayLabel(bestSend, type)}." |
| 3 | Best flash ties or beats best send (`gap <= 0`) | "Your best ${flashTerm} (${gradeDisplayLabel(bestFlash, type)}) matches or beats your best ${sendTerm} (${gradeDisplayLabel(bestSend, type)}) this window." |
| 4 | Best send ahead of best flash (`gap > 0`) | "Your best ${sendTerm} (${gradeDisplayLabel(bestSend, type)}) is ${gap} grade-step${gap === 1 ? "" : "s"} ahead of your best ${flashTerm} (${gradeDisplayLabel(bestFlash, type)}) this window." |

**Verdict: correctly reasoned, not presence-only** — every row computes and
states exactly the one quantity (the grade-step delta between two specific
best-grades) that its message claims. Same consistency gap as Volume: **no
confidence/sample-size gate** — a single send still produces row 3 or 4's
confident "ahead of"/"matches" sentence. Flagged for the same reason, not
urgent.

## RPE / Effort

**Where:** `shared/effort-stats.js`, `effortHeadline()`; the below-gate
copy lives in the composition root, `client/performance-rpe-main.js`.

| # | Rule | Templated copy |
|---|---|---|
| 0 | `totalSends < MIN_SEND_SAMPLE` (5 — numerically equal to `MIN_TAG_COUNT` but a deliberately separate constant, since it gates a different concept: send-sample size, not tag frequency) | `effortHeadline()` returns `null`; composition root shows "Not enough data yet for a reliable read -- log a few more sends and check back." |
| 1 | Grade trending up **and** average exertion rising by ≥5 points (`EXERTION_RISE_MARGIN`) over the window | "Your effort is rising alongside your grade -- sounds like it's paying off. Climbing-specific session-RPE research has found a real link between logged effort and training load, so a trend like this is a reasonable signal the extra push is translating into progress, not just extra fatigue." |
| 2 | Overall average exertion ≥80% (`HIGH_EXERTION_THRESHOLD`) **and** grade is *not* trending up | "You're maxing out effort without much grade movement -- technique work might unlock more than pushing harder would. When effort consistently reads near-maximal but the grade line stays flat, climbing-performance research points more toward technique and movement efficiency as the likely limiter than raw physical output -- worth a technique-focused session or two before assuming you just need to push harder." |
| 3 | Fallback — neither of the above | "There's room to push harder on your ${SEND_TERM[type]} attempts. Your average effort here reads moderate rather than near-maximal, so there may be headroom before a grade is genuinely out of reach -- though this read is inherently less reliable for newer or lower-grade climbers (Gajdošík, Baláš & Draper, 2020), so treat it as a loose prompt to experiment, not a precise verdict." |

**Verdict: correctly reasoned, not presence-only.** Rows 1-3 each directly
compare two real computed quantities (grade-trend direction vs.
exertion-trend direction/magnitude, or an absolute threshold) rather than
substituting a presence check for the relationship the message describes —
structurally the same kind of check the pyramid's top-heavy row (#4) now
also does.

## Cross-view confidence-gate constants (for reference)

| Constant | File | Value | Gates |
|---|---|---|---|
| `MIN_TAG_COUNT` | `shared/tag-stats-helpers.js` | 3 | Tag-cluster sample size (Injury, Strengths) |
| `MIN_SEND_SAMPLE` | `shared/effort-stats.js` | 5 | Send-sample size (RPE/Effort) |
| `HIGH_EXERTION_THRESHOLD` | `shared/effort-stats.js` | 80 | "Maxing out" cutoff |
| `EXERTION_RISE_MARGIN` | `shared/effort-stats.js` | 5 | Min point-rise to call exertion "rising" |
| `PYRAMID_IDEAL_BY_POSITION` | `shared/pyramid-stats.js` | `[1,2,4,8]` | Per-tier ideal counts (8-4-2-1) |

`MIN_TAG_COUNT` and `MIN_SEND_SAMPLE` are no longer numerically equal
(#671 review tuned `MIN_TAG_COUNT` from its original placeholder of 5 down
to 3) — they always gated genuinely different concepts and were always free
to diverge independently; they now have.

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
