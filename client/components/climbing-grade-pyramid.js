import { escapeHtml } from "../escape-html.js";
import { insightsHtml } from "../insight-card.js";
import { loadingSpinnerHtml } from "../loading-spinner.js";
import { DEFAULT_SCALE_BY_TYPE, SCALES, gradePyramidColorForScale } from "../../shared/grade-data.js";
import { haikuHtml } from "../haiku.js";
import { PYRAMID_IDEAL_BY_POSITION, pyramidHealth } from "../../shared/pyramid-stats.js";

const PYRAMID_ICON_GOOD = `<circle cx="12" cy="12" r="9"></circle><path d="m8.5 12.5 2.5 2.5 5-5"></path>`;
const PYRAMID_ICON_LOW = `<path d="M12 3 2 20h20L12 3Z"></path><path d="M12 9v5"></path><path d="M12 17h.01"></path>`;
const PYRAMID_ICON_MISSING = `<circle cx="12" cy="12" r="9"></circle><path d="M12 7v6"></path><path d="M12 16.5h.01"></path>`;
const PYRAMID_ICON_PROMOTED = `<path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z"></path>`;
const PYRAMID_GOLD = "var(--pyramid-status-promoted)";

// 8-4-2-1 stays a coaching heuristic; Draper et al. doesn't validate the ratio.
const SHELL = `
  <div class="pyramid-card bg-surface border border-border rounded-app pt-[22px] px-5 max-[480px]:px-2 pb-4" id="pyramid" role="group" aria-label="Grade pyramid"></div>
  <div id="pyramid-insights"></div>

  <h2 class="sources-heading">Sources</h2>
  <p class="text-sm text-muted leading-[1.7] mb-3">The 8-4-2-1 ratio is a coaching heuristic corroborated across independent sources, not a peer-reviewed or data-validated ratio.</p>
  <ol class="m-0 pl-[1.2rem] text-sm leading-[1.6] text-foreground [&>li+li]:mt-[10px]">
    <li>Hörst, E. J. <em class="text-muted italic">How to Climb 5.12</em> — originating source for the route-pyramid training concept (print only, no stable link available).</li>
    <li>Hampton, K. "Great Pyramids." Power Company Climbing (2010). <a class="text-accent-ink underline underline-offset-2" href="https://www.powercompanyclimbing.com/blog/2010/08/great-pyramids.html" target="_blank" rel="noopener">powercompanyclimbing.com ↗</a></li>
    <li>Draper, N., Giles, D., Schöffl, V., Fuss, F. K., Watts, P., Wolf, P., et al. (2016). "Comparative grading scales, statistical analyses, climber descriptors and ability grouping: IRCRA position statement." <em class="text-muted italic">Sports Technology</em>, 8, 88–94. IRCRA-endorsed adjacent reference for grade-tier bucketing -- doesn't validate the 8-4-2-1 ratio itself.</li>
  </ol>
`;

function pyramidStatusIcon(actual, ideal, promoted) {
  if (promoted)
    return {
      cls: "promoted",
      color: PYRAMID_GOLD,
      svg: PYRAMID_ICON_PROMOTED,
      label: "Ready to push -- you've logged enough at the tier below to attempt this grade",
    };
  if (actual === 0)
    return {
      cls: "missing",
      color: "var(--pyramid-status-missing)",
      svg: PYRAMID_ICON_MISSING,
      label: "No sends at this tier",
    };
  if (actual < ideal)
    return {
      cls: "low",
      color: "var(--color-tier-heuristic)",
      svg: PYRAMID_ICON_LOW,
      label: `${actual} of ${ideal} for a full 8-4-2-1 tier`,
    };
  return {
    cls: "good",
    color: "var(--pyramid-status-good)",
    svg: PYRAMID_ICON_GOOD,
    label: `Meets or exceeds the ${ideal}-send tier`,
  };
}

