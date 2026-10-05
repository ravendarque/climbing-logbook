# 32. The combined view lives on the owner pages, not the public profile

## Status

Accepted (#465, 2026-10-05).

## Context

An owner has two ways to look at their logbook today:

- **The owner pages** (`/:username/log`, `/performance`), which log and analyse one discipline at a time.
- **The public profile** (`/:username` on `my.`), which shows every discipline combined, with a map.

Today the owner has no route between them, and can't see their own profile at all when it's private: the profile is deliberately session-free and 404s for a private logbook, whoever asks. Earlier work tried to give the owner a way into their own profile, which would have made the profile session-aware for the first time (#465, #1240).

There's also an orphaned per-discipline owner map, `/:username/map`. Its tab was removed in #637 and nothing links to it.

## Decision

**1. The combined view is an owner page, `/:username/view`.** The public profile stays as it is: separate and session-free. The owner gets to their own public profile only through the menu link in decision 7, and only when it's public.

**2. `/view` is one page with two tabs, Logbook and Map,** addressed as `/:username/view` and `/:username/view/map`. Both URLs serve the same shell. Switching tabs swaps panels in place and updates the URL, so the data loads once, the switch is instant, and Back and bookmarks still work.

**3. It reads the synced store on the device** ([ADR-0031](0031-owner-reports-from-the-synced-store.md)), the same as `/log`, so it works offline. A demo account reads the public endpoints, as demo `/log` does today.

**4. The discipline dropdown is where you switch.** It gains two headings that can't be selected: **Log**, over the disciplines, and **View**, over a new **Combined** option.

- Choosing a discipline goes to `/log` with that discipline. Nothing about logging a discipline changes.
- Choosing Combined goes to `/view`.
- Combined isn't remembered as a landing page: `/log` with the last discipline stays home, and choosing Combined doesn't change the saved discipline.

**5. `/view` has no editing.** There's no Add button, no edit icons and no Performance tab. Its filter is the combined-discipline filter the public profile already uses.

**6. Components are shared; their content comes from the page.** The table (its all-disciplines mode and combined filter) and `map-view` (all disciplines) are already shared with the profile.

The tab bar becomes a presentational control, on the same pattern as the burger menu. Each page supplies its tabs as markup through an include, as `menu-owned`/`menu-profile` do for the menu. The control lays them out, builds owner paths from the username in the URL, and marks the current tab from the location. It knows nothing about which page it's on, and has no page-specific branches. Page state that affects the tabs, such as Athlete Mode showing Performance, is applied by the page's own script to the markup it supplied.

**7. The menu gets "View public logbook"** with an outgoing-link icon, only when the logbook is public. It opens the public profile in a new tab.

**8. The orphaned `/:username/map` route is removed.**

## Consequences

- The public profile keeps its security-by-absence design, with no session code. The owner-can't-see-their-private-profile problem (#1240) doesn't need fixing: the owner's link to their profile only appears when the profile is public, so they never reach a private one.
- `/view` is added to `SHELL_PATHS`, so the service worker caches it and it opens offline like the other owner pages. `/map` comes out of `SHELL_PATHS`, the worker routes, the Vite entries and `_headers`.
- The tab bar's markup moves into page includes. Tab bar tests change from "renders these tabs for this page" to "lays out and marks whatever tabs it's given".
- The onboarding tour's combined-logbook and map steps move to `/view` and `/view/map`, and its private-logbook fallback goes.
- The View/Work terms describing profile and owner pages are retired. "View" is now just the dropdown heading over Combined.

## Implementation

Separate stories under this epic, roughly in order:

1. The tab bar as a presentational control, with tabs supplied per page.
2. The discipline dropdown's headings and the Combined option.
3. The `/view` page: the combined table and filter, reading the synced store.
4. The Map tab on `/view`, and removing `/:username/map`.
5. "View public logbook" in the menu.
6. Moving the tour's steps 4 and 5 to `/view`.
