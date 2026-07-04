# Climbing Analytics Research Brief

Research grounding for a future logbook reporting/insights feature (grade pyramid, strengths/weaknesses, drill-downs). This document is research and recommendations only — no implementation.

Status: Draft v1, compiled 2026-07-03.

---

## Executive Summary

The "grade pyramid" — a broad base of consolidated sends at lower grades narrowing to a small number of harder sends near a climber's limit — is a long-established, widely corroborated coaching heuristic (independently documented by Eric Hörst and by coach Kris Hampton of Power Company Climbing, among others) for diagnosing whether a climber is progressing sustainably or skipping the consolidation needed to climb harder grades reliably. It is a heuristic drawn from coaching practice, not a peer-reviewed clinical instrument, but it is corroborated across independent coaching sources and is broadly consistent with general sports-training principles of progressive overload and skill consolidation.

Sports-science literature on climbing performance is real but narrower than the coaching literature: peer-reviewed work consistently identifies climbing-specific finger/forearm strength, climbing-specific power, and climbing-specific endurance as the strongest measurable predictors of ability, while flexibility and general anthropometry are weaker and more conflicting predictors. Periodization is a mainstream, evidence-informed practice in climbing coaching, but there is no single validated periodization model specific to climbing the way there is in, say, track and field — coaches like Steve Bechtel explicitly argue for non-linear/undulating models because climbing's energy-system demands are acyclic. RPE (rating of perceived exertion) has been studied directly in climbers and shown to be a reasonably good proxy for physiological demand in advanced climbers but a poor one in lower-grade/less experienced climbers — an important caveat for any RPE-based feature. Session-RPE (RPE × duration) as a training-load method has been validated in climbing specifically, though how to handle rest intervals within that calculation is still an open research question.

For the candidate logbook fields, hold type, wall angle, and climbing style/technique are well-supported by both training literature and hold/movement taxonomy but should be treated as movement-pattern and terrain descriptors rather than validated predictive metrics on their own. Move count as a bouldering proxy and route length/clip count as a lead-climbing endurance proxy are logically sound and used informally in coaching practice, but we found no peer-reviewed validation of clip count specifically as an endurance metric — flag this as coach-practice-level evidence, not clinical evidence. Several additional fields — attempts-to-send, session RPE, rest interval, and injury/pain flags — are well-justified by the literature reviewed below and are recommended additions.

---

## 1. Grade Pyramid Methodology

### What it is and why the shape matters

A grade pyramid plots how many climbs (sends) a climber has completed at each grade over a given period, typically producing a triangular shape when a climber has "many easy sends narrowing to few hard sends." The underlying premise, repeated consistently across sources, is:

- A broad base at grades well below a climber's limit reflects consolidated technique, tactics, and physical capacity at that level.
- A narrowing pyramid toward the top reflects the natural reality that fewer climbs get done as difficulty approaches a climber's current limit.
- The pyramid is used as a **diagnostic**, not just a trophy case: coaches read the shape to infer whether a climber is training/climbing in a way likely to produce sustainable progress.

### The 8-4-2-1 heuristic

The most specific, citable version of this heuristic is a roughly 2:1 ratio between adjacent grade tiers, commonly expressed as "8 at the base grade, 4 at the next grade up, 2 at the grade above that, 1 at the project/target grade." This structure is independently attested in two separate reputable sources:

1. **Eric Hörst**, in *How to Climb 5.12* (and referenced in his later *Training for Climbing*), is widely credited as the originator of the route-pyramid concept for training planning, describing a base of roughly eight routes at a given letter-grade, narrowing through four and two routes at successive grades before a single send at the target grade.
2. **Kris Hampton** (Power Company Climbing, coaching since founding the organization in 2006, personal ascents to 5.14/V11) independently describes the same 8-4-2-1 structure in his article "Great Pyramids," explicitly framing it as: base = 8 climbs done in the past 12 months at a grade, next tier = 4, next = 2, top = 1.

