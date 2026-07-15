# Overview
Currently we build the grade pyramid based on the highest recorded grade for each discipline. This actually doesn't work in certain scenarios and highlights a fundamental problem with how we are approaching it. Here's the example which started me thinking about this:

> In prod I have only two lead climbs in the past 12 months. They're both 5c. The message under the grade pyramid says 'No gaps in this window — every tier from your base to your max has sends behind it.' This is technically correct if we take the top recorded grade and work downwards - in this case the top recorded grade is also the lowest available grade. However it's not useful in terms of the pyramid itself, since it should show the missing tiers above which the climber should aspire to. 

So it feels like the pyramid should exist outside the data, and then we fill it using the data that we have recorded. The following Scenarios section demonstrates this approach using concrete examples.

# Scenarios
These may use specific disciplines as examples but they apply equally to all disciplines unless specifically stated otherwise. All three scenarios are facets of a complete approach and should be taken as a whole.

Note that I am using the following mappings when I discuss tiers:
- Tier 1/First tier = the top of the pyramid
- Tier 2/Second tier = second from the top
- Tier 3/Third tier = third from the top
- Tier 4/Fourth tier = the bottom of the pyramid
- Higher tiers = towards the top of the pyramid (higher grades)
- Lower tiers = towards the bottom of the pyramid (lower grades)
- 8-4-2-1 = in order of bottom (tier 4) to top (tier 1)

## Scenario A: Highest recorded grade down, pyramid incomplete (the current approach)
In this case, we construct the 4 tier pyramid from the highest recorded grade down, with tiers 2-4 visible but empty if there is no data, or partially filled is there is partal data. We message that the pyramid needs building up at the lower tiers.   

## Scenario B: Ready to push up
In this case all four tiers would be grades that we currently support (i.e. tier 4 would be at least a 5A/5c currently) and the top 3 tiers would be at the minimum required to push to a new grade (so 2 ascents at tier 1, 4 at tier 2, and 8 at tier 3). In this case, it would be visually appealing to move the pyramid up a level, dropping the current tier 4 off and adding the next, as yet empty, tier which should visually indicate that we have achieved what we need to break into the next grade. Colours (like gold) icons and messaging should all be very celebratory, like unlocking an achievement/next level.

## Scenario C: Building the foundations
This is where our pyramid approach falls over right now, since we currently base it on max recorded grade for tier 1 and then work downwards through only the supported grades. Let's say we have two entries only and they are both the minimum supported grade (currently 5A/5c): in this case we only display a single tier and message that the pyramid is complete. This isn't an 8-4-2-1 pyramid and is also not helpful as a coaching insight or visual indicator of what to do next. The handling of this scenario becomes a little complex and is likely an edge case but it is important to get it right, so let's break it down further:

With only those two lowest supported grade ascents, we should (but currently do not) show the full pyramid upwards from there. Tiers 1-3 will be empty at this point, dotted bands will still show 8-4-2-1 as will the expected counts on the right. However, with two ascents recorded at tier 4 and no other ascents, the climber is actually ready to push to the next grade and therefore the next tier of the pyramid. So the messaging and the visualisation should reflect that the climber is still building the foundations of their pyramid, but also combine that with scenario B where tier 3 actually has the achievement visualisation and messaging to show they are ready to push to the next level/grade. 

Once they have logged an ascent at tier 3, the messaging changes to continue building their foundation by adding two climbs to tier 4 and one to tier 3, then break into a new grade at tier 2, and so on until we have our complete pyramid, at which point we have transcended Scenario C. 

# Implementation approach

Scenarios A/B/C read as three separate cases, but they're one algorithm: a single promotion step layered on top of today's existing anchor (highest recorded grade with a send in the window), evaluated fresh from current data on every render. No new stored/sticky "promoted" state is needed — the moment a real send lands at or beyond a promoted tier, the ordinary max-anchored window picks it up directly and Scenario A resumes unassisted.

```
topIdx = maxSentIdx   // today's existing anchor, unchanged

// "Ready to push": check up to the top 3 real tiers below topIdx, each
// against the ideal ONE POSITION HARDER than its own slot (position 0 =
// hardest/tier 1 ... position 3 = base/tier 4, ideals [1, 2, 4, 8]). The
// same check whether 1, 2, or 3 real tiers currently exist below topIdx
// -- it just stops early once it runs off the bottom of the grade list.
function readyToPromote(topIdx):
  for pos in 0..2:
    gradeIdx = topIdx - pos
    if gradeIdx < 0: break                        // nothing more to check
    need = PYRAMID_IDEAL_BY_POSITION[pos + 1]      // shifted by one
    if counts[order[gradeIdx]] < need: return false
  return true

if topIdx < order.length - 1 and readyToPromote(topIdx):
  topIdx += 1   // promote once; a freshly-promoted tier is always 0
                // sends, so this can never cascade further in one render

// Display is always 4 tiers wide (when the list supports it), anchored so
// it never runs below index 0 -- this replaces today's clamp-and-truncate
// (the actual Scenario C bug) with clamp-and-extend-upward.
displayTop = max(topIdx, min(3, order.length - 1))
window = order[displayTop - 3 .. displayTop]
```

