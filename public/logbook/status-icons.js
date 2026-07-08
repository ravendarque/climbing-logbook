/**
 * Status icons — outlined stroke-width=2 line icons (Lucide,
 * https://lucide.dev, ISC licensed), matching the outline style used
 * everywhere else in the app (add/sync/filter/edit/back buttons, etc.)
 * rather than the previous illustrative duotone set. Each is colored via
 * a plain `stroke` so the icon stays self-contained — no dependency on
 * an ancestor's `color` — while still giving each status its own
 * at-a-glance identity in the table and entry form.
 * Used by logbook/index.html (list badges, stats bar, and the entry form).
 */

export const STATUS_ICONS = {
  flash: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#f4b400" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
  </svg>`,

  send: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#4ade80" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="10"></circle>
    <path d="m8 12 3 3 5-6"></path>
  </svg>`,

  project: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"></path>
    <line x1="4" x2="4" y1="22" y2="15"></line>
  </svg>`,

  wishlist: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"></path>
    <circle cx="12" cy="12" r="3"></circle>
  </svg>`,

  abandoned: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#f87171" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="10"></circle>
    <path d="m4.9 4.9 14.2 14.2"></path>
  </svg>`,
};
