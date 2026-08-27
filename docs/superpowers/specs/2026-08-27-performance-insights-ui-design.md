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
| `/performance/rpe` | Session RPE trend (#38) | new |
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
Both new schema fields are per-entry, nullable, additive:

- `rpe` (nullable integer, `entries`) — #563
- `pain_flag` (nullable boolean, `entries`, `CHECK (pain_flag IN (0,1))`)
  — #564

#38's "session RPE trend" and #39's "injury/pain correlation" both
aggregate same-day entries at query time rather than the schema
persisting any session-grouping row.

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
- #36 — movement/terrain fields
- #37 — attempts-to-send field
- #563 — `rpe` field
- #564 — `pain_flag` field

**Phase 2 — hub + views (beta-only; promote each as it's ready)**
- **New issue needed** — the hub page itself, the shared card component
  (incl. the `athlete-mode-row`/`public-logbook-row` migration), and
  moving the grade pyramid to `/performance/pyramid`. This has to land
  *before* any of #15/#13/#14/#38/#39, since none of them have anywhere to
  render into otherwise.
- #15 — volume/intensity trend view
- #13 — strengths/weaknesses breakdown (needs #36)
- #14 — onsight-to-redpoint gap (needs #37)
- #38 — session RPE trend (needs #563)
- #39 — injury/pain correlation (needs #564)

Chart type/visual treatment per individual view (table vs. radar vs.
heatmap for #13, etc.) is deliberately not decided here — a smaller,
per-issue design question for whoever picks each one up, not a blocker for
this shared structural work.

## Testing

Same three-layer pattern already used throughout this codebase: Vitest for
any pure aggregation logic (e.g. the per-day RPE/pain-flag grouping),
Playwright e2e against each new static shell + composition root (same
`mockApi()`-based fixture-harness pattern as `log-page.spec.js` etc.), and
real-browser verification for the hub's tile layout/navigation and the
shared card component's two variants (switch control vs. "View" button).