Because this specific ratio appears independently in both an early foundational training text (Hörst) and a separate, unrelated coaching organization's writing (Hampton/Power Company Climbing) without one obviously being a copy of the other's specific framing, we treat the 8-4-2-1 structure as a genuinely corroborated coaching convention — **not** a scientifically validated ratio derived from data, but a heuristic two independent respected coaches converged on. Other sources (Send Edition, The Front Climbing Club, Elevated Adventurer, Prowess Coaching) repeat versions of this same ratio, which further indicates it is a widely-adopted industry convention rather than one person's idiosyncratic system — though these secondary sources are lower-tier evidence and we are not resting the claim on them.

**Caveat:** we could not find a peer-reviewed or data-driven study that validates 8-4-2-1 specifically (e.g., testing whether climbers who follow this ratio progress faster than those who don't). It should be presented to users as "a widely used coaching heuristic," not as scientifically proven.

### Diagnosing plateau, overreaching, and under-consolidation from pyramid shape

Coaching sources converge on the following qualitative interpretations, though none of them offer a precise, validated numeric threshold:

- **Under-consolidation / premature advancement ("overreaching" in the pyramid sense):** A pyramid that is thin or missing at intermediate tiers — e.g., a climber who has sent one route at their limit grade but very few at the grade(s) just below it — suggests they jumped to their hardest grade without building the base of technique/tactical experience that typically makes progress durable. Hampton's article explicitly frames the fix as bulking out the base and intermediate tiers before pushing the top again, and notes that skipping this step is a common reason climbers "spend months not getting better while banging their head" on a next-level project.
- **Plateau:** A pyramid that has a healthy base but has not grown a new top tier over an extended period (e.g., many sends at the same top grade, none higher) is read by coaches as a sign the climber has stalled — consistent with general plateau-diagnosis advice in the broader climbing-coaching literature, which frames a plateau as grades/strength/skills stalling despite continued training input.
- **Healthy progression:** New tiers appearing above the previous pyramid's apex over time, with the lower tiers continuing to broaden (not just the top climb changing), is the pattern coaches point to as evidence of genuine, sustainable improvement rather than a lucky one-off send.

**What the pyramid does NOT tell you (an explicit limitation coaches note):** the pyramid only reflects *sends*. It has no visibility into attempts, projects abandoned, or style-specific weaknesses unless the underlying data is broken down by style/angle/hold type as well — which is exactly why several sources (Power Company Climbing in particular) argue for pyramids segmented by climbing style, not just a single grade pyramid.

### A related, weaker data point: onsight-to-redpoint gap

Separately from the pyramid shape, analyses of the 8a.nu international climbing database (a large, long-running self-reported ascent log used across the climbing community) show that the gap between a climber's onsight grade (first-try, no prior knowledge) and redpoint grade (after practice/rehearsal) widens as climbers get stronger — roughly 2-3 letter grades at the 7a/5.11d level, widening toward ~4 grades at 8a/5.13b and above. This is a useful sanity-check metric (a logbook could compute "average onsight-to-redpoint gap" per climber) but it comes from a single data-analysis source layer (8a.nu's own reporting plus a derivative blog analysis, Climbstat), so we treat it as **suggestive, not settled** — flagged as weaker evidence below.

---

## 2. Training/Coaching Frameworks Relevant to Insight Generation

### Periodization

Periodization — structuring training into cycles that emphasize different qualities (strength, power, endurance) over time — is standard practice in climbing coaching, but climbing-specific literature diverges from classic linear periodization used in other sports:

- **Steve Bechtel** (Climb Strong; author of *Logical Progression: Using Nonlinear Periodization for Year-Round Climbing Performance*, with a second edition adding a "block programming" hybrid model) argues climbing's demands are acyclic — a single route can require endurance for many minutes and high-power moves in the same attempt — so he advocates non-linear periodization, alternating strength/power/endurance emphases within the same multi-week block rather than dedicating separate months to each quality in strict sequence.
- Multiple secondary training-resource sites (TrainingBeta, Rock Climbing Realms) describe periodization in climbing generally as the "systematic manipulation of load, volume, and intensity to hit peak performance at a predetermined time," consistent with general sports-science usage of the term, but climbing-specific applications remain coach-driven rather than governed by a single validated model.
- **USA Climbing's athlete-development materials** (part of the USOPC's broader Quality Coaching Framework / American Development Model) explicitly recommend periodizing training and rest to reduce overuse injury and burnout, and recommend age-appropriate periodization — this is an official national-governing-body coaching resource, though the specific document (Chapter 4 PDF) could not be fully retrieved for this brief (see Areas of Disagreement/Weak Evidence below).

