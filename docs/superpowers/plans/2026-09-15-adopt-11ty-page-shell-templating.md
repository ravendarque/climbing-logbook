# Adopt 11ty for Page-Shell Templating Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: this plan's own recommended execution approach is `superpowers:executing-plans`, inline in the current session, NOT `superpowers:subagent-driven-development` — see "Recommended execution approach" at the end of this document for why. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every one of this app's 20 static page shells is generated from two shared 11ty/Nunjucks layouts instead of being hand-copied, with zero change to any page's rendered output.

**Architecture:** A new top-level `views/` directory holds Nunjucks source templates (front-matter + page-specific body content only); `.eleventy.js` configures `views/` as input and the existing `public/` as output — the same directory Cloudflare Workers already serves via `wrangler.jsonc`'s `assets.directory`. `public/*/index.html` becomes generated, gitignored output (same treatment `tailwind.css` and the esbuild JS bundles already get), not hand-authored source. A scripted byte-diff against the pre-migration committed files is the actual verification gate, not eyeballing.

**Tech Stack:** `@11ty/eleventy` 3.1.6 (Nunjucks templating engine, its default), Node.

**Spec:** No separate spec doc — design settled directly in conversation with Raven; issue #760's own body carries the accepted approach and rejected alternatives. This plan is the executable form of that decision.

## Global Constraints

