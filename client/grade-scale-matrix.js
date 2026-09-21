// Shared "Grade scales & conversion" reference page content (#705, sub-
// issue E of #183). A pure string generator -- no DOM dependency, same
// "callers assign the returned string to a container's innerHTML"
// convention every other client/*.js module in this codebase uses (see
// client/combo-chart.js's own header comment) -- what lets this module's
// tests run on the plain "workers" Vitest project with no happy-dom
// needed.
//
// Reads only A's (#702) already-committed data (shared/grade-data.js) --
// no live API, matching the spec's "static-ish page" scoping for this
// sub-issue.
import { escapeHtml } from "./escape-html.js";
import { SCALES_BY_DISCIPLINE, FONT_STANDARD, FRENCH_STANDARD, GRADE_CONVERSION_MATRIX } from "../shared/grade-data.js";

// The reference scale each discipline's matrix rows are keyed against --
// the one scale in each discipline with an exhaustive, real (not
// interpolated) label list covering every canonical step in range. Same
// choice #704's own REPORT_PRIMARY_SCALE constant made for the identical
// reason (shared/volume-stats.js).
const REFERENCE_SCALE = { boulder: FONT_STANDARD, sport: FRENCH_STANDARD };

// #877/#190 -- a standard-scale row keyed by its own label (e.g. Font
// "6A") would previously show its Non-standard column as the literal
// SAME text ("6a") -- not a bug in the sense of wrong data, but useless:
// buildMatrixRows only ever queries the Non-standard scale's toLabel() at
// ordinals that ARE already exact standard-scale label positions, so the
// two columns could never differ. The standard scale's own label list is
// a curated SUBSET of the full number+letter+modifier space
// (shared/grade-data.js's nonStandardOrdinal/nonStandardLabel) -- Font,
// for instance, only labels 6 of the 12 possible sub-positions per number
// from 6 upward (6A,6A+,6B,6B+,6C,6C+; not 6-,6,6A-,6B-,6C-,6+). This
// walks every real Non-standard sub-position across the standard scale's
// own ordinal range and groups them by whichever standard label they're
// CLOSEST to (the standard scale's own toLabel(), shared/grade-data.js's
// closestParsedLabel -- scoped to same-number candidates only, so e.g.
// "6-"/"6" bucket under "6A", the lowest labelled step IN NUMBER 6, never
// under the previous number's "5+") -- what a row's Non-standard column
// actually shows is "every non-standard grade that would round to this
// standard grade", not a single, always-identical value.
//
// Range: the full NUMBER each end label belongs to, not just that
// label's own exact ordinal -- Font-standard's lowest label "3" starts
// mid-number (there's a real "3-" below it, still within number 3, that
// belongs on "3"'s own row); its highest label "9A" is the ONLY label in
// number 9, so every other sub-position in that number (9A+ through 9+)
// needs to round somewhere too, and same-number-only matching means
// "9A" is their sole candidate. Stopping at each label's own ordinal
// silently dropped both ends' worth of real sub-positions from every
// grouped list.
function nonStandardLabelsByStandardRow(referenceScale, nonStandardScale) {
  const SUB_POSITIONS_PER_NUMBER = 12;
  const firstOrdinal = referenceScale.toOrdinal(referenceScale.labels[0]);
  const lastOrdinal = referenceScale.toOrdinal(referenceScale.labels[referenceScale.labels.length - 1]);
  const minOrdinal = Math.floor(firstOrdinal / SUB_POSITIONS_PER_NUMBER) * SUB_POSITIONS_PER_NUMBER;
  const maxOrdinal = Math.floor(lastOrdinal / SUB_POSITIONS_PER_NUMBER) * SUB_POSITIONS_PER_NUMBER + (SUB_POSITIONS_PER_NUMBER - 1);
  const byRow = new Map();
  for (let ordinal = minOrdinal; ordinal <= maxOrdinal; ordinal++) {
    const standardLabel = referenceScale.toLabel(ordinal);
    if (!byRow.has(standardLabel)) byRow.set(standardLabel, []);
    byRow.get(standardLabel).push(nonStandardScale.toLabel(ordinal));
  }
  return byRow;
}

