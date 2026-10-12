import { escapeHtml } from "./escape-html.js";

// Amber for a problem worth acting on; everything else is neutral (#1375).
const TONES = {
  warning: {
    card: "bg-[color-mix(in_srgb,var(--color-tier-heuristic)_8%,var(--color-surface))] border-[color-mix(in_srgb,var(--color-tier-heuristic)_30%,transparent)] text-tier-heuristic",
    icon: `<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"></path><path d="M12 9v4"></path><path d="M12 17h.01"></path>`,
  },
  info: {
    card: "bg-surface border-border text-muted",
    icon: `<circle cx="12" cy="12" r="10"></circle><path d="M12 16v-4"></path><path d="M12 8h.01"></path>`,
  },
};

function insightCardHtml({ tone, text, detail }) {
  const key = Object.hasOwn(TONES, tone) ? tone : "info";
  const { card, icon } = TONES[key];
  return `<div class="flex gap-3 px-4 py-[14px] rounded-app border ${card}" data-insight-tone="${key}">
    <svg class="w-[1.2rem] h-[1.2rem] stroke-current fill-none mt-[2px] shrink-0" viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icon}</svg>
    <div>
      <p class="text-sm leading-[1.5] text-foreground">${escapeHtml(text)}</p>
      ${detail ? `<p class="text-sm leading-[1.5] text-muted mt-[6px]">${escapeHtml(detail)}</p>` : ""}
    </div>
  </div>`;
}

// Every report's insights sit under its chart, stacked one card each.
export function insightsHtml(insights) {
  const cards = insights.filter(Boolean).map(insightCardHtml).join("");
  return cards ? `<div class="flex flex-col gap-3 mt-5 mb-7" id="report-insights">${cards}</div>` : "";
}
