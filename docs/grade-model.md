# Grade model

How grades are stored, compared, converted and coloured. The code is
`shared/grade-data.js`; reports build on it in `shared/volume-stats.js` and
`shared/pyramid-stats.js`.

## Storage

An entry keeps the grade exactly as logged, plus `grade_scale`, which names
the scale it was logged in. Nothing converted is ever stored. When a client
sends no scale, the server picks one (`defaultGradeScale()` in
`server/api/entries.js`).

Boulder and sport are separate spaces and are never compared with each
other.

## The canonical ordinal

Every scale converts to and from one integer per discipline, the canonical
ordinal. That's how grades in different scales sort and convert.

Its numbering is the non-standard shape: a number 1–9, an optional letter
`a`–`c` and an optional `+` or `-`, in any combination. Real guidebooks use
all of these, including `-` in Font. Each number spans 12 positions, in this
order:

`N-`, `N`, `Na-`, `Na`, `Na+`, `Nb-`, `Nb`, `Nb+`, `Nc-`, `Nc`, `Nc+`, `N+`

A bare `+` is the top of its number, bordering the next, so `2 < 2a+ < 2+`.
Because of that exception, the order is a list rather than a formula.

The ordinals aren't evenly spaced between real named grades (6A → 6A+ is 1
apart; 6C+ → 7A is 5). "How many grades apart" therefore counts positions in
the discipline's list of real named steps (`reportPositionOrder()`), never
ordinal distance.

## Scales

| Discipline | Scale | How it maps to the ordinal |
|---|---|---|
| Boulder | Font (Non-standard) | The numbering itself |
| Boulder | Font | A subset of the non-standard numbering, built from its real label list |
| Boulder | V-scale | An anchor table against Font, from Rockfax's chart. V3, V4, V5 and V8 each cover two Font grades; input resolves to the lower one |
| Sport | French (Non-standard) | The numbering itself |
| Sport | French | A subset of the non-standard numbering |
| Sport | UIAA, YDS, Norwegian, Ewbank | Anchored to French at sourced points and interpolated between them |

**Anchored scales.** Labels between two anchors are spaced evenly. Before
the first anchor and after the last, the slope of the nearest two anchors
carries on; with only one anchor, the slope is one label per French step.
Two anchors may share a French grade, and then everything between them
shares it too: a coarse scale, several steps to one label.
`GRADE_CONVERSION_MATRIX` lists every anchor with its source. Interpolated
labels are the model's own fill-in, not sourced claims, and the whole matrix
is tunable data.

**Converting to a scale that can't express a grade exactly:**
- An anchored scale shows the closest step. A tie rounds down.
- Font and French show the closest step within the same number. `5-` is the
  bottom of 5, so it becomes `5`, never `4+`.
- A grade below a scale's range (Font starts at 3) has no label in that
  scale. Clamping it up to the lowest label would inflate it. A chart drops
  the point. Prose, which can't drop it, falls back to the logged scale.

**Defaults.** A non-standard scale is never the default: it exists for when a
guidebook's notation doesn't match the published scale
(`DEFAULT_SCALE_BY_TYPE`). The Performance Insights reports offer only the
standard scales (`STANDARD_SCALES_BY_DISCIPLINE`), and the server enforces
this too, since the scale is a query parameter anyone can send.

**Unknown grades** rank as `Infinity`, harder than everything. A literal
sentinel like 99 would sort below real sport grades, whose ordinals already
pass 100.

## Tiers and colour

Five tiers, from Beginner to Hyper Elite, set by felt sense of each
discipline's distribution rather than by any conversion table. Bands narrow
towards the top and ask for more than Rockfax's 2020 posters do.

Sport's range runs much further past `8b+` than boulder's does past `8B+`, so
its upper boundaries differ from boulder's: `6a`–`7a`, `7a+`–`8a`,
`8a+`–`9a`, then `9a+` and up. Thresholds are labels in the discipline's
primary scale (Font or French), compared by ordinal.

Each tier has one colour, shared by both disciplines, taken from the "Fiery
Red Sunset" palette (the `--grade-tier-*` tokens in `climbing-header.js`).
The Grade Pyramid spans only about four grades, often within one tier, so
it interpolates across the full ten-colour palette by ordinal instead; that
way adjacent bars always differ.

## Legacy two-argument ranks

`gradeRank(grade, type)` and friends predate scales and still back the log
table. `BOULDER_ORDER` and `LEAD_ORDER` must stay supersets of the pickers'
grade lists: a grade missing from them ranks as unknown.