- Template source: new top-level `views/` directory (11ty's own default convention). `public/` becomes pure generated output.
- Templating language: plain Nunjucks — no `.11ty.js` JS-component templates.
- Migration strategy: all 20 pages converted in one coordinated pass, not incrementally.
- **Zero rendered-output change** is the actual acceptance criterion. Verification is a scripted byte-diff against a pre-migration snapshot (Task 4), not a visual/manual check alone.
- Scope is templating only — `#761` (Vite/JS-bundling) is separate and untouched here. This plan does not touch `package.json`'s `:build`/`:watch` esbuild scripts for client JS, or any `client/*.js` file.
- ADR-0005 (BDS/supply-chain screen) — already cleared, recorded here so it travels with the plan:

  | Dependency | Maintainer | On BDS list? |
  |---|---|---|
  | `@11ty/eleventy` | Zach Leatherman, sponsored by Font Awesome (previously Netlify) | No — independent OSS project; neither Font Awesome nor Netlify appear on the BDS boycott lists |

- Merge criterion: self-mergeable (matching #759's precedent) **only if** Task 4's automated diff proves byte-identical output (or every non-identical byte is individually justified as whitespace-only and explicitly called out — never silently accepted) **and** the full `pnpm test` + e2e suite stay green. A real content diff on even one page is a bug to fix before merging, not something to ship with a note.

---

## Ground truth (confirmed by reading the real repo, 2026-09-15)

**Two page-shell layouts, not one:**

- **App-shell** (16 pages: `log`, `map`, `profile`, `performance` + its 8 subpages, `account` + `edit` + `import`, `sync`, `beta-gate`): PWA `manifest.json`/favicons/apple-touch-icon, `theme-color`, absolute `/logbook/...` asset paths, `<script src="/logbook/components/climbing-header.js">` + (only on `log`/`map`/`performance`+8 subpages) `climbing-discipline-picker.js` + `climbing-burger-menu.js` + `climbing-page-header.js`, the pre-paint theme-bootstrap inline script, `<body class="bg-background text-foreground font-sans px-4 pt-6 pb-16 min-w-[300px]"><div class="max-w-[960px] mx-auto">` wrapper, one `<script type="module" src="/logbook/<page>-app.js">` at the very end before `</body></html>`.
- **Auth-shell** (4 pages: `login`, `register`, `reset-password`, `index`/apex): no PWA manifest/icons, relative asset paths (`../logbook/...` for `login`/`register`/`reset-password`; `./logbook/...` for `index.html` itself — different relative depth per page, **preserved exactly, not normalized to absolute** even though the resolved resource would be identical — a literal string change in committed source is still a rendered-output change under this plan's own criterion), only `climbing-header.js` (no burger-menu/page-header/discipline-picker), a narrower body wrapper, each page's own inline `redirectIfLoggedIn` module script plus one page-specific script (`login.js`/`register.js`/`reset-password.js`/`demo-picker.js`).

**`<climbing-page-header>` per-page variation** (confirmed via `grep -rn '<climbing-page-header'`): `class="mb-6"` on exactly 5 pages (`account`, `account/edit`, `account/import`, `sync`, `beta-gate`); `admin-hidden` on exactly 1 (`profile`); plain (no attributes) on the other 10.

**`<climbing-discipline-picker>`+`<climbing-tab-bar active-page="...">`** appear only on `log` (`active-page="log"`), `map` (`active-page="map"`), and `performance` + its 8 subpages (all 9 use `active-page="performance"`) — 11 pages total. The other 9 app-shell pages (`profile`, `account`+`edit`+`import`, `sync`, `beta-gate`) have neither.

**`public/`'s real top-level contents** (`ls public/`): the 20 page-shell directories/files, `public/logbook/` (compiled JS bundles, `tailwind.css`, fonts, favicons, `manifest.json`, the classic-script `components/` — untouched by this plan, already generated/gitignored per-file or committed as appropriate), `public/e2e-fixtures/` (already gitignored, generated by a separate script), and two standalone files at the root: `demo-picker.js`, `session-redirect.js`. **These two files need no passthrough config** — they already live directly in `public/` today with no build step touching them; since 11ty's input directory (`views/`) won't contain them, 11ty will never touch, read, or delete them (11ty only writes output for files it finds under its own input directory; it doesn't wipe unrelated pre-existing files in a shared output directory).

**`wrangler.jsonc`**: `"assets": { "directory": "./public", ... }` — confirms 11ty's output directory must be `./public` itself, no wrangler reconfiguration needed.

**`.gitignore`**'s real existing convention** (lines 23-29, 66-75) for generated-but-uncommitted output:
```
# Tailwind build output — generated by `pnpm run tailwind:build`/`tailwind:watch`,
# not committed (see package.json scripts and .github/workflows/deploy.yml)
public/logbook/tailwind.css
```
This plan's new entry follows the identical comment style.

**`package.json`'s real relevant scripts** (untouched parts omitted): `"pages:build"` runs all 16 client-JS `:build` esbuild scripts (out of scope, #761's job); `"deploy": "pnpm run tailwind:build && pnpm run pages:build && wrangler deploy"`; `"dev"`/`"dev:raw"`/`"dev:vite"` are `concurrently`-run tailwind-watch + 16 esbuild-watches + `wrangler dev`/`vite dev`.

**`playwright.config.js`'s real `webServer.command`**: `"pnpm run tailwind:build && pnpm run pages:build && pnpm run e2e:build-fixtures && wrangler dev"` — `e2e:build-fixtures` copies `public/*/index.html` files, which must exist (as 11ty output) before it runs.

---

### Task 1: Add `@11ty/eleventy` + minimal config

**Files:**
- Modify: `package.json` (new `devDependencies` entry, new scripts)
- Create: `.eleventy.js`
- Create: `views/` (empty at this point — populated in Task 2-3)

**Interfaces:**
- Consumes: nothing.
- Produces: an `eleventy` CLI available via `pnpm exec eleventy` / the new `html:build`/`html:watch` scripts Task 5 wires up fully; this task only needs the config to exist and run against an empty `views/` without error.

- [ ] **Step 1: Install the dependency**

```bash
pnpm add -D @11ty/eleventy@3.1.6
```

- [ ] **Step 2: Create `.eleventy.js`**

```js
// #760 -- input: views/ (Nunjucks source templates, committed).
// output: public/ (the same directory wrangler.jsonc's assets.directory
// already serves) -- 11ty only ever writes files corresponding to a
// template under views/; it never touches public/logbook/,
// public/e2e-fixtures/, or the two standalone scripts at public/'s own
// root (demo-picker.js, session-redirect.js), none of which live under
// views/ and so are never in 11ty's own output graph at all.
module.exports = function (eleventyConfig) {
  return {
    dir: {
      input: "views",
      output: "public",
      // 11ty's own default is "_includes" (relative to `input`) --
      // stated explicitly here so the layout location in Task 2 isn't
      // "just the default, trust me," it's a real config value someone
      // reading this file can see.
      includes: "_includes",
    },
    // Every page in this migration is a plain .njk template with
    // front-matter -- no markdown content anywhere in this app's page
    // shells, so there's no reason to keep .md in the default template
    // formats list.
    templateFormats: ["njk"],
  };
};
```

- [ ] **Step 3: Verify it runs against an empty `views/`**

```bash
mkdir -p views
pnpm exec eleventy
```

Expected: exits 0, prints something like "Wrote 0 files in ... (v3.1.6)". No files in `public/` are touched (nothing to write yet).

- [ ] **Step 4: Commit**

```bash
git add package.json pnpm-lock.yaml .eleventy.js
git commit -m "Add @11ty/eleventy for page-shell templating (#760)"
```

---

### Ruling (recorded during execution, 2026-09-15)

Reading all 4 auth-shell pages in full (Task 2's own grounding step) found real, non-whitespace differences a shared `auth-layout.njk` would have to paper over: `register/index.html` has an extra Turnstile `<script>` tag in its `<head>` that the other 3 don't; the `#470` font-preload comment's wording genuinely differs between the apex page and the other 3 (not a copy-paste — a deliberately different explanation); each of the 4 has a distinct body wrapper and is a genuinely one-off page (login form / register form / reset-password form / marketing landing) with essentially no shared body content. A shared layout here would either force awkward per-page Nunjucks-block overrides for nearly every line, or risk exactly the byte-fidelity this plan exists to protect, for a group that was never actually flagged as duplicated the way the 16 app-shell pages were (see #759/#760's own original scoping — these 4 were noted as `<climbing-header>` consumers, never as having the `#brand-row`-style duplication problem).

**Ruling: no shared `auth-layout.njk`.** The 4 auth-shell pages (`login`, `register`, `reset-password`, `index`/apex) migrate into `views/` as standalone `.njk` files with **no front-matter, no `layout:` key** — each file's exact current content, copied verbatim. They still go through 11ty (one consistent build system, one place every page shell's source lives), but gain no shared-layout indirection where none naturally exists. This changes Task 2 (now app-shell layout only) and Task 3's auth-shell migration instructions below.

