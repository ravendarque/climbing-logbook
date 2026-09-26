// Scope and how to add a term: docs/app-architecture.md, Usernames. This is data, not copy.

// From obscenity's englishDataset, whose allowlist keeps innocent words (grape, therapist) passing.
export const OBSCENITY_PHRASES = [
  "abeed", "abo", "africoon", "arabush", "boonga", "chingchong", "chink",
  "dyke", "fag", "kike", "negro", "nigger", "rape", "retard", "spastic",
  "tranny",
];

// obscenity pattern syntax: "|" is a word boundary; repeated letters collapse except o, l, e, s, b, g.
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
  // ADL Hate on Display.
  fourteenwords: ["fourteenwords"],
  hitler: ["hitler"],
  siegheil: ["siegheil"],
  whitepower: ["whitepower"],
  whitepride: ["whitepride"],
};

// Innocent words the matcher would otherwise catch.
export const ALLOWED_TERMS = ["fagus", "retardant", "vandyke"];

// Matched before leet handling, which would read the digits as letters. 88 and 14 alone are allowed: birth years and grades.
export const RAW_TERMS = ["1488", "14words", "kkk"];