function pyramidBarRow(row, { ideal, scaleMax, type, promoted = false, viewScaleId }) {
  const actualPct = row.count === 0 ? 0 : (row.count / scaleMax) * 100;
  // Per-grade shade: the window is too narrow for tier colours to tell bars apart.
  const barColor = gradePyramidColorForScale(row.grade, viewScaleId, type);
  const barStyle = `width:${actualPct}%; background:${barColor}`;
  const idealOutline = promoted
    ? `<div class="absolute top-0 left-1/2 -translate-x-1/2 h-full box-border rounded-[4px] border-[1.25px] border-dashed border-pyramid-promoted bg-[color-mix(in_srgb,var(--pyramid-status-promoted)_22%,transparent)] shadow-[0_0_10px_-1px_var(--pyramid-status-promoted)] [filter:drop-shadow(0_0_1px_var(--color-surface))_drop-shadow(0_0_1px_var(--color-surface))] pointer-events-none" style="width:${(ideal / scaleMax) * 100}%"></div>`
    : `<div class="absolute top-0 left-1/2 -translate-x-1/2 h-full box-border rounded-[4px] border-[1.25px] border-dashed border-[color-mix(in_srgb,var(--color-foreground)_65%,transparent)] [filter:drop-shadow(0_0_1px_var(--color-surface))_drop-shadow(0_0_1px_var(--color-surface))] pointer-events-none" style="width:${(ideal / scaleMax) * 100}%"></div>`;
  const icon = pyramidStatusIcon(row.count, ideal, promoted);
  const iconHtml = `<svg class="w-[1.15rem] h-[1.15rem] shrink-0" viewBox="0 0 24 24" fill="none" stroke="${icon.color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icon.svg}</svg>
       <span class="sr-only">${icon.label}</span>`;
  const rowClasses = promoted
    ? "grid grid-cols-[3.2rem_1fr_4.2rem] max-[480px]:grid-cols-[2rem_1fr_3.4rem] items-center gap-[10px] max-[480px]:gap-[8px] mb-[14px] -mx-[.5rem] px-[.5rem] py-[.25rem] rounded-[8px] bg-[color-mix(in_srgb,var(--pyramid-status-promoted)_10%,transparent)]"
    : "grid grid-cols-[3.2rem_1fr_4.2rem] max-[480px]:grid-cols-[2rem_1fr_3.4rem] items-center gap-[10px] max-[480px]:gap-[8px] mb-[14px]";
  const countClasses = "flex items-center gap-[.35rem] text-sm font-bold tabular-nums text-foreground";
  const countText = `${row.count}/${ideal}`;
  return `
    <div class="${rowClasses}">
      <div class="text-sm font-bold text-right tabular-nums text-muted">${escapeHtml(row.grade)}</div>
      <div class="relative h-[1.3rem]">
        <div class="absolute top-0 left-1/2 -translate-x-1/2 h-full rounded-[4px] transition-[width] duration-300" style="${barStyle}"></div>
        ${idealOutline}
      </div>
      <div class="${countClasses}">${countText}${iconHtml}</div>
    </div>`;
}

// The tier with the smallest share of its 8-4-2-1 target, or null when every tier has met it.
function furthestFromTarget(top4) {
  const short = top4
    .map((row, i) => ({ ...row, ideal: PYRAMID_IDEAL_BY_POSITION[i] }))
    .filter(row => row.count < row.ideal);
  return short.length ? short.reduce((low, row) => (row.count / row.ideal < low.count / low.ideal ? row : low)) : null;
}