**Implication for a logbook feature:** periodization is real and important, but the app has no visibility into a user's *training* (gym sessions, hangboard work, etc.) — only their *outdoor/gym send log*. Any periodization-related insight the app surfaces should be inferred cautiously from send patterns (e.g., "volume months" vs. "intensity/projecting months" visible in the log), not presented as if it knows the user's actual training plan.

### Volume vs. intensity

- In climbing-specific training literature (e.g., MaxClimbing's finger-training resources, echoing broader strength-and-conditioning principles), **intensity** is generally defined as a percentage of maximal capacity (how hard a given effort is relative to the climber's ceiling) and **volume** as the total amount of submaximal work performed. These are related non-linearly: small increases in intensity near one's limit produce disproportionately large increases in physiological/connective-tissue load.
- The practical coaching guidance is to vary one training variable (load, density/volume, or technical difficulty) at a time rather than increasing all simultaneously, and to build in deload periods — a mainstream strength-and-conditioning principle applied to climbing's connective-tissue-heavy injury profile (see Injury section below).
- For a send-log-only dataset, "volume" maps reasonably well to number of climbs/sessions in a period, and "intensity" maps to grade relative to the climber's current max — this is a reasonable basis for a volume/intensity insight, but it is a proxy, not the same thing as the load-based volume/intensity used in the strength-training literature (which is about training stimulus, not sends).

### RPE (rate of perceived exertion) in climbing

This is one of the few areas with a directly relevant peer-reviewed climbing study:

- **Gajdošík, Baláš & Draper (2020)**, "Effect of Height on Perceived Exertion and Physiological Responses for Climbers of Differing Ability Levels," *Frontiers in Psychology*, Vol. 11, Article 997. In a controlled study of 42 sport climbers split into lower-grade, intermediate, and advanced groups climbing an identical route on a treadwall vs. a real (high) wall, the authors found RPE (Borg 6-20 scale) correlated only moderately with physiological measures overall (R² = 0.14–0.45), and specifically that **RPE was a reasonably good proxy for physiological demand in advanced climbers but not in intermediate or lower-grade climbers**, who tended to over- or under-report exertion relative to their actual physiological load.
- Separately, the **session-RPE method** (RPE × session duration, a training-load method originally validated in other sports) has been the subject of climbing-specific validation research; one study found large-to-very-large correlations between session-RPE and heart-rate-based training load measures in climbers, supporting its use as a practical, low-burden load-tracking tool. However, the same body of research flags an open question specific to interval-style efforts (like redpoint burns with rest between attempts): **whether rest periods should be included in the session-RPE calculation is still unresolved in the literature.**

**Implication:** RPE is a legitimate, evidence-supported field to capture per session or per climb, but the app/feature should not overweight RPE-derived insights for lower-grade or newer climbers, per the Gajdošík et al. finding — their RPE is measurably less reliable as a fatigue/demand proxy.

### Plateau vs. genuine improvement

We found consistent qualitative guidance across coaching sources (Power Company Climbing, TrainingBeta-adjacent coaching blogs, sports-medicine-adjacent overtraining resources) but **no single peer-reviewed climbing-specific study** that defines a plateau with hard numeric thresholds. Consistent qualitative markers across sources:

- **Plateau markers:** grades/sends stall for an extended period despite continued training input; a pyramid that stops growing a new top tier; in more severe cases (overreaching/overtraining), elevated resting heart rate sustained over time, persistent soreness, sleep/mood disturbance, and declining performance despite continued hard training — these overtraining markers are corroborated across sports-science sources but are physiological/subjective signals a send-log app cannot directly observe.
- **Genuine improvement markers:** new pyramid tiers appearing above the previous ceiling over time, broadening of lower tiers (not just an isolated hard send), and a stable or improving onsight-to-redpoint gap.
- General sports-science guidance (echoed in overtraining literature) stresses that these markers should be read **relative to an individual's own historical baseline**, not absolute values — directly relevant to a personal logbook, which by definition only has one person's baseline to compare against.

