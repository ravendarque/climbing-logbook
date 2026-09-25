// #1015 -- generates the brand lockup (mark, title, tagline and Logbook
// Beta's tag) as ONE SVG, static/-/brand-lockup.svg, so the whole header
// scales and renders as a single image. Separately laid-out HTML boxes
// each snapped to the pixel grid and read the font's ascent metrics their
// own way, so the parts drifted against each other with zoom level and
// platform (#1012).
//
// The text is Bebas Neue glyph outlines, laid out by fontkit with the
// font's own kerning plus the header's `tracking-wide` (0.025em), so the
// SVG never depends on the web font or on how a browser reads its metrics.
// The committed SVG is the source of truth; run this only after changing
// the text, the font or the geometry below:
//
//   node scripts/generate-brand-lockup.mjs
//
// It also rewrites the generated block in climbing-header.js (the two
// viewBox sizes and the "or not" button's box), which
// test/scripts/brand-lockup.test.js checks against the SVG.
import { openSync } from "fontkit";
import { readFileSync, writeFileSync } from "node:fs";

const FONT = "static/-/fonts/BebasNeue-Regular.woff2";
const SVG_OUT = "static/-/brand-lockup.svg";
const HEADER = "static/-/components/climbing-header.js";

// Geometry, in units of 1/1000 of --brand-scale (the title's font size),
// so the title's glyphs are drawn at their native 1000 units per em. The
// ratios are the header's own from #208/#789: mark 1.4133 x 1.1042, gap
// 0.1083, tagline 0.3547 of the title's size.
const TITLE = "CLIMBING LOGBOOK";
const TITLE_RUNS = [["accent", 0, 8], ["foreground", 8, 16]];
const TAGLINE = "LOG YOUR CLIMBS, VISUALISE YOUR PROGRESS (OR NOT)";
const OR_NOT = [TAGLINE.indexOf("OR NOT"), TAGLINE.indexOf("OR NOT") + "OR NOT".length];
const TAGLINE_RUNS = [["muted", 0, OR_NOT[0]], ["accent", ...OR_NOT], ["muted", OR_NOT[1], TAGLINE.length]];
const TAGLINE_SIZE = 354.7;
const TRACKING = 25; // 0.025em, in font units
const MARK_W = 1413.3;
const MARK_H = 1104.2;
const GAP = 108.3;
const TEXT_X = MARK_W + GAP;

// Logbook Beta's tag (#956, #1012): Raven's draft, in its own 722 x 268
// space, leaning 1 across per 2 down like the K's arm, BETA centred.
// Placed with its top on the capitals' line and #1013's gap to the K.
const TAG_W = 762.5;
const TAG_SCALE = TAG_W / 722;
const TAG_OFFSET_X = 6072.9; // from the title's first pen position

const font = openSync(FONT);

// Pen positions for a string: fontkit's advances (kerning included) plus
// the tracking after every character, which is what CSS letter-spacing
// does.
function layout(text) {
  const run = font.layout(text);
  let x = 0;
  const glyphs = run.glyphs.map((glyph, i) => {
    const at = x + run.positions[i].xOffset;
    x += run.positions[i].xAdvance + TRACKING;
    return { glyph, x: at };
  });
  return { glyphs, width: x };
}

// One path per colour run, in font units with y up; the <g> around it
// flips and scales it into place.
function runPath(glyphs, from, to) {
  return glyphs.slice(from, to)
    .map(({ glyph, x }) => glyph.path.translate(x, 0).toSVG())
    .filter(Boolean)
    .join("")
    .replace(/(\d+\.\d{2})\d+/g, "$1");
}

// Ink bounds of a run in lockup units, for the viewBox and the button.
function inkBox(glyphs, from, to, originX, baseline, scale) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const { glyph, x } of glyphs.slice(from, to)) {
    const b = glyph.bbox;
    if (b.minX === b.maxX) continue; // spaces
    minX = Math.min(minX, originX + (x + b.minX) * scale);
    maxX = Math.max(maxX, originX + (x + b.maxX) * scale);
    minY = Math.min(minY, baseline - b.maxY * scale);
    maxY = Math.max(maxY, baseline - b.minY * scale);
  }
  return { minX, maxX, minY, maxY };
}

const title = layout(TITLE);
const tagline = layout(TAGLINE);
const titleInk = inkBox(title.glyphs, 0, TITLE.length, TEXT_X, 0, 1);

// #208: the mark's top sits on the title's ink top, its bottom on the
// tagline's baseline. The title's baseline is y = 0.
const markTop = titleInk.minY;
const taglineBaseline = markTop + MARK_H;
const taglineScale = TAGLINE_SIZE / 1000;
const taglineInk = inkBox(tagline.glyphs, 0, TAGLINE.length, TEXT_X, taglineBaseline, taglineScale);
const orNotInk = inkBox(tagline.glyphs, ...OR_NOT, TEXT_X, taglineBaseline, taglineScale);