// #877/#190 -- Font-standard's own labels start at "3": numbers 1 and 2
// have no standard-scale label at all (real guidebooks don't grade that
// low with this scale), so every Non-standard sub-position below "3"
// has nowhere real to round to -- nonStandardLabelsByStandardRow()
// deliberately never enumerates that range (it starts at the standard
// scale's own minimum ordinal), rather than closest-matching those
// positions into "3"'s row, which would misrepresent an entire two
// numbers' worth of range as belonging to one specific grade. This
// single row stands in for that whole range instead: no Font or V-scale
// value (neither scale reaches this low), a plain description of the
// Non-standard shape rather than an exhaustive list (24 sub-positions is
// too granular to be useful). Boulder-only -- French-standard's own
// labels already start at "1" with no letter, so there's no equivalent
// unlabelled range for Sport.
const BELOW_RANGE_ROW = {
  ordinal: null,
  cells: {
    font: null,
    "font-non-standard": "number (1/2), letter (optional, a/b/c), modifier (optional -/+)",
    "v-scale": null,
  },
};

// One row per reference-scale label. Every scale but the reference
// scale's own Non-standard sibling resolves through toLabel(ordinal) --
// exactly the "every scale interprets the same canonical ordinal"
// property #702 built the whole model to guarantee. A coarser scale
// (V-scale, UIAA, YDS, Norwegian, Ewbank) naturally repeats its own
// label across more than one row here (e.g. Font 6A and 6A+ both show
// V-scale's "V3") -- that's real, documented lossiness (see Sport's own
// caveat text below), not a rendering bug.
export function buildMatrixRows(discipline) {
  const referenceScale = REFERENCE_SCALE[discipline];
  const scales = SCALES_BY_DISCIPLINE[discipline];
  if (!referenceScale || !scales) throw new Error(`Unknown discipline: ${discipline}`);
  const nonStandardScale = scales.find(s => s.id.endsWith("-non-standard"));
  const nonStandardByRow = nonStandardLabelsByStandardRow(referenceScale, nonStandardScale);
  const rows = referenceScale.labels.map(label => {
    const ordinal = referenceScale.toOrdinal(label);
    const cells = Object.fromEntries(scales.map(scale => {
      if (scale === nonStandardScale) {
        return [scale.id, (nonStandardByRow.get(label) ?? []).join(", ")];
      }
      return [scale.id, scale.toLabel(ordinal)];
    }));
    return { ordinal, cells };
  });
  if (discipline === "boulder") rows.unshift(BELOW_RANGE_ROW);
  return rows;
}

// Every distinct source cited anywhere in GRADE_CONVERSION_MATRIX (both
// disciplines), deduped -- what backs the "Cites every source"
// acceptance criterion by construction (reading the same committed
// matrix the conversions themselves are built from, rather than a
// hand-kept prose list that could drift out of sync with it, the exact
// #698-class bug this whole rework exists to avoid).
function allConversionSources() {
  return [...new Set(GRADE_CONVERSION_MATRIX.map(a => a.source))];
}

// A short, plain description per source -- Raven's call, 2026-09-21: the
// Sources section names what each source IS, not what conversion it
// backs (the table above already shows every conversion; repeating the
// specific grade pairs here just duplicates it). Keyed by the exact
// source string GRADE_CONVERSION_MATRIX cites.
const SOURCE_DESCRIPTIONS = {
  "Wikipedia: Grade (climbing)": "Cross-scale grade comparison tables.",
  "theCrag: Norwegian grade conversion": "Norwegian-scale conversion reference.",
  "Rockfax: Bouldering Grade Table (2020)": "Free poster comparing Font, V and UK tech grades.",
};

