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

# Related work
I think we should make a decision on the grading scale we use. Currently we offer Font 5A, 5B,and 5C in Bouldering and I'm happy to stick with this but it does seem to be a departure from the information I can find online which has only 5 and 5+ at that grade. I want to be definitive in what we provide but I also don't want to confuse people if a location uses non-standard grading (like Magic Wood and Fontainebleau). We could simply provide both 5/5+ as additional text in the grade picker which might solve the issue in a simple way. I like this resource which covers all grades (including other scales that we will need to support in future) in a clear and engaging format: https://climbinghouse.com/grades-charts-conversion/