The single tier that gets the achievement/celebratory treatment (Scenario B and C's "ready to push" styling), if any, is exactly `topIdx` when a promotion happened this render. Every other empty tier above it is ordinary plain-aspirational, not celebratory — that distinction falls out of the algorithm rather than needing separate tracking.

## Truth table

Worked against Boulder's actual grade list (`5, 5+, 5A, 5B, 5C, 6A, 6A+, 6B, 6B+, 6C, 6C+, 7A, ...`, indices 0-20) and `PYRAMID_IDEAL_BY_POSITION = [1, 2, 4, 8]`.

| # | Scenario | Sends (last 12mo) | `topIdx` before → after | Displayed window (tier 4 → tier 1) | Outcome |
|---|---|---|---|---|---|
| 1 | Today's normal case, unaffected | 6B: 1, 6B+: 0, 6C: 0, 6C+: 0, 7A: 1 | 11 (7A) → 11 (no promotion — 7A has < 2 sends) | 6B+, 6C, 6C+, 7A | Same as today (Scenario A): gaps shown as ordinary missing tiers, no celebratory tier |
| 2 | B: full house, ready to push | 6B+: 8, 6C: 4, 6C+: 2 | 10 (6C+) → 11 (7A) | 6B+, 6C, 6C+, **7A (celebratory, 0 sends)** | Old tier 4 (6B) dropped, new empty tier 1 (7A) added with achievement styling |
| 3 | C: minimal, single base tier | 5: 2 | 0 (5) → 1 (5+) | **5 (real, 2/8)**, **5+ (celebratory, 0/4)**, 5A (plain, 0/2), 5B (plain, 0/1) | The reported bug's fix: full 4-tier window shown from the base up, not a 1-tier "complete" pyramid |
| 4 | C: growing, real send lands on the celebratory tier | 5: 2, 5+: 1 | 1 (5+) → 1 (no promotion — 5+ has < 2 sends) | 5 (2/8), 5+ (1/4, now real — no longer celebratory), 5A (plain), 5B (plain) | Back to ordinary Scenario A per point 3 — no un-promotion logic needed, the anchor just moved |
| 5 | C: more volume at the base only | 5: 5 (no other sends) | 0 (5) → 1 (5+) | 5 (5/8), 5+ (celebratory, 0/4), 5A (plain), 5B (plain) | Same result as #3 — extra sends at a lower tier widen that bar but don't change which tier is aspirational |
| 6 | Skipping a tier entirely | 5: 2, 5A: 1 (5+ has 0) | 2 (5A) → 2 (no promotion — 5A has < 2 sends) | 5 (2/8), **5+ (0/4, ordinary gap — not celebratory)**, 5A (1/2), 5B (plain) | Per point 3: a real send beyond the aspirational tier means it's sandwiched by real data and reverts to an ordinary missing-tier gap, not a celebration |
| 7 | Already at the hardest supported grade | 8B+: 1 (plus a filled window below it) | 20 (8B+) → 20 (guarded: no grade left to promote into) | 8A, 8A+, 8B, 8B+ | No promotion ever triggers past the top of the list, matching Scenario B's "grades we currently support" constraint |

Edge case worth noting rather than a full row: a discipline list shorter than 4 grades (neither Boulder's 21 nor Lead's 14 are anywhere near this today) degrades gracefully under the same clamps (`min(3, order.length - 1)`), just showing fewer than 4 tiers — no special-case code needed.

# Related work
I think we should make a decision on the grading scale we use. Currently we offer Font 5A, 5B,and 5C in Bouldering and I'm happy to stick with this but it does seem to be a departure from the information I can find online which has only 5 and 5+ at that grade. I want to be definitive in what we provide but I also don't want to confuse people if a location uses non-standard grading (like Magic Wood and Fontainebleau). We could simply provide both 5/5+ as additional text in the grade picker which might solve the issue in a simple way. I like this resource which covers all grades (including other scales that we will need to support in future) in a clear and engaging format: https://climbinghouse.com/grades-charts-conversion/

Tracked separately in #129 — Boulder's picker already offers both notations today (`5`, `5+`, `5A`, `5B`, `5C` all map to V0-V2), so the actual question is whether to combine them into fewer, unified labels, pending a reliable conversion between the two scales at this band.