### How climbing-specific coaching differs from generic strength-training analytics

Peer-reviewed and coaching sources converge on a few points that distinguish climbing analytics from generic strength/fitness tracking:

- **Finger/forearm strength dominates the performance-determinant literature** in a way not true of most sports. Multiple independent peer-reviewed studies found climbing-specific finger-flexor strength (tested via hanging from a small edge, e.g., 22mm) has very strong correlations with bouldering performance (r ≈ 0.89) and strong correlations with redpoint performance (r ≈ 0.67) (Buraas, Brobakken & Wang, 2025, *European Journal of Applied Physiology*). A large systematic review of 74 studies (Faggian et al., 2024, *Journal of Sport and Health Science*) corroborates finger-flexor strength, climbing-specific power, and climbing-specific cardiorespiratory endurance as the strongest, most consistently validated determinants, while flexibility and general anthropometry show weak/conflicting evidence — a separate principal-component analysis (Mackenzie et al., cited within that review literature) found flexibility was not a main determinant of climbing ability despite being commonly assessed.
- **Climbing performance is highly technique/tactics dependent in a way raw strength metrics don't capture** — this is the central thesis of Dave MacLeod's *9 Out of 10 Climbers Make the Same Mistakes* (2010), written by a climber who is also a sport scientist and coach (routes to 9a sport, 8C boulder, E11 trad). MacLeod's core argument, widely cited in the climbing-coaching community, is that most climbers plateau not from lack of physical training but from unaddressed technical/tactical errors and self-coaching blind spots — reinforcing why a logbook feature should surface *style and terrain* breakdowns (where sends/fails cluster) rather than only strength-proxy metrics.
- **Climbing training is inherently acyclic/mixed-energy-system** (per Bechtel, above), unlike sports with more uniform, repeatable efforts — this is why generic periodization models transfer imperfectly.

---

## 3. Recommended Logbook Schema Additions

| Field | Purpose | Justification / Source(s) |
|---|---|---|
| **Hold type** (crimp / sloper / jug / pinch / pocket / edge / sidepull / gaston / undercling) | Enables strengths/weaknesses breakdown by grip demand; directly relevant given finger-strength is the strongest single performance determinant in the literature | Standard climbing-hold taxonomy (multiple gym/coaching sources, e.g. Uncarved Block, PRG); grip-strength performance link supported by Buraas, Brobakken & Wang (2025, *Eur J Appl Physiol*) and the Faggian et al. (2024, *J Sport Health Sci*) systematic review |
| **Wall angle** (slab / vertical / overhang / roof) | Terrain/style breakdown; overhang and roof climbing shift demand toward power/lockoff strength while slab shifts demand toward balance/technique, per movement-pattern literature | Standard terrain taxonomy (multiple gym/coaching sources); consistent with MacLeod's (2010) thesis that plateaus are often technique/terrain-specific rather than general-strength-specific |
| **Move count (bouldering)** | Rough proxy for problem length/power-endurance demand, letting the app distinguish short-power boulders from longer link-up boulders | Logical proxy consistent with power-endurance concepts in climbing training literature (Bechtel; Hörst); **we found no peer-reviewed validation of move count specifically** — treat as coach-practice-level, not clinically validated |
| **Route length + clip count (lead)** | Endurance proxy for roped climbing, analogous to move count for boulders | Logical proxy, consistent with general framing that lead/sport climbing emphasizes endurance more than bouldering (multiple climbing-education sources); **no peer-reviewed study found validating clip count as an endurance metric specifically** — flagged as weak/practice-level evidence, include with that caveat |
| **Climbing style/technique** (static / dynamic-deadpoint / lockoff / kneebar / toe hook / heel hook, etc.) | Enables technique-specific strengths/weaknesses analysis, directly addressing MacLeod's technique-plateau thesis | Standard climbing movement taxonomy (multiple coaching/gym sources); supported indirectly by MacLeod (2010) and by performance-determinant literature showing technique/tactics matter alongside physical capacity |
| **Attempts-to-send** *(proposed addition)* | Core input for pyramid-adjacent diagnostics (e.g., onsight-vs-redpoint-style gap) and for distinguishing efficient sends from grindy ones — a strong signal of whether a grade is truly "consolidated" | Directly supported by the flash/onsight/redpoint distinction central to grade-pyramid practice (Hörst; Hampton/Power Company Climbing) and by 8a.nu-style onsight-to-redpoint gap analysis |
| **Session RPE** *(proposed addition)* | Training-load proxy, enabling volume/intensity and fatigue-trend insights over time | Validated in climbing specifically via session-RPE research showing large correlations with HR-based load; direct climbing RPE study (Gajdošík, Baláš & Draper, 2020, *Frontiers in Psychology*) — but flag reduced reliability for lower-grade/newer climbers |
| **Rest interval (between attempts/burns)** *(proposed addition, optional/low-priority)* | Could refine session-RPE-style load calculations for interval-style redpoint sessions | Motivated by session-RPE literature explicitly flagging rest-interval handling as an open research question — include as optional metadata only, not as a basis for firm conclusions, since the underlying method is unsettled |
| **Injury/pain flag** *(proposed addition)* | Enables correlating spikes in volume/intensity/grade with injury onset — directly relevant to overuse-injury prevention, the single most common climbing injury category | Supported by climbing-specific injury literature: finger flexor pulley injuries are established as the most common overuse injury in climbers (Miro, vanSonnenberg, Sabb & Schöffl, 2021, *Wilderness & Environmental Medicine*, 32(2):247-258), and general overtraining/overreaching literature stresses tracking relative to individual baseline |
| **Weather/conditions** *(considered, not recommended for v1)* | Could explain performance variance (friction/temperature effects on climbing) | Plausible physiologically (temperature/humidity affect friction and finger performance) but we did not find a climbing-specific peer-reviewed source quantifying this for outdoor logbook purposes within the scope of this research pass — **do not include as a justified v1 field; revisit with more targeted research if desired** |

