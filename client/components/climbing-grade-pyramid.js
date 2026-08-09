// <climbing-grade-pyramid> (#374): wraps client/pyramid-view.js's existing
// rendering (send-counting, 8-4-2-1 promotion tiers, citations/evidence-
// tier overlays) as a shared Web Component. Owner-only, full stop -- never
// used on the public `/:username` page (#351 excludes it entirely) or any
// bundle reachable by a logged-out or different-user session. Its two real
// consumers (#348's `/:username/performance`, and eventually the
// Shareable Infographic epic, #7/#19) are both owner-authenticated
// contexts, which is exactly the "second real consumer" case that earns a
// shared component its keep (see #344's decision recorded on this issue).
//
// client/pyramid-stats.js's send-counting/promotion logic is already pure
// and reused completely unchanged, same as #350 reusing client/entries.js.
//
// Citations/evidence-tier overlay open/close is self-contained here (own
// focus-trap/Escape/backdrop-click, not client/modal-utils.js's
// createModalHelpers()) -- that factory coordinates Escape-priority across
// a *fixed* list of every overlay id on `/logbook`'s single page
// (add-place-overlay, entry-overlay, etc.); this component's real
// consumers never have those other overlays alongside it, so there's
// nothing to coordinate with. Same self-contained-modal precedent as
// #345's <climbing-header> footnote overlay.
//
// entries (property) and active-discipline (attribute) come in from
// whichever page's composition root owns that state -- this component
// doesn't know about client/store.js.
// escape-html.js is deliberately imported as "./escape-html.js", not the
// "../escape-html.js" this file's own real nesting (client/components/)
// would suggest -- it's always built --external (see e.g. client/main.js's
// own comment on why: shared/individually-cacheable across every bundle),
// which means esbuild never resolves it on disk at all, just copies the
// import specifier verbatim into the output bundle. Every composition-root
// bundle this component ends up in (client/performance-main.js today) is
// output flatly into public/logbook/*.js, right alongside the one real
// escape-html.js copy -- so the specifier has to be written relative to
// that eventual flat output location, not this file's own source location,
// or it resolves to a 404 in the browser (caught building #348's
// /performance page: esbuild failed outright on "../escape-html.js" since
// no such file exists at client/escape-html.js either).
import { escapeHtml } from "./escape-html.js";
import { gradeColor } from "../grade-data.js";
import { PYRAMID_IDEAL_BY_POSITION, pyramidSplitRows } from "../pyramid-stats.js";
// focusableEls is a stateless utility with no dependency on
// createModalHelpers()'s overlay-coordination logic (which this
// component deliberately doesn't use, see this file's own header
// comment) -- imported directly rather than hand-copied a second time
// (found via code review, 2026-08-09).
import { focusableEls } from "../modal-utils.js";

const DISCIPLINE_LABEL = { boulder: "Boulder", lead: "Lead" };

const PYRAMID_ICON_GOOD     = `<circle cx="12" cy="12" r="9"></circle><path d="m8.5 12.5 2.5 2.5 5-5"></path>`;
const PYRAMID_ICON_LOW      = `<path d="M12 3 2 20h20L12 3Z"></path><path d="M12 9v5"></path><path d="M12 17h.01"></path>`;
const PYRAMID_ICON_MISSING  = `<circle cx="12" cy="12" r="9"></circle><path d="M12 7v6"></path><path d="M12 16.5h.01"></path>`;
const PYRAMID_ICON_PROMOTED = `<path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z"></path>`;
const PYRAMID_GOLD = "#eab308";