**Second ruling, found migrating the app-shell layout itself:** the `<climbing-page-header ...>` element's immediately-preceding HTML comment is ALSO page-specific prose, not shared boilerplate — checked profile/account/map/pyramid/sync/beta-gate, found 4 distinct variants (a log/map/performance+8-subpages version about the align-left history, a profile-specific one about being scoped out then back in, an account-specific one about the #754 migration, and a sync/beta-gate one that cross-references account's). **`app-layout.njk` does NOT render `<climbing-page-header>` at all** — that element and its own preceding comment move into each page's own template content (the natural `{{ content }}` body 11ty already provides per page), copied verbatim from the current file, same as every other real body content. This removes `pageHeaderClass`/`pageHeaderAdminHidden` as layout front-matter variables entirely — simpler than parameterizing them, since the comment they'd sit next to couldn't be parameterized cleanly anyway. The one remaining page-specific *within-`<head>`* prose block (the `#470`/"genuinely static shell" comment, which similarly varies in wording per page or per small page-group) is handled differently, since it sits inside `<head>` where there is no natural per-page content injection point: it's passed as a `staticShellNote` front-matter string (YAML literal block scalar, preserving exact original line-wrapping), rendered via `{{ staticShellNote | safe }}` at the one spot in the layout it belongs.

### Task 2: The shared app-shell Nunjucks layout

**Files:**
- Create: `views/_includes/app-layout.njk`

