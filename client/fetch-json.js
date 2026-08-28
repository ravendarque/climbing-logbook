// Shared by #348/#351's four newer composition roots' boot() sequences
// (map-main.js, performance-pyramid-main.js, log-main.js, profile-main.js) -- the
// identical fetch+parse+ok-check ceremony was hand-copied at each call
// site behind a comment claiming it wasn't worth sharing "for two call
// sites each," which undercounted the real duplication (4+ files, several
// with 3+ calls each) rather than describing it accurately (found via
// code review, 2026-08-09).
//
// Deliberately NOT imported by client/main.js (/logbook's own, still-
// untouched composition root, which keeps its own identical copy) --
// #344's parallel-migration decision holds /logbook stable and unmodified
// throughout this whole epic, including for a zero-risk DRY extraction
// like this one; that policy isn't this PR's call to unilaterally revisit.
export async function loadResource(url, key) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return data[key] ?? [];
}