const SHELL = `
  <p class="text-[.82rem] text-muted leading-[1.7] mb-4" id="window-note"></p>
  <div class="pyramid-card bg-surface border border-border rounded-app pt-[22px] px-5 max-[480px]:px-2 pb-4 mb-5" id="pyramid" role="group" aria-label="Grade pyramid"></div>
  <div class="flex gap-3 px-4 py-[14px] rounded-app mb-7 [&_svg]:w-[1.2rem] [&_svg]:h-[1.2rem] [&_svg]:stroke-current [&_svg]:fill-none [&_svg]:mt-[2px] [&_svg]:shrink-0" id="health-card" role="status"></div>

  <div class="fixed inset-0 z-[100] bg-[color-mix(in_srgb,black_60%,transparent)] flex items-center justify-center px-4 py-6 overflow-y-auto" id="citations-overlay" hidden role="dialog" aria-modal="true" aria-labelledby="citations-title" tabindex="-1">
    <div class="bg-background border border-border rounded-app p-5 w-full max-w-[380px]">
      <div class="flex items-center justify-between mb-[14px]">
        <span class="text-[1.05rem] font-bold text-accent" id="citations-title">Sources</span>
        <button type="button" class="inline-flex items-center justify-center w-8 h-8 border-none bg-transparent text-muted text-[1.1rem] leading-none cursor-pointer hover:text-foreground" id="citations-close" aria-label="Close sources dialog">✕</button>
      </div>
      <ol class="m-0 pl-[1.2rem] text-[.84rem] leading-[1.6] text-foreground [&>li+li]:mt-[10px]">
        <li>Hörst, E. J. <em class="text-muted italic">How to Climb 5.12</em> — originating source for the route-pyramid training concept (print only, no stable link available).</li>
        <li>Hampton, K. "Great Pyramids." Power Company Climbing (2010). <a class="text-accent" href="https://www.powercompanyclimbing.com/blog/2010/08/great-pyramids.html" target="_blank" rel="noopener">powercompanyclimbing.com ↗</a></li>
      </ol>
    </div>
  </div>

  <div class="fixed inset-0 z-[100] bg-[color-mix(in_srgb,black_60%,transparent)] flex items-center justify-center px-4 py-6 overflow-y-auto" id="evidence-overlay" hidden role="dialog" aria-modal="true" aria-labelledby="evidence-title" tabindex="-1">
    <div class="bg-background border border-border rounded-app p-5 w-full max-w-[380px]">
      <div class="flex items-center justify-between mb-[14px]">
        <span class="text-[1.05rem] font-bold text-accent" id="evidence-title">Evidence tiers</span>
        <button type="button" class="inline-flex items-center justify-center w-8 h-8 border-none bg-transparent text-muted text-[1.1rem] leading-none cursor-pointer hover:text-foreground" id="evidence-close" aria-label="Close evidence tiers dialog">✕</button>
      </div>
      <p class="text-[.82rem] text-muted leading-[1.5] mb-4">Claims in the app are tagged by how well-supported they are, so nothing reads as more authoritative than it actually is.</p>
      <ul class="m-0 p-0 list-none [&>li+li]:mt-4">
        <li>
          <span class="tier-chip inline-flex items-center gap-[.35rem] py-[.3rem] pr-[.7rem] pl-[.55rem] rounded-full text-[.74rem] font-semibold border border-[color-mix(in_srgb,var(--color-tier-peer)_35%,transparent)] text-tier-peer bg-[color-mix(in_srgb,var(--color-tier-peer)_14%,var(--color-surface))] [&_svg]:w-[.95rem] [&_svg]:h-[.95rem] [&_svg]:shrink-0 mb-2">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3Z"></path><path d="M9.5 12l1.8 1.8L15 10"></path></svg>
            Peer-reviewed
          </span>
          <p class="text-[.82rem] leading-[1.5] text-foreground m-0">Backed by published, peer-reviewed research.</p>
        </li>
        <li>
          <span class="tier-chip inline-flex items-center gap-[.35rem] py-[.3rem] pr-[.7rem] pl-[.55rem] rounded-full text-[.74rem] font-semibold border border-[color-mix(in_srgb,var(--color-tier-heuristic)_35%,transparent)] text-tier-heuristic bg-[color-mix(in_srgb,var(--color-tier-heuristic)_14%,var(--color-surface))] [&_svg]:w-[.95rem] [&_svg]:h-[.95rem] [&_svg]:shrink-0 mb-2">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5v-15Z"></path><path d="M4 20.5A2.5 2.5 0 0 1 6.5 18H20"></path></svg>
            Coaching heuristic
          </span>
          <p class="text-[.82rem] leading-[1.5] text-foreground m-0">A widely used rule of thumb from coaching practice, not (yet) validated by peer-reviewed research.</p>
        </li>
      </ul>
    </div>
  </div>
`;

function evidenceTierText(text) {
  return `<button type="button" class="text-[.82rem] font-bold text-tier-heuristic bg-transparent border-0 p-0 m-0 cursor-pointer hover:brightness-90" data-evidence-tier aria-label="${text} -- evidence tier: coaching heuristic, tap to learn more">${text}</button>`;
}
const CITATION_MARKER = `<button type="button" class="align-super ml-[.3em] inline-flex items-center justify-center px-[.35em] py-[.1em] rounded-[.3em] border border-[color-mix(in_srgb,var(--color-accent)_35%,transparent)] text-accent bg-[color-mix(in_srgb,var(--color-accent)_14%,var(--color-surface))] text-[.65rem] font-bold leading-none cursor-pointer hover:brightness-95" data-citation aria-label="View sources">1</button>`;

function pyramidStatusIcon(actual, ideal, promoted) {
  if (promoted) return { cls: "promoted", color: PYRAMID_GOLD, svg: PYRAMID_ICON_PROMOTED, label: "Ready to push -- you've logged enough at the tier below to attempt this grade" };
  if (actual === 0) return { cls: "missing", color: "#ef4444", svg: PYRAMID_ICON_MISSING, label: "No sends at this tier" };
  if (actual < ideal) return { cls: "low", color: "var(--color-tier-heuristic)", svg: PYRAMID_ICON_LOW, label: `${actual} of ${ideal} for a full 8-4-2-1 tier` };
  return { cls: "good", color: "#22c55e", svg: PYRAMID_ICON_GOOD, label: `Meets or exceeds the ${ideal}-send tier` };
}