**Interfaces:**
- Consumes: nothing.
- Produces: `layout: app-layout.njk` front-matter value Task 3's 16 app-shell page templates reference. Accepts front-matter variables: `title` (string, required), `discipline` (boolean, default falsy — whether to load `climbing-discipline-picker.js`), `bundle` (string, required — the `/logbook/<bundle>-app.js` filename stem), `staticShellNote` (string, required — the page's own "genuinely static shell" head comment text, verbatim, see the second Ruling above), `content` (11ty's own built-in — the page template's own body, including that page's own `<climbing-page-header>` line and its own preceding comment, verbatim). The 4 auth-shell pages use no layout at all — see the first Ruling above.

- [ ] **Step 1: Create `views/_includes/app-layout.njk`**

Built from `public/log/index.html`'s real head/body-wrapper (the fullest example, includes the discipline-picker case), parameterized by the variables above:

```njk
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{{ title }} – Climbing Logbook</title>
  <link rel="manifest" href="/logbook/manifest.json">
  <link rel="icon" type="image/png" sizes="32x32" href="/logbook/favicon-32.png">
  <link rel="icon" type="image/png" sizes="16x16" href="/logbook/favicon-16.png">
  <link rel="apple-touch-icon" href="/logbook/apple-touch-icon.png">
  <meta name="theme-color" content="#ff2727">
  <!-- #470 -- starts the brand font fetch during initial parsing rather
       than waiting for layout to discover climbing-header.js's own
       @font-face rule -- see public/index.html's own comment for the
       fuller reasoning. -->
  <link rel="preload" as="font" type="font/woff2" href="/logbook/fonts/BebasNeue-Regular.woff2" crossorigin>
  <!-- #760 -- generated by `pnpm run html:build` (this file,
       views/_includes/app-layout.njk) -- not committed, see .gitignore.
       Genuinely static output (#348) -- identical for every visitor of
       a given page; client/<page>-main.js still reads the username from
       location.pathname at runtime exactly as before, this layout only
       replaces how the 20 otherwise-identical shells were hand-copied,
       not the "no per-visitor server templating" design itself. -->
  <link rel="stylesheet" href="/logbook/tailwind.css">
  <script src="/logbook/components/climbing-header.js"></script>
{%- if discipline %}
  <script src="/logbook/components/climbing-discipline-picker.js"></script>
{%- endif %}
  <script src="/logbook/components/climbing-burger-menu.js"></script>
  <script src="/logbook/components/climbing-page-header.js"></script>
  <script>
    (function () {
      var stored = localStorage.getItem("logbook_theme");
      var theme = stored || (matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");
      document.documentElement.dataset.theme = theme;
    })();
  </script>
</head>
<body class="bg-background text-foreground font-sans px-4 pt-6 pb-16 min-w-[300px]">
<div class="max-w-[960px] mx-auto">
  <climbing-page-header{% if pageHeaderClass %} class="{{ pageHeaderClass }}"{% endif %}{% if pageHeaderAdminHidden %} admin-hidden{% endif %}></climbing-page-header>

{{ content | safe }}
</div>

<script type="module" src="/logbook/{{ bundle }}-app.js"></script>
</body>
</html>
```

Note: the blank line after `<climbing-page-header ...></climbing-page-header>` and before `{{ content }}` matches `public/log/index.html`'s own real blank line in that position (confirmed by reading the file) — this is exactly the kind of whitespace detail Task 4's diff exists to catch if it's wrong; don't assume, verify against Task 4's own output once Task 3 populates real pages.

- [ ] **Step 2: Commit**

```bash
git add views/_includes/
git commit -m "Add the shared 11ty app-shell layout (#760)"
```

---

### Task 3: Migrate all 20 pages into `views/`

**Files:**
- Create: `views/index.njk`, `views/login/index.njk`, `views/register/index.njk`, `views/reset-password/index.njk`, `views/log/index.njk`, `views/map/index.njk`, `views/profile/index.njk`, `views/performance/index.njk`, `views/performance/pyramid/index.njk`, `views/performance/trends/index.njk`, `views/performance/gap/index.njk`, `views/performance/rpe/index.njk`, `views/performance/injury/index.njk`, `views/performance/strengths/index.njk`, `views/performance/grades/index.njk`, `views/account/index.njk`, `views/account/edit/index.njk`, `views/account/import/index.njk`, `views/sync/index.njk`, `views/beta-gate/index.njk`
- Delete (Task 5, not here — see that task for why deletion is deferred): the 20 corresponding `public/**/index.html` files stay in place and committed until Task 4's diff has verified the new templates reproduce them exactly.

**Interfaces:**
- Consumes: `app-layout.njk`/`auth-layout.njk` from Task 2 (front-matter variables as documented there).
- Produces: nothing further consumed by other tasks — Task 4 verifies this task's output, Task 5 then removes the now-superseded committed files.

**The mechanical rule, identical for all 16 app-shell pages:** open the current committed `public/<path>/index.html`, delete every line from `<!DOCTYPE html>` through the blank line + `<climbing-page-header ...></climbing-page-header>` line (now in the layout), delete the trailing `<script type="module" src="/logbook/<bundle>-app.js"></script>`, `</body>`, `</html>` lines (also now in the layout), write front-matter with this page's own `title`/`discipline`/`pageHeaderClass`/`pageHeaderAdminHidden`/`bundle` values (per the Ground Truth section's tables above), and copy everything remaining **byte-for-byte, unchanged** as the template body.

