# Performance Insights UI design

Design for epic #5's remaining work: how the five not-yet-built views (#15,
#13, #14, #38, #39) and the already-shipped grade pyramid (#12) fit together
as a whole on `/performance`. Analytical content for each view is already
settled — see `docs/climbing-analytics-research.md` §6 and issue #5's own
body — this spec covers structure, components, and routing only.

## Architecture

`/performance` becomes a **hub page**: a landing page listing every
insight as a tile, matching the account page's own hub-of-tiles shape.
Each insight is its own real sub-page under `/performance/*`, not a
client-side tab/view switch on one page. Rejected alternatives:

- **Stack everything vertically on one page** — six full analytical views
  is a lot of scrolling, and the shared drill-down filters (below) become
  ambiguous: do they scope to one view or all six at once?
- **Sub-tabs within one page (SPA-style)** — real client-side routing/view
  state for six increasingly complex views, for no real advantage over
  separate routes; this app has no SPA framework and deliberately hasn't
  wanted one (see #344's own separate, not-yet-started epic for that
  question). Six real static-shell sub-pages, each independently
  server-gated the same way every other owned page already is
  (`owned-routes.js`), is simpler and consistent with how `/account`'s own
  sub-pages (`/account/edit`, `/account/import`) already work.

## Routes

| Path | View | Status |
|---|---|---|
| `/performance` | Hub — tile list | new |
| `/performance/pyramid` | Grade pyramid (#12) | **migrated** off the bare `/performance` route |
| `/performance/trends` | Volume/intensity trend (#15) | new |
| `/performance/strengths` | Strengths/weaknesses breakdown (#13) | new |
| `/performance/gap` | Onsight-to-redpoint gap (#14) | new |
| `/performance/rpe` | RPE / effort trend (#38) | new |
| `/performance/injury` | Injury/pain flag correlation (#39) | new |

Each sub-page is a real, independent static shell (its own
`public/performance/<slug>/index.html` + composition root), server-side
gated the same way as every other owned page (`handleOwnedRoute`/
`SHELL_PATHS` in `server/api/owned-routes.js`, `run_worker_first` entry in
`wrangler.jsonc`) — mirroring the `/account`, `/account/edit` precedent
exactly, not inventing a new routing shape.

`<climbing-tab-bar>`'s label for this whole section changes from "Grade
Pyramid" to **"Performance Insights"** (the established umbrella term) —
abbreviate to "Performance" later if it reads too verbose in the tab bar
once built; not a blocking decision now.

## Shared card component

New, genuinely shared component (not copy-pasted per page) for every
"row-card with a text side and a control side" instance in the app — the
hub's own insight tiles, and retroactively `athlete-mode-row`/
`public-logbook-row` on the account page, which currently still use the
pre-#558 shape (title+control on one inner row, description as a
full-width sibling paragraph below) while `beta-opt-in-row` already
migrated to the real shape. Folding that fix into this epic since the
shared component is being extracted anyway — leaving two rows on the old
shape while extracting a "standard" from the third would just relocate the
same inconsistency.

**Shape:** a `row-card` flex row with two children:
- **Text column** (`flex-1 min-w-0`) — title (`row-card-title`),
  description paragraph, optional status line (accent-colored, e.g.
  `beta-opt-in-status`'s own treatment)
- **Control column** (`shrink-0`) — whatever's appropriate: a switch
  (Athlete Mode/Public Logbook), a button opening a modal (beta opt-in's
  "Manage"), or, new for this epic, a **"View" button** navigating to the
  insight's own sub-page

Explicitly *not* using the account page's plain nav-link shape
(`edit-account-link`/`import-link` — a bare `<a>` with just a title +
chevron, no description) for the hub tiles: those work as whole-tile click
targets specifically because they're just a label. A tile carrying real
description text reads as too large/complex to feel like a natural click
target if the whole card is the link — hence the explicit "View" button as
the actual affordance, consistent with how `beta-opt-in-row` already
solved the identical problem with "Manage".

Implementation shape: a shared JS helper (module exporting a function that
builds/updates this markup), consumed by every page that needs one —
matching this codebase's existing granularity for shared-but-not-a-full-
component UI (`modal-utils.js`, `admin-bar.js`), not a new Custom Element.
Epic #344 (Web Components UI) is a separate, deliberately unstarted epic —
not a dependency here.

## Data model

No new "session" concept (explicit decision, 2026-08-27) — the foundation
stays a logbook of individual climbs, aggregated per-user for insights.

- `rpe` (nullable integer, `entries`, per-entry, additive) — #563

#38's RPE/effort trend and #39's injury/pain log both aggregate per-entry
data at query time rather than the schema persisting any session-grouping
row.

### Move-level tagging (hardest/easiest moves) — #13's real data source

`entries`-level fields aren't enough for #13's strengths/weaknesses
breakdown: a climb can mix hold types and wall angles across its length
(the crimps-on-overhang-vs-crimps-on-slab example), so the useful signal
lives at the level of individual **moves within an entry**, not the entry
as a whole. This is captured as an optional, additive, unbounded child
table — working name `entry_moves` — rather than any new fixed columns on
`entries`:

- Zero-to-many rows per entry, in either of two buckets: **"Hardest moves
  for you"** and **"Easiest moves for you"**. Both buckets share one table
  with a `difficulty` discriminator column rather than two parallel
  tables — same row shape either way, no reason to duplicate the schema.
- Each row is **self-contained**: it captures all four dimensions
  (limb+side, hold type, movement style, wall angle) for one tagged move
  together, not as separate cross-referenced datasets. This is what makes
  the eventual insight queries simple — filter on any one dimension while
  grouping by the rest, all from one table, e.g. "hold type = crimp,
  broken down by wall angle × limb × movement style."
- Entirely optional and low-friction to log: a handful of dropdowns added
  per row, never required to save an entry.

**The taxonomy is limb-dependent, not four independent fields** — this
was the crux (no pun intended) of the design discussion. `hold_type` and
`movement_style`'s valid *options* both change depending which limb is
selected, so the entry form is three cascading dropdowns
(limb → filtered hold_type → filtered movement_style), plus one
independent one (wall_angle):

- **limb**: `hand` / `foot` / `knee`, each × `left`/`right` (side is
  always meaningful — no research needed there, it's fundamental to
  human physiology)
- **hold_type**, options filtered by limb:
  - `hand` → traditional hold-shape vocabulary (crimp, jug, pocket,
    sloper, pinch, edge, etc.) — the full enumerated list is an
    implementation-time detail, not fixed here
  - `foot` / `knee` → technique-shaped, not hold-shaped: `toe-hook`,
    `heel-hook` for foot; `kneebar` for knee. (A plain "foothold"
    for ordinary edging/smearing footwork isn't tagged here — this
    table is specifically for the moves worth calling out as
    hardest/easiest, and routine footwork isn't that.)
- **movement_style**: `static` / `dynamic` for every limb, plus
  `lockoff` — but **only when limb = hand**. A lockoff is fundamentally
  a hand/upper-body hold pattern; a toe-hook or kneebar might accompany
  or set up a lockoff, but the foot/knee engagement itself isn't the
  lockoff, so it doesn't carry that option.
- **wall_angle**: `slab` / `vert` / `overhang` / `roof` — flat, fixed,
  independent of limb (the wall doesn't change angle depending on which
  limb is touching it).

```sql
CREATE TABLE entry_moves (
  id             TEXT PRIMARY KEY,
  entry_id       TEXT NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
  difficulty     TEXT NOT NULL CHECK (difficulty IN ('hardest','easiest')),
  limb           TEXT NOT NULL CHECK (limb IN ('hand','foot','knee')),
  side           TEXT NOT NULL CHECK (side IN ('left','right')),
  hold_type      TEXT NOT NULL,   -- valid set depends on limb; validated
                                   -- app-level, same treatment entries.grade
                                   -- already gets (too discipline/limb-
                                   -- dependent for a flat CHECK)
  movement_style TEXT NOT NULL CHECK (
                   (limb = 'hand' AND movement_style IN ('static','dynamic','lockoff'))
                OR (limb != 'hand' AND movement_style IN ('static','dynamic'))
                 ),
  wall_angle     TEXT NOT NULL CHECK (wall_angle IN ('slab','vert','overhang','roof')),
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_entry_moves_entry_id ON entry_moves(entry_id);
```

The `movement_style` CHECK enforces the lockoff-is-hand-only rule at the
DB layer itself, backstopping the same cascading-dropdown validation the
entry form does client-side — not just a UI nicety.

This table's home is #36 ("movement/terrain fields") — its body has been
updated to match this shape (it originally described flat columns,
superseded by this design).

### Injury/pain move tagging — #39's real data source

A near-identical need came up for #39 during the chart-layout discussion:
pinning a pain flag to a specific move (not just the whole climb) gives
`docs/climbing-analytics-research.md`'s injury-pattern insight real teeth
— "your pain flags cluster on left-hand crimps, overhang" is a much
sharper signal than a bare per-entry flag can produce.

**Explicitly a separate table from `entry_moves`, not a `pain` column
added to it.** That was considered and rejected: a boolean on
`entry_moves` would imply pain is a property of being tagged
hardest/easiest, which isn't true — a move can hurt without being
anyone's hardest or easiest move of the climb. The cascading-dropdown
*UI component* (limb → filtered hold_type → filtered movement_style,
plus wall_angle) is reused as-is, same code, DRY; the *data* stays fully
independent in its own table, `entry_pain_moves` (#572):

```sql
CREATE TABLE entry_pain_moves (
  id             TEXT PRIMARY KEY,
  entry_id       TEXT NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
  limb           TEXT NOT NULL CHECK (limb IN ('hand','foot','knee')),
  side           TEXT NOT NULL CHECK (side IN ('left','right')),
  hold_type      TEXT NOT NULL,   -- same limb-filtered vocabulary as entry_moves
  movement_style TEXT NOT NULL CHECK (
                   (limb = 'hand' AND movement_style IN ('static','dynamic','lockoff'))
                OR (limb != 'hand' AND movement_style IN ('static','dynamic'))
                 ),
  wall_angle     TEXT NOT NULL CHECK (wall_angle IN ('slab','vert','overhang','roof')),
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_entry_pain_moves_entry_id ON entry_pain_moves(entry_id);
```

No `difficulty` column — this table has no hardest/easiest concept, only
"did this move hurt." **This is the sole pain-tracking mechanism**
(revised 2026-08-28) — no separate `entries.pain_flag` column. Zero rows
means no pain logged, one or more means yes; the row count *is* the flag.
A flat boolean was considered and dropped (was #564, now closed) since
nothing in the entry form sets it independently of this list — keeping it
would only be derivable state that could drift out of sync.

## Delivery sequence

Deploy classification matters: any tag touching `migrations/` deploys
direct (beta + production automatically); anything else deploys beta-only
and needs a deliberate `promote.yml` run — learned firsthand via #443's
epic, which sat un-promoted on beta for its entire duration. Schema work
is grouped first specifically to avoid that risk entirely for that phase;
grouping the app increments together after confines the "remember to
promote" exposure to one contiguous stretch instead of scattering it
across the whole epic.

**Phase 1 — schema (direct-deploy, no promotion needed)**
- #36 — `entry_moves` table (hold type, wall angle, style, limb)
- #37 — attempts-to-send field
- #563 — `rpe` field
- #572 — `entry_pain_moves` table (sole pain-tracking mechanism, shares
  #36's taxonomy)

**Gate — #569 (spike: charting library vs. hand-rolled)** — must land
before any Phase 2 view work starts below; the outcome affects how every
one of #15/#13/#14/#38/#39 gets implemented, not just one of them.

**Phase 2 — hub + views (beta-only; promote each as it's ready)**
- **New issue needed** — the hub page itself, the shared card component
  (incl. the `athlete-mode-row`/`public-logbook-row` migration), and
  moving the grade pyramid to `/performance/pyramid`. This has to land
  *before* any of #15/#13/#14/#38/#39, since none of them have anywhere to
  render into otherwise.
- #15 — volume/intensity trend view
- #13 — strengths/weaknesses breakdown (needs #36)
- #14 — onsight-to-redpoint gap (needs #37)
- #38 — RPE / effort trend (needs #563)
- #39 — injury/pain log (needs #572)

### Chart legibility principles (applies to every time-series view)

Early mockups for #15/#38/#39 were hard to parse — bare CSS bars/lines
with no axis labels, no data-point values, and multiple signals packed
into one mark with no key. Fixed going forward, non-negotiable regardless
of which per-view layout wins:

1. **Real axis labels and tick values** — dates on the x-axis, a numeric
   or categorical scale on the y-axis. No bare unlabeled shapes.
2. **Data labels on the marks themselves** — an actual number/grade on or
   near each bar/point, not just relative height.
3. **Lead with a plain-language headline sentence**, same pattern #13 and
   #14 already use ("2 grades, narrowing") — the chart is supporting
   evidence, not the primary carrier of meaning.

**Shared time-window control**, used by every time-series view (#15, #14,
#38): a segmented pill control (`3mo` / `12mo` / `Custom`) rather than a
raw date-range picker as the default — matches the fixed-shortcut
presets Raven specified (today/yesterday/past week/month/3 months/12
months), with `Custom` opening a real range picker for anything finer.
Same implementation granularity as the shared card component above (a
JS helper, not a new Custom Element) — reused across all three views
rather than rebuilt per page.

#13's interaction design is unchanged from before (below). #15/#14/#39
are now decided too (below); #38's insight framing is decided (per-climb
effort vs. grade, not training-session load — see #563/#38) but its exact
chart layout is still open, pending #569.

### #15 volume & intensity: interaction design

**Compound bar + line chart**, not the small-multiples layout considered
earlier — bars for climbs logged per time bucket, a line overlaid on the
same plot for max grade sent in that bucket. Small multiples (two aligned
mini-charts) was mocked and rejected in favor of this: seeing volume and
grade trend together in one glance reads better than scanning two
separate panels. Grade labels sit directly on the line's points (`V4`,
`V5`, ...) rather than a numeric y-axis, since grade is ordinal, not a
clean linear scale. Caveat stays explicit: send-log proxy for training
load, not a measure of real training stimulus.

### #14 onsight/redpoint gap: interaction design

**Two overlaid trend lines** (first-attempt-success max grade, eventual-
send max grade) over time, not a single abstracted "gap" number or
sparkline — shows both underlying numbers directly, so it's visible
whether the gap is closing because the harder metric is catching up or
because the easier one has stalled.

- **Discipline-specific terminology**: "onsight-to-redpoint" is
  lead-climbing vocabulary; boulder's equivalent is flash-to-send. The
  view picks the right pair based on the entry's discipline rather than
  using one fixed pair everywhere.
- **Third data layer: attempts-to-send.** #37's field becomes a bar layer
  behind the two trend lines (average attempts per send, per time
  bucket) — same compound bar+line pattern as #15, reused for visual
  consistency across the hub rather than inventing a different chart
  language per view.
- Evidence-tier chip: "Community data" (#16's pink tier), since the
  8a.nu/Climbstat reference data is a single data-analysis layer, not
  peer-reviewed.

### #39 injury/pain: interaction design

**A chronological log, not a chart.** Pain events are sparse, discrete
occurrences — a chart trying to correlate two thin signals (pain flags
against volume/intensity) is weaker than a scannable list; an early
mockup overlaying a marker on a bar chart was tried and rejected as
unclear.

- **Log**: entries with one or more `entry_pain_moves` (#572) rows, most
  recent first, each row showing the climb, date, and the specific
  move(s) tagged.
- **Headline ranked callout**, reusing #13's exact pattern (same
  confidence-gated ranking, same minimum-sample-size threshold before a
  combination is presented as a real pattern rather than noise), surfaces
  above the log once enough move-level tags exist: "your pain flags
  cluster on left-hand crimps, overhang."
- No evidence-tier chip here (unlike #14/#38) — this is the app's own
  data overlay, not a sourced external claim. Framed per the research
  doc as "a pattern-noticing tool, not medical advice."

### #13 strengths/weaknesses: interaction design

- **Default view — auto-surfaced headline.** No filter picking required:
  the view opens on the single weakest full four-dimension combination
  (limb+side, hold type, movement style, wall angle) that clears the
  confidence gate below, stated in plain language ("Your left hand on
  overhanging crimps looks like a key weakness") rather than making the
  user hunt for it.
- **Drill-down — single-dimension anchor.** The user picks any *one*
  dimension value (a hold type, a wall angle, a limb, a movement style)
  to anchor on; the view pivots to rank every combination of the
  *remaining three* dimensions for that anchor, weakest to strongest.
  Multi-dimension anchoring (e.g. "crimp + overhang" together) is
  explicitly out of scope for v1 — the auto-surfaced headline already
  covers the highest-value case, and stacking anchors multiplies UI
  complexity for comparatively little extra insight.
- **Ranking score.** `entry_moves` is self-tagged, not a send/attempt
  success rate, so the score has to come from tag frequency: per
  combination-cell, `hardest_count / (hardest_count + easiest_count)` — a
  net "hardest share."
- **Confidence gate.** A cell needs a minimum total tag count (placeholder
  ≥5, tune once there's real data) before it's ranked and shown at all;
  below that it reads "not enough data yet" rather than a false-confidence
  ranked entry. Same evidence-honesty discipline the research doc already
  applies elsewhere (the RPE reliability caveat, the onsight/redpoint
  gap's "community data suggests" framing) — a one/zero-tag cell scoring
  100% "weakness" would undermine that.
- **Coaching-heuristic overlay.** The headline (and each ranked entry) can
  pair with a suggested drill pulled from a lookup table (hold type ×
  movement style [× wall angle] → suggestion), explicitly labeled as a
  coaching heuristic — the same evidence tier #16's chips already give
  the 8-4-2-1 pyramid ratio, never presented as personalized clinical
  advice. Authoring that lookup table's actual content is real,
  separately-scoped work — not something to improvise per insight at
  render time.

## Entry form

Where all of the above data actually gets captured: a new **"Performance
data"** section appended to the existing add/edit entry modal
(`client/entry-form.js`, `public/log/index.html`'s `#entry-form`) — not a
separate page or flow. Athlete-Mode-gated per #40's existing design, same
as every other coaching field. Grounded in the real form's current
structure (a flat sequence of labeled fields, no `<section>` wrappers
today) and its offline model: the whole entry is built as one plain object
and queued atomically on submit (`queue.push({kind:"entry", op, record})`)
— any new flat field rides through this for free.

Order, top to bottom: **Exertion, Attempts, Move difficulty, Pain/injury
during this climb.**

### Exertion

A 0–100% slider in 10% increments (11 stops), not a raw 1–10 number —
friendlier at a glance than the underlying RPE scale it's built on (see
#563). **Conditionally visible: only rendered when the entry's status is
Send or Flash.** Not gated with an explanatory caption ("sends only") —
just genuinely absent from the DOM for Project/Checkout/Archived, since a
field that isn't there needs no explanation. Exertion is a property of
having sent the climb, not of an unsent attempt.

### Attempts

A stepper — `−` / count (3-digit-wide, centered) / `+` — not a typed
number field, per the low-friction/glove-friendly requirement.

**Saves immediately on each tap, independent of the form's own Submit
button**, in edit mode only — same PATCH-on-change pattern
`client/admin-auth.js`'s `setAthleteMode`/`setLogbookPublic` already use,
not queued as part of the eventual full-entry save. A boulder/route can
sit as a project across many hours or multiple separate sessions before
it's finally sent; the modal itself won't realistically stay open that
whole time (mobile tabs get evicted), so waiting for the full-form submit
to persist each `+` tap risks losing real attempts. Add mode has no entry
id to PATCH against yet, so there the count is just local state, included
in the initial creation POST like every other field — the multi-hour risk
only exists for entries that already exist.

### Move difficulty

Two labeled sub-lists, unchanged from the `entry_moves` data model design
above: **"Hardest moves for you"** and **"Easiest moves for you"**, each
starting empty with its own "+ Add a move" button. Each added row is a
small card:

- A captioned 2×2 field grid — **Limb**, **Hold type**, **Movement**,
  **Wall angle** — each dropdown's own tiny label sits above it, since a
  bare value chip ("Sloper", "Roof") means nothing without knowing which
  dimension it belongs to.
- The grid is `grid-template-columns: repeat(auto-fit, minmax(85px,
  1fr))` (or similar) — **one row of four on a wide viewport, two rows of
  two on the narrow modal**, same markup either way, no manual breakpoint.
- A remove control sits above the grid, not inside it, so both grid rows
  stay evenly split rather than one row absorbing the remove button's
  space.

Cascading behavior (limb filters hold_type options, which filters
movement_style options) as designed earlier in this doc.

### Pain / injury during this climb

One list, same card/grid shape and cascading-dropdown component as Move
difficulty (DRY — same code, bound to `entry_pain_moves` instead of
`entry_moves`), just "+ Add a move" with **no checkbox**. Zero rows means
no pain logged; one or more rows means yes — the presence of rows *is*
the flag, so a separate boolean toggle would just be redundant state that
could drift out of sync with the list.

**Resolved 2026-08-28**: `entries.pain_flag` (#564) is dropped — closed,
superseded by #572. #39 queries `entry_pain_moves` presence directly
(`EXISTS`/count) rather than keeping a flat column that only mirrors
derivable state. The tradeoff is a join instead of an indexed boolean for
#39's log filter — accepted now, revisit only if that join is ever a
measured problem, not a hypothetical one.

### Offline

`entry_moves`/`entry_pain_moves` rows travel as nested arrays on the same
entry object the offline queue already treats as one atomic record (e.g.
`entry.moves: [...]`, `entry.painMoves: [...]`) — the server's upsert
diffs-and-replaces those child rows by `entry_id` when it handles the
save, same "whole entry is the atomic offline-queueable unit" model as
today, just with two more array fields on it. Attempts is the one
deliberate exception (see above) — it bypasses the queue-on-submit model
entirely in favor of immediate persistence, because losing it silently
would be worse than a slightly different sync story for that one field.

## Testing

Same three-layer pattern already used throughout this codebase: Vitest for
any pure aggregation logic (the `entry_moves`/`entry_pain_moves` ranking
and confidence-gate math, the RPE-vs-grade framing, the attempts-to-send
bucketing), Playwright e2e against each new static shell + composition
root (same `mockApi()`-based fixture-harness pattern as `log-page.spec.js`
etc.) plus the entry form's new section and its offline/immediate-save
behavior, and real-browser verification for the hub's tile layout/
navigation, the shared card component's two variants (switch control vs.
"View" button), the shared time-window control, and the move-difficulty
grid's responsive reflow.