function pyramidBarRow(row, { ideal = null, scaleMax, lower = false, type, promoted = false } = {}) {
  const actualPct = row.count === 0 ? 0 : (row.count / scaleMax) * 100;
  const barColor = gradeColor(row.grade, type);
  const barStyle = lower
    ? `width:${actualPct}%; background:${barColor}; filter:saturate(.18) brightness(1.12)`
    : `width:${actualPct}%; background:${barColor}`;
  const idealOutline = ideal !== null
    ? promoted
      ? `<div class="absolute top-0 left-1/2 -translate-x-1/2 h-full box-border rounded-[4px] border-[1.25px] border-dashed border-[#eab308] bg-[color-mix(in_srgb,#eab308_22%,transparent)] shadow-[0_0_10px_-1px_#eab308] [filter:drop-shadow(0_0_1px_var(--color-surface))_drop-shadow(0_0_1px_var(--color-surface))] pointer-events-none" style="width:${(ideal / scaleMax) * 100}%"></div>`
      : `<div class="absolute top-0 left-1/2 -translate-x-1/2 h-full box-border rounded-[4px] border-[1.25px] border-dashed border-[color-mix(in_srgb,var(--color-foreground)_65%,transparent)] [filter:drop-shadow(0_0_1px_var(--color-surface))_drop-shadow(0_0_1px_var(--color-surface))] pointer-events-none" style="width:${(ideal / scaleMax) * 100}%"></div>`
    : "";
  const icon = ideal !== null ? pyramidStatusIcon(row.count, ideal, promoted) : null;
  const iconHtml = icon
    ? `<svg class="w-[1.15rem] h-[1.15rem] shrink-0" viewBox="0 0 24 24" fill="none" stroke="${icon.color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icon.svg}</svg>
       <span class="sr-only">${icon.label}</span>`
    : "";
  const rowClasses = lower
    ? "grid grid-cols-[3.2rem_1fr_4.2rem] max-[480px]:grid-cols-[2rem_1fr_3.4rem] items-center gap-[10px] max-[480px]:gap-[8px] mb-[14px] opacity-[.82]"
    : promoted
      ? "grid grid-cols-[3.2rem_1fr_4.2rem] max-[480px]:grid-cols-[2rem_1fr_3.4rem] items-center gap-[10px] max-[480px]:gap-[8px] mb-[14px] -mx-[.5rem] px-[.5rem] py-[.25rem] rounded-[8px] bg-[color-mix(in_srgb,#eab308_10%,transparent)]"
      : "grid grid-cols-[3.2rem_1fr_4.2rem] max-[480px]:grid-cols-[2rem_1fr_3.4rem] items-center gap-[10px] max-[480px]:gap-[8px] mb-[14px]";
  const countClasses = lower
    ? "flex items-center gap-[.35rem] text-[.82rem] font-semibold tabular-nums text-muted"
    : "flex items-center gap-[.35rem] text-[.82rem] font-bold tabular-nums text-foreground";
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

export class ClimbingGradePyramid extends HTMLElement {
  #entries = [];
  #lowerGradesExpanded = false;
  #wired = false;
  #lastFocusedEl = null;

  static get observedAttributes() {
    return ["active-discipline"];
  }

  get entries() { return this.#entries; }
  set entries(v) { this.#entries = v ?? []; this.#render(); }

  get activeDiscipline() { return this.getAttribute("active-discipline") || "boulder"; }
  set activeDiscipline(v) { this.setAttribute("active-discipline", v); }

  connectedCallback() {
    if (!this.#wired) {
      this.innerHTML = SHELL;
      this.#wireOverlays();
      this.#wired = true;
    }
    this.#render();
  }

  attributeChangedCallback() {
    if (this.#wired) this.#render();
  }

  // Called externally by whichever discipline-picker wiring the
  // consuming page uses (client/header-chrome.js today) when switching
  // disciplines -- lowerGradesExpanded is private state here, same
  // reasoning pyramid-view.js's own resetExpansion() already had.
  resetExpansion() {
    this.#lowerGradesExpanded = false;
  }

  #openOverlay(overlay) {
    this.#lastFocusedEl = document.activeElement;
    overlay.hidden = false;
    overlay.scrollTop = 0;
    (focusableEls(overlay)[0] ?? overlay).focus();
  }

  #closeOverlay(overlay) {
    overlay.hidden = true;
    if (this.#lastFocusedEl) this.#lastFocusedEl.focus();
  }

  #wireOverlays() {
    const citationsOverlay = this.querySelector("#citations-overlay");
    const evidenceOverlay = this.querySelector("#evidence-overlay");

    this.querySelector("#citations-close").addEventListener("click", () => this.#closeOverlay(citationsOverlay));
    citationsOverlay.addEventListener("click", e => { if (e.target === citationsOverlay) this.#closeOverlay(citationsOverlay); });
    this.querySelector("#evidence-close").addEventListener("click", () => this.#closeOverlay(evidenceOverlay));
    evidenceOverlay.addEventListener("click", e => { if (e.target === evidenceOverlay) this.#closeOverlay(evidenceOverlay); });

    document.addEventListener("keydown", e => {
      const openOverlay = [citationsOverlay, evidenceOverlay].find(o => !o.hidden);
      if (!openOverlay) return;
      if (e.key === "Escape") { this.#closeOverlay(openOverlay); return; }
      if (e.key === "Tab") {
        const focusable = focusableEls(openOverlay);
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    });
  }

  #pyramidSplitRows(type) {
    return pyramidSplitRows(type, this.#entries);
  }

  #render() {
    const type = this.activeDiscipline;
    const { top4, lower, hasSends, promotedGrade } = this.#pyramidSplitRows(type);
    const pyramidEl = this.querySelector("#pyramid");
    const healthEl = this.querySelector("#health-card");
    const windowNoteEl = this.querySelector("#window-note");

    if (!hasSends) {
      pyramidEl.innerHTML = `<p class="text-[.9rem] text-muted">No ${DISCIPLINE_LABEL[type]} sends logged in the last 12 months yet -- log a send to see your pyramid.</p>`;
      healthEl.innerHTML = "";
      windowNoteEl.innerHTML = "";
      return;
    }

    const top4Scale = Math.max(8, ...top4.map(r => r.count));
    const top4Html = top4.map((r, i) => pyramidBarRow(r, { ideal: PYRAMID_IDEAL_BY_POSITION[i], scaleMax: top4Scale, type, promoted: r.grade === promotedGrade })).join("");

    let lowerHtml = "";
    if (lower.length) {
      const lowerScale = Math.max(1, ...lower.map(r => r.count));
      lowerHtml = `
        <div class="text-center my-1 mb-[14px]">
          <button type="button" class="font-sans text-[.8rem] font-semibold text-muted bg-transparent border-b-0 border-l-0 border-r-0 border-t border-border py-[14px] min-h-[2.75rem] w-full cursor-pointer hover:text-accent" id="show-lower-link" aria-expanded="${this.#lowerGradesExpanded}" aria-controls="lower-rows">${this.#lowerGradesExpanded ? "Hide lower grades ▴" : "Show lower grades ▾"}</button>
        </div>
        <div id="lower-rows">${this.#lowerGradesExpanded ? lower.map(r => pyramidBarRow(r, { scaleMax: lowerScale, lower: true, type })).join("") : ""}</div>`;
    }

    pyramidEl.innerHTML = top4Html + lowerHtml;

    if (lower.length) {
      const link = this.querySelector("#show-lower-link");
      link.addEventListener("click", () => {
        this.#lowerGradesExpanded = !this.#lowerGradesExpanded;
        this.#render();
        this.querySelector("#show-lower-link").focus();
      });
    }

    windowNoteEl.innerHTML =
      `Sends from the <strong class="text-foreground font-semibold">last 12 months only</strong>${CITATION_MARKER}, showing your
       <strong class="text-foreground font-semibold">8-4-2-1 window</strong> — four grade tiers anchored to your progress so far, including any with zero sends, projecting one tier higher once you've logged enough to be ready to push for it. Dashed outlines mark the
       ideal count for each tier. The ratio itself is a ${evidenceTierText("widely used coaching heuristic")}${CITATION_MARKER}, not a proven ratio.`;
    this.querySelectorAll("[data-citation]").forEach(btn =>
      btn.addEventListener("click", () => this.#openOverlay(this.querySelector("#citations-overlay")))
    );
    this.querySelectorAll("[data-evidence-tier]").forEach(btn =>
      btn.addEventListener("click", () => this.#openOverlay(this.querySelector("#evidence-overlay")))
    );

    if (promotedGrade) {
      healthEl.className = "flex gap-3 px-4 py-[14px] rounded-app mb-7 [&_svg]:w-[1.2rem] [&_svg]:h-[1.2rem] [&_svg]:stroke-current [&_svg]:fill-none [&_svg]:mt-[2px] [&_svg]:shrink-0 bg-[color-mix(in_srgb,#eab308_10%,var(--color-surface))] border border-[color-mix(in_srgb,#eab308_35%,transparent)] text-[#eab308]";
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
}

customElements.define("climbing-grade-pyramid", ClimbingGradePyramid);
