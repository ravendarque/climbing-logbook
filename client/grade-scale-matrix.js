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

// One row per reference-scale label, each column resolved through that
// scale's own toLabel(ordinal) -- exactly the "every scale interprets
// the same canonical ordinal" property #702 built the whole model to
// guarantee. A coarser scale (V-scale, UIAA, YDS, Norwegian, Ewbank)
// naturally repeats its own label across more than one row here (e.g.
// Font 6A and 6A+ both show V-scale's "V3") -- that's the real,
// documented lossiness the spec's "Sport conversions are lossy and known
// to be" section describes, not a rendering bug.
export function buildMatrixRows(discipline) {
  const referenceScale = REFERENCE_SCALE[discipline];
  const scales = SCALES_BY_DISCIPLINE[discipline];
  if (!referenceScale || !scales) throw new Error(`Unknown discipline: ${discipline}`);
  return referenceScale.labels.map(label => {
    const ordinal = referenceScale.toOrdinal(label);
    return {
      ordinal,
      cells: Object.fromEntries(scales.map(scale => [scale.id, scale.toLabel(ordinal)])),
    };
  });
}

// Every anchor actually used to build this discipline's own conversions,
// deduped by its cited source string -- what backs the "Cites every
// source" acceptance criterion by construction (reading the same
// committed matrix the conversions themselves are built from, rather
// than a hand-kept prose list that could drift out of sync with it, the
// exact #698-class bug this whole rework exists to avoid).
function conversionSourcesFor(discipline) {
  const scaleIds = new Set(SCALES_BY_DISCIPLINE[discipline].map(s => s.id));
  const bySource = new Map();
  for (const anchor of GRADE_CONVERSION_MATRIX) {
    if (!scaleIds.has(anchor.scaleId)) continue;
    if (!bySource.has(anchor.source)) bySource.set(anchor.source, []);
    bySource.get(anchor.source).push(anchor);
  }
  return [...bySource.entries()];
}

const CAVEATS_BY_DISCIPLINE = {
  boulder: `V-scale is <strong class="text-foreground font-semibold">coarser</strong> than Font below 7C -- several V-scale steps
     (V3, V4, V5, V8) each cover two Font grades, so converting a V-scale grade back to Font always resolves
     to the <em>lower</em> of that pair. There's no true "middle" of a 2-wide range.`,
  sport: `Sport conversions are <strong class="text-foreground font-semibold">lossy, and known to be</strong>. French, UIAA, and YDS
     are roughly 1:1 with documented anchor points; Norwegian and Ewbank use different granularity and offsets
     and are interpolated between their own sourced anchors. Every conversion tool has this same limitation --
     a coarse-scale round-trip losing precision is expected, not a bug. French's own low end (below <code>6a</code>)
     and Font's (<code>5</code>/<code>5A</code>/<code>5B</code>/<code>5C</code>) are this app's own chosen
     conventions where real sources disagree, not settled fact.`,
};

// GRADE_CONVERSION_MATRIX's own anchor objects all name this field
// `frenchAnchor` regardless of discipline (shared/grade-data.js) -- every
// Sport anchor really is against French-standard, but Boulder's one
// entry (V-scale) is actually anchored against Font-standard instead
// (French-standard doesn't apply to Boulder at all). The field holds the
// right grade LABEL either way; only the display name of what it's an
// anchor *against* needs to follow the discipline's own reference scale,
// not be hardcoded to "French".
function citationListHtml(discipline) {
  const sources = conversionSourcesFor(discipline);
  if (sources.length === 0) return "";
  const anchorScaleName = REFERENCE_SCALE[discipline].name;
  const items = sources.map(([source, anchors]) => {
    const anchorText = anchors.map(a => `<strong class="text-foreground font-semibold">${escapeHtml(SCALES_BY_DISCIPLINE[discipline].find(s => s.id === a.scaleId)?.name ?? a.scaleId)} ${escapeHtml(a.label)}</strong> = ${escapeHtml(anchorScaleName)} ${escapeHtml(a.frenchAnchor)}`).join(", ");
    return `<li>${anchorText} -- ${escapeHtml(source)}</li>`;
  }).join("");
  return `<ol class="m-0 pl-[1.2rem] text-[.84rem] leading-[1.6] text-foreground [&>li+li]:mt-[10px]">${items}</ol>`;
}

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
  const citations = citationListHtml(discipline);
  const sourcesSection = citations
    ? `<h2 class="section-heading mt-7 mb-3">Sources</h2><p class="text-[.82rem] text-muted leading-[1.7] mb-3">Every cross-scale equivalence below comes from one of these, tracked alongside the conversion data itself.</p>${citations}`
    : "";

  return `
    <p class="text-[.82rem] text-muted leading-[1.7] mb-4">${CAVEATS_BY_DISCIPLINE[discipline] ?? ""}</p>
    ${baseNote}
    <div class="overflow-x-auto rounded-app border border-border" id="grade-scale-matrix-scroll">
      <table class="w-full border-collapse text-[.85rem]">
        <thead><tr>${headerCells}</tr></thead>
        <tbody>${bodyRows}</tbody>
      </table>
    </div>
    ${sourcesSection}
  `;
}
