# Configurable Grade Systems — Canonical Model (#702) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the canonical grade ordinal, all 9 grade scales, the cross-scale
conversion matrix, and `entries.grade_scale` storage — the data/logic
foundation issue #703 (entry-form picker), #704 (reports picker), #705
(reference page), and #708 (logbook filter/search) all depend on.

**Architecture:** One pure-computation module (`shared/grade-data.js`) grows a
formula-based canonical ordinal (no backing array — it's `(number-1)*12 +
subPosition`, the same numbering both Non-standard scales and every real
scale's sparse positions resolve into) plus 9 scale objects, each exposing
`toOrdinal(label)`/`toLabel(ordinal)`. New scale-aware functions
(`gradeRankV2`-shaped signatures, real names below) are added *alongside*
today's exports — nothing existing is deleted or renamed in this plan, so
every current caller (`entry-form.js`, `climbing-entries-table.js`,
`entries.js`, `volume-stats.js`, `gap-stats.js`, `effort-stats.js`,
`pyramid-stats.js`) keeps working completely unchanged. The DB gains one
additive column (`entries.grade_scale`) with a backfill for existing rows and
a smart runtime default for new rows written before #703 ships a picker that
actually sends it.

**Tech Stack:** Cloudflare Workers, D1 (SQLite), Vitest (`@cloudflare/vitest-pool-workers`), Valibot.

**Spec:** `docs/superpowers/specs/2026-09-10-configurable-grade-systems-design.md`

## Global Constraints

- **No UI.** Nothing in `client/*.js` gets new user-visible behavior. Any
  file under `client/` touched in this plan is touched only to add a new,
  additively-exported function/field it does not yet call — never to change
  what a current caller renders or what a current caller passes in.
- **`BOULDER_GRADES`, `LEAD_GRADES`, `BOULDER_ORDER`, `LEAD_ORDER`, and the
  existing 2-argument `gradeRank(g, type)` / `gradeTier(g, type)` /
  `gradeColor(g, type)` / `gradePyramidColor(g, type)` keep their exact
  current values and behavior for every existing test case.** `BOULDER_ORDER`/
  `LEAD_ORDER` are the one exception allowed to be deleted outright — grep
  confirms (2026-09-11) they have zero consumers outside `shared/grade-data.js`
  and its own test file, unlike every other export in this list.
  Retiring `BOULDER_GRADES`/`LEAD_GRADES` and giving the 2-arg functions
  real multi-scale behavior is sub-issue B's (#703) job, once it replaces
  `entry-form.js`'s picker — not this plan's.
- **`entries.grade_scale` is optional at the schema-validation layer, not
  required.** `client/entry-form.js` is not being touched in this plan, so it
  will keep submitting entries with no `gradeScale` field at all until #703
  ships. The server must default sensibly, never reject, a write with no
  `gradeScale`.
- **Migration deploys immediately to beta *and* production** (ADR-0020) —
  this is real, not a rehearsal. Query real row counts before writing the
  backfill's `WHERE` clauses.
- **Deploy classification: this PR stays open for Raven's review, not
  self-merged.** The backfill mapping is a judgment call (see the spec's
  "Risks / open notes"), unlike this epic's earlier additive-only
  deliverables (#461/#129/#209/#462/#463) which were merged solo. The
  final step of this plan is push + PR — do **not** invoke
  finishing-a-development-branch's merge option, and do not offer the
  "work through the rest of the epic" autonomous continuation this session
  used for those five — stop after opening the PR and report back.

---

## File structure

- **Modify `shared/grade-data.js`** — the only file gaining real new logic.
  Grows from ~240 to roughly 550 lines; still one file (not split) because
  every scale genuinely shares one canonical ordinal and this repo's own
  precedent (`pyramid-stats.js`, `entry-schema.js`) keeps a bounded domain's
  logic in one module rather than one-file-per-scale.
- **Modify `shared/entry-schema.js`** — one new optional field validated.
- **Modify `server/api/logbook.js`** — `buildRow`/`rowToJson`/
  `publicRowToJson` gain the `grade_scale`/`gradeScale` column.
- **Create `migrations/0016_add_grade_scale.sql`** — additive column +
  backfill.
- **Modify `docs/app-architecture.md`** — new canonical-grade-model
  subsection under "Data model"; `gradeScale` added to the documented Entry
  wire format.
- **Test**: `test/shared/grade-data.test.js` (grows substantially),
  `test/shared/entry-schema.test.js`, `test/logbook.test.js` (or wherever
  `buildRow`/`rowToJson` are currently covered — confirmed in Task 6).

---

## Task 1: Canonical ordinal formula + the two Non-standard scales

**Files:**
- Modify: `shared/grade-data.js`
- Test: `test/shared/grade-data.test.js`

**Interfaces:**
- Consumes: nothing (foundational).
- Produces:
  - `nonStandardOrdinal(number, letter, modifier)` → integer. `number` is
    1–9. `letter` is `null` or one of `"a"|"b"|"c"`. `modifier` is `null` or
    one of `"-"|"+"`.
  - `NON_STANDARD_LABEL_ORDER` = `["-", "", "+"]` (the three modifier slots
    in ordinal order, `""` meaning "no modifier") — exported so Task 2/3 can
    reuse the same slot ordering when building label strings.
  - `nonStandardLabel(number, letter, modifier)` → string, e.g.
    `nonStandardLabel(6, "a", "+")` → `"6a+"`, `nonStandardLabel(2, null,
    "-")` → `"2-"`.
  - `parseNonStandardLabel(label)` → `{ number, letter, modifier }` or
    `null` if the string doesn't parse (used by both Non-standard scale
    objects and by Task 2's regex-based real-scale parsing, which is a
    strict subset of this same shape).
  - `FONT_NON_STANDARD` and `FRENCH_NON_STANDARD` — each `{ id: string,
    discipline: "boulder"|"sport", toOrdinal(label): number|null,
    toLabel(ordinal): string }`. Both delegate to the exact same
    `nonStandardOrdinal`/`nonStandardLabel`/`parseNonStandardLabel` — per
    Raven's explicit decision, there are **no per-discipline parameters
    left**; the only difference between the two objects is their `id` and
    `discipline` tag.

- [ ] **Step 1: Write the failing ordinal-formula tests**

```js
import { describe, it, expect } from "vitest";
import { nonStandardOrdinal, nonStandardLabel, parseNonStandardLabel } from "../../shared/grade-data.js";

describe("nonStandardOrdinal", () => {
  it("orders the 12 sub-positions within one number correctly -- bare -/plain at the bottom, lettered positions in the middle, bare + at the very top (corrected 2026-09-11, see Raven's worked example below)", () => {
    const ordinals = [
      nonStandardOrdinal(2, null, "-"),
      nonStandardOrdinal(2, null, null),
      nonStandardOrdinal(2, "a", "-"),
      nonStandardOrdinal(2, "a", null),
      nonStandardOrdinal(2, "a", "+"),
      nonStandardOrdinal(2, "b", "-"),
      nonStandardOrdinal(2, "b", null),
      nonStandardOrdinal(2, "b", "+"),
      nonStandardOrdinal(2, "c", "-"),
      nonStandardOrdinal(2, "c", null),
      nonStandardOrdinal(2, "c", "+"),
      nonStandardOrdinal(2, null, "+"),
    ];
    for (let i = 1; i < ordinals.length; i++) {
      expect(ordinals[i]).toBeGreaterThan(ordinals[i - 1]);
    }
  });

  it("crosses from one number to the next without a gap or overlap -- bare N+ (not Nc+) is the last item before (N+1)-", () => {
    expect(nonStandardOrdinal(2, null, "+")).toBe(nonStandardOrdinal(3, null, "-") - 1);
  });

  it("covers all 9 numbers x 12 sub-positions as 108 distinct, contiguous ordinals", () => {
    const seen = new Set();
    for (let n = 1; n <= 9; n++) {
      for (const letter of [null, "a", "b", "c"]) {
        for (const modifier of ["-", null, "+"]) {
          seen.add(nonStandardOrdinal(n, letter, modifier));
        }
      }
    }
    expect(seen.size).toBe(108);
    expect(Math.min(...seen)).toBe(0);
    expect(Math.max(...seen)).toBe(107);
  });

  it("matches the worked example: N-, N, Na-, Na, Na+, Nb-, Nb, Nb+, Nc-, Nc, Nc+, N+", () => {
    // number=1 (base offset 0): 1-=0, 1=1, 1a-=2, 1a=3, 1a+=4, 1b-=5,
    // 1b=6, 1b+=7, 1c-=8, 1c=9, 1c+=10, 1+=11 -- "+" on the BARE number
    // moves to the very end, not right after bare "1", per Raven's own
    // ordering ("2a+" must sort between bare "2" and bare "2+").
    expect(nonStandardOrdinal(1, null, "-")).toBe(0);
    expect(nonStandardOrdinal(1, null, null)).toBe(1);
    expect(nonStandardOrdinal(1, "a", "-")).toBe(2);
    expect(nonStandardOrdinal(1, "a", null)).toBe(3);
    expect(nonStandardOrdinal(1, "a", "+")).toBe(4);
    expect(nonStandardOrdinal(1, "c", "+")).toBe(10);
    expect(nonStandardOrdinal(1, null, "+")).toBe(11);
  });

  it("matches Raven's own real-entries example: grades logged as \"2\", \"2a+\", \"2+\" sort 2 < 2a+ < 2+", () => {
    const bare2 = nonStandardOrdinal(2, null, null);
    const twoAPlus = nonStandardOrdinal(2, "a", "+");
    const bare2Plus = nonStandardOrdinal(2, null, "+");
    expect(bare2).toBeLessThan(twoAPlus);
    expect(twoAPlus).toBeLessThan(bare2Plus);
  });
});

describe("nonStandardLabel / parseNonStandardLabel round-trip", () => {
  const cases = [
    [2, null, "-", "2-"],
    [2, null, null, "2"],
    [2, null, "+", "2+"],
    [6, "a", "-", "6a-"],
    [6, "a", null, "6a"],
    [6, "a", "+", "6a+"],
    [9, "c", "+", "9c+"],
  ];
  for (const [number, letter, modifier, label] of cases) {
    it(`renders ${JSON.stringify({ number, letter, modifier })} as "${label}"`, () => {
      expect(nonStandardLabel(number, letter, modifier)).toBe(label);
    });
    it(`parses "${label}" back to {number:${number}, letter:${JSON.stringify(letter)}, modifier:${JSON.stringify(modifier)}}`, () => {
      expect(parseNonStandardLabel(label)).toEqual({ number, letter, modifier });
    });
  }

  it("returns null for an unparseable string", () => {
    expect(parseNonStandardLabel("banana")).toBeNull();
    expect(parseNonStandardLabel("")).toBeNull();
    expect(parseNonStandardLabel("6d")).toBeNull(); // letter must be a-c
  });
});

describe("FONT_NON_STANDARD / FRENCH_NON_STANDARD", () => {
  it("both scales use the identical formula -- same ordinal for the same triple", () => {
    const { FONT_NON_STANDARD, FRENCH_NON_STANDARD } = require("../../shared/grade-data.js");
  });
});
```

(The last `describe` block above is a placeholder shape only for this step
— Step 3 replaces it with real assertions once the exports exist; write it
as shown, it's expected to fail to even import at this point.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- grade-data -t "nonStandardOrdinal"`
Expected: FAIL — `nonStandardOrdinal is not a function` (or similar import
error, since none of these exports exist yet).

- [ ] **Step 3: Implement the formula, label helpers, and the two Non-standard scale objects**

Add to `shared/grade-data.js` (near the top, before the existing
`BOULDER_ORDER` block — this is genuinely foundational, everything else in
the file will reference it):

```js
// #702 -- the canonical ordinal. One shared, discipline-agnostic formula:
// every number 1-9 takes the full combination of an optional letter (a-c)
// and an optional modifier (+/-), independently -- confirmed with Raven
// 2026-09-11 against real guidebooks (Jingo Wobbly uses "-" for Font in
// the wild), not just the two verified real scales (Font-extended, FFME)
// this was originally derived from. No per-discipline parameters --
// Boulder and Sport each interpret this same numbering as their own
// separate ordinal space (never cross-compared, same as #461's
// BOULDER_RANK/LEAD_RANK split), but the formula computing a position
// within one number is identical for both.
//
// Sub-position order within one number, corrected 2026-09-11 per Raven's
// own worked example (three real climbs logged as "2", "2+", and "2a+"
// must sort as 2 < 2a+ < 2+): bare "-"/plain sit at the very bottom
// (Raven's earlier "bare sits at the bottom" call, unchanged) -- but bare
// "+" moves to the very TOP of the number's range instead of sitting
// right after plain. "+" on a bare number reads as "the strong edge of
// this number, bordering the next one," the same intuition "+" already
// carries everywhere else in this matrix (UIAA/Norwegian's own -/plain/+
// triads, French's a+/b+/c+). An explicit ordered list, not a derived
// formula -- once "+" moves out of sequence for the no-letter case
// specifically, the ordering isn't a clean arithmetic function of
// (letterSlot, modifierSlot) anymore, so spelling out the 12 positions
// directly is clearer (and less error-prone) than a formula hiding a
// special case.
const SUB_POSITION_ORDER = [
  [null, "-"], [null, null],
  ["a", "-"], ["a", null], ["a", "+"],
  ["b", "-"], ["b", null], ["b", "+"],
  ["c", "-"], ["c", null], ["c", "+"],
  [null, "+"],
];
const SUB_POSITION_INDEX = new Map(
  SUB_POSITION_ORDER.map(([letter, modifier], i) => [`${letter ?? null}|${modifier ?? null}`, i])
);
export function nonStandardOrdinal(number, letter, modifier) {
  const key = `${letter ?? null}|${modifier ?? null}`;
  const subPosition = SUB_POSITION_INDEX.get(key);
  if (subPosition === undefined) return null;
  return (number - 1) * 12 + subPosition;
}

export function nonStandardLabel(number, letter, modifier) {
  return `${number}${letter ?? ""}${modifier ?? ""}`;
}

// Strict shape: one digit 1-9, optional single lowercase letter a-c,
// optional trailing +/-. Case-insensitive on input (real logged text may
// be uppercase); always normalizes letter to lowercase, matching
// nonStandardLabel()'s own output so toOrdinal(toLabel(x)) round-trips.
const NON_STANDARD_RE = /^([1-9])([abc])?([+-])?$/i;
export function parseNonStandardLabel(label) {
  const m = NON_STANDARD_RE.exec(String(label).trim());
  if (!m) return null;
  return {
    number: Number(m[1]),
    letter: m[2] ? m[2].toLowerCase() : null,
    modifier: m[3] ?? null,
  };
}

function makeNonStandardScale(id, discipline) {
  return {
    id,
    discipline,
    toOrdinal(label) {
      const parsed = parseNonStandardLabel(label);
      return parsed ? nonStandardOrdinal(parsed.number, parsed.letter, parsed.modifier) : null;
    },
    toLabel(ordinal) {
      const number = Math.floor(ordinal / 12) + 1;
      const withinNumber = ordinal - (number - 1) * 12;
      const [letter, modifier] = SUB_POSITION_ORDER[withinNumber];
      return nonStandardLabel(number, letter, modifier);
    },
  };
}

export const FONT_NON_STANDARD = makeNonStandardScale("font-non-standard", "boulder");
export const FRENCH_NON_STANDARD = makeNonStandardScale("french-non-standard", "sport");
```

Replace Step 1's placeholder `describe("FONT_NON_STANDARD ...")` block with:

```js
describe("FONT_NON_STANDARD / FRENCH_NON_STANDARD", () => {
  it("both scales use the identical formula -- same ordinal for the same triple", () => {
    expect(FONT_NON_STANDARD.toOrdinal("6a+")).toBe(FRENCH_NON_STANDARD.toOrdinal("6a+"));
  });
  it("round-trips label -> ordinal -> label for every one of the 108 positions, both scales", () => {
    for (const scale of [FONT_NON_STANDARD, FRENCH_NON_STANDARD]) {
      for (let n = 1; n <= 9; n++) {
        for (const letter of [null, "a", "b", "c"]) {
          for (const modifier of ["-", null, "+"]) {
            const label = nonStandardLabel(n, letter, modifier);
            expect(scale.toLabel(scale.toOrdinal(label))).toBe(label);
          }
        }
      }
    }
  });
  it("is case-insensitive and rejects garbage", () => {
    expect(FONT_NON_STANDARD.toOrdinal("6A+")).toBe(FONT_NON_STANDARD.toOrdinal("6a+"));
    expect(FONT_NON_STANDARD.toOrdinal("not-a-grade")).toBeNull();
  });
});
```

Add the matching `import` line at the top of the test file:

```js
import {
  nonStandardOrdinal, nonStandardLabel, parseNonStandardLabel,
  FONT_NON_STANDARD, FRENCH_NON_STANDARD,
} from "../../shared/grade-data.js";
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- grade-data -t "nonStandardOrdinal|FONT_NON_STANDARD"`
Expected: PASS, all cases above green.

- [ ] **Step 5: Commit**

```bash
git add shared/grade-data.js test/shared/grade-data.test.js
git commit -m "feat(grades): canonical ordinal formula + Font/French (Non-standard) scales (#702)"
```

---

## Task 2: Font (standard), French (standard), and V-scale maps

These three are the scales with a real, already-verified literal label
list (from the spec) that decomposes cleanly through
`parseNonStandardLabel`/`nonStandardOrdinal` — Font-standard and
French-standard both have the exact `number + optional letter(a-c) +
optional modifier(+)` shape (verified: neither ever uses `-`, and French's
`1`/`2` simply have no letter, which the existing parser already handles).
V-scale doesn't decompose that way (`VB`, `V0-`, `V0`, `V0+`, `V1`...`V17`
isn't a number/letter/modifier shape at all) — it's defined instead as an
explicit anchor table against Font-standard's own computed ordinals, using
the corrected hakaru.io-sourced correspondence from the spec.

**Files:**
- Modify: `shared/grade-data.js`
- Test: `test/shared/grade-data.test.js`

**Interfaces:**
- Consumes: `nonStandardOrdinal`, `parseNonStandardLabel` (Task 1).
- Produces: `FONT_STANDARD`, `FRENCH_STANDARD`, `V_SCALE` — each the same
  `{ id, discipline, toOrdinal(label), toLabel(ordinal) }` shape as Task 1's
  Non-standard scales. `toLabel` on a coarse scale (`V_SCALE`) never
  receives an ordinal outside its own covered range in this plan (that only
  happens via cross-scale conversion, which is C's concern) — it's fine for
  `toLabel` to return the nearest covered label by clamping.

- [ ] **Step 1: Write the failing tests**

```js
describe("FONT_STANDARD", () => {
  it("round-trips every label in the spec's verified Font-standard list", () => {
    const labels = [
      "3","3+","4","4+","5","5+","6A","6A+","6B","6B+","6C","6C+",
      "7A","7A+","7B","7B+","7C","7C+","8A","8A+","8B","8B+","8C","8C+","9A",
    ];
    for (const label of labels) {
      expect(FONT_STANDARD.toLabel(FONT_STANDARD.toOrdinal(label)).toUpperCase()).toBe(label);
    }
  });
  it("is monotonically increasing across the full list", () => {
    const labels = ["3","3+","4","4+","5","5+","6A","6A+","6B","6B+","6C","6C+","7A","9A"];
    const ordinals = labels.map(l => FONT_STANDARD.toOrdinal(l));
    for (let i = 1; i < ordinals.length; i++) expect(ordinals[i]).toBeGreaterThan(ordinals[i - 1]);
  });
  it("matches the hand-computed anchor from the spec: 6A is ordinal 63", () => {
    // number=6, letter="a", modifier=null -> subPosition 3 (SUB_POSITION_ORDER:
    // [null,-]=0, [null,null]=1, [a,-]=2, [a,null]=3, ...) -> (6-1)*12+3 = 63.
    expect(FONT_STANDARD.toOrdinal("6A")).toBe(63);
  });
});

describe("FRENCH_STANDARD", () => {
  it("round-trips every label in the spec's verified FFME list", () => {
    const labels = [
      "1","2","3a","3b","3c","4a","4b","4c","5a","5a+","5b","5b+","5c","5c+",
      "6a","6a+","6b","6b+","6c","6c+","7a","7a+","7b","7b+","7c","7c+",
      "8a","8a+","8b","8b+","8c","8c+","9a","9a+","9b","9b+","9c","9c+",
    ];
    for (const label of labels) {
      expect(FRENCH_STANDARD.toLabel(FRENCH_STANDARD.toOrdinal(label))).toBe(label);
    }
  });
  it("places 6a and Font-standard's 6A at the same canonical ordinal -- both disciplines share the same numbering formula, even though they're never cross-compared", () => {
    expect(FRENCH_STANDARD.toOrdinal("6a")).toBe(FONT_STANDARD.toOrdinal("6A"));
  });
});

describe("V_SCALE", () => {
  it("matches every anchor from the corrected hakaru.io table", () => {
    const oneToOne = [["VB","3"],["V1","5"],["V2","5+"],["V6","7A"],["V9","7C"],["V10","7C+"],
      ["V11","8A"],["V12","8A+"],["V13","8B"],["V14","8B+"],["V15","8C"],["V16","8C+"],["V17","9A"]];
    for (const [v, font] of oneToOne) {
      expect(V_SCALE.toOrdinal(v)).toBe(FONT_STANDARD.toOrdinal(font));
    }
  });
  it("resolves a 2-wide V-scale step (V3/V4/V5/V8) to the LOWER of its two Font ordinals on input -- Raven's 'no true middle of a 2-wide range' ruling", () => {
    expect(V_SCALE.toOrdinal("V3")).toBe(FONT_STANDARD.toOrdinal("6A"));
    expect(V_SCALE.toOrdinal("V4")).toBe(FONT_STANDARD.toOrdinal("6B"));
    expect(V_SCALE.toOrdinal("V5")).toBe(FONT_STANDARD.toOrdinal("6C"));
    expect(V_SCALE.toOrdinal("V8")).toBe(FONT_STANDARD.toOrdinal("7B"));
  });
  it("V0- is Font 3+ (the corrected mapping, not the old wrong 6A=V0)", () => {
    expect(V_SCALE.toOrdinal("V0-")).toBe(FONT_STANDARD.toOrdinal("3+"));
    expect(V_SCALE.toOrdinal("V0")).toBe(FONT_STANDARD.toOrdinal("4"));
    expect(V_SCALE.toOrdinal("V0+")).toBe(FONT_STANDARD.toOrdinal("4+"));
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- grade-data -t "FONT_STANDARD|FRENCH_STANDARD|V_SCALE"`
Expected: FAIL — none of these exports exist yet.

- [ ] **Step 3: Implement**

Add below Task 1's block:

```js
// #702 -- Font-standard and French-standard both decompose exactly
// through the same number+letter+modifier shape Task 1 already parses --
// neither real table ever uses "-", and French's 1/2 simply have no
// letter (parseNonStandardLabel already treats a missing letter as
// valid). Built from the literal, already-verified label lists (spec
// "The eight -- now nine -- scales"), not re-typed as raw ordinals --
// one source of truth per scale, same "derive, don't hand-duplicate"
// fix this whole rework exists to make (the #698 BOULDER_ORDER drift bug
// was exactly two hand-kept lists of the same data going out of sync).
function makeParsedScale(id, discipline, labels) {
  const byLabel = new Map();
  const byOrdinal = new Map();
  for (const label of labels) {
    const parsed = parseNonStandardLabel(label);
    if (!parsed) throw new Error(`${id}: "${label}" doesn't parse as number+letter+modifier`);
    const ordinal = nonStandardOrdinal(parsed.number, parsed.letter, parsed.modifier);
    byLabel.set(label.toLowerCase(), ordinal);
    byOrdinal.set(ordinal, label);
  }
  return {
    id,
    discipline,
    toOrdinal(label) { return byLabel.get(String(label).toLowerCase()) ?? null; },
    toLabel(ordinal) { return byOrdinal.get(ordinal) ?? null; },
  };
}

const FONT_STANDARD_LABELS = [
  "3","3+","4","4+","5","5+","6A","6A+","6B","6B+","6C","6C+",
  "7A","7A+","7B","7B+","7C","7C+","8A","8A+","8B","8B+","8C","8C+","9A",
];
export const FONT_STANDARD = makeParsedScale("font", "boulder", FONT_STANDARD_LABELS);

const FRENCH_STANDARD_LABELS = [
  "1","2","3a","3b","3c","4a","4b","4c","5a","5a+","5b","5b+","5c","5c+",
  "6a","6a+","6b","6b+","6c","6c+","7a","7a+","7b","7b+","7c","7c+",
  "8a","8a+","8b","8b+","8c","8c+","9a","9a+","9b","9b+","9c","9c+",
];
export const FRENCH_STANDARD = makeParsedScale("french", "sport", FRENCH_STANDARD_LABELS);

// #702 -- V-scale doesn't decompose through the number/letter/modifier
// shape at all (VB/V0-/V0/V0+/V1... isn't that pattern) -- an explicit
// anchor table against FONT_STANDARD's own ordinals instead, using the
// corrected hakaru.io-sourced correspondence (the spec's first draft had
// this wrong: 6A=V0, which no real chart shows). V3/V4/V5/V8 are
// genuinely 2-wide (map to two Font ordinals) -- everything else is 1:1.
const V_SCALE_TO_FONT = {
  "vb": "3", "v0-": "3+", "v0": "4", "v0+": "4+", "v1": "5", "v2": "5+",
  "v3": "6A", "v4": "6B", "v5": "6C", "v6": "7A", "v7": "7A+",
  "v8": "7B", "v9": "7C", "v10": "7C+", "v11": "8A", "v12": "8A+",
  "v13": "8B", "v14": "8B+", "v15": "8C", "v16": "8C+", "v17": "9A",
};
// The upper bound of each V-scale step's range, for 2-wide steps -- used
// only if a future consumer needs the "upper" edge (C's cross-scale
// rendering); toOrdinal() below always resolves the LOWER edge on input,
// per Raven's "no true middle of a 2-wide range" ruling.
const V_SCALE_UPPER = { v3: "6A+", v4: "6B+", v5: "6C+", v8: "7B+" };
export const V_SCALE = {
  id: "v-scale",
  discipline: "boulder",
  toOrdinal(label) {
    const font = V_SCALE_TO_FONT[String(label).toLowerCase()];
    return font ? FONT_STANDARD.toOrdinal(font) : null;
  },
  toLabel(ordinal) {
    // Reverse lookup: find the V-scale key whose Font ordinal (or, for a
    // 2-wide step, whose UPPER Font ordinal) is the smallest one >=
    // `ordinal` -- i.e. which V-scale bucket this canonical ordinal falls
    // into. Table is small (21 entries); linear scan is fine.
    const entries = Object.entries(V_SCALE_TO_FONT);
    for (const [vKey, fontLabel] of entries) {
      const upperLabel = V_SCALE_UPPER[vKey] ?? fontLabel;
      if (ordinal <= FONT_STANDARD.toOrdinal(upperLabel)) return vKey.toUpperCase().replace("V", "V");
    }
    return entries[entries.length - 1][0].toUpperCase();
  },
};
```

Add the corresponding imports to the test file
(`FONT_STANDARD, FRENCH_STANDARD, V_SCALE`).

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- grade-data -t "FONT_STANDARD|FRENCH_STANDARD|V_SCALE"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add shared/grade-data.js test/shared/grade-data.test.js
git commit -m "feat(grades): Font (standard), French (standard), and V-scale maps (#702)"
```

---

## Task 3: UIAA, YDS, Norwegian, Ewbank — anchor-interpolated coarse scales + the conversion matrix

These four have no natural number/letter/modifier decomposition and no
single authoritative source (the spec's own "Matrix authority" risk note).
Each is built from the **exact anchor points already sourced and verified
in the spec**, interpolated linearly between anchors for the labels the
spec doesn't explicitly anchor. This is committed as **data with a source
field per anchor** — the conversion matrix the spec calls for, not a
separate artifact.

**Files:**
- Modify: `shared/grade-data.js`
- Test: `test/shared/grade-data.test.js`

**Interfaces:**
- Consumes: `FRENCH_STANDARD` (Task 2) — every anchor below is expressed as
  "this label equals this French grade", since Sport's canonical ordinal
  space is FRENCH_STANDARD's own numbering.
- Produces: `UIAA_SCALE`, `YDS_SCALE`, `NORWEGIAN_SCALE`, `EWBANK_SCALE` (same
  shape as before) and `GRADE_CONVERSION_MATRIX` — an array of `{ scaleId,
  label, frenchAnchor, source }` rows, one per **anchor** (not one per
  label — interpolated labels aren't anchors and don't get a row), for
  sub-issue E's reference page to render/cite later.

- [ ] **Step 1: Write the failing tests**

```js
describe("UIAA_SCALE / YDS_SCALE / NORWEGIAN_SCALE / EWBANK_SCALE", () => {
  it("UIAA: VI+ anchors to French 6a (Wikipedia Grade(climbing) anchor row)", () => {
    expect(UIAA_SCALE.toOrdinal("VI+")).toBe(FRENCH_STANDARD.toOrdinal("6a"));
  });
  it("YDS: 5.10a anchors to French 6a (same Wikipedia anchor row)", () => {
    expect(YDS_SCALE.toOrdinal("5.10a")).toBe(FRENCH_STANDARD.toOrdinal("6a"));
  });
  it("Norwegian: 6- anchors to French 6a, 7- anchors to French 6b+ (theCrag)", () => {
    expect(NORWEGIAN_SCALE.toOrdinal("6-")).toBe(FRENCH_STANDARD.toOrdinal("6a"));
    expect(NORWEGIAN_SCALE.toOrdinal("7-")).toBe(FRENCH_STANDARD.toOrdinal("6b+"));
  });
  it("Ewbank: 18 anchors to French 6a (Wikipedia anchor row, '18-19≈6a')", () => {
    expect(EWBANK_SCALE.toOrdinal("18")).toBe(FRENCH_STANDARD.toOrdinal("6a"));
  });
  it("every scale is monotonically increasing across its full label list", () => {
    for (const [scale, labels] of [
      [UIAA_SCALE, ["I","II","III-","III","III+","IV-","IV","IV+","V-","V","V+","VI-","VI","VI+","VII-","VII","VII+","VIII-","VIII","VIII+","IX-","IX","IX+","X-","X","X+","XI-","XI","XI+","XII-","XII","XII+"]],
      [YDS_SCALE, ["5.0","5.1","5.2","5.3","5.4","5.5","5.6","5.7","5.8","5.9","5.10a","5.10b","5.10c","5.10d","5.11a","5.11b","5.11c","5.11d","5.12a","5.12b","5.12c","5.12d","5.13a","5.13b","5.13c","5.13d","5.14a","5.14b","5.14c","5.14d","5.15a","5.15b","5.15c","5.15d"]],
      [NORWEGIAN_SCALE, ["1","1+","2-","2","2+","3-","3","3+","4-","4","4+","5-","5","5+","6-","6","6+","7-","7","7+","8-","8","8+","9-","9","9+","10-","10","10+","11-","11"]],
      [EWBANK_SCALE, Array.from({length: 40}, (_, i) => String(i + 1))],
    ]) {
      const ordinals = labels.map(l => scale.toOrdinal(l));
      expect(ordinals.every(o => o !== null)).toBe(true);
      for (let i = 1; i < ordinals.length; i++) expect(ordinals[i]).toBeGreaterThanOrEqual(ordinals[i - 1]);
    }
  });
});

describe("GRADE_CONVERSION_MATRIX", () => {
  it("has a source for every anchor row", () => {
    expect(GRADE_CONVERSION_MATRIX.length).toBeGreaterThan(0);
    for (const row of GRADE_CONVERSION_MATRIX) {
      expect(row.scaleId).toBeTruthy();
      expect(row.label).toBeTruthy();
      expect(row.frenchAnchor).toBeTruthy();
      expect(row.source).toBeTruthy();
    }
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- grade-data -t "UIAA_SCALE|GRADE_CONVERSION_MATRIX"`
Expected: FAIL — none of these exports exist yet.

- [ ] **Step 3: Implement**

The shared interpolation helper (anchors + full label list in, an
`{id, discipline, toOrdinal, toLabel}` scale out), then each scale's own
anchor data transcribed from the spec:

```js
// #702 -- shared by the four "no natural decomposition" Sport scales.
// `anchors` is the ordered subset of `labels` whose French-standard
// equivalent is actually sourced (spec "The conversion matrix"/"Risks --
// Matrix authority"); every other label in `labels` is spaced evenly
// between its neighboring anchors. Two anchors with the same French
// ordinal are allowed (multiple coarse labels legitimately collapsing to
// one French grade) -- the labels between them then also collapse to
// that same ordinal (zero-width interpolation), which is exactly the
// "coarse scale, several ordinals->one label" shape the spec already
// documents for these scales.
function makeAnchoredScale(id, labels, anchors) {
  const anchorIndex = new Map(anchors.map(a => [a.label, FRENCH_STANDARD.toOrdinal(a.frenchAnchor)]));
  const ordinalByLabel = new Map();
  let lastAnchorPos = -1, lastAnchorOrdinal = null;
  const anchoredPositions = labels
    .map((l, i) => (anchorIndex.has(l) ? i : -1))
    .filter(i => i !== -1);

  for (let i = 0; i < labels.length; i++) {
    const label = labels[i];
    if (anchorIndex.has(label)) {
      ordinalByLabel.set(label, anchorIndex.get(label));
      lastAnchorPos = i;
      lastAnchorOrdinal = anchorIndex.get(label);
      continue;
    }
    const nextAnchorPos = anchoredPositions.find(p => p > i);
    if (lastAnchorPos === -1) {
      // Before the first anchor: extrapolate backward from the first two
      // anchors' slope, clamped so it never goes negative.
      const firstPos = anchoredPositions[0];
      const secondPos = anchoredPositions[1];
      const slope = (anchorIndex.get(labels[secondPos]) - anchorIndex.get(labels[firstPos])) / (secondPos - firstPos);
      ordinalByLabel.set(label, Math.max(0, Math.round(anchorIndex.get(labels[firstPos]) - slope * (firstPos - i))));
      continue;
    }
    if (nextAnchorPos === undefined) {
      // After the last anchor: extrapolate forward from the last two.
      const lastTwo = anchoredPositions.slice(-2);
      const slope = (anchorIndex.get(labels[lastTwo[1]]) - anchorIndex.get(labels[lastTwo[0]])) / (lastTwo[1] - lastTwo[0]);
      ordinalByLabel.set(label, Math.round(lastAnchorOrdinal + slope * (i - lastAnchorPos)));
      continue;
    }
    const nextOrdinal = anchorIndex.get(labels[nextAnchorPos]);
    const t = (i - lastAnchorPos) / (nextAnchorPos - lastAnchorPos);
    ordinalByLabel.set(label, Math.round(lastAnchorOrdinal + t * (nextOrdinal - lastAnchorOrdinal)));
  }

  const labelByOrdinal = new Map();
  for (const [label, ordinal] of ordinalByLabel) if (!labelByOrdinal.has(ordinal)) labelByOrdinal.set(ordinal, label);

  return {
    id,
    discipline: "sport",
    toOrdinal(label) { return ordinalByLabel.get(String(label).toUpperCase()) ?? ordinalByLabel.get(String(label)) ?? null; },
    toLabel(ordinal) {
      if (labelByOrdinal.has(ordinal)) return labelByOrdinal.get(ordinal);
      let closest = null, closestDist = Infinity;
      for (const [o, l] of labelByOrdinal) {
        const d = Math.abs(o - ordinal);
        if (d < closestDist) { closest = l; closestDist = d; }
      }
      return closest;
    },
  };
}

const UIAA_LABELS = [
  "I","II","III-","III","III+","IV-","IV","IV+","V-","V","V+","VI-","VI","VI+",
  "VII-","VII","VII+","VIII-","VIII","VIII+","IX-","IX","IX+","X-","X","X+",
  "XI-","XI","XI+","XII-","XII","XII+",
];
// Wikipedia "Grade (climbing)" comparison table anchor row:
// 5.10a ~ 6a ~ VI+ ~ Ewbank 18-19 ~ Norwegian 6-.
const UIAA_ANCHORS = [
  { label: "VI+", frenchAnchor: "6a", source: "Wikipedia: Grade (climbing)" },
];
export const UIAA_SCALE = makeAnchoredScale("uiaa", UIAA_LABELS, UIAA_ANCHORS);

const YDS_LABELS = [
  "5.0","5.1","5.2","5.3","5.4","5.5","5.6","5.7","5.8","5.9",
  "5.10a","5.10b","5.10c","5.10d","5.11a","5.11b","5.11c","5.11d",
  "5.12a","5.12b","5.12c","5.12d","5.13a","5.13b","5.13c","5.13d",
  "5.14a","5.14b","5.14c","5.14d","5.15a","5.15b","5.15c","5.15d",
];
const YDS_ANCHORS = [
  { label: "5.10a", frenchAnchor: "6a", source: "Wikipedia: Grade (climbing)" },
];
export const YDS_SCALE = makeAnchoredScale("yds", YDS_LABELS, YDS_ANCHORS);

const NORWEGIAN_LABELS = [
  "1","1+","2-","2","2+","3-","3","3+","4-","4","4+","5-","5","5+",
  "6-","6","6+","7-","7","7+","8-","8","8+","9-","9","9+","10-","10","10+","11-","11",
];
// theCrag's Norwegian conversion, both points the spec cites: 6a=6-, and
// the "6a...8c=9+" upper anchor.
const NORWEGIAN_ANCHORS = [
  { label: "6-", frenchAnchor: "6a", source: "theCrag: Norwegian grade conversion" },
  { label: "9+", frenchAnchor: "8c", source: "theCrag: Norwegian grade conversion" },
];
export const NORWEGIAN_SCALE = makeAnchoredScale("norwegian", NORWEGIAN_LABELS, NORWEGIAN_ANCHORS);

const EWBANK_LABELS = Array.from({ length: 40 }, (_, i) => String(i + 1));
const EWBANK_ANCHORS = [
  { label: "18", frenchAnchor: "6a", source: "Wikipedia: Grade (climbing)" },
];
export const EWBANK_SCALE = makeAnchoredScale("ewbank", EWBANK_LABELS, EWBANK_ANCHORS);

// #702 -- the committed conversion matrix: every anchor used above, in
// one place, with its source -- what sub-issue E's reference page reads
// to cite where each equivalence came from. Deliberately only the
// ANCHORS (not every interpolated label) -- an interpolated label isn't
// a sourced claim, it's this module's own best-effort fill-in, and the
// spec's "Matrix authority" risk note is explicit that this whole thing
// is tunable data, not settled fact.
export const GRADE_CONVERSION_MATRIX = [
  ...UIAA_ANCHORS.map(a => ({ scaleId: "uiaa", ...a })),
  ...YDS_ANCHORS.map(a => ({ scaleId: "yds", ...a })),
  ...NORWEGIAN_ANCHORS.map(a => ({ scaleId: "norwegian", ...a })),
  ...EWBANK_ANCHORS.map(a => ({ scaleId: "ewbank", ...a })),
  { scaleId: "v-scale", label: "V9", frenchAnchor: "7c", source: "hakaru.io V-scale converter; cross-checked Wikipedia: Grade (climbing) ('exactly aligns after V9/7C')" },
];
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- grade-data -t "UIAA_SCALE|YDS_SCALE|NORWEGIAN_SCALE|EWBANK_SCALE|GRADE_CONVERSION_MATRIX"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add shared/grade-data.js test/shared/grade-data.test.js
git commit -m "feat(grades): UIAA/YDS/Norwegian/Ewbank scales + committed conversion matrix (#702)"
```

---

## Task 4: `SCALES` registry + scale-aware `gradeRank`/`gradeTier`/`gradeColor`/`gradePyramidColor`/`gradeDisplayLabel`

Adds the new, explicit-scale forms of every existing grade function
**alongside** the current ones — per Global Constraints, nothing existing
changes behavior. `gradeDisplayLabel` currently lives in
`shared/volume-stats.js`, not `grade-data.js` — its new form is added there.

**Files:**
- Modify: `shared/grade-data.js`
- Modify: `shared/volume-stats.js`
- Test: `test/shared/grade-data.test.js`, `test/shared/volume-stats.test.js`

**Interfaces:**
- Consumes: every scale object from Tasks 1–3.
- Produces:
  - `SCALES` — `{ [scaleId]: scaleObject }`, all 9 scales keyed by id
    (`"font"`, `"font-non-standard"`, `"v-scale"`, `"french"`,
    `"french-non-standard"`, `"uiaa"`, `"yds"`, `"norwegian"`, `"ewbank"`).
  - `SCALES_BY_DISCIPLINE` — `{ boulder: [scaleObject, ...], sport:
    [scaleObject, ...] }`, for Task 5/6 and future UI work (#703/#704) to
    enumerate a discipline's valid scale ids.
  - `gradeOrdinal(grade, scaleId)` → number|null. The one real new
    primitive — every function below is now defined in terms of it.
  - `gradeRankForScale(grade, scaleId, type)` → number. Same contract as
    today's `gradeRank(g, type)` (comparable number, `?? 99` fallback) but
    scale-aware.
  - `gradeTierForScale(grade, scaleId, type)`, `gradeColorForScale(grade,
    scaleId, type)`, `gradePyramidColorForScale(grade, scaleId, type)` —
    same pattern.
  - `gradeDisplayLabelForScale(grade, scaleId, type)` (in
    `volume-stats.js`) — same pattern.

- [ ] **Step 1: Write the failing tests**

```js
describe("SCALES / SCALES_BY_DISCIPLINE", () => {
  it("has all 9 scales, keyed by id", () => {
    expect(Object.keys(SCALES).sort()).toEqual([
      "ewbank","font","font-non-standard","french","french-non-standard",
      "norwegian","uiaa","v-scale","yds",
    ]);
  });
  it("splits by discipline correctly", () => {
    expect(SCALES_BY_DISCIPLINE.boulder.map(s => s.id).sort()).toEqual(["font","font-non-standard","v-scale"]);
    expect(SCALES_BY_DISCIPLINE.sport.map(s => s.id).sort()).toEqual(["ewbank","french","french-non-standard","norwegian","uiaa","yds"]);
  });
});

describe("gradeOrdinal / gradeRankForScale / gradeTierForScale / gradeColorForScale / gradePyramidColorForScale", () => {
  it("gradeOrdinal resolves through the right scale", () => {
    expect(gradeOrdinal("6A", "font")).toBe(FONT_STANDARD.toOrdinal("6A"));
    expect(gradeOrdinal("6a+", "french")).toBe(FRENCH_STANDARD.toOrdinal("6a+"));
    expect(gradeOrdinal("not-a-grade", "font")).toBeNull();
  });
  it("gradeRankForScale ranks two grades in different scales correctly, same discipline", () => {
    // V4 (boulder, Font 6B) should rank above V1 (Font 5) -- proves cross-scale ranking actually works, not just parroting one scale's own order.
    const v4 = gradeRankForScale("V4", "v-scale", "boulder");
    const v1 = gradeRankForScale("V1", "v-scale", "boulder");
    expect(v4).toBeGreaterThan(v1);
  });
  it("gradeTierForScale/gradeColorForScale/gradePyramidColorForScale don't throw and return sane shapes across every scale", () => {
    for (const scale of Object.values(SCALES)) {
      const type = scale.discipline;
      const anyLabel = scale.toLabel(scale.discipline === "boulder" ? gradeOrdinal("6A", "font") : gradeOrdinal("6a", "french"));
      expect(typeof gradeTierForScale(anyLabel, scale.id, type)).toBe("string");
      expect(typeof gradeColorForScale(anyLabel, scale.id, type)).toBe("string");
      expect(typeof gradePyramidColorForScale(anyLabel, scale.id, type)).toBe("string");
    }
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- grade-data -t "SCALES|gradeOrdinal|gradeRankForScale"`
Expected: FAIL.

- [ ] **Step 3: Implement**

```js
export const SCALES = {
  [FONT_STANDARD.id]: FONT_STANDARD,
  [FONT_NON_STANDARD.id]: FONT_NON_STANDARD,
  [V_SCALE.id]: V_SCALE,
  [FRENCH_STANDARD.id]: FRENCH_STANDARD,
  [FRENCH_NON_STANDARD.id]: FRENCH_NON_STANDARD,
  [UIAA_SCALE.id]: UIAA_SCALE,
  [YDS_SCALE.id]: YDS_SCALE,
  [NORWEGIAN_SCALE.id]: NORWEGIAN_SCALE,
  [EWBANK_SCALE.id]: EWBANK_SCALE,
};
export const SCALES_BY_DISCIPLINE = {
  boulder: Object.values(SCALES).filter(s => s.discipline === "boulder"),
  sport: Object.values(SCALES).filter(s => s.discipline === "sport"),
};

export function gradeOrdinal(grade, scaleId) {
  const scale = SCALES[scaleId];
  return scale ? scale.toOrdinal(grade) : null;
}

// Same `?? 99` "rank unknown as harder than everything" fallback as
// today's gradeRank() -- deliberate continuity, not an oversight (#461's
// own comment already explains why this beats crashing or silently
// sorting an out-of-model grade first).
export function gradeRankForScale(grade, scaleId, type) {
  return gradeOrdinal(grade, scaleId) ?? 99;
}

export function gradeTierForScale(grade, scaleId, type) {
  const resolvedType = type ?? "boulder";
  const thresholds = GRADE_TIER_THRESHOLDS[resolvedType] ?? GRADE_TIER_THRESHOLDS.boulder;
  // Thresholds are still expressed as labels in the discipline's own
  // primary scale (Font-standard / French-standard) -- resolve those
  // through the SAME scale as the grade being classified only when it's
  // the primary scale; otherwise compare via the shared canonical
  // ordinal both sides now share (Task 1's whole point).
  const primaryScaleId = resolvedType === "boulder" ? "font" : "french";
  const r = gradeOrdinal(grade, scaleId) ?? 99;
  let tier = thresholds[0][0];
  for (const [name, fromGrade] of thresholds) {
    if (fromGrade !== null && r >= (gradeOrdinal(fromGrade, primaryScaleId) ?? 99)) tier = name;
  }
  return tier;
}

export function gradeColorForScale(grade, scaleId, type) {
  return GRADE_TIER_COLORS[gradeTierForScale(grade, scaleId, type)];
}

export function gradePyramidColorForScale(grade, scaleId, type) {
  const resolvedType = type ?? "boulder";
  const primaryScaleId = resolvedType === "boulder" ? "font" : "french";
  const list = resolvedType === "boulder" ? FONT_STANDARD_LABELS : FRENCH_STANDARD_LABELS;
  const maxRank = gradeOrdinal(list[list.length - 1], primaryScaleId);
  const r = gradeOrdinal(grade, scaleId) ?? 0;
  const frac = Math.min(1, Math.max(0, r / maxRank));
  const pos = frac * (FIERY_RED_SUNSET.length - 1);
  const lo = Math.floor(pos);
  if (pos === lo) return FIERY_RED_SUNSET[lo];
  const hi = lo + 1;
  const loPct = Math.round((hi - pos) * 100);
  return `color-mix(in srgb, ${FIERY_RED_SUNSET[lo]} ${loPct}%, ${FIERY_RED_SUNSET[hi]})`;
}
```

In `shared/volume-stats.js`, add alongside the existing
`gradeDisplayLabel` (import `gradeOrdinal`/`V_SCALE`/`SCALES` from
`./grade-data.js` too):

```js
// #702 -- scale-aware sibling of gradeDisplayLabel() above. Same V-scale
// display quirk (Boulder's V-grade text isn't 1:1 with Font internally),
// generalized: for Boulder, always render the V-scale label regardless of
// which scale `grade` was logged in, by converting through the shared
// canonical ordinal (gradeOrdinal) rather than a direct BOULDER_GRADES
// string match, which only worked because every grade used to be in one
// implicit scale.
export function gradeDisplayLabelForScale(grade, scaleId, type) {
  if (type !== "boulder") return grade;
  const ordinal = gradeOrdinal(grade, scaleId);
  return ordinal === null ? grade : V_SCALE.toLabel(ordinal);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- grade-data volume-stats`
Expected: PASS, including every pre-existing test in both files
(regression check for Global Constraints' "nothing existing changes").

- [ ] **Step 5: Commit**

```bash
git add shared/grade-data.js shared/volume-stats.js test/shared/grade-data.test.js test/shared/volume-stats.test.js
git commit -m "feat(grades): scale-aware gradeRank/gradeTier/gradeColor/gradePyramidColor/gradeDisplayLabel (#702)"
```

---

## Task 5: `entries.grade_scale` — schema, validation, server read/write

**Files:**
- Modify: `shared/entry-schema.js`
- Modify: `server/api/logbook.js`
- Test: `test/shared/entry-schema.test.js`, and whichever test file covers
  `buildRow`/`rowToJson`/`publicRowToJson` today — confirm the exact path
  with `grep -rn "buildRow\|rowToJson" test/` before writing Step 1; if
  none of the three are directly unit-tested (only exercised indirectly
  through `test/logbook.test.js`'s HTTP-level tests), add the new
  assertions there instead, following that file's existing style for a
  POST/PUT round-trip.

**Interfaces:**
- Consumes: `SCALES_BY_DISCIPLINE` (Task 4).
- Produces: `entrySchema` validates an optional `entry.gradeScale`;
  `buildRow(entry, id, userId)` writes `grade_scale`; `rowToJson(row)` /
  `publicRowToJson(row)` read it back as `gradeScale`.

- [ ] **Step 1: Write the failing entry-schema test**

```js
import { validateEntryShape } from "../../shared/entry-schema.js";

describe("gradeScale validation", () => {
  const base = { id: "1", placeId: "p1", name: "Test", grade: "6A", type: "boulder", status: "send" };

  it("accepts an entry with no gradeScale at all -- optional, not required (client/entry-form.js doesn't send it yet)", () => {
    expect(validateEntryShape(base)).toBeNull();
  });
  it("accepts a valid gradeScale for the entry's discipline", () => {
    expect(validateEntryShape({ ...base, gradeScale: "font-non-standard" })).toBeNull();
  });
  it("rejects a gradeScale that doesn't belong to the entry's discipline", () => {
    expect(validateEntryShape({ ...base, gradeScale: "french" })).toMatch(/gradeScale/);
  });
  it("rejects an unknown gradeScale id", () => {
    expect(validateEntryShape({ ...base, gradeScale: "not-a-real-scale" })).toMatch(/gradeScale/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- entry-schema -t "gradeScale"`
Expected: FAIL — `gradeScale` currently isn't validated at all (an unknown
value passes silently since `anyField` accepts anything and no check runs
against it), so the "rejects" cases fail first.

- [ ] **Step 3: Implement**

In `shared/entry-schema.js`, add the import and the field:

```js
import { SCALES_BY_DISCIPLINE } from "./grade-data.js";
```

Add `gradeScale: anyField,` to the `v.object({...})` block (alongside the
existing `grade: anyField,` line), then add this check in the `rawCheck`
body, right after the existing `grade` check
(`if (!VALID_GRADES[entry.type].includes(entry.grade)) {...}`):

```js
    // #702 -- optional, not required: client/entry-form.js doesn't send
    // this yet (sub-issue #703 adds the picker that will). Validated only
    // when present, so every current entry create/edit keeps working
    // completely unchanged until #703 ships.
    if (entry.gradeScale !== undefined && entry.gradeScale !== null) {
      const validIds = SCALES_BY_DISCIPLINE[entry.type]?.map(s => s.id) ?? [];
      if (!validIds.includes(entry.gradeScale)) {
        addIssue({ message: `gradeScale must be one of: ${validIds.join(", ")}`, path: fieldPath(entry, "gradeScale") });
        return;
      }
    }
```

In `server/api/logbook.js`, update `buildRow`:

```js
// #702 -- the exact same finite legacy low-end list the migration
// (migrations/0016_add_grade_scale.sql) backfills against -- MUST stay in
// sync with that SQL file's own WHERE clause; both encode "which
// pre-correction Sport grades were never real FFME notation." Boulder has
// no equivalent branch: every existing/legacy Boulder grade string is a
// valid font-non-standard label once compared case-insensitively (see the
// migration's own comment for why).
const LEGACY_SPORT_NON_STANDARD_GRADES = new Set(["1", "1+", "2", "2+", "3", "3+"]);
function defaultGradeScale(entry) {
  if (entry.type === "boulder") return "font-non-standard";
  return LEGACY_SPORT_NON_STANDARD_GRADES.has(entry.grade) ? "french-non-standard" : "french";
}
```

Then in `buildRow`'s returned object, add one line after `grade:
entry.grade,`:

```js
    grade_scale: entry.gradeScale ?? defaultGradeScale(entry),
```

In `rowToJson` and `publicRowToJson`, add one line after each `grade:
row.grade,`:

```js
    gradeScale: row.grade_scale,
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- entry-schema logbook`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add shared/entry-schema.js server/api/logbook.js test/shared/entry-schema.test.js
git commit -m "feat(grades): optional gradeScale field, validated and defaulted server-side (#702)"
```

---

## Task 6: `entries.grade_scale` migration + backfill

**Files:**
- Create: `migrations/0016_add_grade_scale.sql`
- Test: verified by running the real migration against a fresh D1 instance
  (Vitest's `applyD1Migrations`, `test/apply-migrations.js`) — every
  existing test that touches `entries` already exercises this path.

**Interfaces:**
- Consumes: nothing new (pure SQL).
- Produces: `entries.grade_scale TEXT NOT NULL`, backfilled for every
  existing row.

- [ ] **Step 1: Check real row counts before writing the backfill**

The spec's own "Risks / open notes" requires checking real data before
finalizing this — not optional. Run against the actual D1 database (use
whichever `wrangler d1 execute` invocation this repo's other migrations'
own commit history used — check `git log --oneline -- migrations/` for a
recent example, e.g. `0015`'s own PR, for the exact flag set: local vs
`--remote`, database name):

```bash
wrangler d1 execute LOGBOOK_DB --remote --command "SELECT discipline_id, grade, COUNT(*) FROM entries WHERE discipline_id = 'sport' GROUP BY discipline_id, grade ORDER BY grade;"
```

Confirm the counts match what the spec's "Risks / open notes" describes
(a tiny dataset — a handful of Boulder rows, 3 Sport rows). Record the
actual output in the commit message for Step 5 below. If the real counts
are wildly different from "tiny" (hundreds of rows, multiple real users),
stop and flag it before proceeding — the backfill mapping below was
designed and approved against a tiny dataset.

- [ ] **Step 2: Write the migration**

```sql
-- migrations/0016_add_grade_scale.sql
-- Adds entries.grade_scale (#702, sub-issue A of #183) -- which of the 9
-- grade scales entries.grade is written in. Storage is now "as logged":
-- entries.grade stays exactly what was typed, grade_scale records the
-- notation it's in, and the canonical ordinal used for sort/filter/report
-- is always computed on demand from the pair (never a stored column --
-- see the spec's "Storage" section for why: this app filters/sorts in
-- application code over a small per-user result set, not a SQL WHERE/
-- ORDER BY, so there's no query-performance case for materializing it,
-- and nothing to keep in sync if a matrix anchor is ever corrected).
--
-- Backfill reasoning (spec "Risks / open notes", confirmed against real
-- row counts -- see this migration's own commit message):
--
-- Boulder: every existing grade string is the app's old ad-hoc hybrid
-- notation -- uppercase, but with letters below 6A ("1A", "5C") that
-- neither real Font-standard (no letters below 6) nor real Font-extended
-- (lowercase) uses as-is. It IS a 1:1 match for Font-extended's own
-- progression once lowercased -- so every Boulder row backfills to
-- font-non-standard, with `grade` itself also lowercased to match that
-- scale's real notation (see shared/grade-data.js's
-- parseNonStandardLabel -- it's case-insensitive on read regardless, but
-- storing the label in the notation its own scale actually uses is more
-- honest than storing an uppercase string tagged as a lowercase scale).
--
-- Sport: the FFME correction only changed labels below 6a. Existing
-- 4a/4b/4c/5a/5b/5c rows are valid, unchanged labels in the new French
-- table -- backfill those to french, verbatim. Existing 1/1+/2/2+/3/3+
-- rows used the OLD, now-known-incorrect low end (FFME's real 1/2/3a
-- shape never had a "+" there) -- backfilling those as `french` would
-- misrepresent them as authoritative FFME notation they never were.
-- Backfill to french-non-standard instead, preserving the label exactly
-- as logged (it's already a valid french-non-standard label -- e.g. "1+"
-- is number=1, no letter, modifier=+). This exact literal set --
-- 1/1+/2/2+/3/3+ -- MUST stay in sync with server/api/logbook.js's own
-- LEGACY_SPORT_NON_STANDARD_GRADES (used for the same classification on
-- every new write until #703 ships a real picker).
--
-- sync_cursor bumped on every row this changes, same reasoning as
-- 0014/0015's own identical fix -- an already-synced client's local cache
-- otherwise never picks up the new column's value.
ALTER TABLE entries ADD COLUMN grade_scale TEXT;

UPDATE entries
SET grade_scale = 'font-non-standard',
    grade = LOWER(grade),
    sync_cursor = CAST(unixepoch() * 1000 AS INTEGER)
WHERE discipline_id = 'boulder';

UPDATE entries
SET grade_scale = 'french-non-standard',
    sync_cursor = CAST(unixepoch() * 1000 AS INTEGER)
WHERE discipline_id = 'sport' AND grade IN ('1', '1+', '2', '2+', '3', '3+');

UPDATE entries
SET grade_scale = 'french',
    sync_cursor = CAST(unixepoch() * 1000 AS INTEGER)
WHERE discipline_id = 'sport' AND grade_scale IS NULL;
```

`grade_scale` is deliberately added nullable-then-backfilled-then-left
without a `NOT NULL` constraint in this migration — D1/SQLite can't add a
`NOT NULL` column without a constant default in one `ALTER TABLE` (same
limit 0005's own comment already documents), and every one of these three
`UPDATE`s together covers every row unconditionally (`boulder` OR
`sport` is exhaustive for `discipline_id`), so no row is ever left NULL
in practice. `server/api/logbook.js`'s `defaultGradeScale()` (Task 5)
guarantees every future write also always sets it. If Raven wants the
`NOT NULL` guarantee enforced at the DB level too, that's a trivial
follow-up migration once this one is confirmed to have left zero NULLs —
not blocking this plan.

- [ ] **Step 3: Run the full test suite to verify the migration applies cleanly**

Run: `pnpm test`
Expected: PASS — every existing D1-backed test applies migrations
0001–0016 in sequence via `test/apply-migrations.js`'s `applyD1Migrations`,
so a SQL syntax error or constraint violation here fails the entire suite
immediately, not just a targeted test.

- [ ] **Step 4: Verify the backfill against real data (dry run)**

Run the three `UPDATE` statements' `WHERE`/`SET` logic as `SELECT`s first
against the real remote DB, to confirm the row counts match Step 1's
findings before this migration ever runs for real (migrations deploy
immediately per ADR-0020 — there's no staging rehearsal):

```bash
wrangler d1 execute LOGBOOK_DB --remote --command "SELECT COUNT(*) as boulder_count FROM entries WHERE discipline_id = 'boulder';"
wrangler d1 execute LOGBOOK_DB --remote --command "SELECT COUNT(*) as legacy_low_end FROM entries WHERE discipline_id = 'sport' AND grade IN ('1','1+','2','2+','3','3+');"
wrangler d1 execute LOGBOOK_DB --remote --command "SELECT COUNT(*) as french_standard FROM entries WHERE discipline_id = 'sport' AND grade NOT IN ('1','1+','2','2+','3','3+');"
```

- [ ] **Step 5: Commit**

```bash
git add migrations/0016_add_grade_scale.sql
git commit -m "feat(grades): add entries.grade_scale, backfill existing rows (#702)

Real row counts confirmed before writing the backfill:
<paste Step 1's actual output here>"
```

---

## Task 7: `docs/app-architecture.md` — canonical grade model section

**Files:**
- Modify: `docs/app-architecture.md`

**Interfaces:**
- Consumes: nothing (documentation only).
- Produces: nothing consumed by other tasks — this is the plan's last
  content task.

- [ ] **Step 1: Add `gradeScale` to the documented Entry wire format**

In the `Entry { ... }` block (`docs/app-architecture.md`, "Data model"
section), change:

```
  name, grade: string,
```

to:

```
  name, grade: string,
  gradeScale: string,   // which of the 9 grade scales `grade` is in --
                         // see "Canonical grade model" below. Optional on
                         // write (server defaults it when absent -- see
                         // that section); always present on read.
```

- [ ] **Step 2: Add the new subsection**

Insert a new `###` subsection immediately after the `Entry { ... }` code
block and its immediately-following paragraph (the one starting
"`type`/`status` on the wire map directly..."), before the
`buildRow()`/`rowToJson()` paragraph:

```markdown
### Canonical grade model

`shared/grade-data.js` (#702) defines one canonical ordinal per
discipline — a pure formula, `(number - 1) * 12 + subPosition`, not a
backing array — and 9 grade scales, each `{ id, discipline,
toOrdinal(label), toLabel(ordinal) }`:

| Discipline | Scales |
|---|---|
| Boulder | `font`, `font-non-standard`, `v-scale` |
| Sport | `french`, `french-non-standard`, `uiaa`, `yds`, `norwegian`, `ewbank` |

**Storage is "as logged", not canonical.** `entries.grade` stays exactly
as entered; `entries.grade_scale` (added by
`migrations/0016_add_grade_scale.sql`) records which scale it's in. The
canonical ordinal is **never stored** — always computed on demand via
`gradeOrdinal(grade, scaleId)`, the same way `gradeRank()` computed a
rank from a single implicit scale before this. This directly serves a
real requirement: a climber logs a grade exactly as their guidebook
shows it, sees it in the logbook exactly as logged, and exports it
exactly as logged — none of that is possible if the stored value is
already converted to some canonical notation.

**The two Non-standard scales** (`font-non-standard`,
`french-non-standard`) aren't lookup tables — real guidebooks use
letters and `+`/`-` modifiers inconsistently (e.g. Jingo Wobbly for
Font), so both accept the full combinatorial space (a number 1–9, an
optional letter a–c, an optional modifier `+`/`-`) via one shared,
discipline-agnostic formula (`nonStandardOrdinal`) rather than an
enumerated list — the exact class of drift bug #698 found in the old
`BOULDER_ORDER` hand-kept list can't recur here since there's no second
list to fall out of sync.

**The other 7 scales** resolve onto that same canonical numbering:
Font-standard, French-standard, and V-scale from real, verified tables
(Font/French decompose through the same number+letter+modifier shape;
V-scale is an explicit anchor table against Font-standard, corrected
2026-09-11 against hakaru.io's V-scale converter — earlier internal
drafts of this had `6A≈V0`, which no real chart shows). UIAA, YDS,
Norwegian, and Ewbank have no natural decomposition and no single
authoritative source, so each is anchor-interpolated: `shared/
grade-data.js`'s `GRADE_CONVERSION_MATRIX` records every anchor point
actually used, with its source, and every label between two anchors is
spaced evenly — a documented best-effort, not settled fact (see the
design spec's "Matrix authority" note).

Design spec: `docs/superpowers/specs/2026-09-10-configurable-grade-systems-design.md`.
```

- [ ] **Step 3: Commit**

```bash
git add docs/app-architecture.md
git commit -m "docs: canonical grade model section (#702)"
```

---

## Task 8: Full-suite verification + PR (stays open, not merged)

**Files:** none (verification + PR only).

- [ ] **Step 1: Run the full test suite**

Run: `pnpm test`
Expected: PASS, 0 failures — every test from Tasks 1–7 plus every
pre-existing test in `test/shared/grade-data.test.js`,
`test/shared/volume-stats.test.js`, `test/shared/gap-stats.test.js`,
`test/shared/effort-stats.test.js`, `test/shared/pyramid-stats.test.js`,
`test/shared/entry-schema.test.js`, `test/logbook.test.js`, and any e2e
suite that touches entry creation/editing.

- [ ] **Step 2: Confirm no UI file actually changed behavior**

```bash
git diff origin/main --stat -- client/
```

Expected: empty, or (if Task 4 touched `client/*.js` at all — it
shouldn't have, per Global Constraints) confirm by reading the diff that
any touched line is a comment or an unused-so-far import, never a changed
call site.

- [ ] **Step 3: Push and open the PR**

```bash
git push -u origin issue-702-grade-canonical-model
gh pr create --title "Grade systems: canonical model + 9 scales + conversion matrix + storage (#702)" \
  --body "Closes #702. Sub-issue A of #183 -- see docs/superpowers/specs/2026-09-10-configurable-grade-systems-design.md.

Canonical ordinal (formula-based, not a backing array) + all 9 grade scales + the conversion matrix, and entries.grade_scale storage (\"as logged\", never a stored canonical value). Nothing UI-facing changes -- every existing export/behavior is preserved unchanged; the new scale-aware functions are additive, ready for #703/#704/#705/#708 to build on.

**Migration**: migrations/0016_add_grade_scale.sql backfills grade_scale for every existing row. Real row counts confirmed before writing it -- see that migration's own commit message. This involves a real judgment call (which scale to backfill each existing Sport row to), so per Raven's standing instruction this PR is left open for review rather than self-merged." \
  --label "release: minor"
```

- [ ] **Step 4: Report back — do not merge, do not continue to B/C/E/F**

This PR's migration involves real judgment calls (the backfill mapping) —
per Global Constraints, stop here. Report the PR URL and that it's
waiting for Raven's review, same as this plan's own header says. Do not
invoke finishing-a-development-branch's merge option, and do not start
sub-issue B/C/E/F's work in this same session pass without Raven
explicitly asking for it next.

---

## Self-review notes (run before handing this plan off)

- **Spec coverage**: canonical ordinal (Task 1) ✅, all 9 scales (Tasks
  1–3) ✅, conversion matrix (Task 3) ✅, storage as-logged (Tasks 5–6) ✅,
  `gradeTier`/`gradeColor`/`gradePyramidColor`/`gradeDisplayLabel`
  re-pointing (Task 4, additive form) ✅, `docs/app-architecture.md`
  section (Task 7) ✅. `entry-schema.js`'s `VALID_GRADES` re-pointing from
  the spec's "What replaces what" table is **deliberately not done in this
  plan** — `BOULDER_GRADES`/`LEAD_GRADES` (which `VALID_GRADES` derives
  from) are frozen as-is per Global Constraints, so `VALID_GRADES` already
  correctly reflects them unchanged; real re-pointing happens when
  sub-issue B retires those two arrays. Noted explicitly rather than
  silently dropped.
- **Placeholder scan**: no TBD/TODO, every code step has real
  implementation. The one deliberately-approximate piece — the coarse
  scales' anchor interpolation in Task 3 — is approximate by design (the
  spec's own "best-effort, tunable data" framing for exactly these four
  scales), not a placeholder; its anchors and algorithm are both fully
  specified and tested.
- **Type consistency**: `{id, discipline, toOrdinal(label), toLabel(ordinal)}`
  is the one scale-object shape used identically across every task.
  `gradeOrdinal(grade, scaleId)` (Task 4) is the single primitive every
  other new function in Tasks 4–6 is built from — checked, no drift.
