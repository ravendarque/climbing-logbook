# Help content: voice, tone, and content shape

Reference for writing `/help` pages (#190), distilled from studying
[Ente's own help site](https://ente.io/help/) as a deliberate tone/layout
model (Raven's call, 2026-09-20) -- not to copy Ente, but to calibrate
against a real, working example of "friendly and approachable while still
professional" for exactly this kind of content (a small product's own
user-facing help/FAQ section).

## Voice

- **Answer first, explain second.** Every real answer opens with the
  actual answer in its first sentence ("You can install Ente Photos on
  your desktop by downloading the installer from our website"), then
  breaks into short numbered steps for anything procedural. Never lead
  with throat-clearing ("So you want to know how to...", "Great
  question!").
- **Second person, direct.** "You can...", "Your entry will...", not
  passive voice or third-person ("users can...", "the app will...").
- **No hedging, no apologies.** No "we think this should probably work",
  no "sorry for the inconvenience", no "please note that". State the
  behavior plainly, including its limits, without softening language that
  adds words but no information.
- **Warmth comes from small, real touches, not padding.** An occasional
  "Yes!", a genuine cross-link ("Learn more in Creating an account and
  logging in") that actually helps rather than pads out a see-also list.
  Not from friendly-sounding filler sentences.
- **Short, declarative sentences.** Procedural content breaks into
  numbered steps rather than a single dense paragraph describing a
  sequence.

## Content shape

- **One question, one focused answer.** Not a sprawling "everything about
  this topic" essay -- narrow, specific questions and answers, cross-
  linked to related ones rather than restating them inline.
- **Callouts for asides, not inline hedging.** A genuine caveat or
  platform-specific note (e.g. "requires macOS 13.3 or later") goes in a
  visually distinct callout, not folded into the main sentence with a
  qualifier.
- **Numbered steps for anything procedural**, prose for anything
  conceptual/explanatory. Don't force a conceptual explanation into fake
  steps, and don't leave a real sequence as an unbroken paragraph.

## What this project does differently from Ente, deliberately

- **No mascot/illustration.** Ente's duck ("Ducky") is a genuine brand
  device for them; this app's own brand voice (the header's own
  "LOG YOUR CLIMBS, VISUALISE YOUR PROGRESS (OR NOT)" dry humor) is
  already established and doesn't need a second, separate mascot.
- **No product-line split.** Ente's sidebar is organized by product
  (Photos/Auth/Locker) because they ship three genuinely separate apps.
  This app is one product -- the sidebar organizes by *topic*
  (Overview/Working offline/Adding climbs/etc.), not by a product split
  that doesn't exist here.
- **Flat, not deeply nested.** Ente's own sidebar goes topic → FAQ index
  page → per-subtopic answer page, three levels deep, because they have
  hundreds of real FAQ entries. This app's help section is starting from
  a handful of pages (#190's own "foundational pass, not complete" scope)
  -- one flat level (topic → page) is the right depth until real volume
  justifies adding a second one, not before.

## Applying this

When writing a new `/help` page:
1. State what the page is about in the first sentence, plainly.
2. Break any real sequence of actions into a numbered list.
3. Put genuine caveats/platform notes in their own short paragraph or
   callout, not folded into the main explanation with hedging language.
4. Cross-link to a genuinely related page by name, not with a generic
   "see also" pointing at the whole section.
5. Stop when the question is answered -- don't pad toward a "complete"
   feeling word count.
