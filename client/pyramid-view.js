// The Grade Pyramid tab (#12) -- #237, fourth piece of #233's
// modularization epic. Reads through the Store module (#234); builds on
// client/pyramid-stats.js's pure send-counting/promotion logic (#231).
//
// A factory, same reasoning as logbook-view.js/map-view.js. `openModal`/
// `closeModal` are injected (from client/modal-utils.js, #241) -- the
// underlying focus-trap/Escape-to-close mechanism is generic and shared,
// but this module owns the citations/evidence-tier overlays' full open
// *and* close lifecycle itself (#263 moved their close wiring here from
// main.js, joining the open wiring that already lived here -- one owner
// for both, rather than split across two files).
import { escapeHtml } from "./escape-html.js";
import { gradeColor } from "./grade-data.js";
import {
  PYRAMID_IDEAL_BY_POSITION,
  pyramidSplitRows as pyramidSplitRowsPure,
} from "./pyramid-stats.js";

// Duplicated from client/header-chrome.js's own copy (the discipline
// picker's true owner, #240) rather than shared -- same trivial-
// duplication call as client/map-view.js's copy.
const DISCIPLINE_LABEL = { boulder: "Boulder", lead: "Lead" };

const PYRAMID_ICON_GOOD     = `<circle cx="12" cy="12" r="9"></circle><path d="m8.5 12.5 2.5 2.5 5-5"></path>`;
const PYRAMID_ICON_LOW      = `<path d="M12 3 2 20h20L12 3Z"></path><path d="M12 9v5"></path><path d="M12 17h.01"></path>`;
const PYRAMID_ICON_MISSING  = `<circle cx="12" cy="12" r="9"></circle><path d="M12 7v6"></path><path d="M12 16.5h.01"></path>`;
const PYRAMID_ICON_PROMOTED = `<path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z"></path>`;
const PYRAMID_GOLD = "#eab308"; // achievement/celebratory accent (#131) -- literal hex, matching the existing good/missing icons' style rather than a CSS var

