import { escapeHtml } from "./escape-html.js";
import { SCALES_BY_DISCIPLINE, FONT_STANDARD, FRENCH_STANDARD, GRADE_CONVERSION_MATRIX } from "../shared/grade-data.js";

const REFERENCE_SCALE = { boulder: FONT_STANDARD, sport: FRENCH_STANDARD };

// Groups every non-standard sub-position under the standard label it rounds to, within the same
// number, across whole numbers at both ends so none are dropped.
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

// Font starts at 3, so numbers 1 and 2 get one descriptive row rather than rounding into 3.
const BELOW_RANGE_ROW = {
  ordinal: null,
  cells: {
    font: null,
    "font-non-standard": "number (1/2), letter (optional, a/b/c), modifier (optional -/+)",
    "v-scale": null,
  },
};

// Coarse scales repeat labels across rows (6A and 6A+ are both V3): real lossiness, not a bug.
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

// Built from the matrix itself, so the source list can't drift from the data.
function allConversionSources() {
  return [...new Set(GRADE_CONVERSION_MATRIX.map(a => a.source))];
}

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

// French is the sport reference table, not a converted anchor, so it's cited by hand.
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

export function gradeScaleSourcesHtml() {
  const sources = allConversionSources();
  if (sources.length === 0) return "";
  const items = sources.map(source => `<li><strong class="text-foreground font-semibold">${escapeHtml(source)}</strong>${SOURCE_DESCRIPTIONS[source] ? ` -- ${escapeHtml(SOURCE_DESCRIPTIONS[source])}` : ""}</li>`).join("");
  return `
    <h2 class="sources-heading">Sources</h2>
    <ol class="m-0 pl-[1.2rem] text-[.84rem] leading-[1.6] text-foreground [&>li+li]:mt-[10px]">${items}</ol>
  `;
}
