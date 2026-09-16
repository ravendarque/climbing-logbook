# 22. 11ty (Eleventy) for page-shell templating

## Status

Accepted

## Context

Every one of this app's 20 static page shells was a hand-copied HTML file under `public/`: 16 app-shell pages sharing an almost-identical `<head>` (PWA manifest/icons, theme-color, the pre-paint theme-bootstrap script, the same handful of `<script>` tags) and 4 standalone auth/marketing pages with their own smaller shared boilerplate. A shared piece of markup changing meant editing it in up to 16 places by hand, with no structural guard against one copy drifting from the rest — exactly the class of bug [#759](https://github.com/ravendarque/climbing-logbook/issues/759) fixed once for the `#brand-row` header/burger-menu wrapper specifically, without addressing the underlying "20 copies of shared markup" problem itself.

Five approaches were evaluated (2026-09-14 architectural retrospective, recorded in full in [#758](https://github.com/ravendarque/climbing-logbook/issues/758)'s own issue body):

1. A component-boundary fix alone (#759) — a real, adopted-regardless improvement, but doesn't solve template duplication on its own.
2. A purpose-built static site generator (11ty, Astro, Parcel).
3. Extending Vite to own templating as well as bundling — rejected as a single move: Vite has no native HTML partial/include support, so this would mean bolting a plugin onto a tool not built for it. Client bundling and templating were split into two separate decisions instead (this ADR covers templating; [ADR-0021](0021-vite-for-production-build-client-and-worker.md) covers the bundler).
4. Cloudflare `HTMLRewriter` for request-time edge composition — a legitimate, arguably most-idiomatic-to-this-stack alternative (the app already does per-request `env.ASSETS.fetch()` dispatch) — deferred in favor of a build-time fix, since there was no HTML build step to add friction to at the time.
5. A hand-rolled Node build script using a real templating engine (Nunjucks/Handlebars) directly — superseded by adopting 11ty outright rather than reinventing a thinner slice of the same thing.

## Decision

**11ty**, chosen over Astro/Parcel as template-language-agnostic, zero-JS-by-default, and the closest thing to an industry standard for "many independent HTML pages sharing layouts" without pulling in a component framework this project has already rejected for other reasons ([ADR-0004](0004-tailwind-for-styling-reject-radix.md)). Cleared against this project's own BDS-compliance screen ([ADR-0005](0005-screen-dependencies-against-bds-boycott-lists.md)): independently maintained by Zach Leatherman, sponsored by Font Awesome, neither of which appear on BDS boycott lists.

**Nunjucks** as the templating language — 11ty's own default engine, and the closest fit to this codebase's existing hand-string-concatenation style (no JSX-like `.11ty.js` component paradigm to learn).

**Template source lives in a new top-level `views/` directory**; `public/` becomes pure generated output (`pnpm run html:build`/`html:watch`, `.eleventy.js`). Two genuinely different page-shell families stayed genuinely different rather than being forced into one shared shape: the 16 app-shell pages share one layout (`views/_includes/app-layout.njk`); the 4 auth/marketing pages (login, register, reset-password, the apex index) are standalone templates with no shared layout at all — real, one-off differences between them (an extra Turnstile script on `register`, different relative asset-path depths) made a forced shared layout a byte-fidelity risk for no real DRY gain.

**All 20 pages migrated in one coordinated pass**, not incrementally — a partial migration would have left two competing page-shell mechanisms live at once, with no clean way to tell which pages were "old" vs. "new" without checking each one.

**Zero rendered-output change was the acceptance bar**, verified by a real scripted byte-diff (`scripts/verify-html-migration.mjs`) against a snapshot of the pre-migration committed files, not by eyeballing — every one of the 20 pages confirmed byte-identical, with the one real YAML block-scalar whitespace subtlety this surfaced (a `staticShellNote` front-matter field's indentation) fixed rather than silently accepted as "close enough."

This does **not** change the app's "genuinely static shell" architecture: 11ty runs once at build time, producing one plain HTML file per page identical for every visitor — the same as before, just generated instead of hand-copied. Every page's own composition root still reads the username from `location.pathname` client-side at runtime, unchanged.

## Consequences

- A real, previously-latent CI gap surfaced and got fixed alongside this migration: none of `test.yml`/`deploy.yml`/`promote.yml`/`preview.yml` had an `html:build` step before this, since the 20 page shells used to be committed files that just existed on disk already. Once they became gitignored generated output, every one of those four workflows needed the new step added — without it, production/preview deploys would have shipped with zero page shells (every page 404ing on its own static HTML). Found via a genuine CI failure on the migration's own PR, not caught in review beforehand.
- A new build-time dependency (`@11ty/eleventy`) and a new templating language (Nunjucks) for anyone working on page shells going forward — a real, if modest, learning-curve cost weighed against the alternative of continuing to hand-copy 16+ pages' worth of shared boilerplate.
- Whether request-time edge composition (`HTMLRewriter`, option 4 above) would have been a better long-term fit for this stack's existing per-request `env.ASSETS.fetch()` dispatch pattern remains an open, deliberately deferred question — not revisited here, since a build-time fix was sufficient and lower-risk given there was no existing HTML build step to begin with.