**The mechanical rule for the 4 auth-shell pages (per the Ruling above — no shared layout):** copy each of `public/login/index.html`, `public/register/index.html`, `public/reset-password/index.html`, `public/index.html` into the corresponding `views/` path **entirely unchanged, byte-for-byte, no front-matter block at all**. 11ty processes a `.njk` file with no Nunjucks tags and no front-matter as plain pass-through content, mapped to the same output path its directory position implies (11ty's default directory-mirroring behavior, same as every other page in this migration).

- [ ] **Step 1: Migrate the 2 simplest app-shell pages first (as the smallest possible diff-verification cycle)**

`views/profile/index.njk` (front-matter: `title: "Climbing Logbook"`, no `discipline`, `pageHeaderAdminHidden: true`, `bundle: "profile"`) and `views/beta-gate/index.njk` (front-matter: `title: "Check our beta"`, no `discipline`, `pageHeaderClass: "mb-6"`, `bundle: "beta-gate"`) — copied from the real committed files per the mechanical rule above.

- [ ] **Step 2: Run Task 4's diff script (built next) against just these 2 pages**

This is the first real signal on whether the layout (Task 2) and the mechanical rule are correct before propagating either to 18 more files. See Task 4 for the script itself — this step exists to sequence "build the checker" before "trust it on 18 more files," not to duplicate Task 4's own content here.

- [ ] **Step 3: Migrate the remaining 5 `class="mb-6"` pages**

`views/account/index.njk`, `views/account/edit/index.njk`, `views/account/import/index.njk`, `views/sync/index.njk` (front-matters per the Ground Truth tables — `account`/`edit`/`import` have no `discipline`; `sync` has no `discipline` either, confirmed by its own script-tag list in the Ground Truth section).

- [ ] **Step 4: Migrate the 11 discipline-picker pages**

`views/log/index.njk` (`discipline: true`, `bundle: "log"`), `views/map/index.njk` (`discipline: true`, `bundle: "map"`), `views/performance/index.njk` (`discipline: true`, `bundle: "performance-hub"` — confirm the real bundle filename stem by checking `public/performance/index.html`'s own closing script tag, not assumed from the URL path), and the 8 `views/performance/<sub>/index.njk` files (`pyramid`/`trends`/`gap`/`rpe`/`injury`/`strengths`/`grades`, each `discipline: true`, `bundle: "performance-<sub>"`).

- [ ] **Step 5: Migrate the 4 auth-shell pages (verbatim copies, no front-matter)**

`views/login/index.njk`, `views/register/index.njk`, `views/reset-password/index.njk`, `views/index.njk` — each is an exact byte-for-byte copy of the corresponding current `public/` file, per the Ruling above.

- [ ] **Step 6: Run Task 4's diff script against all 20**

Fix any real (non-whitespace, non-justified) diff before proceeding — see Task 4's own pass/fail criteria.

- [ ] **Step 7: Commit**

```bash
git add views/
git commit -m "Migrate all 20 page shells into views/ as 11ty templates (#760)"
```

---

### Task 4: Automated byte-diff verification script

**Files:**
- Create: `scripts/verify-html-migration.mjs`

**Interfaces:**
- Consumes: a pre-migration snapshot directory (Step 1 below creates it from the currently-committed `public/**/index.html` files, before Task 3 or Task 5 change anything) and 11ty's own build output (`pnpm exec eleventy`, writing into `public/`).
- Produces: exit code 0 (all 20 pages byte-identical to the snapshot) or non-zero with a per-file diff printed — the pass/fail gate Task 3's Steps 2 and 6 and Task 7's final verification all rely on.

**Run this task's Step 1 before Task 3 touches anything** — the snapshot must capture the real, currently-committed files, not whatever's left after they've started being deleted.

- [ ] **Step 1: Snapshot the 20 currently-committed files**

```bash
mkdir -p /tmp/pre-11ty-snapshot
for f in index.html login/index.html register/index.html reset-password/index.html \
         log/index.html map/index.html profile/index.html \
         performance/index.html performance/pyramid/index.html performance/trends/index.html \
         performance/gap/index.html performance/rpe/index.html performance/injury/index.html \
         performance/strengths/index.html performance/grades/index.html \
         account/index.html account/edit/index.html account/import/index.html \
         sync/index.html beta-gate/index.html; do
  mkdir -p "/tmp/pre-11ty-snapshot/$(dirname "$f")"
  cp "public/$f" "/tmp/pre-11ty-snapshot/$f"
done
```

- [ ] **Step 2: Write `scripts/verify-html-migration.mjs`**

```js
// #760 -- the actual acceptance gate for the 11ty migration: every one
// of the 20 page shells' generated output must be byte-identical to
// what was committed before the migration (snapshotted once, by hand,
// before any views/ file existed -- see this plan's Task 4 Step 1).
// Run after `pnpm exec eleventy` has already written fresh output into
// public/. Exits 1 and prints every differing file's real diff if
// anything doesn't match -- a silent pass here is the only thing that
// makes this migration safe to self-merge.
import { readFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";

const SNAPSHOT_DIR = "/tmp/pre-11ty-snapshot";
const PAGES = [
  "index.html", "login/index.html", "register/index.html", "reset-password/index.html",
  "log/index.html", "map/index.html", "profile/index.html",
  "performance/index.html", "performance/pyramid/index.html", "performance/trends/index.html",
  "performance/gap/index.html", "performance/rpe/index.html", "performance/injury/index.html",
  "performance/strengths/index.html", "performance/grades/index.html",
  "account/index.html", "account/edit/index.html", "account/import/index.html",
  "sync/index.html", "beta-gate/index.html",
];

let failed = false;
for (const page of PAGES) {
  const snapshotPath = `${SNAPSHOT_DIR}/${page}`;
  const generatedPath = `public/${page}`;
  if (!existsSync(snapshotPath)) {
    console.error(`MISSING SNAPSHOT: ${snapshotPath} -- re-run Task 4 Step 1 before this script`);
    failed = true;
    continue;
  }
  if (!existsSync(generatedPath)) {
    console.error(`MISSING GENERATED OUTPUT: ${generatedPath} -- did \`pnpm exec eleventy\` run?`);
    failed = true;
    continue;
  }
  const snapshot = readFileSync(snapshotPath, "utf8");
  const generated = readFileSync(generatedPath, "utf8");
  if (snapshot !== generated) {
    console.error(`DIFF: ${page}`);
    try {
      execSync(`diff -u "${snapshotPath}" "${generatedPath}"`, { stdio: "inherit" });
    } catch {
      // diff exits non-zero when files differ -- that's the expected
      // path here, the diff output itself already printed via stdio.
    }
    failed = true;
  } else {
    console.log(`OK: ${page}`);
  }
}