function pyramidInsight(health, top4) {
  if (health.kind === "promoted") {
    return health.stillBuilding
      ? {
          tone: "positive",
          title: "Building your pyramid",
          text: `You've already got enough sends at the top to consider trying some ${health.grade}s, but keep building out the lower tiers too. A full 8-4-2-1 pyramid needs volume all the way down, not just at the top.`,
        }
      : {
          tone: "positive",
          title: "You've built a full pyramid!",
          text: `Consider pushing up to ${health.grade} if you feel ready.`,
        };
  }
  const index = top4.findIndex(row => row.grade === health.grade);
  if (health.kind === "gap") {
    return {
      tone: "negative",
      title: "Your pyramid has a gap",
      text: `You haven't logged any sends at ${health.grade} in the past 12 months, which means the tiers above don't have a strong base to build on. ${PYRAMID_IDEAL_BY_POSITION[index]} sends at ${health.grade} would complete the tier.`,
    };
  }
  if (health.kind === "top-heavy") {
    const row = top4[index];
    const above = top4[index - 1];
    return {
      tone: "negative",
      title: "Your pyramid is top-heavy",
      text: `In the past 12 months you've logged fewer sends at ${row.grade} (${row.count}) than at ${above.grade}, the harder tier above it (${above.count}). That leaves the tiers above without a strong base to build on. Bringing ${row.grade} up to ${above.count} sends would balance it.`,
    };
  }
  const furthest = furthestFromTarget(top4);
  return {
    tone: "positive",
    title: "Building your pyramid",
    text: `No gaps or inversions (higher tiers with more sends than lower tiers), so your sends build up from your base to your top grade, as an effective pyramid should.${
      furthest
        ? ` ${furthest.grade} is furthest from its target (${furthest.count} of ${furthest.ideal} sends), so extra sends there will do the most to fill it out.`
        : ""
    }`,
  };
}

// The scale's lowest grade, for the empty haiku's last line: "From Font 3 upwards" (#1389).
function lowestGradePhrase(scaleId) {
  const scale = SCALES[scaleId];
  if (!scale?.labels?.length) return "the lowest grade";
  const prefix = { "v-scale": "", yds: "", ewbank: "Ewbank" }[scaleId] ?? scale.name.split(" ")[0];
  return `${prefix} ${scale.labels[0]}`.trim();
}

const EMPTY_PYRAMID = { top4: [], hasSends: false, promotedGrade: null };

export class ClimbingGradePyramid extends HTMLElement {
  // Null until the page hands over a report: unknown, not empty (#1387).
  #pyramidData = null;
  #wired = false;
  #viewScaleId = null;

  static get observedAttributes() {
    return ["active-discipline"];
  }

  get pyramidData() {
    return this.#pyramidData;
  }
  set pyramidData(v) {
    this.#pyramidData = v ?? null;
    this.#render();
  }

  get activeDiscipline() {
    return this.getAttribute("active-discipline") || "boulder";
  }
  set activeDiscipline(v) {
    this.setAttribute("active-discipline", v);
  }

  get viewScaleId() {
    return this.#viewScaleId;
  }
  set viewScaleId(v) {
    this.#viewScaleId = v;
    this.#render();
  }

  connectedCallback() {
    if (!this.#wired) {
      this.innerHTML = SHELL;
      this.#wired = true;
    }
    this.#render();
  }

  attributeChangedCallback() {
    if (this.#wired) this.#render();
  }

  #render() {
    const type = this.activeDiscipline;
    const viewScaleId = this.#viewScaleId;
    const pyramidEl = this.querySelector("#pyramid");
    const insightsEl = this.querySelector("#pyramid-insights");
    if (this.#pyramidData === null) {
      pyramidEl.innerHTML = loadingSpinnerHtml("Loading your Grade Pyramid");
      insightsEl.innerHTML = "";
      return;
    }
    const { top4, hasSends, promotedGrade } = this.#pyramidData[type] ?? EMPTY_PYRAMID;

    if (!hasSends) {
      const scaleId = viewScaleId ?? DEFAULT_SCALE_BY_TYPE[type];
      pyramidEl.innerHTML = haikuHtml(
        `You have logged no sends\nWithin this report's window\nFrom ${lowestGradePhrase(scaleId)} upwards`,
      );
      insightsEl.innerHTML = "";
      return;
    }

    const top4Scale = Math.max(8, ...top4.map(r => r.count));
    pyramidEl.innerHTML = top4
      .map((r, i) =>
        pyramidBarRow(r, {
          ideal: PYRAMID_IDEAL_BY_POSITION[i],
          scaleMax: top4Scale,
          type,
          viewScaleId,
          promoted: r.grade === promotedGrade,
        }),
      )
      .join("");

    insightsEl.innerHTML = insightsHtml([pyramidInsight(pyramidHealth(top4, promotedGrade), top4)]);
  }
}

customElements.define("climbing-grade-pyramid", ClimbingGradePyramid);
