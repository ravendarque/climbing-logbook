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
discipline, a real canonical model underneath them, two UI pickers, and
persistence. This spec covers that.

## Scope

In scope:

1. A **canonical grade model** — one internal ordinal per discipline,
   every scale a mapping to/from it, plus a best-effort conversion
   matrix. Replaces the drift-prone `BOULDER_ORDER`/`LEAD_ORDER` string
   lists (#698 caught them out of sync with the picker).
2. **All eight scales** built at once (Raven's call — not phased):
   Boulder: Font, Font (extended), V-scale. Sport: French, UIAA, YDS,
   Norwegian, Australian.
3. A **scale picker + preference for the add/edit entry form**.
4. A **scale picker + preference for every view** (performance reports,
   logbook) — one shared preference, separate from #3's.
5. `gradeTier` thresholds re-expressed against the canonical ordinal.
6. A **dedicated "Grade scales & conversion" reference page** — renders
   the full cross-scale matrix, explains the caveats (sport conversions
   are lossy, low-end conventions), and **cites every source**. Linked
   from both scale pickers ("how do these compare?").

Explicitly deferred to a follow-up issue (sub-issue D below):

- **Showing each entry's grade in the notation it was logged in.** It
  conflicts with the grade filter (which works on one scale's labels),
  needs its own `grade_scale` column and filter rework, and isn't
  required for the six items above.

## The eight scales (verified)

Structures below are what the model must enumerate. Where sources
disagree, the chosen convention and why is noted — same "pick and
commit" situation #129 already hit for Font `5/5A/5B/5C`.

### Boulder

**Font (standard)** — uppercase, starts at `3`, `A/B/C` only from `6`,
`+` throughout:

```
3, 3+, 4, 4+, 5, 5+, 6A, 6A+, 6B, 6B+, 6C, 6C+, 7A, 7A+, 7B, 7B+,
7C, 7C+, 8A, 8A+, 8B, 8B+, 8C, 8C+, 9A
```

**Font (extended)** — a genuinely separate scale (the Fontainebleau /
Magic Wood guidebook convention), **lowercase**, starts at `1a`, `a/b/c`
all the way down, `+` from `6a`:

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

Boulder conversions are clean: Font ↔ V-scale is well established and
"exactly aligns after V9 / 7C"; the sub-`6A` correspondence is a known
convention (`V0 ≈ 6A`, `V1 ≈ 6A+/6B`, …).

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
the existing-entry impact.

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

## Canonical model

### The ordinal

**One internal ordinal per discipline**, defined at the *finest*
granularity any supported scale needs — French / Font-extended / YDS
letter+plus resolution. Every scale is a mapping to and from it.

Concretely, `shared/grade-data.js` gains, per discipline, an ordered
list of canonical steps (the finest grade progression), and each scale
is two lookups:

- **ordinal → label** — render a canonical grade in that scale.
- **label → ordinal** — parse an input grade in that scale.

Coarse scales (UIAA, Norwegian, Ewbank) map *several* canonical ordinals
to one label. On input, a coarse label resolves to the **middle**
ordinal of the range it covers (Raven's call — "if someone is logging
Ewbank but viewing in French they already know it's a coarse
conversion"). On output, a canonical ordinal renders as whichever coarse
label's range contains it.

### What replaces what

| Today | Under the model |
|---|---|
| `BOULDER_ORDER` / `LEAD_ORDER` (hand-kept string lists) | the per-discipline canonical step list |
| `BOULDER_GRADES` (the `1,1+,1A,1B,1C,…` hybrid — not any real scale) | split into **Font (standard)** + **Font (extended)** scale maps |
| `LEAD_GRADES` (`1,1+,2,2+,3,3+,4a,…`) | the **French** scale map, low end corrected to FFME |
| `gradeRank(g, type)` | `g` + scale → ordinal; still returns a comparable number |
| `gradeTier(g, type)` | thresholds re-expressed as canonical ordinals |
| `gradeColor` / `gradePyramidColor` / `gradeDisplayLabel` | key off the ordinal; `gradeDisplayLabel`'s Boulder V-scale special case folds into the V-scale map |

`gradeRank`'s existing `?? 99` fallback and the "wider than the picker"
defensive extras stay in spirit — but derived from the canonical list +
a small explicit out-of-picker set, not a second hand-kept list (the
#698 comment already flags this).

### The conversion matrix

Seed from the openclimbing-style table still in #183's body (collapsed
`<details>` — UIAA / French / Saxon / YDS / V-Grade / UK / Norwegian /
Fontainebleau columns), refined with:

- Wikipedia [Grade (climbing)](https://en.wikipedia.org/wiki/Grade_(climbing))
  anchor rows (`5.10a≈6a≈VI+≈Ewbank 18–19≈Nor 6-`, etc.).
- FFME / French Wikipedia for the French low end.
- theCrag's Norwegian conversion (`6a=6-` … `8c=9+`).
- "Font ↔ V-scale exactly aligns after V9 / 7C" for the boulder pair.

The matrix is data, committed to the repo (not just a doc) — a per-scale
`ordinal ↔ label` table. Where a source gives a range or a `/`
(`5.10a/b`), the model picks one canonical ordinal per label and
documents it inline.

**Every conversion carries its source.** The matrix data structure
records, per anchor, which source(s) it came from — so the reference
page (sub-issue E) can cite them and so a future correction has a
paper trail. Sources so far: FFME, French/English Wikipedia
[Grade (climbing)](https://en.wikipedia.org/wiki/Grade_(climbing)),
theCrag (Norwegian), the openclimbing-style table in #183's body,
Rockfax's 2020 comparison chart, IRCRA (Draper et al., 2016 — already
cited in `docs/climbing-analytics-research.md`).

### Storage

**Decision: keep the stored `grade` string as a canonical label, not a
raw ordinal.** The canonical label form is:

- Boulder: **Font (extended)** notation (lowercase, finest-grained).
- Sport: **French (FFME)** notation.

Reasons: human-readable in D1; insertion-safe (it's a label looked up in
a map, not a positional index that shifts if a canonical step is ever
added); one obvious "source of truth" scale per discipline. Every
comparison does one map lookup to get the ordinal.

The add/edit form takes input in the user's chosen scale and converts to
the canonical label before write. Views convert the canonical label to
the view's chosen scale before render.

### Preferences

Two independent per-discipline preferences, both defaulting to "last
one selected":

| Preference | Scope | Default when never set |
|---|---|---|
| `gradeScale.entry.<discipline>` | the add/edit form's grade picker only | canonical scale (Font-extended / French) |
| `gradeScale.view.<discipline>` | every view — performance reports, logbook, filter slider labels | canonical scale |

Stored the same way the app already persists lightweight client
preferences (match the existing discipline-picker / theme-toggle
persistence, whatever that is — `localStorage` or a settings row; follow
precedent, don't invent).

## Delivery — sub-issues (dependency order)

### A. Canonical grade model + 8 scales + conversion matrix

`shared/grade-data.js` rework. Data + internal logic only — no UI, no
new stored columns.

- Canonical step list per discipline.
- All 8 scales as `ordinal ↔ label` maps.
- The committed conversion matrix.
- `gradeRank` / `gradeTier` / `gradeColor` / `gradePyramidColor` /
  `gradeDisplayLabel` re-pointed at the ordinal.
- `BOULDER_ORDER` / `LEAD_ORDER` deleted; `BOULDER_GRADES` split into
  Font-standard + Font-extended; `LEAD_GRADES` → French with the FFME
  low end.
- `entry-schema.js`'s `VALID_GRADES` derives from the canonical label
  set (already derives from `BOULDER_GRADES`/`LEAD_GRADES` — just
  re-point it).
- Full unit coverage: every scale's `ordinal → label → ordinal`
  round-trips for fine scales; coarse scales round-trip to the range
  midpoint; every documented matrix anchor asserted.

**Depends on nothing.** Blocks B, C, D.

### B. Add/edit form scale picker + preference

- A scale-picker control next to the grade selector in the entry form
  (`client/entry-form.js`), opening a popup list of the current
  discipline's scales.
- Choosing a scale relabels the grade dropdown's options via A's maps.
- On submit, the chosen label converts to the canonical label for
  storage.
- Persist `gradeScale.entry.<discipline>`; restore on open.
- Editing an existing entry: show its canonical grade rendered in the
  chosen scale.

**Depends on A.**

### C. Views scale picker + preference

- A scale picker on the performance-reports pages and the logbook
  (`client/performance-*-main.js`, the logbook composition root).
- Charts and headline copy render grades via A's maps in the chosen
  scale (`shared/*-stats.js`'s `gradeDisplayLabel` calls, chart axis
  labels, pyramid rung labels).
- The grade-filter slider's tick labels render in the chosen scale
  (the filter itself still operates on the canonical ordinal).
- Persist `gradeScale.view.<discipline>`; one preference shared across
  every view.
- Both this picker and B's link to the reference page (E).

**Depends on A.** (E can land before or after — the "how do these
compare?" link degrades gracefully if E isn't up yet.)

### E. "Grade scales & conversion" reference page

A dedicated help/reference page, in the same spirit as the existing
citations / evidence-tier overlays.

- Renders the full cross-scale matrix from A's data — all 8 scales side
  by side, per canonical step.
- Prose section on the caveats: sport cross-scale conversion is lossy;
  the low-end conventions (French below `6a`, Font `5/5A/5B/5C`) are
  choices not facts; coarse scales collapse many grades to one label.
- **Cites every source**, pulled from the per-anchor source field in
  A's matrix data plus the prose sources — FFME, Wikipedia, theCrag,
  openclimbing, Rockfax, IRCRA. Written in the app's own voice, same as
  the citations dialog.
- Static-ish page (reads A's committed data, no live API) — its own
  route, gated like the other public reference content.

**Depends on A.** Independent of B/C/D.

### D. (follow-up) Show each entry's grade as logged

- Schema migration: `entries.grade_scale` (which scale the entry was
  logged in). Backfill = the discipline's current fixed scale for every
  existing row.
- The add/edit form records `grade_scale` on write (from B's picker).
- The logbook table renders each entry's grade in **its own**
  `grade_scale`, not the view preference.
- Grade filter reconciliation: the slider operates on canonical
  ordinals as today; its tick labels render in the **view** scale
  (C's preference); entry rows still show their as-logged notation, so
  a row's visible grade string and the slider's labels can legitimately
  be in different scales — acceptable, document it in the filter's help
  text.

**Depends on A, B, C.** Separate issue because of the filter conflict
and the schema change.

## Risks / open notes

- **Sub-`6a` Sport entries.** The FFME French low-end change only
  affects existing Sport entries graded below `6a` (`3`, `4a`, etc.).
  A real sport logbook rarely has these; check the count in the D1
  data as the first step of sub-issue A, and migrate the handful if any
  exist (`3`→`3a` etc. — a mapping table in the migration).
- **Coarse-scale display churn.** Rendering a fine canonical grade in
  Ewbank/UIAA/Norwegian collapses many distinct grades to one label —
  a pyramid or chart in one of those scales will show repeated labels
  on adjacent rungs. Expected; the per-grade *colour* (#698) still
  differentiates them visually.
- **Round-trip loss.** Logging in Ewbank then editing while viewing in
  French then saving again could nudge the stored canonical grade by a
  step (Ewbank→midpoint→French→…). Mitigate: the edit form keeps the
  original canonical label unless the user actually changes the picker,
  rather than re-deriving it from the displayed scale every open.
- **Matrix authority.** No source is fully authoritative for sport
  cross-scale conversion. The committed matrix is a documented
  best-effort; treat it as tunable data, not settled fact (same footing
  as `docs/climbing-analytics-research.md`'s own caveated numbers).

## Verification

- Sub-issue A: `pnpm test` — the round-trip + matrix-anchor unit suite
  above, plus every existing `grade-data`/`pyramid`/`entries`/stats test
  still green against the re-pointed internals.
- Sub-issues B/C/D: driven in a real browser (or `wrangler dev` +
  Playwright) — pick a scale, confirm the picker/dropdown/charts/filter
  relabel, reload and confirm the preference stuck, log an entry in a
  non-canonical scale and confirm it stores and reads back correctly.
- `docs/app-architecture.md` gets the canonical-model section in the
  same PR as sub-issue A.

Deploy classification: sub-issue A is app-code + (likely) a small data
migration; B/C are app-code only; D is app-code + a schema migration.
All beta-first per ADR-0020; promotion is a separate manual call.
