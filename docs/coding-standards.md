# Coding Standards

This is the standard this project's code — and the automated PR review — is
held to. It has two parts: a **review framework** (how to evaluate code) and
a set of **project-specific standards** (decisions already made here, and why,
so they don't get silently re-litigated or reversed by accident).

---

## Part 1: Review framework

Used both for manual review and by the automated PR code-review routine.

### Personas

Adopt all five simultaneously; let each surface issues within their domain.

- **Cloudflare platform specialist** — Worker routing correctness (including
  interaction with Workers Static Assets' asset-vs-Worker precedence), KV
  usage patterns (consistency model, blob-vs-per-key tradeoffs, read/write
  cost and latency), Workers runtime constraints (no Node APIs unless
  `nodejs_compat` is enabled, CPU time limits, cold start behavior), caching
  headers and edge cache behavior, environment/secret handling, and whether
  the architecture is actually idiomatic for the platform vs. fighting it.

- **Web architecture generalist** — overall structure of the app (routing,
  data flow, client/server boundary), API design (REST semantics, status
  codes, error shapes, idempotency), state management on the client, coupling
  between modules/files, and whether the architecture will scale gracefully
  as features are added.

- **Software engineering principles (SOLID, KISS, DRY, YAGNI)** — flag
  single-responsibility violations, unnecessary abstraction or premature
  generalization, duplicated logic that should be extracted (or extracted
  logic that's over-engineered for its one caller), speculative code paths
  for requirements that don't exist yet, and places where a simpler solution
  was available but a cleverer one was used.

- **Quality and DevOps engineering** — test coverage (or absence of it) and
  what's actually risky to ship without tests, error handling completeness
  (network failures, malformed input, race conditions), input validation and
  sanitization at trust boundaries, secret management and whether anything
  sensitive could leak into the client bundle or git history, deployment/
  rollback safety, and observability (can you tell what broke in production
  from what's logged/returned?).

- **UI/UX design** — accessibility (semantic HTML, ARIA where native
  semantics fall short, keyboard navigation, focus management in modals/
  overlays, color contrast), responsive behavior across viewport sizes,
  loading/empty/error states, feedback for async actions (is it ever unclear
  whether a click did anything?), and consistency of visual language across
  the app's surfaces.

### Process

- Read the actual code — don't infer from file names or assume best
  practices were followed.
- For each finding, cite the specific file and line/section, explain **why**
  it's a problem (not just that it deviates from a rule), and state the
  **concrete risk** if left unaddressed (a bug, a security hole, a
  maintenance trap, a broken user flow).
- Distinguish severity:
  - **Blocking** — will break in production or is actively insecure.
  - **Should-fix** — a real problem, not urgent.
  - **Worth considering** — stylistic or architectural opinion, lower
    confidence.
- Do not manufacture findings to pad out every category — if a persona has
  nothing significant to add for a given area of the code, say so briefly
  rather than inventing filler.
- Where a fix isn't obvious, propose one concretely (a code sketch, a
  specific pattern, a named alternative) rather than just naming the problem.
- Verify platform-specific behavior (routing precedence, redirect handling,
  API auth requirements) empirically where practical, rather than trusting a
  documentation summary alone — Cloudflare's docs (and third-party summaries
  of them) have repeatedly turned out incomplete or subtly wrong during this
  project's own build-out. A quick `curl`/`wrangler dev` check beats a
  confident-sounding guess.

### Output

Group findings by severity first, then by persona/domain within each
severity tier. End with a short prioritized punch list (top 5 things to fix
first) and one paragraph on what's already done well, so the review isn't
purely negative. Provide links/references where appropriate for further
reading.

---

## Part 2: Project-specific standards

Decisions already made in this project, with the reasoning — so a reviewer
(automated or human) doesn't flag them as problems, and so they don't get
quietly reversed without someone re-deciding on purpose.

### Tooling
- **pnpm, not npm/npx.** `pnpm install`, `pnpm exec <bin>`, `pnpm-lock.yaml`
  committed. New projects need an explicit build-script allow-list for
  packages with postinstall scripts (e.g. `wrangler`'s `workerd`) — pnpm
  blocks any dependency's install scripts by default unless allow-listed.
  This project's list lives in `pnpm-workspace.yaml`'s `allowBuilds` field
  (the current pnpm convention — `package.json`'s `onlyBuiltDependencies`
  is the older location and no longer where this repo's list lives).
  This is a real supply-chain control, not boilerplate: it's what stands
  between a compromised dependency and its postinstall script running
  arbitrary code during `pnpm install` — don't blanket-approve a package
  here without knowing why it needs to run a build script.
- **Feature branches + PRs, always** — no direct commits/pushes to `main`,
  even for small fixes, even from an agent. Merge only after review or
  explicit confirmation a dependent step (e.g. infra apply) succeeded.

### Infrastructure
- **All Cloudflare infra is Terraform-managed** — KV namespaces, the D1
  database, DNS, redirect rulesets, Turnstile, and anything else
  provisionable — declarative, repeatable, idempotent. The *only* thing
  that lives outside that: the logbook's actual data. See
  `docs/infra-architecture.md`.
- **Least-privilege token scoping**, split by resource type: most Workers/
  KV/R2/D1 permissions are Account-scoped only (no zone option exists);
  Workers Routes and DNS are Zone-scoped. Scope each permission row to the
  narrowest resource that actually has that option — don't default to
  "all zones"/"all accounts" out of convenience.

### Authentication

See [ADR-0002](adr/0002-replace-cloudflare-access-with-better-auth.md) for
why Better Auth replaced Cloudflare Access as the mechanism itself.

- **Better Auth sessions gate admin/write paths inside the Worker itself
  (#297)** — not a shared secret checked ad hoc, and not an edge-only gate.
  Read (public) and write (admin) endpoints still live on distinct path
  prefixes (`/api/logbook` vs `/api/admin/logbook`) — a holdover from this
  project's earlier Cloudflare-Access-gated design, kept because it's a
  clear, self-documenting split, not because anything still requires it.
- Every write endpoint resolves its session server-side
  (`server/lib/session.js`) and scopes the operation to that session's own
  `user_id` — the actual multi-tenant isolation boundary. Never trust a
  `user_id` supplied in the request body.

### Application code
- **Escape all user-controlled data before HTML interpolation.** Every
  field that can contain arbitrary text (name, place, area, notes, video
  URL) must go through an `escapeHtml()`-equivalent before landing in a
  template string bound for `innerHTML`. This project was built from scratch
  with this as a rule after an earlier stored-XSS finding — don't reintroduce
  raw interpolation as a shortcut.
- **Validate URL schemes server-side** for any user-submitted URL field
  (e.g. `video`) — restrict to `http:`/`https:`. Client-side validation
  alone is not a trust boundary.
- **If a shared-secret auth mechanism is ever reintroduced** (this app's
  original design had one — a shared `ADMIN_KEY` compared via an
  HMAC-signed session cookie — before it was replaced first by Cloudflare
  Access, then by Better Auth, which now gates all admin/write paths via a
  real in-Worker session check): use timing-safe comparison, never a plain
  `===`, on the token/key/signature, and rate-limit attempts against the
  endpoint that checks it. Not an active constraint on today's code —
  there is currently no secret comparison or login endpoint of this
  app's own to apply either rule to — kept here so the rule isn't lost if
  the auth model ever changes again.
- **Client-generated UUIDs for entity IDs**, not derived/slugified strings.
  A previous slug-based ID scheme caused a real desync bug between the
  offline queue and server-side collision-renaming; UUIDs make collisions
  vanishingly rare and let the server treat a duplicate-ID write as an
  idempotent replay instead of needing rename logic.
- **KV as a single JSON blob per logical resource** (not per-entry keys) is
  a deliberate tradeoff at current scale — cheap, simple, no pagination
  needed. Revisit only with actual evidence of scale (thousands of entries,
  concurrent-writer contention), not preemptively.
- **`Cache-Control: no-store`** on API responses backing frequently-mutated
  data — don't add caching back in without a measured reason.
- **Service workers must only cache `res.ok` responses** — caching a
  transient error response means that error gets served on the next
  genuinely-offline visit.

### Connectivity resilience

See [ADR-0006](adr/0006-design-for-poor-connectivity-first.md) for the full
decision and why it's an ongoing constraint, not a single shipped feature.

- **This app is built for bad connections, not despite them** — "signal at
  the crag is usually bad" (#111). That's the actual operating condition to
  design for, not an edge case.
- **Don't put a network request at the moment of interaction for something
  that could be available upfront instead.** A lazy/on-demand fetch (e.g.
  loading a dataset only when the control that needs it is opened) is the
  wrong tradeoff here even when it would save real bytes on the common
  case — it puts the network dependency exactly where it's most likely to
  fail: mid-interaction on a flaky connection, not at initial page load
  (which the service worker/offline queue already treat as the resilience
  boundary).
- **Prefer bundling small, static, rarely-changing datasets directly into
  the single-file app** (e.g. a country list) over fetching them on demand.
  If a dataset is genuinely too large to justify always-loading it, cache
  it after first load (service worker) rather than leaving it an uncached
  fetch-on-open.
- See #111 for the broader initiative (progressive/streamed data loading)
  this principle is part of.

### Accessibility
- Custom interactive elements (collapse toggles, sortable headers) need
  `role="button"`, `tabindex="0"`, and an Enter/Space keydown handler —
  not just a click handler.
- Modals need `role="dialog"`, `aria-modal="true"`, a focus trap, and
  Escape-to-close.
- Toggle/filter buttons need `aria-pressed` reflecting actual state.
- Don't reuse alarming "error" styling for a non-error empty state (e.g. "no
  results match your filters") — it reads as something being broken.

### Verification

See [ADR-0011](adr/0011-three-layer-test-pyramid.md) for the three-layer
test strategy (real-runtime Vitest, extracted-logic unit tests, Playwright
E2E) this section's manual-verification ask formalized into an automated,
CI-enforced check.

- For anything user-facing, verify in an actual browser (or `wrangler dev` +
  the preview tools), not just by reading the code — type-checking and unit
  tests confirm correctness, not that the feature works.
- For anything infra/platform-specific, verify empirically (a real request,
  a real deploy) rather than trusting docs alone.

---

## References

- [OWASP XSS Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html)
- [Cloudflare KV: how it works (consistency model)](https://developers.cloudflare.com/kv/concepts/how-kv-works/)
- [Cloudflare Workers Static Assets routing](https://developers.cloudflare.com/workers/static-assets/routing/)
- [WAI-ARIA Authoring Practices — Dialog (Modal)](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/)
- [MDN — SameSite cookies](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Set-Cookie#samesitesamesite-value)
