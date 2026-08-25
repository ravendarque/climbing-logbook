# 20. Beta environment: shared production data, tag-cumulative promotion, opt-in gate

## Status

Accepted

## Context

Today's pipeline (`docs/versioning.md`, `.github/workflows/deploy.yml`) has
no gate between "merged" and "live": a release-labelled PR merge tags
automatically, and that tag push deploys straight to production. There is
no point at which a change gets exercised by real usage before every user
sees it.

`#443` asked for a `beta.climbinglogbook.com` environment to fix this —
motivated primarily by risk mitigation (catch a broken feature before it
reaches everyone, important with just two people working on this, one of
them an AI agent) and secondarily by giving opted-in users early access as
a perk. It raised three open questions, resolved below: how promotion to
production is decided, how data is managed across the two environments,
and how access is controlled.

A related, separate idea (`#392`, per-PR isolated preview D1 databases —
today's PR previews share one DB, so whichever PR pushed most recently
"wins" the shared state) was initially assumed to be superseded by this
work. It isn't — `#392` is about isolating **PR preview** deployments from
each other; this ADR is about a **beta/production** split. They solve
different problems and both remain independently valid.

## Decision

### Data: one shared database, not a clone or sync

Beta and production point at the **same D1 database** — no separate beta
database, no periodic sync. This was the key simplifying call: the
alternative (beta on its own database) would mean beta's schema could
drift ahead of production's between promotions, exactly the failure mode
a staging environment should prevent, not introduce. With one shared
database, the *only* thing that differs between the two environments is
which Worker code is deployed — there is no "beta's schema is newer"
class of bug to design around, and users see their real, current data in
both places.

The corollary, explicitly accepted: **schema and infra changes are not
beta-gated.** Beta's job is catching UI/API/behavior regressions in
application code, not schema changes — those are trusted to be tested
before merge and ship straight through (see next section). Database
changes stay a real risk regardless of this environment split; this ADR
doesn't reduce that risk, it just doesn't pretend to.

### Deploy classification: auto-detected, not a manual label

Every release-labelled merge still tags exactly as it does today. What
changes is what that tag push triggers:

- If the diff between this tag and the previous one touches
  `migrations/**` or `infra/**`, the tag deploys **directly to both beta
  and production simultaneously** — the existing behavior, preserved, for
  the class of change that shouldn't wait. Deploying to both at once (not
  production alone) is what keeps beta from silently falling behind
  production on the commits that bypass it.
- Otherwise, the tag deploys to **beta only**.

This is auto-detected from the changed paths, not a new manual label —
objective, can't be forgotten, and matches the reasoning that a
schema/infra change going straight to production is a necessary
consequence of the change itself, not a per-release judgment call.

### Promotion: pick a tag, deploy it to production

A new `workflow_dispatch`-triggered workflow takes a tag input (default:
the latest tag) and deploys that exact commit to production. No new
mechanism is needed to "group" multiple accumulated beta releases into one
promotion — git tags in this repo are already full cumulative snapshots of
`main`, not deltas, so promoting the latest tag inherently includes
everything before it. This was the actual open question in `#443` ("what
if we want to group multiple releases") and it falls out for free from
how tags already work.

Two alternatives considered and rejected:
- A `beta`/`production` branch pair with promotion-as-merge — more moving
  parts (branch management, merge conflicts across promotion cycles) for
  no benefit over what tags already give for free.
- Cloudflare's native percentage-based gradual/versioned deployment
  (splitting traffic between two Worker versions by random sample) —
  doesn't fit; this needs an opt-in, per-user, dedicated-subdomain model,
  not random sampling.

### Access control: tri-state opt-in, gated subdomain, shared modal

`settings` gains a **tri-state** `beta_opt_in` column (never decided /
opted in / opted out — not a plain boolean, since "never decided" and
"explicitly declined" need different treatment at the gate below).

- **Account settings** gets a new card: title "Check our beta", body
  "Opt in to get early access to new features before they're released."
  Selecting it opens a consent modal with explanatory copy (what
  pre-release features mean, that they can opt out anytime), two
  mutually-exclusive choices ("Yes, I want to opt in to early access" /
  "No, I want to opt out of early access"), and a submit button to lock
  in the choice.
- That modal is a **single shared component** (`<beta-opt-in-modal>`,
  matching the existing reusable-overlay pattern `notes-overlay`/the
  citations overlay already establish), not duplicated between its two
  entry points.
- **Login-time redirect**: after a successful sign-in on
  `climbinglogbook.com/login`, a user with `beta_opt_in = true` lands on
  `beta.climbinglogbook.com/<username>` instead of
  `my.climbinglogbook.com/<username>`. `my.x` itself is untouched for
  everyone regardless of opt-in status — no added check on that hot path,
  the opt-in only changes where login lands.
- **The `beta.x` gate**: enforced server-side (`server/index.js`, same
  layer that already does session-based routing). A request to `beta.x`
  from a user whose status is `opted out` silently redirects to the
  equivalent `my.x` path — no repeat nagging for an already-declined
  user. A request from a `never decided` user gets served a minimal shell
  (header + the same `<beta-opt-in-modal>`) instead of the real page;
  submitting "Yes" records the choice and continues into the originally
  requested page, submitting "No" records it and sends them to the `my.x`
  equivalent. This is also why the popup, not a separate sub-page, was
  the right call — it lets a user who arrives at `beta.x` cold decide and
  continue in place, rather than bouncing them out to account settings
  and back.

Session cookies already work across this split with no auth changes:
`server/lib/auth.js` already sets the session cookie's `Domain` to the
bare apex (`climbinglogbook.com`) for any `*.climbinglogbook.com`
hostname, so a session established on `my.x` or the apex is already valid
on `beta.x`.

## Consequences

- New migration: `settings.beta_opt_in` (tri-state), plus the account
  settings card and the shared `<beta-opt-in-modal>` component.
- `wrangler.jsonc` gains a new `env.beta`, analogous in shape to the
  existing `env.preview` but routed at `beta.climbinglogbook.com/*` and
  sharing production's `LOGBOOK_DB` binding/id rather than a database of
  its own.
- `server/lib/auth.js`'s trusted-origins lists need `beta.climbinglogbook.com`
  added alongside the existing apex/`my.` entries.
- Infra: a new DNS record for `beta.climbinglogbook.com` (Terraform,
  `infra/`), and confirming the Turnstile widget's allowed domains cover
  it if server-rendered forms on `beta.x` invoke it.
- Two workflow changes: `deploy.yml`'s trigger logic gains the
  migrations/infra path-detection branch described above, and a new
  `promote.yml` (`workflow_dispatch`, tag input) is added.
- A schema/infra-path release bypasses beta's testing value entirely for
  that PR's application-code changes too, since code and migration ship
  together on that path. Accepted risk, per the same reasoning that
  motivated the auto-detected split in the first place — this doesn't
  change how carefully those PRs need to be tested before merge.
- This ADR doesn't resolve exact `wrangler.jsonc`/Terraform diffs, the
  modal's visual design, or workflow YAML — those are implementation,
  scoped as separate issues under `#443`.
- `#392` (per-PR preview DB isolation) is unaffected by this decision and
  remains open as its own, unrelated concern.
