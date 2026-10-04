import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(process.cwd(), "styles/tailwind.css"), "utf8");

function tokensIn(selectorPattern) {
  const tokens = {};
  for (const [, body] of css.matchAll(new RegExp(`^${selectorPattern} \\{([^}]*)\\}`, "gm"))) {
    for (const [, name, value] of body.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) tokens[name] = value;
  }
  return tokens;
}

const dark = tokensIn(":root");
const THEMES = { dark, light: { ...dark, ...tokensIn(':root\\[data-theme="light"\\]') } };

function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map(i => {
    const c = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const TEXT = 4.5;
const NON_TEXT = 3;

const PAIRS_BOTH_THEMES = [
  ["color-accent-text", "color-accent-strong", TEXT, "white text on a strong-red fill"],
  ["color-accent-ink", "color-bg", TEXT, "red text on the page"],
  ["color-accent-ink", "color-surface", TEXT, "red text on a card"],
  ["color-warning-ink", "color-warning-bg", TEXT, "warning text on its tint"],
  ["color-warning-border", "color-surface", NON_TEXT, "a warning's border on a card"],
  ["grade-tier-beginner-ink", "grade-tier-beginner", TEXT, "a beginner grade badge"],
  ["grade-badge-ink", "grade-tier-intermediate", TEXT, "an intermediate grade badge"],
  ["grade-badge-ink", "grade-tier-advanced", TEXT, "an advanced grade badge"],
  ["grade-badge-ink", "grade-tier-elite", TEXT, "an elite grade badge"],
  ["grade-badge-ink", "grade-tier-hyper-elite", TEXT, "a hyper-elite grade badge"],
];

const PAIRS_LIGHT_THEME = [
  ["color-field-border", "color-bg", NON_TEXT, "a field's border on the page"],
  ["color-field-border", "color-surface", NON_TEXT, "a field's border on a card"],
];

function token(theme, name) {
  const value = THEMES[theme][name];
  expect(value, `--${name} in the ${theme} theme`).toMatch(/^#/);
  return value;
}

describe("token colour contrast (WCAG 2.2 AA)", () => {
  for (const theme of ["dark", "light"]) {
    for (const [fg, bg, min, what] of PAIRS_BOTH_THEMES) {
      it(`${theme}: ${what} reaches ${min}:1`, () => {
        expect(contrast(token(theme, fg), token(theme, bg))).toBeGreaterThanOrEqual(min);
      });
    }
  }
  for (const [fg, bg, min, what] of PAIRS_LIGHT_THEME) {
    it(`light: ${what} reaches ${min}:1`, () => {
      expect(contrast(token("light", fg), token("light", bg))).toBeGreaterThanOrEqual(min);
    });
  }
});
