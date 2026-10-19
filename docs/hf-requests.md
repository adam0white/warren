# HF requests from The Warren (HF 2.8.0)

Found while building, 2026-10-19. Each says what is confirmed (measured or read in code) and what is assumed.

1. **Need terms are too small to drive work.** Confirmed: with advertised deltas of 0.1–0.6 on safety, competence, esteem or meaning, the `need:*` utility terms came out near 0.001, while effort cost was −0.14 to −0.36. Nobody dug or reaped until the host added `material`, a `goal` (`refuge`, advanced by dig, carry-spoil, carve-door, make-lamp) and an initial safety deficit plus a threat percept. Request: document the expected scale of need terms against effort, or give hosts one documented knob for "this work matters to this person" that is not money.

2. **Effort cost does not depend on duration.** Confirmed from the cost formula: `effortScale*((effort*0.1 + focus*sleepiness)*ease + effort*fatigue*(1-fitness))`. A 150-minute dig stint costs the same as a 30-minute one. Hosts lengthen activities to cut event cost, which silently makes work cheaper per hour. Request: a duration-aware option, or a note in the affordance docs.

3. **Cost per decision limits population at high speed.** Measured: about 4–10 ms per person per sim-day at 30-minute quanta (≈ 45 decisions per person-day, predict 0.06–0.16 ms each), so 60 people at a 1.25-second sim-day take about half a core. Assumed: phones are 2–3× slower. Request: a profiling guide (what dominates a decision) or a cheaper path for repeated identical offer sets.

4. **Community cache footgun.** Confirmed (a test caught it): `createCommunity(people, prior)` holds state that must be written back with `communityState` before a host switches to another state object or resets caches; otherwise the saved `community` is stale and a replay differs. Request: say so in the `createCommunity` doc comment, or make `snapshot`/`stepCommunity` keep the prior in sync.

5. **No notion of place or reach.** Assumed limitation, not a bug: `alongside` names companions but HF has no space, so a host computes paths, positions and "who can see this chalk". Fine for The Warren; noted for a future spatial helper (who perceives what within N steps).
