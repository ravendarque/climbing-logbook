# Configurable grade systems (#183) — design

Design for #183's remaining work. Its foundation is already merged:

| # | What it delivered |
|---|---|
| #461 | `gradeRank(g, type)` — per-discipline ordinal (a hand-kept string list, `BOULDER_ORDER`/`LEAD_ORDER`) |
| #129 | Extended both picker ranges (Boulder `1`–`9A`, Sport `1`–`9c+`) |
| #209 | Pyramid "Below 6A"/"Below 6a" base-tier aggregation |
| #462 | `gradeTier(g, type)` — five headline tiers (Beginner…Hyper Elite) |
| #463/#696/#698 | Tier-based colour; `gradePyramidColor()` per-grade shade |

What's left is the actual **multi-scale** layer: several grade scales per
discipline, a real canonical model underneath them, "as logged" storage
and display, two entry/report scale pickers, a tier-based logbook filter
and grade search, and a cited reference page. This spec covers all of it.

## The requirements (Raven, verbatim intent)

Six things this has to be true for, in priority order — everything below
argues from these:

1. Log a climb using whatever grade the source (guidebook/app/topo) shows.
2. See that climb's grade in the logbook **exactly as logged** — not
   relabelled into some other scale.
3. Report on performance across all climbs in **one chosen scale**, via a
   canonical conversion that's invisible to the user.
4. Sort/filter the logbook by difficulty across all climbs, **still
   displayed in the scale each was logged in** — the canonical conversion
   backing sort/filter is invisible, the display isn't touched by it.
5. Export data exactly as logged — grade and grading system as specified.
6. Import data with an explicit grade + grading system per row — no
   ambiguity, no scale inference.

(1) is sub-issue B, (2)+(5)+(6) drive the storage model below, (3) is
sub-issue C (now reports-only, see "What changed" below), (4) is a large
part of sub-issue A + the new sub-issue F.

## What changed from the first draft of this spec

This spec went through two correction rounds with Raven before being
treated as ready to implement from. Recorded here so the reasoning isn't
lost:

- **V-scale/Font conversion was wrong.** The first draft equated `6A`
  with `V0`, which no real chart shows. Re-verified against
  [hakaru.io's V-scale converter](https://hakaru.io/tools/bouldering-v-scale-converter)
  (Raven's source, used as ground truth where sources disagree) — see
  "The eight — now nine — scales" below for the corrected table.
- **Storage was under-specified.** The first draft proposed storing a
  single "canonical label" string, which silently violates requirements
  2/5/6 above (it isn't what was logged, and it's a literal string
  duplicated everywhere rather than a normalized reference). Storage is
  now "as logged" — see "Storage" below.
- **Ordering.** Confirmed grade labels mostly do **not** sort correctly
  as plain strings (`"5.10a" < "5.9"` lexicographically; `"III+" <
  "III-"` by ASCII). Not a new problem needing a bespoke comparator,
  though — the canonical-ordinal model already being built for
  conversion gives correct ordering for free. What the rework actually
  fixes is that there is now **exactly one literal label list per
  scale**, with ordinal derived from position in it — never a second
  hand-kept order list running in parallel (the exact class of bug #698
  found in `BOULDER_ORDER` drifting from `BOULDER_GRADES`).
- **Grade filter is now tier-based, not scale-based**, and grade search
  is a new, separate dimension — see sub-issue F.
- **Sub-issue D is gone as a follow-up** — "show grade as logged" is now
  the *only* way the logbook has ever worked under this model, not a
  deferred enhancement. Its schema-migration concern folds into A.
- **Sub-issue C narrows to reports only.** There's no "view scale" for
  the logbook anymore (requirement 4) — only performance reports need a
  single chosen scale to render aggregate data in.

## Scope

In scope:

1. **A canonical grade model** — one internal ordinal per discipline, at
   the finest granularity any scale needs, computed on demand (not
   stored — see "Storage"). Replaces the drift-prone
   `BOULDER_ORDER`/`LEAD_ORDER` string lists (#698 caught them out of
   sync with the picker).
2. **Nine scales** built at once (Raven's call — not phased). Boulder:
   Font, Font (Non-standard), V-scale. Sport: French, French
   (Non-standard), UIAA, YDS, Norwegian, Australian.
3. **Storage as logged**: `entries.grade` (the label, unchanged column)
   plus a new `entries.grade_scale` column recording which of the nine
   scales it's in. No separate stored ordinal.
4. A **scale picker + preference for the add/edit entry form** (sub-issue B).
5. A **scale picker + preference for performance reports only** (sub-issue C).
6. `gradeTier` thresholds re-expressed against the canonical ordinal.
7. **Logbook grade filter (5 tiers, multi-select) + grade search**
   (sub-issue F) — replaces the old grade-range slider.
8. A **dedicated "Grade scales & conversion" reference page** (sub-issue
   E) — renders the full cross-scale matrix, explains the caveats, and
   cites every source.

Also on the board, tracked separately (not part of #183): a **public,
apex-hosted version of the conversion data**, under epic #472 — see
"Related, separate issue" below.

## The eight — now nine — scales (verified)

### Boulder

**Font (standard)** — uppercase, starts at `3`, `A/B/C` only from `6`,
`+` throughout:

```
3, 3+, 4, 4+, 5, 5+, 6A, 6A+, 6B, 6B+, 6C, 6C+, 7A, 7A+, 7B, 7B+,
7C, 7C+, 8A, 8A+, 8B, 8B+, 8C, 8C+, 9A
```

**Font (Non-standard)** — the Fontainebleau/Magic Wood guidebook
convention (previously called "Font (extended)" in this spec —
renamed, and its flat dropdown is replaced by a structured input, see
below). Lowercase, starts at `1a`, `a/b/c` all the way down, `+` from
`6a`:

```
1a, 1b, 1c, 2a, 2b, 2c, 3a, 3b, 3c, 4a, 4b, 4c, 5a, 5b, 5c,
6a, 6a+, 6b, 6b+, 6c, 6c+, 7a, 7a+, 7b, 7b+, 7c, 7c+,
8a, 8a+, 8b, 8b+, 8c, 8c+, 9a
```

**V-scale (Hueco)** — starts at `VB`, with `V0-`/`V0`/`V0+` subdivisions
then single steps:

```
VB, V0-, V0, V0+, V1, V2, V3, V4, V5, V6, V7, V8, V9, V10,
V11, V12, V13, V14, V15, V16, V17
```

**Corrected conversion** (was `6A ≈ V0` in the first draft — wrong).
V-scale is **coarser** than Font below 7C: several V-scale steps each
cover two Font grades. Verified against
[hakaru.io's V-scale converter](https://hakaru.io/tools/bouldering-v-scale-converter)
(Raven's source, used as ground truth):

```
VB=3, V0-=3+, V0=4, V0+=4+, V1=5, V2=5+,
V3=6A/6A+, V4=6B/6B+, V5=6C/6C+, V6=7A, V7=7A+, V8=7B/7B+,
V9=7C, V10=7C+, V11=8A, V12=8A+, V13=8B, V14=8B+, V15=8C, V16=8C+, V17=9A
```

V-scale is modeled as a **coarse scale**, same treatment as
UIAA/Norwegian/Ewbank on Sport — V3/V4/V5/V8 each cover 2 canonical Font
ordinals; on input a V-scale grade resolves to the lower of the pair (no
true "middle" of a 2-wide range); on output a canonical grade renders as
whichever V-scale step's range contains it. Only VB…V2, V6, and V9+ are
1:1 with Font.

Cross-checked against Wikipedia's ["Grade (climbing)"](https://en.wikipedia.org/wiki/Grade_(climbing))
comparison table, which disagrees on fine detail (different anchors from
V3 up, runs to V18 not V17) but agrees on the two things that matter
most: V0–V2 track Font's sub-6A grades 1:1, and **V9 = 7C** — the
documented "exactly aligns after V9/7C" anchor both sources state
independently.

### Sport

**French (FFME)** — Raven's decision after checking FFME, French
Wikipedia, the Rockfax 2020 chart, and English references, which
disagree below `6a`. FFME's own convention: letters from `3`, `+` from
`5a`. From `6a` up every source agrees exactly.

```
1, 2, 3a, 3b, 3c, 4a, 4b, 4c, 5a, 5a+, 5b, 5b+, 5c, 5c+,
6a, 6a+, 6b, 6b+, 6c, 6c+, 7a, 7a+, 7b, 7b+, 7c, 7c+,
8a, 8a+, 8b, 8b+, 8c, 8c+, 9a, 9a+, 9b, 9b+, 9c, 9c+
```

This **replaces the current `LEAD_GRADES` low end** (`1, 1+, 2, 2+, 3,
3+, 4a, 4b, 4c, 5a, 5b, 5c`, from #129) — see "Risks / open notes" for
the existing-entry migration.

**French (Non-standard)** — new. Not a UI reskin of French — genuinely
additive (Sport's picker goes from 5 scales to 6). FFME is one specific
convention for where letters/`+` start; other guidebooks/apps use
letters and modifiers placed differently, the same "problem" Font
(Non-standard) solves for Boulder. Same structured input, own formula —
see below.

**UIAA** — Roman numerals, `+`/`-` refinement, open-ended:

```
I, II, III-, III, III+, IV-, IV, IV+, V-, V, V+, VI-, VI, VI+,
VII-, VII, VII+, VIII-, VIII, VIII+, IX-, IX, IX+, X-, X, X+,
XI-, XI, XI+, XII-, XII, XII+
```

**YDS** — `5.0`–`5.9` then `a/b/c/d` from `5.10`:

```
5.0, 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 5.9,
5.10a, 5.10b, 5.10c, 5.10d, 5.11a, 5.11b, 5.11c, 5.11d,
5.12a, 5.12b, 5.12c, 5.12d, 5.13a, 5.13b, 5.13c, 5.13d,
5.14a, 5.14b, 5.14c, 5.14d, 5.15a, 5.15b, 5.15c, 5.15d
```

**Norwegian** — whole numbers, `-`/plain/`+` (three per number). Coarser
than French and offset (`6a=6-`, `6a+=6`, `6b=6+`, `6b+=7-`, `6c=7`, …):

```
1, 1+, 2-, 2, 2+, 3-, 3, 3+, 4-, 4, 4+, 5-, 5, 5+,
6-, 6, 6+, 7-, 7, 7+, 8-, 8, 8+, 9-, 9, 9+, 10-, 10, 10+, 11-, 11
```

**Australian (Ewbank)** — bare integers, open-ended:

```
1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19,
20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36,
37, 38, 39, 40
```

Sport conversions are **lossy and known to be**. French↔UIAA↔YDS are
roughly 1:1 with documented anchor points; Norwegian and Ewbank have
different granularity and offsets. The matrix records best-effort
equivalences; coarse-scale round-trips are lossy by design and that is
acceptable (every conversion tool has the same limitation).

### The Non-standard scales — structured input, not a flat list

Font (Non-standard) and French (Non-standard) share a real problem: a
flat dropdown enumerating every combination is awkward at exactly the
range that matters (irregular heads, letters/modifiers that only kick in
partway up), and hand-writing that enumeration is the same maintenance
trap that caused #698 (`BOULDER_ORDER` silently drifting from
`BOULDER_GRADES`).

**Raven's solution**: replace the flat dropdown, for these two scales
only, with three fields:

- **Number** (1–9, required)
- **Letter** (a–c, optional)
- **Modifier** (+ or -, optional)

**Correction — this is not two irregular-headed scales, it's one
uniform combinatorial space.** Confirmed with Raven: `-` is essential
(real guidebooks — e.g. Jingo Wobbly for Font — use it in the wild), and
every number from `1` up takes the full combination of optional letter
and optional modifier, independently, with no irregular "letters/
modifiers only kick in partway up" gating at all. Per number `N`, all
twelve of these are valid and distinct:

```
N-, N, Na-, Na, Na+, Nb-, Nb, Nb+, Nc-, Nc, Nc+, N+
```

(Raven's own example: `2, 2-, 2+, 2a-, 2a, 2a+`, etc.) This replaces the
earlier `letterFrom`/`modifierFrom`-per-discipline idea entirely — there
is no per-discipline parametrization left to do. **One function, with no
discipline-specific constants at all**, shared verbatim by both Font
(Non-standard) and French (Non-standard):
`nonStandardOrdinal(number, letter, modifier)` → a 0–11 sub-position
within `N`, combined as `(number - 1) * 12 + subPosition` for a position
within that scale's own space.

**Sub-position ordering within `N` — corrected 2026-09-11, after a real
worked example.** The original proposal (bare-number below the whole
lettered breakdown: `N-, N, N+, Na-, Na, Na+, …`) was wrong — Raven gave
a concrete case that breaks it: three real climbs logged as `2`, `2a+`,
and `2+` must sort `2 < 2a+ < 2+`, which requires `2+` to rank *above*
`2a+`, not below the entire lettered range. The fix keeps `N-`/`N` (bare,
no modifier) at the bottom — Raven's original "bare sits at the bottom"
call still holds for those two — but moves bare `N+` to the very *top*
of `N`'s range, past the lettered breakdown, since `+` reads as "the
strong edge of this number, bordering the next one" — the same intuition
`+` already carries everywhere else in this matrix (UIAA/Norwegian's own
`-`/plain/`+` triads, French's `a+`/`b+`/`c+`). Checked against the
example: `nonStandardOrdinal(2, null, null)` (=1) < `nonStandardOrdinal(2,
"a", "+")` (=4) < `nonStandardOrdinal(2, null, "+")` (=11). Still 12
slots, still no per-discipline parameters — only where `N+` sits changed.

**Architectural consequence — this now drives the canonical ordinal's
finest resolution.** No real published scale in this spec (Font,
V-scale, French, UIAA, YDS, Norwegian, Ewbank) ever uses more than 2–3
sub-positions per number. The 12-per-number combinatorial space above is
required *only* because the two Non-standard scales must accept
literally anything a guidebook might print. Consequence: each
discipline's canonical ordinal list widens to this 12-per-number
resolution, and every real named scale now occupies a **sparse subset**
of it — e.g. Font-standard only ever lands on the bare-`N`/bare-`N+`
and `Na`/`Na+`-shaped positions it actually publishes (`3`, `3+`, `6A`,
`6A+`, …), never `N-` or `Nb-`. This is the same "wider than the picker"
precedent already established elsewhere in this codebase (`gradeRank`'s
existing defensive extras) — an unused canonical position isn't a
problem, it's just a position no real scale happens to render. Most
Non-standard-only positions (the ones no real scale ever hits) have no
matrix anchor and convert to other scales purely by interpolation —
consistent with the "coarse scale conversion is lossy by design" stance
already taken for UIAA/Norwegian/Ewbank.

**Real vs. moot, for the record:** this distinction only matters once
entries can genuinely mix bare and lettered Non-standard notation for the
same number — which can't happen until sub-issue B ships a real picker
(today's only Non-standard-scale entries are #702's own migration
backfill, bare-form only). Getting it exactly right now cost little
either way, since the ordinal is never stored (see "Storage" below) —
changing the formula later, if it turns out to matter differently in
practice, is a pure code change with no migration.

**Open note (not blocking, flag during B's implementation)**: whether
the UI restricts field combinations (e.g. a climber is unlikely to ever
enter `Na-`) or just accepts anything entered is a sub-issue B UI
decision, not a data model question — the conversion function is
defined for the full space either way.

## Canonical model

### The ordinal

**One internal ordinal per discipline**, defined at the *finest*
granularity any supported scale needs. In practice that finest
granularity is set by the two Non-standard scales' full 12-per-number
combinatorial space (see above), not by any of the seven real published
scales — every real scale (including French/Font-extended) lands on a
sparse subset of it. Every scale is a mapping to and from it. It is
**never stored** — see "Storage" below — only computed on demand from a
`(grade, grade_scale)` pair, the same way `gradeRank()` computes a rank
from `(grade, type)` today.

Concretely, `shared/grade-data.js` gains, per discipline, an ordered
list of canonical steps (the finest grade progression), and each scale
is two lookups:

- **ordinal → label** — render a canonical grade in that scale.
- **label → ordinal** — parse an input grade in that scale.

Coarse scales (UIAA, Norwegian, Ewbank, V-scale) map *several* canonical
ordinals to one label. On input, a coarse label resolves to the
**middle** ordinal of the range it covers (Raven's call — "if someone is
logging Ewbank but viewing in French they already know it's a coarse
conversion"; for 2-wide ranges like V-scale's, that's the lower of the
two). On output, a canonical ordinal renders as whichever coarse label's
range contains it. This resolution only ever happens transiently, at the
moment something needs to be *displayed* in a different scale than it
was logged in (a performance report, or a view converting for the
reference page) — it never mutates what's stored.

### What replaces what

| Today | Under the model |
|---|---|
| `BOULDER_ORDER` / `LEAD_ORDER` (hand-kept string lists) | the per-discipline canonical step list |
| `BOULDER_GRADES` (the `1,1+,1A,1B,1C,…` hybrid — not any real scale) | split into **Font (standard)** + **Font (Non-standard)** scale maps |
| `LEAD_GRADES` (`1,1+,2,2+,3,3+,4a,…`) | the **French** scale map, low end corrected to FFME, plus the new **French (Non-standard)** map |
| `gradeRank(g, type)` | `(g, scale)` → ordinal; still returns a comparable number, computed not stored |
| `gradeTier(g, type)` | thresholds re-expressed as canonical ordinals |
| `gradeColor` / `gradePyramidColor` / `gradeDisplayLabel` | key off the ordinal; `gradeDisplayLabel`'s Boulder V-scale special case folds into the V-scale map |

`gradeRank`'s existing `?? 99` fallback and the "wider than the picker"
defensive extras stay in spirit — but derived from the canonical list +
a small explicit out-of-picker set, not a second hand-kept list (the
#698 comment already flags this).

### The conversion matrix

Applies to the **six data-driven scales** (Font, V-scale, French, UIAA,
YDS, Norwegian, Ewbank) — the two Non-standard scales use the shared
formula above instead of matrix data, since they're defined structurally
rather than by an external published table.

Seed from the openclimbing-style table still in #183's body (collapsed
`<details>` — UIAA / French / Saxon / YDS / V-Grade / UK / Norwegian /
Fontainebleau columns), refined with:

- Wikipedia [Grade (climbing)](https://en.wikipedia.org/wiki/Grade_(climbing))
  anchor rows (`5.10a≈6a≈VI+≈Ewbank 18–19≈Nor 6-`, etc.).
- FFME / French Wikipedia for the French low end.
- theCrag's Norwegian conversion (`6a=6-` … `8c=9+`).
- hakaru.io for the V-scale/Font pair (see correction above).

The matrix is data, committed to the repo (not just a doc) — a per-scale
`ordinal ↔ label` table. Where a source gives a range or a `/`
(`5.10a/b`), the model picks one canonical ordinal per label and
documents it inline.

**Every conversion carries its source.** The matrix data structure
records, per anchor, which source(s) it came from — so the reference
page (sub-issue E) can cite them and so a future correction has a paper
trail. Sources so far: FFME, French/English Wikipedia
[Grade (climbing)](https://en.wikipedia.org/wiki/Grade_(climbing)),
theCrag (Norwegian), the openclimbing-style table in #183's body,
Rockfax's 2020 comparison chart, hakaru.io (V-scale), IRCRA (Draper et
al., 2016 — already cited in `docs/climbing-analytics-research.md`).

### Storage

**Decision (revised): store exactly what was logged, nothing derived.**

- `entries.grade` — the label, unchanged column, exactly as entered
  (e.g. `"6a+"`, `"V4"`, `"5.11a"`) — requirement 2/5 (as-logged
  display, as-logged export) is satisfied by construction, not by
  reconstruction.
- `entries.grade_scale` — **new column**, which of the nine scales
  `grade` is in. Required on write — requirement 6 (import needs both,
  unambiguous).
- **No stored ordinal.** The canonical ordinal is computed on demand
  from `(grade, grade_scale)` — exactly how `gradeRank()` already
  computes a rank from `(grade, type)` today, just with a scale
  parameter instead of an assumed single implicit scale. This was the
  right call to walk back from the previous draft's "materialize a
  stable id" proposal: this app filters/sorts entries in application
  code over a small per-user result set (`client/entries.js`'s
  `filteredEntries`/`sortEntries`, not a SQL `WHERE`/`ORDER BY`), so
  there's no query-performance case for a persisted derived column —
  and not persisting it means there is nothing to keep in sync if a
  matrix anchor ever gets corrected.

The add/edit form takes input in the user's chosen scale — for the two
Non-standard scales, from the number/letter/modifier fields — and writes
`(grade, grade_scale)` verbatim as entered; there is no conversion at
write time at all. Views convert `(grade, grade_scale)` to the ordinal,
then to the view's chosen scale, only at render time.

### Preferences

Two independent per-discipline preferences, both defaulting to "last one
selected":

| Preference | Scope | Default when never set |
|---|---|---|
| `gradeScale.entry.<discipline>` | the add/edit form's grade picker only | Font (Non-standard) / French |
| `gradeScale.reports.<discipline>` | performance reports only — **not** the logbook, which always shows as-logged (requirement 4) | Font (Non-standard) / French |

Renamed from `gradeScale.view.*` in the first draft, which implied every
view (including the logbook) shared one displayed scale — that's no
longer true.

Stored the same way the app already persists lightweight client
preferences (match the existing discipline-picker / theme-toggle
persistence, whatever that is — `localStorage` or a settings row; follow
precedent, don't invent).

## Delivery — sub-issues (dependency order)

### A. Canonical grade model + 9 scales + conversion matrix + storage

`shared/grade-data.js` rework, plus the one schema change everything
else depends on.

- Canonical step list per discipline.
- All 9 scales as `ordinal ↔ label` maps or (for the two Non-standard
  scales) the shared `gradeOrdinal(number, letter, modifier,
  discipline)` formula.
- The committed conversion matrix (6 data-driven scales).
- `gradeRank` / `gradeTier` / `gradeColor` / `gradePyramidColor` /
  `gradeDisplayLabel` re-pointed at `(grade, scale) → ordinal`,
  computed on demand.
- `BOULDER_ORDER` / `LEAD_ORDER` deleted; `BOULDER_GRADES` split into
  Font-standard + Font-Non-standard; `LEAD_GRADES` → French with the
  FFME low end, plus French-Non-standard added.
- `entry-schema.js`'s `VALID_GRADES` derives from the canonical label
  set (already derives from `BOULDER_GRADES`/`LEAD_GRADES` — just
  re-point it), and gains `grade_scale` validation.
- **Migration**: add `entries.grade_scale`, backfill existing rows.
  See "Risks / open notes" for the concrete backfill mapping — this is
  a judgment call (not additive-only), so per your stated merge policy
  the PR stays open for your review rather than being self-merged
  (though the real dataset is tiny — see "Risks / open notes").
- Full unit coverage: every scale's `ordinal → label → ordinal`
  round-trips for fine scales; coarse scales round-trip to the range
  boundary they resolve to; every documented matrix anchor asserted;
  the shared `nonStandardOrdinal(number, letter, modifier)` formula
  tested against its full 12-per-number space for both disciplines.

**Depends on nothing.** Blocks B, C, E, F.

### B. Add/edit form scale picker + preference

- A scale-picker control next to the grade selector in the entry form
  (`client/entry-form.js`), opening a popup list of the current
  discipline's scales.
- Choosing a scale relabels the grade input via A's maps — a dropdown
  for the seven data-driven scales, the number/letter/modifier fields
  for the two Non-standard ones.
- On submit, writes `(grade, grade_scale)` verbatim — no conversion.
- Persist `gradeScale.entry.<discipline>`; restore on open.
- Editing an existing entry: show its stored `(grade, grade_scale)`
  exactly, in the picker matching what was actually logged (not the
  preference).

**Depends on A.**

### C. Reports scale picker + preference

- A scale picker on the performance-reports pages only
  (`client/performance-*-main.js`) — **not** the logbook.
- Charts and headline copy render grades via A's maps in the chosen
  scale (`shared/*-stats.js`'s `gradeDisplayLabel` calls, chart axis
  labels, pyramid rung labels).
- Persist `gradeScale.reports.<discipline>`.
- Links to the reference page (E).

**Depends on A.** (E can land before or after — the "how do these
compare?" link degrades gracefully if E isn't up yet.)

### E. "Grade scales & conversion" reference page

- Renders the full cross-scale matrix from A's data — all 9 scales side
  by side, per canonical step.
- Prose section on the caveats: sport cross-scale conversion is lossy;
  the low-end conventions (French below `6a`, Font `5/5A/5B/5C`) are
  choices not facts; coarse scales collapse many grades to one label.
- **Cites every source**, pulled from the per-anchor source field in
  A's matrix data plus the prose sources — FFME, Wikipedia, theCrag,
  openclimbing, Rockfax, hakaru.io. Written in the app's own voice, same
  as the citations dialog.
- Static-ish page (reads A's committed data, no live API) — its own
  route, gated like the other public reference content.

**Depends on A.** Independent of B/C/F.

### F. Logbook grade filter (tiers) + grade search

New sub-issue, not in the first draft.

- **Filter**: replace `client/entries.js`'s `gradeRange:{min,max}` facet
  with a tier facet — multi-select `Set` of the five tiers
  (Beginner…Hyper Elite), same UI pattern as the existing
  `statusFilters` `Set`. Filters on `gradeTier(gradeRank(e.grade,
  e.grade_scale, activeType))`.
- **Search**: extend the existing free-text `search` predicate
  (`client/entries.js:68`, currently `name` + area only) to also match
  the as-logged `grade` label:
  - Query **without** a trailing modifier matches case-insensitively
    against the base (number+letter), including both modifier variants
    — searching `7A` matches `7A`, `7a`, `7A+`, `7a+`.
  - Query **with** a trailing modifier matches case-insensitively,
    modifier included — searching `7a+` matches `7a+`/`7A+` only.
  - Pure string matching over the as-logged label — deliberately **not**
    canonical/cross-scale (a search for `7A` does not also surface a
    `V3` entry that happens to convert to the same range). Keeps this a
    small, predictable text feature rather than folding in the
    conversion matrix; the tier filter already covers the
    cross-scale-equivalence use case.

**Depends on A** (tiers already exist via #462; needs `grade_scale` from
A's migration to compute ordinal correctly across scales).

## Risks / open notes

Real dataset is small (Raven's own logbook — a handful of Boulder
entries, three Sport entries), so the backfills below are low-risk in
practice; still leaving A's PR open per policy since the migration logic
itself needs to be right regardless of current row count.

- **Boulder backfill.** Every existing Boulder entry's `grade` string is
  in the app's old ad-hoc hybrid notation (uppercase, but with letters
  below `6A` — `"1A"`, `"5C"` — which is neither real Font-standard,
  which has no letters below `6`, nor real Font-extended, which is
  lowercase). It's a 1:1 match for Font-extended's own progression once
  lowercased. Proposed backfill: `grade_scale = 'font-non-standard'` for
  every existing Boulder row, `grade = grade.toLowerCase()`. Mechanical,
  no data loss, no per-row guessing — but it is a real content change to
  every existing row, so it's a judgment call for your review, not
  something to self-merge.
- **Sport backfill / sub-`6a` entries.** The FFME correction only
  changes labels below `6a`. Entries already using `4a`/`4b`/`4c`/`5a`/
  `5b`/`5c` are valid, unchanged labels in the new French table —
  backfill those as `grade_scale = 'french'` verbatim. Entries using the
  *old* low end (`1`, `1+`, `2`, `2+`, `3`, `3+`) were never real FFME
  notation (FFME's own `1`/`2`/`3a` shape didn't have `+` there) —
  backfilling those as `grade_scale = 'french'` would misrepresent them
  as authoritative FFME labels they never were. Proposed backfill:
  `grade_scale = 'french-non-standard'` for these rows, with the
  existing label preserved exactly (number + modifier fields, no
  letter) — honest about what was actually logged, no data loss, no
  relabeling. Check the real count in D1 as the first step of A; if it's
  zero this whole bullet is moot.
- **Coarse-scale display churn.** Rendering a fine canonical grade in
  Ewbank/UIAA/Norwegian/V-scale collapses many distinct grades to one
  label — a report in one of those scales will show repeated labels on
  adjacent points. Expected; the per-grade *colour* (#698) still
  differentiates them visually.
- **Matrix authority.** No source is fully authoritative for sport
  cross-scale conversion. The committed matrix is a documented
  best-effort; treat it as tunable data, not settled fact (same footing
  as `docs/climbing-analytics-research.md`'s own caveated numbers).

## Related, separate issue

**Public grade conversion page on apex** (Raven, sidebar 2026-09-11):
democratize the conversion data by publishing it outside Athlete Mode,
on the logged-out apex site. Tracked under epic
[#472](https://github.com/ravendarque/climbing-logbook/issues/472), not
#183 — it's a public-facing reuse of E's matrix data, not part of the
authenticated app. To be scoped as its own issue once E's data shape is
settled (it can reuse A's committed matrix directly).

## Verification

- Sub-issue A: `pnpm test` — the round-trip + matrix-anchor + Non-standard
  formula unit suite above, plus every existing `grade-data`/`pyramid`/
  `entries`/stats test still green against the re-pointed internals.
- Sub-issues B/C/E/F: driven in a real browser (or `wrangler dev` +
  Playwright) — pick a scale, confirm the picker/dropdown/charts/filter/
  search relabel or match correctly, reload and confirm the preference
  stuck, log an entry in a non-canonical scale (including via the
  Non-standard number/letter/modifier fields) and confirm it stores and
  reads back exactly as entered.
- `docs/app-architecture.md` gets the canonical-model section in the
  same PR as sub-issue A.

Deploy classification: sub-issue A is app-code + a schema migration with
real judgment calls (see "Risks / open notes") — **leave that PR open**
per your stated policy. B/C/F are app-code + UI — **always leave those
PRs open** for review regardless of migration content. E is app-code
only, UI — same, leave open. All beta-first per ADR-0020; promotion is a
separate manual call.
