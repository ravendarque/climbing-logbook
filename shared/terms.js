// Oldest first. A change that matters gets 14 days' notice: until `effective`, agreeing can wait (#1354).
export const TERMS_HISTORY = [
  {
    version: "2026-10-07",
    effective: "2026-10-07",
    changes: ["Climbing Logbook has Terms of use."],
  },
  {
    version: "2026-10-11",
    effective: "2026-10-11",
    changes: [
      "A new section, “Who can't use Climbing Logbook”, says which governments, organisations and people can't use the app.",
      "Questions and complaints go through Report an issue instead of email.",
    ],
  },
];

export const TERMS_VERSION = TERMS_HISTORY[TERMS_HISTORY.length - 1].version;

const today = () => new Date().toISOString().slice(0, 10);

// Null when the agreed version is the latest; otherwise what's changed since, and whether agreeing can still wait.
export function termsUpdate(agreedVersion, now = today()) {
  const newer = TERMS_HISTORY.filter(({ version }) => !agreedVersion || version > agreedVersion);
  if (newer.length === 0) return null;
  return {
    version: TERMS_VERSION,
    effective: newer[newer.length - 1].effective,
    required: newer.some(({ effective }) => effective <= now),
    changes: newer.flatMap(({ changes }) => changes),
  };
}
