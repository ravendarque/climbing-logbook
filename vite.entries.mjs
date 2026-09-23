// #761/#774 -- the one shared list of client entry points, imported by
// both vite.config.js (dev server + devEntryRewrite, #775) and
// vite.deploy.config.js (the real production/preview/beta build). Kept
// in its own file rather than duplicated across the two configs --
// exactly the "one list, not two copies that silently drift" lesson
// this project already learned the hard way (#391/#224, and again when
// scripts/dev.mjs's own hand-copied watch list turned out to be missing
// beta-gate entirely).
export const CLIENT_ENTRIES = {
  log: "client/log-main.js",
  map: "client/map-main.js",
  "performance-hub": "client/performance-hub-main.js",
  "performance-pyramid": "client/performance-pyramid-main.js",
  "performance-trends": "client/performance-trends-main.js",
  "performance-gap": "client/performance-gap-main.js",
  "performance-rpe": "client/performance-rpe-main.js",
  "performance-injury": "client/performance-injury-main.js",
  "performance-strengths": "client/performance-strengths-main.js",
  profile: "client/profile-main.js",
  account: "client/account-main.js",
  "account-edit": "client/account-edit-main.js",
  "account-import": "client/account-import-main.js",
  sync: "client/sync-main.js",
  "beta-gate": "client/beta-gate-main.js",
  help: "client/help-main.js",
  // #924 -- its own dedicated bundle, not folded into help-main.js: that
  // one is a generic bundle every /help/* page loads (nav/search/theme
  // toggle), and this form's own DOM elements/Turnstile widget only exist
  // on this one page -- same "one bundle per distinct-behavior page" split
  // account-edit/account-import already use, not piling page-specific
  // logic into a shared bundle other pages don't need.
  "report-issue": "client/report-issue-main.js",
  // #925 -- same "own dedicated bundle" reasoning as report-issue above.
  feedback: "client/feedback-main.js",
};