const CAVEATS_BY_DISCIPLINE = {
  boulder: `V-scale is <strong class="text-foreground font-semibold">coarser</strong> than Font below 7C -- several V-scale steps
     (V3, V4, V5, V8) each cover two Font grades, so converting a V-scale grade back to Font always resolves
     to the <em>lower</em> of that pair. This avoids unintended grade inflation for performance insights.`,
  sport: `Sport conversions are <strong class="text-foreground font-semibold">lossy</strong>. French, UIAA, and YDS
     are roughly 1:1 with documented anchor points; Norwegian and Ewbank use different granularity and offsets,
     interpolated between their own sourced anchors. Converting between scales with different granularity always
     loses some precision on a round trip -- that's inherent to the conversion, not specific to this app. Where
     real sources disagree -- French's own low end (below <code>6a</code>) and Font's
     (<code>5</code>/<code>5A</code>/<code>5B</code>/<code>5C</code>) -- this app picks one convention and states
     it here.`,
};

// French (FFME)'s own base table isn't a converted anchor (it's the
// reference scale sport's own matrix is built against), so it doesn't
// come from GRADE_CONVERSION_MATRIX -- cited by hand here instead, per
// the spec's own "Sport" section sourcing note. Boulder's own reference
// scale (Font) has no equivalent hand-cited note: the spec treats Font
// as the known baseline every other Boulder scale converts against, not
// itself a disputed convention.
const BASE_TABLE_NOTE = {
  boulder: null,
  sport: `French (FFME)'s own table -- this app's Sport reference scale -- follows the Fédération Française de la
     Montagne et de l'Escalade's convention, chosen after checking FFME, French Wikipedia, the Rockfax 2020
     grade-comparison chart, and English-language references, which disagree below <code>6a</code>. From
     <code>6a</code> up, every source agrees exactly.`,
};

export function gradeScaleMatrixHtml(discipline) {
  const scales = SCALES_BY_DISCIPLINE[discipline];
  if (!scales) throw new Error(`Unknown discipline: ${discipline}`);
  const rows = buildMatrixRows(discipline);
  const headerCells = scales.map(s => `<th scope="col" class="text-left font-semibold text-muted text-[.78rem] py-[.5rem] px-[.6rem] whitespace-nowrap">${escapeHtml(s.name)}</th>`).join("");
  const bodyRows = rows.map(row => {
    const cells = scales.map(s => `<td class="py-[.4rem] px-[.6rem] whitespace-nowrap">${row.cells[s.id] != null ? escapeHtml(row.cells[s.id]) : "<span class=\"text-muted\">—</span>"}</td>`).join("");
    return `<tr class="border-t border-border">${cells}</tr>`;
  }).join("");

  const baseNote = BASE_TABLE_NOTE[discipline] ? `<p class="text-[.82rem] text-muted leading-[1.7] mb-4">${BASE_TABLE_NOTE[discipline]}</p>` : "";

  return `
    <p class="text-[.82rem] text-muted leading-[1.7] mb-4">${CAVEATS_BY_DISCIPLINE[discipline] ?? ""}</p>
    ${baseNote}
    <div class="overflow-x-auto rounded-app border border-border" id="grade-scale-matrix-scroll">
      <table class="w-full border-collapse text-[.85rem]">
        <thead><tr>${headerCells}</tr></thead>
        <tbody>${bodyRows}</tbody>
      </table>
    </div>
  `;
}

// #877/#190 -- split out of gradeScaleMatrixHtml so the page can put one
// shared Sources section at the bottom of the page (Raven's call,
// 2026-09-21), not interleaved per-table, and not split per discipline --
// a source doesn't change identity depending on which table cites it, so
// one list, deduped across both. Plain source name + a short description
// of what it is -- no repeated grade-conversion pairs (the tables above
// already show every conversion; this section just says where the
// numbers came from). Uses sources-heading (styles/tailwind.css) -- the
// same hairline-topped style every other Sources section in the app
// uses, not a page-local bare <h2>.
export function gradeScaleSourcesHtml() {
  const sources = allConversionSources();
  if (sources.length === 0) return "";
  const items = sources.map(source => `<li><strong class="text-foreground font-semibold">${escapeHtml(source)}</strong>${SOURCE_DESCRIPTIONS[source] ? ` -- ${escapeHtml(SOURCE_DESCRIPTIONS[source])}` : ""}</li>`).join("");
  return `
    <h2 class="sources-heading">Sources</h2>
    <ol class="m-0 pl-[1.2rem] text-[.84rem] leading-[1.6] text-foreground [&>li+li]:mt-[10px]">${items}</ol>
  `;
}
