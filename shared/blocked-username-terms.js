// #997 phase 2 -- terms no username may contain. Scope (Raven, 2026-09-25):
// slurs and hate speech only. Swearing isn't blocked, and neither are
// political or identity terms in themselves.
//
// Matching is shared/username-policy.js's job, using obscenity
// (github.com/jo3-l/obscenity, MIT, pinned exactly in package.json so an
// update can't silently change what's blocked). It reads leet, lookalike
// Unicode and repeated letters (n1gger, niiigger). To add a term: a PR with
// a test in test/shared/username-policy.test.js covering the term and an
// innocent name that contains its letters, then run
// scripts/audit-usernames.mjs against production.
//
// This file names slurs because a blocklist has to. It's data, not copy.

// Phrases taken as-is from obscenity's englishDataset (its "originalWord"
// names), which comes with the allowlist entries that keep innocent words
// passing (grape, therapist, montenegro, sniggering...). Its sexual and
// general profanity is left out, per the scope above.
export const OBSCENITY_PHRASES = [
  "abeed", "abo", "africoon", "arabush", "boonga", "chingchong", "chink",
  "dyke", "fag", "kike", "negro", "nigger", "rape", "retard", "spastic",
  "tranny",
];

// Slurs and hate slogans obscenity doesn't cover, in its pattern syntax:
// "|" is a word boundary (a name's "." and "_" count as one), for words
// that sit innocently inside others (spicy, raccoon, pakistan, gookie).
// obscenity collapses repeated letters before matching, except o, l, e,
// s, b and g, so a doubled letter elsewhere is written once (ziperhead).
export const EXTRA_PATTERNS = {
  beaner: ["|beaner|", "|beaners|"],
  coon: ["|coon|", "|coons|"],
  golliwog: ["golliwog"],
  gook: ["|gook|", "|gooks|"],
  paki: ["|paki|", "|pakis|"],
  pikey: ["pikey"],
  raghead: ["raghead"],
  shemale: ["shemale"],
  spic: ["|spic|", "|spics|"],
  towelhead: ["towelhead"],
  wetback: ["wetback"],
  wog: ["|wog|", "|wogs|"],
  zipperhead: ["ziperhead"],
  // White-supremacist slogans (ADL Hate on Display).
  fourteenwords: ["fourteenwords"],
  hitler: ["hitler"],
  siegheil: ["siegheil"],
  whitepower: ["whitepower"],
  whitepride: ["whitepride"],
};

// Innocent words the matcher would otherwise catch.
export const ALLOWED_TERMS = ["fagus", "retardant", "vandyke"];

// Matched on the name with "." and "_" removed, before any leet or
// repeated-letter handling, because obscenity would read the digits as
// letters (and collapse kkk to k). 1488 and 14words are neo-Nazi codes (ADL
// Hate on Display); 88 and 14 on their own aren't blocked, since they're
// mostly birth years and grades (Raven, 2026-09-25).
export const RAW_TERMS = ["1488", "14words", "kkk"];
