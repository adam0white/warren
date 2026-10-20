# Owner improvements, 2026-10-20

Scope: owner run `r-yzbd6wq2da`; acceptance is the three requested changes deployed at the pushed commit with `dirty: false`. Adam accepts the game by playing it (see design.md). Work stays on the current branch as requested.

1. Reproduce the private replay with `replay(seed, inputs, minute)` and compare its fingerprint. Capture the existing layout at 360×780, 412×891 and 1440×900.
2. Add failing regression tests for viewport fit with privacy controls closed and open, camera growth and manual control, and truthful progress guidance.
3. Make the game and privacy controls share the viewport. Let the scene resize when either changes. Derive the camera target from excavated space, interpolate toward it, and stop automatic movement after manual pan/zoom.
4. Keep the refuge purpose visible. Derive brief next steps and urgent blockers from present state, with a useful fallback between goals. Keep existing drawn jars, lamps, beds and people; add no counters.
5. Run the tests and capture screenshots. Obtain independent correctness and usability reviews. Record broader gameplay work in Deferred with target 2026-11-03.
6. Run `npm run check`, sign the commit with the required co-author line, push, run `npm run deploy`, then verify live release provenance and the three viewport sizes.

Constraints: Node ≥24 with /opt/homebrew/bin first; HF remains exactly 2.8.0; no simulation changes or new randomness; no edits outside this repository; exact PID only for process cleanup; signing stays enabled.
