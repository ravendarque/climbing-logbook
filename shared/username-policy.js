// The rules are listed in docs/app-architecture.md, Usernames.
import {
  DataSet, RegExpMatcher, englishDataset, englishRecommendedTransformers, parseRawPattern,
} from "obscenity";
import { ALLOWED_TERMS, EXTRA_PATTERNS, OBSCENITY_PHRASES, RAW_TERMS } from "./blocked-username-terms.js";
import { DEMO_USERNAMES } from "./demo-personas.js";
import { AUTHORITY_TOKENS, BRAND_TERMS, RESERVED_USERNAMES } from "./reserved-usernames.js";

export const USERNAME_MIN_LENGTH = 1;
export const USERNAME_MAX_LENGTH = 30;
const FORMAT = /^[a-z0-9._]+$/;

// "1" is read as both i and l (skeletons()).
const LEET = { 0: "o", 3: "e", 4: "a", 5: "s", 7: "t" };

export function skeletons(name) {
  const base = name
    .toLowerCase()
    .replace(/[._]/g, "")
    .replace(/[03457]/g, digit => LEET[digit])
    .replace(/rn/g, "m")
    .replace(/vv/g, "w");
  return base.includes("1") ? [base.replace(/1/g, "i"), base.replace(/1/g, "l")] : [base];
}

const skeletonSet = names => new Set(names.flatMap(skeletons));
const RESERVED = skeletonSet(RESERVED_USERNAMES);
const AUTHORITY = skeletonSet(AUTHORITY_TOKENS);
const BRAND = BRAND_TERMS.flatMap(skeletons);

const hateTerms = new DataSet()
  .addAll(englishDataset)
  .removePhrasesIf(phrase => !OBSCENITY_PHRASES.includes(phrase.metadata?.originalWord));
for (const [word, patterns] of Object.entries(EXTRA_PATTERNS)) {
  hateTerms.addPhrase(phrase => {
    phrase.setMetadata({ originalWord: word });
    for (const raw of patterns) phrase.addPattern(parseRawPattern(raw));
    return phrase;
  });
}
hateTerms.addPhrase(phrase => {
  for (const term of ALLOWED_TERMS) phrase.addWhitelistedTerm(term);
  return phrase;
});
const HATE = new RegExpMatcher({ ...hateTerms.build(), ...englishRecommendedTransformers });

function containsHateTerm(candidate) {
  const joined = candidate.replace(/[._]/g, "");
  return RAW_TERMS.some(term => joined.includes(term))
    || HATE.hasMatch(candidate.replace(/[._]/g, " "))
    || HATE.hasMatch(joined);
}

// The reason is for tests and scripts; the person registering only sees "unavailable".
export function checkUsername(candidate) {
  if (typeof candidate !== "string" || !FORMAT.test(candidate)
    || candidate.length < USERNAME_MIN_LENGTH || candidate.length > USERNAME_MAX_LENGTH) {
    return { ok: false, reason: "format" };
  }
  if (DEMO_USERNAMES.includes(candidate)) return { ok: false, reason: "demo" };
  const forms = skeletons(candidate);
  if (forms.some(form => RESERVED.has(form))) return { ok: false, reason: "reserved" };
  const parts = candidate.split(/[._]/).filter(Boolean);
  if (parts.some(part => skeletons(part).some(form => AUTHORITY.has(form)))) return { ok: false, reason: "authority" };
  if (forms.some(form => BRAND.some(brand => form.includes(brand)))) return { ok: false, reason: "brand" };
  if (containsHateTerm(candidate)) return { ok: false, reason: "hate" };
  return { ok: true };
}
