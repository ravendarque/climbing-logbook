// Shared evidence-tier chip + overlay component (#14, epic #5 Phase 2) --
// extracted on its second real consumer. client/components/climbing-
// grade-pyramid.js's own hand-rolled tier-chip/evidence-overlay markup
// (peer + heuristic tiers, #516) is the first consumer -- this codebase's
// own established rule (see that file's header comment) is that a shared
// component earns its keep on a second real consumer, not speculatively
// ahead of one. #38 (RPE/effort trend) is the confirmed third consumer
// (its own "Peer-reviewed" chip, per the design doc). Deliberately NOT
// retrofitting climbing-grade-pyramid.js to use this module as part of
// this task -- that component works today; retrofitting it is unrelated
// scope, a candidate follow-up, not built here.
//
// Same client/-not-shared/ placement as client/combo-chart.js/client/
// row-card.js -- pure presentational HTML generation, never needed
// server-side. Pure string generation, no DOM dependency, same "tests
// run on the plain workers Vitest project" property client/combo-
// chart.js's own tests already have.
import { escapeHtml } from "./escape-html.js";

const PEER_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3Z"></path><path d="M9.5 12l1.8 1.8L15 10"></path></svg>`;
const HEURISTIC_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5v-15Z"></path><path d="M4 20.5A2.5 2.5 0 0 1 6.5 18H20"></path></svg>`;
const COMMUNITY_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>`;

// Same three-part shape (label/svg/description) climbing-grade-
// pyramid.js's own overlay markup already encodes inline -- peer/
// heuristic text copied verbatim from there for consistency (same claim,
// same wording, wherever it appears). "community" is new: the 8a.nu/
// Climbstat reference data this epic's #14 needs is a single data-
// analysis layer, not peer-reviewed research or an established coaching
// rule of thumb -- a third, weaker tier, not a synonym for either.
const TIER_DEFINITIONS = {
  peer: {
    className: "tier-peer",
    label: "Peer-reviewed",
    icon: PEER_ICON,
    description: "Backed by published, peer-reviewed research.",
  },
  heuristic: {
    className: "tier-heuristic",
    label: "Coaching heuristic",
    icon: HEURISTIC_ICON,
    description: "A widely used rule of thumb from coaching practice, not (yet) validated by peer-reviewed research.",
  },
  community: {
    className: "tier-community",
    label: "Community data",
    icon: COMMUNITY_ICON,
    description: "Derived from self-reported community logging data (e.g. 8a.nu), not a controlled or peer-reviewed study.",
  },
};

function tierListItemHtml(tierKey) {
  const tier = TIER_DEFINITIONS[tierKey];
  if (!tier) throw new Error(`Unknown evidence tier: ${tierKey}`);
  return `<li>
    <span class="tier-chip inline-flex items-center gap-[.35rem] py-[.3rem] pr-[.7rem] pl-[.55rem] rounded-full text-[.74rem] font-semibold border border-[color-mix(in_srgb,var(--color-${tier.className})_35%,transparent)] text-${tier.className} bg-[color-mix(in_srgb,var(--color-${tier.className})_14%,var(--color-surface))] [&_svg]:w-[.95rem] [&_svg]:h-[.95rem] [&_svg]:shrink-0 mb-2">
      ${tier.icon}
      ${escapeHtml(tier.label)}
    </span>
    <p class="text-[.82rem] leading-[1.5] text-foreground m-0">${escapeHtml(tier.description)}</p>
  </li>`;
}

export function evidenceOverlayHtml(tierKeys) {
  const itemsHtml = tierKeys.map(tierListItemHtml).join("");
  return `<div class="fixed inset-0 z-[100] bg-[color-mix(in_srgb,black_60%,transparent)] flex items-center justify-center px-4 py-6 overflow-y-auto" id="evidence-overlay" hidden role="dialog" aria-modal="true" aria-labelledby="evidence-title" tabindex="-1">
    <div class="bg-background border border-border rounded-app p-5 w-full max-w-[380px]">
      <div class="flex items-center justify-between mb-[14px]">
        <span class="text-[1.05rem] font-bold text-accent" id="evidence-title">Evidence tiers</span>
        <button type="button" class="inline-flex items-center justify-center w-8 h-8 border-none bg-transparent text-muted text-[1.1rem] leading-none cursor-pointer hover:text-foreground" id="evidence-close" aria-label="Close evidence tiers dialog">✕</button>
      </div>
      <p class="text-[.82rem] text-muted leading-[1.5] mb-4">Claims in the app are tagged by how well-supported they are, so nothing reads as more authoritative than it actually is.</p>
      <ul class="m-0 p-0 list-none [&>li+li]:mt-4">${itemsHtml}</ul>
    </div>
  </div>`;
}

const TIER_TEXT_COLOR = { peer: "text-tier-peer", heuristic: "text-tier-heuristic", community: "text-tier-community" };

export function evidenceTierButtonHtml(text, tierKey) {
  const colorClass = TIER_TEXT_COLOR[tierKey];
  if (!colorClass) throw new Error(`Unknown evidence tier: ${tierKey}`);
  const tierLabel = TIER_DEFINITIONS[tierKey].label;
  return `<button type="button" class="text-[.82rem] font-bold ${colorClass} bg-transparent border-0 p-0 m-0 cursor-pointer hover:brightness-90" data-evidence-tier aria-label="${escapeHtml(text)} -- evidence tier: ${escapeHtml(tierLabel.toLowerCase())}, tap to learn more">${escapeHtml(text)}</button>`;
}