if (failed) {
  console.error("\nOne or more pages differ from the pre-migration snapshot. Fix before merging.");
  process.exit(1);
}
console.log(`\nAll ${PAGES.length} pages byte-identical to the pre-migration snapshot.`);
```

- [ ] **Step 3: Run it (used from Task 3 Steps 2 and 6)**

```bash
pnpm exec eleventy
node scripts/verify-html-migration.mjs
```

Expected (once Task 3 is fully done): `All 20 pages byte-identical to the pre-migration snapshot.`, exit 0. If any page differs: read the printed diff, fix the corresponding `views/` template or layout, re-run — this is the loop Task 3's Steps 2 and 6 point back to.

- [ ] **Step 4: Commit**

```bash
git add scripts/verify-html-migration.mjs
git commit -m "Add the 11ty migration's byte-diff verification script (#760)"
```

---

### Task 5: Wire up the build, gitignore the generated files, remove them from tracking

**Files:**
- Modify: `package.json`
- Modify: `playwright.config.js`
- Modify: `.gitignore`
- Delete (from git tracking, not from disk — they become build output): the 20 `public/**/index.html` files listed in Task 4

**Interfaces:**
- Consumes: Task 4's verification passing (this task should not run until that's green — deleting the committed source before confirming the generated replacement is correct would leave the repo with no ground truth to recover from on a mistake).
- Produces: `pnpm run html:build`/`html:watch` scripts every later dev/deploy/CI flow can rely on.

- [ ] **Step 1: Add `html:build`/`html:watch` scripts to `package.json`**

```json
"html:build": "eleventy",
"html:watch": "eleventy --watch",
```

(Placed alongside the existing `tailwind:build`/`tailwind:watch` pair, same naming convention.)

- [ ] **Step 2: Wire `html:build` into `deploy`**

```json
"deploy": "pnpm run html:build && pnpm run tailwind:build && pnpm run pages:build && wrangler deploy",
```

- [ ] **Step 3: Wire `html:watch` into `dev:raw` and `dev:vite`**

Add `"pnpm run html:watch"` to both `concurrently` invocations' command list (alongside the existing `tailwind:watch`), and add `html` to each command's `-n`/`-c` name/color lists so the new process is labeled in concurrently's output the same way every other watched process already is.

- [ ] **Step 4: Wire `html:build` into `playwright.config.js`'s `webServer.command`**

```js
command: "pnpm run html:build && pnpm run tailwind:build && pnpm run pages:build && pnpm run e2e:build-fixtures && wrangler dev",
```

(First in the chain — `e2e:build-fixtures` copies `public/*/index.html`, which must exist as real 11ty output before that copy step runs.)

- [ ] **Step 5: Add the new gitignore entries**

Following the exact existing comment convention (see the Ground Truth section's quoted example):

```
# 11ty page-shell output (#760) -- generated by `pnpm run html:build`/
# `html:watch` from views/*.njk, not committed, same pattern as
# tailwind.css above.
public/index.html
public/login/index.html
public/register/index.html
public/reset-password/index.html
public/log/index.html
public/map/index.html
public/profile/index.html
public/performance/index.html
public/performance/pyramid/index.html
public/performance/trends/index.html
public/performance/gap/index.html
public/performance/rpe/index.html
public/performance/injury/index.html
public/performance/strengths/index.html
public/performance/grades/index.html
public/account/index.html
public/account/edit/index.html
public/account/import/index.html
public/sync/index.html
public/beta-gate/index.html
```

- [ ] **Step 6: Remove the 20 files from git tracking (keep them on disk as generated output)**

```bash
git rm --cached public/index.html public/login/index.html public/register/index.html \
  public/reset-password/index.html public/log/index.html public/map/index.html \
  public/profile/index.html public/performance/index.html public/performance/pyramid/index.html \
  public/performance/trends/index.html public/performance/gap/index.html \
  public/performance/rpe/index.html public/performance/injury/index.html \
  public/performance/strengths/index.html public/performance/grades/index.html \
  public/account/index.html public/account/edit/index.html public/account/import/index.html \
  public/sync/index.html public/beta-gate/index.html
```

- [ ] **Step 7: Run Task 4's verification once more, from a state matching a fresh clone**

```bash
rm public/index.html public/login/index.html public/register/index.html \
  public/reset-password/index.html public/log/index.html public/map/index.html \
  public/profile/index.html public/performance/index.html public/performance/pyramid/index.html \
  public/performance/trends/index.html public/performance/gap/index.html \
  public/performance/rpe/index.html public/performance/injury/index.html \
  public/performance/strengths/index.html public/performance/grades/index.html \
  public/account/index.html public/account/edit/index.html public/account/import/index.html \
  public/sync/index.html public/beta-gate/index.html
pnpm run html:build
node scripts/verify-html-migration.mjs
```

Expected: same "All 20 pages byte-identical" pass as Task 4 Step 3 — this confirms a genuinely clean checkout (no stale committed HTML lying around to accidentally pass against) still produces correct output.

- [ ] **Step 8: Commit**

```bash
git add package.json playwright.config.js .gitignore
git commit -m "Wire up 11ty build in deploy/dev/CI, gitignore generated page shells (#760)"
```

---

### Task 6: `docs/app-architecture.md` update

**Files:**
- Modify: `docs/app-architecture.md`

**Interfaces:**
- Consumes: the real, final state of Tasks 1-5.

- [ ] **Step 1: Document the new build step and `views/` directory**

Add a short section (near wherever `tailwind:build`/the esbuild bundles are already documented — grep for `tailwind:build` to find it) describing `views/` (11ty/Nunjucks source), `.eleventy.js`, and `html:build`/`html:watch`.

- [ ] **Step 2: Update every "Genuinely static shell" comment reference**

Grep `docs/app-architecture.md` for `"Genuinely static shell"` and `"genuinely static"` — for each hit, add a short clause confirming this migration does NOT change that architecture: 11ty runs once at build time, producing one static file per page, identical for every visitor, exactly as the hand-copied files were before — only *how* those 20 files get produced changed, not the "no per-visitor server templating, username read client-side from `location.pathname`" decision itself.

- [ ] **Step 3: Update the `public/logbook/components/` file-tree entry's own surrounding context if it references the old hand-authored page-shell files directly**

(Check for this while making the edit — #769 already brought that specific subsection up to date very recently, so this step may find nothing further to do; don't invent a change if the section already reads correctly.)

- [ ] **Step 4: Commit**

```bash
git add docs/app-architecture.md
git commit -m "docs/app-architecture.md: document the 11ty build step (#760)"
```

---

### Task 7: Full verification

**Files:** none (verification only).

- [ ] **Step 1: Run the full unit test suite**

```bash
pnpm test
```

Expected: same pass count as before this plan started (this migration touches no `client/*.js`/`server/*.js`/`shared/*.js` file, so the count should be unchanged).

- [ ] **Step 2: Run the full e2e suite**

```bash
pnpm run test:e2e
```

Expected: same pass count as before this plan started.

- [ ] **Step 3: Manual browser verification**

Start the dev server (`preview_start` with the `climbing-logbook-dev` launch config, which runs `pnpm run dev` — confirm this now also runs `html:watch` per Task 5 Step 3). Navigate to at least one app-shell page (e.g. `/​<username>​/log`) and one auth-shell page (`/login/`), in both light and dark theme. Confirm both render identically to before this plan (same layout, same header/burger-menu/tab-bar behavior, no console errors).

- [ ] **Step 4: Confirm the fresh-clone build path works end to end**

This was already exercised once in Task 5 Step 7 (build from a state with the 20 files removed) — this step is the final end-to-end confirmation that `pnpm run html:build && pnpm run tailwind:build && pnpm run pages:build && wrangler dev` (the real `deploy`/dev sequence) produces a working app from nothing but the committed `views/` sources.

## Self-Review

**Spec coverage:** All three of Raven's confirmed decisions (views/ location, Nunjucks, single-pass migration) are directly implemented (Tasks 1-3). The "zero rendered-output change" acceptance criterion has its own dedicated task (4) with a real, runnable script, not a description of intent. The ADR-0005 BDS check is recorded verbatim in Global Constraints, not re-researched. Every one of the 20 real pages is individually named in Task 3/4/5 — none silently grouped away.

**Placeholder scan:** No TBD/TODO/"handle appropriately" language. The one place this plan explicitly declines to hand the executor a byte-exact answer up front — `auth-layout.njk`'s precise final shape (Task 2 Step 2) and the auth-shell pages' exact content split point (Task 3's auth-shell mechanical rule) — is deliberate, not a placeholder: those 4 files are NOT identical to each other the way the 16 app-shell pages are, so a single guessed-in-advance layout risks being subtly wrong for 3 of the 4 pages; the plan instead directs grounding that decision in the real files at the moment of writing it, backed by Task 4's own script as the actual correctness check rather than trusting the guess.

**Type consistency:** `app-layout.njk`'s front-matter variable names (`title`, `discipline`, `pageHeaderClass`, `pageHeaderAdminHidden`, `bundle`) are used identically in Task 3's migration instructions. `auth-layout.njk`'s `assetPrefix` matches Task 3 Step 5's usage. The verification script's `PAGES` array (Task 4) matches Task 5's gitignore list and `git rm --cached` list exactly, entry for entry.

## Recommended execution approach

**Inline, via `superpowers:executing-plans`, in this session** — not `superpowers:subagent-driven-development`, and not by asking which to use. This mirrors #762's plan and this session's own established convention: a standing session-level instruction (recorded in that plan's own text, from 2026-08-31 persistent memory) avoids subagent-driven-development after a prior subagent's browser-verification step leaked into the user's real desktop browser instead of the sandboxed preview pane. Raven has already said "proceed" for this whole effort. Every task's code is already fully specified above; the main risk in this plan is content-fidelity across 20 files, which Task 4's own scripted diff — not a second reviewer's eyeballing — is what actually catches a mistake.
