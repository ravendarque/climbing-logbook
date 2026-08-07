# 3. Native Web Components for shared UI + multi-page route split

## Status

Accepted

## Context

#113 (public per-user profile pages) was built as a separate, static,
zero-JS SSR page — deliberately isolated from the real authenticated app,
which is a single large SPA bundle. This surfaced as architecturally wrong
once the login redirect bug was diagnosed: it exposed that #113 diverged
from the app's own original design intent, which was that the *same* URL
should show different capability depending on session state — logged out,
logged in viewing your own profile, or logged in viewing someone else's —
mirroring how the original single-user app already behaved, not a
separate read-only surface bolted on beside it.

Working through this in conversation surfaced several concrete problems
with keeping two separate pages (one read-only/static, one full-featured):

- **Duplication.** Every table, every rendering rule, every piece of UI
  the read-only page needs already exists in the full app — building it
  twice means maintaining it twice.
- **Divergence risk.** Two independently-maintained implementations of
  "render a logbook" will drift apart by accident over time, not by
  design — a fix or a new feature landing in one and not the other.
- **Read-only doesn't meaningfully reduce attack surface.** The public
  page still needs to serve real user data correctly; the actual
  authorization boundary is server-side (#297's session check), not
  whether the client happens to also have edit controls.
- **The app is built for poor connectivity as a first principle**
  (`docs/coding-standards.md`'s "Connectivity resilience" section,
  "signal at the crag is usually bad"). Loading the entire SPA bundle and
  all of a user's data for every visit — including a visit that only
  wants the map, or a visitor just glancing at someone's public
  profile — is exactly the kind of unnecessary-network-dependency this
  project already treats as a defect elsewhere. That cost only grows as
  more features are added to the single bundle.
- The existing tab bar and the (backlogged) footer share no controls
  today, so there's no structural reason the whole app has to live in one
  page beyond historical accident.

## Decision

**Shared UI: native Web Components (Custom Elements), light DOM — not
Shadow DOM, not a framework.** Zero new dependencies (this project already
avoids frontend frameworks and unnecessary supply-chain surface — see
`docs/ui-stack-evaluation.md`), and light DOM keeps Tailwind's global
utility classes working across component boundaries without a styling
bridge. Components extracted first: `<climbing-header>` (logo/title/
subheader), `<climbing-menu-bar>` (discipline picker + burger menu),
`<climbing-tab-bar>` (route-aware active tab), `<climbing-entries-table>`.
An update to one of these is automatically reflected everywhere it's used
— the actual fix for the duplication/divergence problem above.

**Route split for code-splitting**, not just component reuse: the
authenticated app splits into separate pages/bundles — `/log` (the
editable logbook), `/map`, `/performance` — each its own esbuild entry
point. Editing a climb doesn't load the map or performance reports; viewing
the map doesn't load the full logbook data. Valued more for JS-payload
reduction than data-payload reduction, since entries/places/locations
already cache to `localStorage` for offline support regardless of which
route loaded them first.

**Public vs. authenticated capability is resolved by session match at the
same URL shape** (`/:username`), not by routing to a different page —
this is the actual original design intent #113 diverged from. A visitor
with no session, or a session for a *different* user, sees read-only;
the profile owner's own session unlocks the full editable surface at that
same address. Zero-friction principle (stated explicitly during this
decision, not previously written down anywhere): a logged-in user hitting
apex root lands directly on their own full-featured page, ready to work,
with no extra click.

Scoped as its own epic, **#344**, deliberately separate from and not
blocking epic #8's remaining work — sequenced to start after #8 closes.
Sub-issues, dependency-ordered:

- Phase A — shared chrome: `<climbing-header>` (#345), `<climbing-menu-bar>` (#346)
- Phase B — route split: session/route authorization (#347), `<climbing-tab-bar>` (#349), splitting `client/main.js` into route bundles (#348), `<climbing-entries-table>` (#350)
- Phase C — rebuild the public `/:username` page on the shared components (#351)
- Phase D — zero-friction apex redirect + already-logged-in handling on `/login` (#352)

## Consequences

- One-time refactor cost (9 sub-issues) in exchange for eliminating the
  duplication/divergence risk identified above, and reducing per-route JS
  weight on the connectivity profile this app is explicitly designed for.
- `/edit` as a separate full-featured path (an earlier candidate discussed
  in the same conversation) was rejected — a user may only want to look at
  performance data, not edit anything, so gating "full featured" behind a
  literal `/edit` segment doesn't fit the zero-friction principle either.
- This is a genuinely separate epic from #8, not a subset of it — #8's own
  remaining scope (D1 cutover, Access removal, etc.) proceeds unaffected
  and unblocked by #344 being unstarted.
- No component library, no build-time templating beyond what esbuild
  already does — a future maintainer looking for "the framework" won't
  find one, by design.
