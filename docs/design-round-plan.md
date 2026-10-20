# Room safety and first-raid edition implementation plan

Goal: let the keeper judge a sleeping place before ringing, read a continuing call and door task, and learn from a first raid without injuries.

Spec: design change supplied 2026-10-20; common brief in the Human Framework design-round scratch directory. Adam accepts by playing. Fresh source-unread testing remains separate from builder checks.

Architecture: UI safety reads the existing rider-search geometry without changing state. New runs use edition 0.3.0. Missing edition means legacy 0.2.0; legacy states acquire no new fields. Exports and replay carry the edition explicitly. HF remains exactly 2.8.0.

- [x] Capture full-state fingerprints on unmodified 172c384 for seeds 1, 7, 19 under plain building and watch-only policies, through two raids. Capture a day-20 checkpoint and two-day continuation for each.
- [x] Test edition-specific first raid, later injury, recovery words, legacy replay/load/export/continuation, and new-edition replay. Add optional edition and scouting state, keeping the legacy branch identical. New edition suppresses strikes in raid one, records reached cells and named exposed people, and records recovery in their own words using existing HF healing.
- [x] Add drawn exposure and room-specific inspection, pre-bell sleeping-space reading, current call state, and named eligible door workers with their observed activity. Test geometry, copy and DOM. Render before/after at 360×690 touch and 1280×800.
- [x] Measure the same plain policy for old/new editions across seeds; report injury counts per raid, deaths and whether the village was lost. Bots cannot establish player quits; record quits as unmeasured.
- [x] Independent reviews cover replay/rules and UI accuracy. Fix verified findings. Run npm run check, sign commit, push main, use npm run deploy, verify release HEAD/dirty, green CI and live phone render. Write the requested report.

Review focus: unversioned exports replay legacy; closed doors cannot promise protection behind a bypass shaft; scouting highlights record actual historical reach; an expired bell is distinct from continued shelter travel; door eligibility matches adult, distance and reachable-path rules. Existing saves must retain every legacy fingerprint.

Revert: set DEFAULT_EDITION in src/sim/game.ts to '0.2.0' for new runs; existing 0.3.0 runs stay on their edition. Revert UI files for the read-only cues separately.

Execution: the supplied design authorized implementation and shipping. Two independent reviews found false single-door protection, forgotten bell history, whole-part healing copy and an injury metric label; regression tests and the comparison report address these. Final release and CI receipts live in the requested external round report. Adam’s acceptance and the fresh player retest remain outstanding.

## Follow-up b — UI only

Spec: lead designer review in `brief-warren-b.md`. Implementation and independent review complete. Shipping receipts are recorded in the external worker report after deployment. Adam's acceptance play and a fresh source-unread retest remain owner/lead acceptance work.

- [x] Make the current entrance/shaft exposure pale and legible at default phone zoom, fading by existing route depth and stopping at shut doors. Keep protected passages still and darker; historical tracks never imply current exposure. Test canvas geometry and contrast in both themes.
- [x] Dock room/door readings in the existing status space, retaining the map and tool positions. Freeze automatic framing during inspection. Test room visibility, scrolling, close/focus and transitions to other sheets on phone and desktop.
- [x] Keep previews and temporary hint text in the journal control, never over the plan. Test actual DOM placement and canvas text.
- [x] Capture both themes at 360×690 and 1280×800 with `-b` suffixes and review independently. Add frozen pre-follow-up 0.3.0 full-state hashes for seeds 1, 7, 19 with plain/watch input logs; retain all legacy fixtures.

Shipping procedure: run `npm run check`, commit with Codex trailer, push main, deploy, and verify live release and green CI. The external report records the final outcome and commit. Two reviewers found no blocking defect; both requested regression coverage (direct room-to-shelter replacement and retained historical tracks), which was added. The full check also caught a 320px map-height regression from excess reserved status space and a stale `.hint` test selector. The reserved space now uses its natural 120px minimum; the first-minute test reads guidance in the journal control.

Ruling: reuse the status area for inspection rather than shrink the map when the card opens. The clock remains visible below it. This preserves the tapped room and building controls; longer explanations scroll inside the reading.

## Follow-up c — live retest, UI only

Acceptance: Adam and the lead designer. Shipping status and receipts are maintained in the external round report. Done means the three requested UI changes, regression checks, real phone/desktop renders, exact legacy/current replay, a signed pushed commit with Codex trailer, deployed HEAD/clean release and green CI. Adam and the lead designer accept the experience; fresh source-unread play remains separate.

- [x] Read fresh Kofi retest and common rules. No fun-warren.md existed at task start.
- [x] Render held chalk/bed safety and rough capacity; inspect committed unbuilt plans without changing the simulation.
- [x] Show six-game-hour call duration and lapse reason, plus named observed travel or next-choice timing. Preserve autonomy and quiet faith.
- [x] Put immediate feedback in the dock and retain Last reading. Keep map/tools stable, full text scrollable, live readings recoverable and scroll position stable.
- [x] Freeze actual live 0.2.0/0.3.0 downloads, including mid-run continuations; verify exact replay after UI changes. All 36 live state hashes matched; the regression suite repeats the comparisons.
Shipping procedure: complete final checks and independent reviews, retain phone/desktop renders, commit/push/deploy, then record live/CI receipts in the external report. The two reviews found and resolved live bell scroll reset and stale reopened bell state.

No simulation or dependency changes. Revert the follow-up UI commit's UI/test edits to restore prior behavior. Retain frozen baseline receipts.

## Follow-up d — edition 0.4.0

Spec: `fun-warren.md`, section 5, ranked changes 1–3, explicitly authorized with main/push/deploy. Done means the three rules ship as new-run edition 0.4.0 with exact 0.2.0/0.3.0 live hashes, tests, measurements, phone/desktop renders, signed commit, clean live HEAD and green CI. Adam and the lead designer accept by playing; retention remains unmeasured.

- [x] Capture the actual f9550e8 live bundle and exports for both prior editions, seeds 1/7/19, plain/watch logs, checkpoint/continuation/end before editing simulation sources.
- [x] Write failing acceptance tests for a smoke-time call through all-clear, rejected renewal without interrupts, continued personal refusals, quiet false alarms, and door cost. Implement the edition branch and edition-aware call words.
- [x] Write failing scouting reward and later real defence tests. Skip both reward and penalty for harmless scouting in 0.4.0; retain its exposure record.
- [x] Write failing sleep/shelter destination tests for protected beds, nearest route, occupancy, stale air, shut doors and shafts. Prefer protected reachable breathable available beds during real danger. Keep HF choice, other offers and legacy branches intact. Avoid full/stale bed fallback for new shelter offers.
- [x] Compare fixed policies on 0.3.0/0.4.0, measuring raid injury events, bell inputs and actual protected-bed shelter/sleep occupancy. Add a separately labeled renewing policy to measure call maintenance; retain unchanged bot and watch controls.
- [x] Run independent correctness and acceptance reviews. Resolve verified findings. Current-raid wording now precedes a past all-clear; a real HF trace proves late-review refusal; quiet-door cost precedes the ring instruction. Render and inspect phone and desktop fixtures.

Shipping protocol: `npm run check`, signed commit with Codex trailer, push main, deploy, verify release HEAD/dirty and CI, save live phone render. The external Follow-up d report owns the final check counts and shipping receipts.

Revert: set `DEFAULT_EDITION` in `src/sim/game.ts` to `'0.3.0'` for new runs; keep all edition branches for existing exports. No HF dependency change. Working in the explicitly requested main checkout. The user supplied the design and shipping acceptance, so implementation proceeds without another approval gate.