export function createPyramidView({ store, openModal, closeModal }) {
  const citationsOverlay = document.getElementById("citations-overlay");
  const evidenceOverlay = document.getElementById("evidence-overlay");

  document.getElementById("citations-close").addEventListener("click", () => closeModal(citationsOverlay));
  citationsOverlay.addEventListener("click", e => { if (e.target === citationsOverlay) closeModal(citationsOverlay); });

  document.getElementById("evidence-close").addEventListener("click", () => closeModal(evidenceOverlay));
  evidenceOverlay.addEventListener("click", e => { if (e.target === evidenceOverlay) closeModal(evidenceOverlay); });

  // Sticks at false until toggled -- Pyramid-local UI state, not Store
  // state (#234's own scoping note: this was deliberately left out of
  // the shared Store since only this section ever reads/writes it,
  // aside from one cross-section reset the discipline picker still
  // calls resetExpansion() for below).
  let lowerGradesExpanded = false;

  // Thin wrapper over client/pyramid-stats.js's pure pyramidSplitRows --
  // closes over the Store's entries so render()'s one call site stays a
  // plain zero-extra-arg call.
  function pyramidSplitRows(type) {
    return pyramidSplitRowsPure(type, store.getEntries());
  }

  // Evidence-tier claims mark the claim's own words bold + tier-colored
  // and clickable (rather than a separate icon badge appended after the
  // text, which read as visually heavy and disturbed the paragraph's line
  // height, #147 v2) -- plain inline text styling wraps normally across
  // lines and can never inflate the line box it sits in. `data-evidence-
  // tier` is wired up generically elsewhere (querySelectorAll), so this
  // works wherever it's dropped into rendered HTML without extra plumbing.
  function evidenceTierText(text) {
    return `<button type="button" class="text-[.82rem] font-bold text-tier-heuristic bg-transparent border-0 p-0 m-0 cursor-pointer hover:brightness-90" data-evidence-tier aria-label="${text} -- evidence tier: coaching heuristic, tap to learn more">${text}</button>`;
  }
  // Reads like a superscript because it uses the actual browser-native
  // superscript mechanism (`align-super`, i.e. `vertical-align: super`)
  // rather than a hand-measured position -- the browser computes the
  // raise amount from real font metrics, so this stays correct across
  // any font/font-size/browser without per-context tuning. The badge's
  // own font-size is a plain fixed rem value (not relative to the
  // surrounding paragraph), so it doesn't depend on inheritance either.
  // window-note's own leading was bumped from 1.6 to 1.7 to give the
  // raised badge comfortable headroom -- at 1.6 the fit was borderline
  // enough that per-line text-rendering rounding occasionally tipped one
  // specific line into visibly growing by ~2px, which the extra leading
  // absorbs (any remaining ±1px line-to-line variance afterwards is
  // ordinary sub-pixel rendering noise, present in any paragraph).
  const CITATION_MARKER = `<button type="button" class="align-super ml-[.3em] inline-flex items-center justify-center px-[.35em] py-[.1em] rounded-[.3em] border border-[color-mix(in_srgb,var(--color-accent)_35%,transparent)] text-accent bg-[color-mix(in_srgb,var(--color-accent)_14%,var(--color-surface))] text-[.65rem] font-bold leading-none cursor-pointer hover:brightness-95" data-citation aria-label="View sources">1</button>`;

  function pyramidStatusIcon(actual, ideal, promoted) {
    if (promoted) return { cls: "promoted", color: PYRAMID_GOLD, svg: PYRAMID_ICON_PROMOTED, label: "Ready to push -- you've logged enough at the tier below to attempt this grade" };
    if (actual === 0) return { cls: "missing", color: "#ef4444", svg: PYRAMID_ICON_MISSING, label: "No sends at this tier" };
    if (actual < ideal) return { cls: "low", color: "var(--color-tier-heuristic)", svg: PYRAMID_ICON_LOW, label: `${actual} of ${ideal} for a full 8-4-2-1 tier` };
    return { cls: "good", color: "#22c55e", svg: PYRAMID_ICON_GOOD, label: `Meets or exceeds the ${ideal}-send tier` };
  }

  // Bars center on a shared vertical midline (rather than left-align) so
  // the row naturally tapers like a pyramid based on relative send counts.
  // The dashed ideal-outline is plain CSS border (not SVG -- an SVG
  // viewBox stretched non-uniformly per row's width would distort its own
  // corner radius along with the width) with a same-background-color
  // drop-shadow halo so it stays legible over any grade color underneath,
  // regardless of whether the bar happens to be wider or narrower than it.
  function pyramidBarRow(row, { ideal = null, scaleMax, lower = false, type, promoted = false } = {}) {
    const actualPct = row.count === 0 ? 0 : (row.count / scaleMax) * 100;
    const barColor = gradeColor(row.grade, type);
    const barStyle = lower
      ? `width:${actualPct}%; background:${barColor}; filter:saturate(.18) brightness(1.12)`
      : `width:${actualPct}%; background:${barColor}`;
    // The promoted (achievement/celebratory, #131) tier's outline goes
    // gold instead of the usual neutral dashed border -- filled with a
    // translucent gold wash and a soft glow, not just an empty dashed
    // box, since its actual bar is always 0-width (no sends there yet)
    // and would otherwise leave the tier looking empty rather than
    // "waiting to be claimed". Both branches are written out as complete
    // literal class strings (not built from the PYRAMID_GOLD JS
    // constant) -- Tailwind's build scans this file's raw source text
    // for whole class names, so an interpolated `border-[${PYRAMID_GOLD}]`
    // would never be found or generated.
    const idealOutline = ideal !== null
      ? promoted
        ? `<div class="absolute top-0 left-1/2 -translate-x-1/2 h-full box-border rounded-[4px] border-[1.25px] border-dashed border-[#eab308] bg-[color-mix(in_srgb,#eab308_22%,transparent)] shadow-[0_0_10px_-1px_#eab308] [filter:drop-shadow(0_0_1px_var(--color-surface))_drop-shadow(0_0_1px_var(--color-surface))] pointer-events-none" style="width:${(ideal / scaleMax) * 100}%"></div>`
        : `<div class="absolute top-0 left-1/2 -translate-x-1/2 h-full box-border rounded-[4px] border-[1.25px] border-dashed border-[color-mix(in_srgb,var(--color-foreground)_65%,transparent)] [filter:drop-shadow(0_0_1px_var(--color-surface))_drop-shadow(0_0_1px_var(--color-surface))] pointer-events-none" style="width:${(ideal / scaleMax) * 100}%"></div>`
      : "";
    const icon = ideal !== null ? pyramidStatusIcon(row.count, ideal, promoted) : null;
    // The status is conveyed by icon shape+color for sighted users, but a
    // `title` tooltip requires hover (unavailable on touch, unreliable for
    // screen readers) -- sr-only text covers both.
    const iconHtml = icon
      ? `<svg class="w-[1.15rem] h-[1.15rem] shrink-0" viewBox="0 0 24 24" fill="none" stroke="${icon.color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icon.svg}</svg>
         <span class="sr-only">${icon.label}</span>`
      : "";
    // The promoted row gets a soft gold spotlight band behind it (extends
    // slightly past the bar itself via negative margin/padding) so the
    // achievement reads at a glance scrolling past, not just up close.
    const rowClasses = lower
      ? "grid grid-cols-[3.2rem_1fr_4.2rem] max-[480px]:grid-cols-[2rem_1fr_3.4rem] items-center gap-[10px] max-[480px]:gap-[8px] mb-[14px] opacity-[.82]"
      : promoted
        ? "grid grid-cols-[3.2rem_1fr_4.2rem] max-[480px]:grid-cols-[2rem_1fr_3.4rem] items-center gap-[10px] max-[480px]:gap-[8px] mb-[14px] -mx-[.5rem] px-[.5rem] py-[.25rem] rounded-[8px] bg-[color-mix(in_srgb,#eab308_10%,transparent)]"
        : "grid grid-cols-[3.2rem_1fr_4.2rem] max-[480px]:grid-cols-[2rem_1fr_3.4rem] items-center gap-[10px] max-[480px]:gap-[8px] mb-[14px]";
    const countClasses = lower
      ? "flex items-center gap-[.35rem] text-[.82rem] font-semibold tabular-nums text-muted"
      : "flex items-center gap-[.35rem] text-[.82rem] font-bold tabular-nums text-foreground";
    // Actual/ideal (e.g. "1/4", "3/2") only where there's an ideal to
    // compare against -- lower-grade rows (outside the 8-4-2-1 window)
    // have no defined target, so they keep showing the bare count.
    const countText = ideal !== null ? `${row.count}/${ideal}` : `${row.count}`;
    return `
      <div class="${rowClasses}">
        <div class="text-[.8rem] font-bold text-right tabular-nums text-muted">${escapeHtml(row.grade)}</div>
        <div class="relative h-[1.3rem]">
          <div class="absolute top-0 left-1/2 -translate-x-1/2 h-full rounded-[4px] transition-[width] duration-300" style="${barStyle}"></div>
          ${idealOutline}
        </div>
        <div class="${countClasses}">${countText}${iconHtml}</div>
      </div>`;
  }

  function render() {
    const type = store.getActiveType();
    const { top4, lower, hasSends, promotedGrade } = pyramidSplitRows(type);
    const pyramidEl = document.getElementById("pyramid");
    const healthEl = document.getElementById("health-card");

    if (!hasSends) {
      pyramidEl.innerHTML = `<p class="text-[.9rem] text-muted">No ${DISCIPLINE_LABEL[type]} sends logged in the last 12 months yet -- log a send to see your pyramid.</p>`;
      healthEl.innerHTML = "";
      document.getElementById("window-note").innerHTML = "";
      return;
    }

    const top4Scale = Math.max(8, ...top4.map(r => r.count));
    const top4Html = top4.map((r, i) => pyramidBarRow(r, { ideal: PYRAMID_IDEAL_BY_POSITION[i], scaleMax: top4Scale, type, promoted: r.grade === promotedGrade })).join("");

    let lowerHtml = "";
    if (lower.length) {
      const lowerScale = Math.max(1, ...lower.map(r => r.count));
      lowerHtml = `
        <div class="text-center my-1 mb-[14px]">
          <button type="button" class="font-sans text-[.8rem] font-semibold text-muted bg-transparent border-b-0 border-l-0 border-r-0 border-t border-border py-[14px] min-h-[2.75rem] w-full cursor-pointer hover:text-accent" id="show-lower-link" aria-expanded="${lowerGradesExpanded}" aria-controls="lower-rows">${lowerGradesExpanded ? "Hide lower grades ▴" : "Show lower grades ▾"}</button>
        </div>
        <div id="lower-rows">${lowerGradesExpanded ? lower.map(r => pyramidBarRow(r, { scaleMax: lowerScale, lower: true, type })).join("") : ""}</div>`;
    }

    pyramidEl.innerHTML = top4Html + lowerHtml;

    if (lower.length) {
      const link = document.getElementById("show-lower-link");
      link.addEventListener("click", () => {
        lowerGradesExpanded = !lowerGradesExpanded;
        render();
        // Re-focus after the innerHTML rebuild above destroys the old node
        // -- otherwise focus silently drops to <body> on every toggle
        // (same bug class as the #95 type-tabs re-render fix).
        document.getElementById("show-lower-link").focus();
      });
    }

    document.getElementById("window-note").innerHTML =
      `Sends from the <strong class="text-foreground font-semibold">last 12 months only</strong>${CITATION_MARKER}, showing your
       <strong class="text-foreground font-semibold">8-4-2-1 window</strong> — four grade tiers anchored to your progress so far, including any with zero sends, projecting one tier higher once you've logged enough to be ready to push for it. Dashed outlines mark the
       ideal count for each tier. The ratio itself is a ${evidenceTierText("widely used coaching heuristic")}${CITATION_MARKER}, not a proven ratio.`;
    document.querySelectorAll("[data-citation]").forEach(btn =>
      btn.addEventListener("click", () => openModal(citationsOverlay))
    );
    document.querySelectorAll("[data-evidence-tier]").forEach(btn =>
      btn.addEventListener("click", () => openModal(evidenceOverlay))
    );

    if (promotedGrade) {
      // Achievement/celebratory styling (#131) -- gold instead of the
      // usual tier-heuristic teal. Written as complete literal classes
      // (not built from the PYRAMID_GOLD JS constant) for the same
      // reason as pyramidBarRow's dashed-outline branch above: Tailwind
      // scans this file's raw source text for whole class names.
      healthEl.className = "flex gap-3 px-4 py-[14px] rounded-app mb-7 [&_svg]:w-[1.2rem] [&_svg]:h-[1.2rem] [&_svg]:stroke-current [&_svg]:fill-none [&_svg]:mt-[2px] [&_svg]:shrink-0 bg-[color-mix(in_srgb,#eab308_10%,var(--color-surface))] border border-[color-mix(in_srgb,#eab308_35%,transparent)] text-[#eab308]";
      // A promoted tier can still have plain-empty aspirational tiers
      // above it (Scenario C: building from the base, several grades
      // still out of reach) -- worth a different message than a clean
      // Scenario B promotion, where the promoted tier is the only gap.
      const stillBuilding = top4.some(r => r.count === 0 && r.grade !== promotedGrade);
      healthEl.innerHTML = stillBuilding
        ? `
          <svg viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${PYRAMID_ICON_PROMOTED}</svg>
          <div>
            <p class="text-[.86rem] leading-[1.5] text-foreground">Still building your pyramid from the base up — but you've already got enough mileage to give ${escapeHtml(promotedGrade)} a go.</p>
            <p class="text-[.8rem] leading-[1.5] text-muted mt-[6px]">Keep adding sends at your lower tiers too — a full 8-4-2-1 pyramid needs volume all the way down, not just at the top.</p>
          </div>`
        : `
          <svg viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${PYRAMID_ICON_PROMOTED}</svg>
          <div>
            <p class="text-[.86rem] leading-[1.5] text-foreground">You've logged enough at every tier below to be ready to push into ${escapeHtml(promotedGrade)}.</p>
            <p class="text-[.8rem] leading-[1.5] text-muted mt-[6px]">Heuristic guidance, not diagnosis — only you know if the moves suit you.</p>
          </div>`;
      return;
    }

    const gapRow = top4.find(r => r.count === 0);
    if (gapRow) {
      healthEl.className = "flex gap-3 px-4 py-[14px] rounded-app mb-7 [&_svg]:w-[1.2rem] [&_svg]:h-[1.2rem] [&_svg]:stroke-current [&_svg]:fill-none [&_svg]:mt-[2px] [&_svg]:shrink-0 bg-[color-mix(in_srgb,var(--color-tier-heuristic)_8%,var(--color-surface))] border border-[color-mix(in_srgb,var(--color-tier-heuristic)_30%,transparent)] text-tier-heuristic";
      healthEl.innerHTML = `
        <svg viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"></path><path d="M12 9v4"></path><path d="M12 17h.01"></path></svg>
        <div>
          <p class="text-[.86rem] leading-[1.5] text-foreground">No sends logged at ${escapeHtml(gapRow.grade)} in the last 12 months, right in the middle of your pyramid window.</p>
          <p class="text-[.8rem] leading-[1.5] text-muted mt-[6px]">Heuristic guidance, not diagnosis — might be worth spending more mileage there before pushing your top grade again.</p>
        </div>`;
    } else {
      healthEl.className = "flex gap-3 px-4 py-[14px] rounded-app mb-7 [&_svg]:w-[1.2rem] [&_svg]:h-[1.2rem] [&_svg]:stroke-current [&_svg]:fill-none [&_svg]:mt-[2px] [&_svg]:shrink-0 bg-[color-mix(in_srgb,var(--color-tier-heuristic)_8%,var(--color-surface))] border border-[color-mix(in_srgb,var(--color-tier-heuristic)_30%,transparent)] text-tier-heuristic";
      healthEl.innerHTML = `
        <svg viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"></path></svg>
        <div><p class="text-[.86rem] leading-[1.5] text-foreground">No gaps in this window — every tier from your base to your max has sends behind it.</p></div>`;
    }
  }

  return {
    render,
    // Called externally by the discipline picker (client/header-chrome.js,
    // #240) when switching disciplines -- lowerGradesExpanded is
    // module-private now, so it can't reach in and reset the field
    // directly the way the pre-#237 code did.
    resetExpansion: () => { lowerGradesExpanded = false; },
  };
}
