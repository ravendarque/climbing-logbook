# 29. Beta channel: two-state enrollment, checked on the page, one channel per origin

## Status

Accepted. Partially supersedes
[ADR-0020](0020-beta-environment-shared-data-tag-promotion.md): its
"Access control" section (tri-state `beta_opt_in`, the server-side
`beta.x` gate, the forced opt-in modal, and the unconditional login-time
redirect) is replaced by this ADR. The rest of ADR-0020 (one shared
database, auto-detected deploy classification, tag promotion) is
unaffected and still holds.

## Context

ADR-0020 gave the beta channel (`beta.climbinglogbook.com`) a tri-state
`settings.beta_opt_in` (never decided / opted in / opted out) and enforced
it on the server. `handleBetaGatedRoute` (`server/api/owned-routes.js`)
does one of three things for a `beta.x` owner page:

- opted out: 302 to the equivalent `my.x` path;
- never decided: serve the `/beta-gate` shell with a non-dismissible
  `<beta-opt-in-modal>`;
- opted in: serve the real page.

Joining happens through the same modal, opened from a "Check our beta"
row on the account hub. After sign-in, the apex login sends every opted-in
user to `beta.x`.

Four things make this model wrong for where the app is going (#950):

1. **A server-enforced gate stops running once pages come from a service
   worker.** Epic #945 makes owner pages open offline by serving their
   shells from the worker's cache, so a navigation to `beta.x` no longer
   reaches `handleBetaGatedRoute`. An opted-out user with a beta bookmark
   or installed beta app would keep landing on beta indefinitely.
2. **Enrollment isn't a security boundary.** Beta and production share one
   database (ADR-0020), and the API is not enrollment-gated.
   `beta_opt_in` is only read by `server/index.js`, `owned-routes.js` and
   `settings.js`. The gate decides which build of the UI someone sees,
   nothing more, so it doesn't need to be enforced where security
   decisions live.
3. **An installed PWA belongs to one origin.** An app installed from
   `my.x` always opens `my.x`, and opting in can't change that. App pages
   currently send users to the **apex** login, which is outside an
   installed app's scope. On iOS, home-screen apps keep their own cookie
   jar, separate from Safari ([WebKit bug
   181849](https://bugs.webkit.org/show_bug.cgi?id=181849)), so a login
   that leaves the app may never reach it (spike #957, Q1; unverified on
   a device because none is available). The apex's opted-in redirect also
   throws a prod-app login onto beta.
4. **The states and the modal don't match what was wanted.** Raven: the
   "never decided" state, and "opted-out users never see the beta
   sign-up", weren't part of the original requirement. A modal also has
   no room to explain what joining really means: a different address, a
   separate installed app, a first-time sync on each device, and data
   that is shared with the main app.

## Decision

1. **Two states: enrolled or not enrolled. Everyone starts not
   enrolled.** The "never decided" state is removed: existing nulls
   become "not enrolled", and `betaOptIn` is always a boolean.
2. **Enrollment is checked in one place: the boot of a beta owner page.**
   On `beta.x`, every owner page reads the enrollment flag synchronously
   from locally cached settings before its data layer starts:
   - enrolled: boot normally;
   - not enrolled: show "Beta is for enrolled users", linking to
     `my.x/:username/account/beta`, and don't start the data layer.

   The page's existing non-blocking settings fetch corrects the cached
   value when it returns. This works offline and never blocks the chrome
   (ADR-0023). The server serves `beta.x` owner routes exactly like `my.x`
   (session and ownership check only). `handleBetaGatedRoute`, the
   `/beta-gate` shell, `client/beta-gate-main.js` and the forced modal
   are deleted.
3. **The channel is whichever address or app you open.**
   - `my.x` never redirects to beta.
   - **App pages log in on their own origin** (`my.x/login/`,
     `beta.x/login/`) and come back to the page they came from through a
     same-origin `returnTo` path, so a login never leaves an installed
     app.
   - The **apex** login (`climbinglogbook.com/login/`) keeps sending
     enrolled users to beta and everyone else to prod. That's the
     automatic channel choice for browser users who start there.
4. **Beta and prod can be used side by side.** They are separate origins,
   so each has its own service worker, caches, local data and offline
   queue. They behave like two devices, reconciled by the existing delta
   sync (ADR-0019). Beta is installable as its own app, **Logbook Beta**,
   with its own name, icon and theme colour, and a visible beta badge in
   the header, so the two can't be confused. Its app identity comes from
   its origin: both manifests say `id: "/"`, which resolves to a different
   app on each host (#956 checked Chromium's app IDs). Keeping `/` means
   beta installs made since #949 pick up the new name and icon rather
   than becoming orphaned.
5. **Joining and leaving happen on a My account sub-page**
   (`/:username/account/beta`). It gives a concise explanation of the
   consequences and an explicit confirm, and links to a full help page
   (`/help/beta-channel/`). The hub row becomes a link to it.
6. **No cross-device queue detection.** An offline device can't tell the
   server it has unsynced changes, so this can't be solved. The sub-page
   warns about *this* device's queue (the one thing it can see), and the
   help page tells users to sync every device before switching.
7. **Keep it simple.** Joining is a conscious, active choice, so a cold
   sync the first time beta is used on a device is acceptable. No
   migration of local data between origins.

Alternatives considered:

- **Keep the server gate and make the worker ask the server.** That
  reintroduces a network dependency on every beta launch, against
  ADR-0006, and breaks offline. Rejected.
- **Clean up on opt-out** (unregister the beta worker, clear its caches
  and data, redirect). It only works for opt-outs made on `beta.x`, since
  an opt-out made on `my.x` can't touch `beta.x`'s storage. The page-boot
  check handles both cases with one mechanism. Rejected as needless.
- **Serve both channels from one origin** so an installed app could
  switch channel. It needs per-user routing between Worker versions on a
  single hostname, which is unverified on Cloudflare and far from simple.
  Rejected.
- **Stop the apex redirecting enrolled users to beta.** It would be
  simpler, but Raven wants browser users who log in at the apex to land
  on beta automatically. Same-origin app login gives both: automatic beta
  for apex logins, and an app that always returns to itself.

## Consequences

- `server/index.js`'s `beta.x` branch collapses to the same owned-route
  handling as `my.x`. The gate code, shell, bundle, fixture and e2e spec
  go (#952). The sign-up invite gate (ADR-0014/ADR-0016,
  `server/lib/beta-gate.js`) is unrelated and untouched.
- A user who leaves the beta but still has Logbook Beta installed sees
  the "not enrolled" message there, not a redirect. The help page tells
  them to uninstall it.
- Devices running both apps hold two local copies of the logbook and two
  offline queues. That's accepted at this app's data sizes, and it's the
  same situation as using two devices.
- The same-device queue warning is advisory only. Syncing other devices
  before switching is left to the user, and the help page says so.
- App-page logins move from the apex to the app's own origin. The
  `returnTo` check becomes a same-origin path check (#955), not a
  cross-origin allowlist. Session cookies are already set on the apex
  domain for every subdomain (`server/lib/auth.js`), so nothing changes
  there.
- Implementation is tracked in epic #950: #952 (two states, page check,
  gate removed; must land before the service worker runtime #947), #953
  (sub-page), #954 (help page), #955 (same-origin login), #956 (Logbook
  Beta app).
- Relates to [ADR-0028](0028-service-worker-owns-the-owner-app-shell.md)
  (being written under #946), whose cached owner shells are the reason
  the gate has to move client-side.