---

## 4. Explicitly Flagged Areas of Disagreement or Weak/Anecdotal Evidence

Being direct about uncertainty, per the brief for this research:

1. **The 8-4-2-1 pyramid ratio is a coaching convention, not an empirically validated ratio.** It is corroborated across two independent, reputable coaching sources (Hörst; Hampton/Power Company Climbing) plus several secondary sources repeating it, which is reasonable grounds to treat it as a legitimate, widely-used convention — but we found no study testing whether climbers who structure training around this exact ratio progress faster than those who don't. Present it in-product as "a widely used coaching heuristic," not as science.

2. **Clip count and move count as endurance/length proxies are logical, not validated.** These are reasonable, low-risk fields to collect, but no peer-reviewed source in our search validated them as quantitative endurance metrics. They should be framed in the eventual feature as descriptive/contextual data, not as inputs to a scientifically-derived score.

3. **The onsight-to-redpoint gap data (8a.nu / Climbstat analysis) is a single data-analysis layer**, not a peer-reviewed study. It's a reasonable sanity-check metric but shouldn't be presented with more confidence than "community data suggests..."

4. **RPE reliability varies by climber ability level**, per Gajdošík et al. (2020) — RPE-based insights (including any derived session-RPE load metric) will likely be noisier/less trustworthy for lower-grade or newer climbers. Any eventual feature using RPE should account for or at least caveat this.

5. **Whether to include rest intervals in a session-RPE-style load calculation is an open question in the sports-science literature itself** (not just climbing) — don't build a feature that treats this as settled.

6. **USA Climbing's official athlete-development periodization document (Chapter 4 PDF referenced in search results) could not be fully retrieved** (403 error) for this brief — the periodization/rest recommendations attributed to USA Climbing/USOPC above are drawn from search-result summaries of that material, not a direct read of the primary document. If this becomes load-bearing for the eventual feature, it's worth re-fetching and verifying directly.

7. **Weather/conditions as a logbook field** is plausible on general physiological grounds (temperature and humidity affect friction and finger performance) but we did not find a climbing-specific peer-reviewed source in this research pass that quantifies this well enough to justify it as a v1 schema field. Not recommending it now; flagging as a possible future research item rather than baking it in on intuition alone.

