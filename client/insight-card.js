import { escapeHtml } from "./escape-html.js";
import { haikuHtml } from "./haiku.js";

// Emerald for good news, amber for a problem worth acting on, neutral for everything else (#1375).
const TONES = {
  positive: {
    card: "bg-[color-mix(in_srgb,var(--insight-positive)_8%,var(--color-surface))] border-[color-mix(in_srgb,var(--insight-positive)_30%,transparent)] text-insight-positive",
    icon: `<circle cx="12" cy="12" r="10"></circle><path d="m8.5 12.5 2.5 2.5 5-5"></path>`,
  },
  negative: {
    card: "bg-[color-mix(in_srgb,var(--color-tier-heuristic)_8%,var(--color-surface))] border-[color-mix(in_srgb,var(--color-tier-heuristic)_30%,transparent)] text-tier-heuristic",
    icon: `<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"></path><path d="M12 9v4"></path><path d="M12 17h.01"></path>`,
  },
  neutral: {
    card: "bg-surface border-border text-muted",
    icon: `<circle cx="12" cy="12" r="10"></circle><path d="M12 16v-4"></path><path d="M12 8h.01"></path>`,
  },
};

// A haiku card is the poem alone; every other card has a title over its message (#1389).
function insightCardHtml({ tone, title, text, detail, link, haiku }) {
  const key = Object.hasOwn(TONES, tone) ? tone : "neutral";
  const { card, icon } = TONES[key];
  if (haiku) {
    return `<div class="px-4 py-[14px] rounded-app border ${card}" data-insight-tone="${key}">${haikuHtml(text)}</div>`;
  }
  return `<div class="flex gap-3 px-4 py-[14px] rounded-app border ${card}" data-insight-tone="${key}">
    <svg class="w-[1.2rem] h-[1.2rem] stroke-current fill-none mt-[2px] shrink-0" viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icon}</svg>
    <div>
      ${title ? `<p class="text-sm leading-[1.5] font-semibold text-foreground" data-insight-title>${escapeHtml(title)}</p>` : ""}
      ${text ? `<p class="text-sm leading-[1.5] text-foreground${title ? " mt-1" : ""}">${escapeHtml(text)}</p>` : ""}
      ${detail ? `<p class="text-sm leading-[1.5] text-muted mt-[6px]">${escapeHtml(detail)}</p>` : ""}
      ${link ? `<p class="text-sm leading-[1.5] mt-[6px]"><a class="text-accent-ink underline" href="${escapeHtml(link.href)}">${escapeHtml(link.label)}</a></p>` : ""}
    </div>
  </div>`;
}

// Every report's insights sit under its chart, stacked one card each.
export function insightsHtml(insights) {
  const cards = insights.filter(Boolean).map(insightCardHtml).join("");
  return cards ? `<div class="flex flex-col gap-3 mt-5 mb-7" id="report-insights">${cards}</div>` : "";
}