const tagX = TEXT_X + TAG_OFFSET_X;
const tagTop = -font.capHeight;

const top = Math.min(markTop, tagTop);
const bottom = Math.max(taglineBaseline, taglineInk.maxY);
const right = Math.max(titleInk.maxX, taglineInk.maxX);
const betaRight = Math.max(right, tagX + TAG_W);
const round = n => Math.round(n * 10) / 10;
const box = { y: round(top), h: round(bottom - top), w: round(right), betaW: round(betaRight) };

const fill = token => `style="fill:var(--color-${token === "foreground" ? "text" : token === "muted" ? "text-muted" : "accent"})"`;
const runGroup = (layoutResult, runs, x, baseline, scale) => runs
  .map(([token, from, to]) => `<path ${fill(token)} d="${runPath(layoutResult.glyphs, from, to)}"/>`)
  .join("\n    ")
  .replace(/^/, `<g transform="translate(${round(x)} ${round(baseline)}) scale(${scale} ${-scale})">\n    `) + "\n  </g>";

// BETA, laid out the same way, centred in the tag at the #1013 size.
const beta = layout("BETA");
const betaScale = 0.235;
const betaX = (134 / 2 + 588 / 2) - (beta.width - TRACKING) * betaScale / 2;

const svg = `<svg xmlns="http://www.w3.org/2000/svg">
<!-- #1015: generated by scripts/generate-brand-lockup.mjs from Bebas Neue.
     Units are 1/1000 of the header's brand scale. Colours come from the
     page's theme tokens, which inherit into <use>. -->
<defs>
  <g id="lockup-mark" transform="translate(0 ${round(markTop)}) scale(${round(MARK_H / 96 * 1000) / 1000}) translate(0 -14.4)" style="fill:var(--color-text)">
    <path d="M45.6,14.4l23.718,48l-2.99,6l-21.689,0l10.843,21.6l-10.142,20.4l-45.342,0l45.6,-96Z"/>
    <path d="M85.203,37.2l16.333,31.2l-10.787,21.6l21.63,0l10.501,20.4l-74.042,0l36.364,-73.2Z"/>
  </g>
  <g id="lockup-text">
  ${runGroup(title, TITLE_RUNS, TEXT_X, 0, 1)}
  ${runGroup(tagline, TAGLINE_RUNS, TEXT_X, taglineBaseline, taglineScale)}
  </g>
</defs>
<symbol id="lockup" viewBox="0 ${box.y} ${box.w} ${box.h}">
  <use href="#lockup-mark"/>
  <use href="#lockup-text"/>
</symbol>
<symbol id="lockup-beta" viewBox="0 ${box.y} ${box.betaW} ${box.h}">
  <use href="#lockup-mark"/>
  <use href="#lockup-text"/>
  <g transform="translate(${round(tagX)} ${round(tagTop)}) scale(${round(TAG_SCALE * 10000) / 10000})">
    <polygon points="134,0 722,0 588,268 0,268" fill="#ffcc00"/>
    <path fill="#0f0f0f" transform="translate(${round(betaX)} 216.5) scale(${betaScale} ${-betaScale})" d="${runPath(beta.glyphs, 0, 4)}"/>
  </g>
</symbol>
</svg>
`;
writeFileSync(SVG_OUT, svg);

// The header needs the sizes to lay out the <svg> that <use>s a symbol,
// and the "or not" box for its button, as fractions of the lockup.
const pct = n => Math.round(n * 10000) / 10000;
const generated = `  // BEGIN GENERATED (scripts/generate-brand-lockup.mjs)
  var LOCKUP = { width: ${box.w}, betaWidth: ${box.betaW}, height: ${box.h}, orNot: { x: ${round(orNotInk.minX)}, y: ${round(orNotInk.minY - box.y)}, width: ${round(orNotInk.maxX - orNotInk.minX)}, height: ${round(orNotInk.maxY - orNotInk.minY)} } };
  // END GENERATED`;
const header = readFileSync(HEADER, "utf8");
const marked = /  \/\/ BEGIN GENERATED \(scripts\/generate-brand-lockup\.mjs\)\n[\s\S]*?  \/\/ END GENERATED/;
if (!marked.test(header)) throw new Error(`${HEADER} has no generated block to replace`);
writeFileSync(HEADER, header.replace(marked, generated));

console.log(SVG_OUT, `${(svg.length / 1024).toFixed(1)} KB`, box, { orNot: orNotInk, taglineBaseline: round(taglineBaseline), titleInk, pct: pct(box.w / box.betaW) });