8. **Performance-determinant variance figures are wide and study-dependent.** Different studies cite anthropometric/physiological factors explaining anywhere from ~39% to ~80% of variance in climbing ability depending on methodology, population, and which factors are included — this range itself signals the science is still maturing and single-number claims should be treated cautiously.

---

## 5. Full Source List

### Peer-reviewed journal articles

1. Gajdošík, J., Baláš, J., & Draper, N. (2020). "Effect of Height on Perceived Exertion and Physiological Responses for Climbers of Differing Ability Levels." *Frontiers in Psychology*, 11:997. https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2020.00997/full (also available at https://pmc.ncbi.nlm.nih.gov/articles/PMC7289971/)

2. Buraas, B. F., Brobakken, M. F., & Wang, E. (2025). "Climbing performance in males: the importance of climbing-specific finger strength." *European Journal of Applied Physiology*, 125(10), 2823–2830. DOI: 10.1007/s00421-025-05802-5. https://pmc.ncbi.nlm.nih.gov/articles/PMC12479556/

3. Faggian, S., Borasio, N., Vecchiato, M., Gatterer, H., Burtscher, M., Battista, F., Brunner, H., Quinto, G., Duregon, F., Ermolao, A., & Neunhaeuserer, D. (2024). "Sport climbing performance determinants and functional testing methods: A systematic review." *Journal of Sport and Health Science*, 14. DOI: 10.1016/j.jshs.2024.100974. https://pmc.ncbi.nlm.nih.gov/articles/PMC11904605/

4. Miro, P. H., vanSonnenberg, E., Sabb, D. M., & Schöffl, V. (2021). "Finger Flexor Pulley Injuries in Rock Climbers." *Wilderness & Environmental Medicine*, 32(2), 247–258. https://pubmed.ncbi.nlm.nih.gov/33966972/

5. (Referenced within Faggian et al.'s review and secondary summaries, not independently fetched in full — flagged as lower-confidence attribution) Mackenzie et al., principal component analysis of climbing performance determinants (shoulder power, pull-up capacity, flexibility) — cited via secondary sports-science search summaries. Treat this specific attribution as needing direct verification before being relied upon.

6. Session-RPE validation in climbing: a study titled "Monitoring training load in climbing: a validation of the Session RPE method" was identified via ResearchGate (https://www.researchgate.net/publication/390413878_Monitoring_training_load_in_climbing_a_validation_of_the_Session_RPE_method) — full author/journal/year metadata could not be confirmed from the search snippet alone; re-verify before citing with full confidence.

7. General session-RPE methodology background (not climbing-specific): "Session-RPE Method for Training Load Monitoring: Validity, Ecological Usefulness, and Influencing Factors." https://pmc.ncbi.nlm.nih.gov/articles/PMC5673663/

### Books

8. Hörst, E. J. *How to Climb 5.12* (source of the original route-pyramid training concept, per multiple secondary sources; specific edition/ISBN not independently verified in this research pass).

9. Hörst, E. J. (2016). *Training for Climbing: The Definitive Guide to Improving Your Performance* (3rd ed.). Falcon Guides. ISBN: 9781493017614 (per Amazon listing). No stable single-page URL; publisher/retail page: https://www.amazon.com/Training-Climbing-Definitive-Improving-Performance/dp/1493017616

10. Bechtel, S., Stewart, K., Snavely, Z., Ratz, M., & Watt, J. *Logical Progression: Using Nonlinear Periodization for Year-Round Climbing Performance*. ISBN: 9781544119533 (per Amazon listing). No stable single-page URL: https://www.amazon.com/Logical-Progression-Periodization-Year-Round-Performance/dp/1544119534 (Second edition also referenced: ISBN 9798645772505.)

11. MacLeod, D. (2010). *9 Out of 10 Climbers Make the Same Mistakes: Navigation Through the Maze of Advice for the Self-coached Climber*. ISBN: 9780956428103. Publisher page: https://www.davemacleod.com/shop/9outof10climbers

### Coaching organization / practitioner sources

12. Hampton, K. "Great Pyramids." Power Company Climbing. https://www.powercompanyclimbing.com/blog/2010/08/great-pyramids.html

13. Drolet, N. "Not All Pyramids are Built the Same." Power Company Climbing. https://www.powercompanyclimbing.com/blog/2020/5/6/not-all-pyramids-are-built-the-same

14. USA Climbing. "Education" (coaching resources landing page). https://usaclimbing.org/climb/education/ — and referenced Chapter 4 ("Contextual Fit") PDF, https://usaclimbing.org/wp-content/uploads/2021/07/Chapter-4.pdf (could not be retrieved directly in this research pass — 403 error; content attributed to it here is from search-result summaries only, flagged in Section 4).

15. Climb Strong (Steve Bechtel's coaching site/training-log product). https://www.climbstrong.com/

### Data-analysis / community sources (lower-tier, used only for the onsight/redpoint gap point, explicitly flagged as weaker evidence)

16. "Onsights up to four grades harder than redpoint." 8a.nu News. https://www.8a.nu/news/onsight-49849

17. "How much harder is onsighting vs redpointing?" Climbstat (data-analysis blog built on 8a.nu data). http://climbstat.blogspot.com/2020/02/how-much-harder-is-onsighting-vs.html

### Terminology / taxonomy references (used only for hold-type, wall-angle, and technique definitions, not for scientific claims)

18. "Understanding Climbing Hold Names: A Comprehensive Guide." Uncarved Block. https://www.uncarvedblock.com.au/blog/whatsinaname

19. "Understanding Different Types of Climbing Holds." Philly Rock Gym. https://philarockgym.com/understanding-different-types-of-climbing-holds/

20. "From Slab to Overhang: Decoding Climbing Styles." Stone Climbing. https://stoneclimbing.com/journal/from-slab-to-overhang-decoding-climbing-styles

21. "22 Essential Techniques Explained." Send Edition. https://sendedition.com/22-climbing-techniques-and-how-to-do-them/

22. "How To Toe Hook: The Most Misunderstood Climbing Technique." Power Company Climbing. https://www.powercompanyclimbing.com/blog/how-to-toe-hook

23. Glossary of climbing terms. Wikipedia. https://en.wikipedia.org/wiki/Glossary_of_climbing_terms (general reference/cross-check only, not relied on for any load-bearing claim)

---

## 6. Outline: What the Eventual Reporting Feature Should Surface

High level only — no implementation detail, per scope of this brief.

- **Grade pyramid chart(s):** overall pyramid across all climbs, plus the ability to segment/filter the same pyramid by type (boulder vs. lead), wall angle, hold type, or style — since coaching sources (esp. Power Company Climbing) emphasize that a single aggregate pyramid can hide style-specific weaknesses.
- **Pyramid health indicators:** visual/qualitative cues for a broad, filled-out base vs. a thin or gap-y pyramid, and tracking of the pyramid's shape over time (new tiers appearing above the prior ceiling = progress signal; stagnant top tier over an extended window = possible plateau signal) — presented as heuristic guidance, not diagnosis.
- **Strengths/weaknesses breakdown:** send/attempt/success-rate analysis cut by hold type, wall angle, and style/technique, directly motivated by the technique-plateau thesis (MacLeod) and by finger-strength/technique being the dominant performance determinants in the literature.
- **Onsight/flash-to-redpoint gap tracking:** using attempts-to-send data, surfaced as a soft, evolving personal benchmark rather than a hard target.
- **Volume/intensity trend view:** sends or sessions over time relative to the climber's current max grade, as a rough proxy for training-load balance — with an explicit caveat in-product that this is a send-log-derived proxy, not a measure of actual training stimulus.
- **Session RPE / effort trend (if session RPE is captured):** longitudinal view of perceived effort, with an explicit lower-confidence flag for climbers below a certain grade/experience threshold, consistent with the Gajdošík et al. finding on RPE reliability varying by ability level.
- **Injury/pain flag correlation view:** ability to see injury/pain flags overlaid against recent volume/intensity spikes, motivated by the overuse-injury and overtraining literature — framed as a pattern-noticing tool, not medical advice.
- **Drill-down/rollup filters:** by place/area, grade, type, wall angle, hold type, style, date range, and status (send/project/abandoned/wishlist) — enabling all of the above views to be sliced consistently rather than only viewed in aggregate.
