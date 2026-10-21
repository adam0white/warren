# The Warren: design

**What done means.** For this first increment: a public, playable build at https://warren.adamwhite.work with a playtest export that replays, at least two playtest-and-fix rounds recorded verbatim in `docs/playtests/`, and an entry on https://human.adamwhite.work/games/. Adam (owner) accepts it by playing it. Later work goes in the Deferred list below, each item with a date.

## The idea

A plateau village digs a refuge into soft tuff, drawn in cross-section like an ant farm. The player keeps the dig-master's chalk and his bell. The people are full Human Framework persons (HF 2.8.0, exact pin). Nobody takes orders. They see chalked faces, lamps, marked rooms and doors as things they could do, and choose by their own needs, goals, habits, fatigue and fear. The only voice is the bell.

The ant-farm frame (actual ants) was rejected after an early consult with a game-design expert and a wildcard persona: it splits into two half-games and shows HF least. People underground keep the pull of an ant farm and let HF do the work. The setting is unnamed ("in the old days"), inspired by the underground cities of central Anatolia. Raiders are never named by people or era.

## Hooks map

Research: [research-hooks.md](research-hooks.md) ([S] sourced, [I] inference). Each hook, and the design choice that answers it:

| Hook | Choice in The Warren |
|---|---|
| 1. Watching the swarm work [S] | Everyone is visible at once in the cross-section; posture shows what they do (pick swung, load carried, lying asleep, leaning tired). Nothing is scripted; HF picks each action. |
| 2. Trails and indirect control [S] | Stigmergy, honestly. Chalk, lamps, room marks and doors change what people can do; they do not command. Feet wear the floor: worn cells are walked faster and decay ×0.9 a day (evaporation). A habit of digging forms over weeks (HF habits). Crews form because an offer names who is already doing it (HF 2.8.0 `alongside`). |
| 3. One-to-many power, without guilt [I] | Transformed rather than copied: these are named people. Danger is advertised (loose stone, smoke) and the people choose; the risk is theirs, not thrown at them. Infrastructure (lamps, doors, rooms) is the expendable part. |
| 4. Growth and the queen [S] | Yusuf Usta, 74, sits at the hearth and shows the young how to cut stone (the immobile anchor). Word spreads when the hill holds; families arrive if there are beds. Growth is capped at sixty souls. |
| 5. Cross-section, discovery, digging [S] | Unseen stone is drawn as plain rock until someone digs beside it. Hard bands, loose pockets, a water seam that becomes a well, an old chamber with soot and two lamps, the neighbours' passages. |
| 6. Wars between colonies [S] | Riders come at set seasons (smoke first, then the hill). The neighbours across the ridge have a store; a tunnel can reach it. Theft is a norm violation people weigh for themselves; if noticed, a grudge grows, they retaliate, then wall the passage, and word of the hill drops. |
| 7. Compounding, idle pull [S] | Automatic quiet playback; new words and arrivals stop fast batches for reading. Inspections and bell decisions wait. The saved hill waits while you are away. |
| 8. Stories you retell [S] | The journal records breakthroughs, finds, raids, refusals, habits and deaths in past tense. People answer the bell in their own words. |

**Naughty edges, by design, a little fun and inside the model:** crying wolf with the bell (false alarms make sheltering a poor outcome, so trust in the bell falls and later the bell is ignored); digging into the neighbours' store (above); peering into everyone's lives through the cross-section; overworking the diggers (fatigue builds over days in HF's slow store; tired people stop, slow down, or get hurt on loose stone).

**Natural difficulty first:** stale air beyond reach of a sky opening (no lamp burns, people avoid the face); darkness; spoil blocking faces until carried up; hard stone; loose stone that can fall; thirst and water carrying; the harvest and the winter; riders; crowding. No arbitrary caps beyond three doors.

## Core loop

1. Chalk stone beside open ground. Someone who sees it may take up a pick (within the hour in daylight).
2. The dug space opens; spoil piles up and is carried to the heap; feet wear the path.
3. Mark rooms (store, beds); grain and sleepers move below. Hang lamps where the dark stops the picks; sink a shaft where the air goes stale.
4. Smoke comes. Ring the bell, or not. Riders come down every opening to the sky, so each shaft dug for air is also a way in; a door below closes it. People shelter, shut doors, hide, or keep reaping.
5. The hill holds or it does not. Word spreads; families come; the warren must grow.

## How HF is used

- Every figure is a full HF `Person` (no lightweight agents), stepped with `stepCommunity` in 30-minute quanta.
- World callbacks offer real affordances with real paths (Dijkstra over the cross-section, costs from wear, light and spoil).
- Goals (`refuge`), material pay (`material` on work offers), `alongside`, habits, fatigue store, injuries, norms (theft, help) and a voice (`usta`, the bell) carry the behaviour. Psychological need terms alone are too small to drive work (see [hf-requests.md](hf-requests.md)).
- Faith stays quiet: devout adults keep a dusk prayer; it is a line in the journal, never a mechanic.

## Determinism, saves and export

- One seed; all randomness is hashed from the seed and the event. Inputs are logged at the minute they apply (always a quantum boundary).
- Saves: the full state as gzip in IndexedDB (a year with 60 people is several megabytes of JSON).
- Export (Game menu → Save and run → Download this run): seed, input log, state JSON and fingerprint. `replay(seed, inputs, minute)` reproduces the fingerprint (tested; a 365-day bot run matched).

## Performance (measured, M-series Mac, machine under heavy parallel load)

| People | ms per sim-day | Notes |
|---|---|---|
| 9 | 35–60 | first weeks |
| 35 | ~135 | day 120 |
| 81 | ~810 | before the population cap; now capped at 60 |

A pending raid warning holds playback until the keeper rings the bell or chooses Keep watching. Inspections hold time. Quiet playback runs at 72 game minutes per real second, and the first new note, arrival, departure or death stops the current batch for six seconds of reading time. These are UI playback changes; simulation quanta, state, inputs and exports stay unchanged. Keep watching lasts for the current sitting; resuming an unresolved raid shows its warning again.

The earlier gallop setting ran a sim-day in 1.25 real seconds; automatic quiet playback now takes 20 seconds before reading stops. The earlier CPU measurement does not describe the current pacing. The frame loop gives the sim at most 10 ms a frame; if it cannot keep up, time slows and the page says "the days pass as fast as they can". **Decision date for moving the sim to a Web Worker: 2026-10-26**, after phone playtests.

## Shelter and marks (round 4)

Check shelter opens the people sheet after the bell or during ordinary play. The same sheet is available through Game menu → people. It updates each living person’s current location against the existing rider-search geometry, their observed activity or trip, and their recorded answer to the latest bell. An unknown reason stays unknown. Hidden people are described as out of sight for now. Depth and shut doors limit the passages riders search; beds only make sleeping space. Open shafts remain entrances. Current checks do not reconstruct motives at a past injury.

Chalk uses a dashed excavation outline and a pick in previews and accepted marks. A successful mark says “Dig planned.” Sleeping marks report the connected room’s approximate capacity in words. Selecting beds and the people sheet also show the total marked capacity and whether it fits the living village. Raid guidance takes precedence. Capacity is space, not a promise of access, occupancy or protection. These are UI readings of existing state; simulation rules, HF pin, inputs and export format stay unchanged.

## Phone building and door inspection (round 5)

Selecting a building tool keeps the current camera fixed as the refuge grows. Prompt and warning text share reserved space, so changing tasks does not move the hill. Zoom + and Zoom − enlarge the working area around its centre, up to 72 CSS pixels per cell. Pinch zoom remains available. Fit hill explicitly reframes the excavated space. Look drags or two fingers move the view; no camera action enters the simulation input log.

The compact shelter button remains available during building and raid warnings. It opens the same live people sheet. Sleeping capacity and current exposure are counted independently; hiding is listed separately and never called safe. The sheet has a scroll body for touch and wheel, with close and tabs outside it. Updates only replace changed status text.

Look and Door show the full door explanation in a closable inspection card. Unfinished doors name the light and carving prerequisites. Rolled-back doors explain that the bell, smoke or riders make shutting it a choice for an adult nearby who can reach it. The keeper cannot roll it directly or guarantee that choice. The explanation updates while open. Inspecting another target closes it. These are UI changes; simulation sources, HF pin and export format remain unchanged.

## Design change 2026-10-20 (owner may veto)

Bao said, “I did not become bored. I became frustrated after the raid” and wanted to judge whether people were sheltered (F-246). Tunde could not discover how to close the door (F-254). Mirela said, “I do not know how to make this shelter safe enough before I call them in. I would not spend the rest of my break repeating the bell” (F-259).

The plan now shows draught hatching along the routes riders can search. Marked sleeping places can be inspected before anyone goes below. Their words distinguish shallow space, an open route, and a rolled-back door in the actual layout. The bell describes the sleeping places before calling people and distinguishes a standing call, continuing journeys and an ended call. A door names the reachable adults who could shut it and their current activity; nobody is ordered to do it.

New runs use **edition 0.3.0**. Their first raid is a scouting visit: no strikes, looting, trampled grain or extinguished lamps. The journal records actual searched places and names the exposed people who would have been caught. Those searched cells remain visible as pale tracks afterwards. Later raids keep the existing strike and theft rules. Existing HF healing is unchanged; injured people describe easing pain and a mended injury as it happens. These words do not award recovery or promise an adult's choice. Saves and exports retain their edition. Missing state edition means 0.2.0. Three-argument replay keeps its legacy contract; pass the export's `game` as the fourth argument to replay a versioned export.

Costs and risks: the first raid offers less material danger and can bring the existing successful-refuge consequences sooner. Hatching adds texture to a small plan; room words and the bell reading must stay legible on phones. Current exposure and historical scouting tracks differ when a door shuts or a new shaft opens. Plain-policy runs (seeds 1, 7, 19; 70 days) changed first-raid injuries from 1/8/6 to zero and second-raid injuries from 7/9/7 to 10/15/15, alongside larger populations. No retention or per-capita improvement is claimed. Headless runs measure injuries and village survival; they cannot establish whether a person would quit. Adam accepts by playing; a fresh source-unread retest is still needed.

Revert: new runs start on the previous edition by setting `DEFAULT_EDITION` in `src/sim/game.ts` to `'0.2.0'`. Keep both rulesets to continue existing 0.3.0 runs. Revert the UI changes in `src/ui/room-safety.ts`, `draw.ts`, `app.ts`, `shelter.ts`, `door-help.ts` and `guidance.ts` separately if the read-only cues are vetoed. Pre-change full-state hashes and checkpoint continuations are in `test/fixtures/edition-legacy.json`, captured from `172c384` before changing simulation sources.

## Clarity exceptions

- DL-27 updated 2026-10-21: resuming restores the saved minute. Offline catch-up was removed so it cannot pass a bell decision before the player sees the hill. Old saves, inputs, editions and replay quanta remain unchanged.
- DL-3 scene colours: chalk marks and lamp flames keep their material accent colour. Selection uses ordinary ink and a heavier ellipse; the current instruction uses the accent in the controls. Material colour does not mark selection.

## Deferred

- Reflow the play panel for very short portrait and landscape screens (target 2026-11-03; review measured almost no hill space at 320×568 and 690×360; the round-5 acceptance fixtures are 360×690 and 1280×800).

- Contain keyboard focus inside Game menu (target 2026-11-03; pre-existing issue found during F-233 review, beyond this round’s person-origin return fixes).

- Web Worker sim if phones lag at gallop (decide 2026-10-26).
- Collapsing infrastructure as the expendable part of "sacrifice without guilt" (2026-11-02).
- Lab client from npm instead of the release tarball, once the owner publishes `@adam0white/lab-client` (check 2026-10-26).
- Goals judged on outcomes (beds slept in, people below when riders came), food that can run short, and slowing the days for big finds such as water (2026-10-26; round 2 veteran).
- Mid-game events between raids (cave-ins on loose stone, quarrels) and a "while you were away" growth record for idle players (2026-11-02; rounds 1 and 2 idle testers).
- A tap with a drag-only tool says so (2026-10-26; round 3 check). Camera stability and explicit zoom addressed in round 5.
- The dig drawn as it happens (chips, a face that visibly gives) for younger players (2026-11-02; round 2 wildcard).
- Owner follow-up: make the wider gameplay arc clearer through lived outcomes (who actually sleeps below and returns after raids), work/refusal feedback, and pacing between raids; expand tool teaching and visible digging feedback beyond this brief guidance pass (target 2026-11-03; owner 2026-10-20).

## Follow-up b — 2026-10-20 (owner may veto)

The lead designer found the draught too faint at phone zoom, the sleeping-room reading covered its room, and faint text competed with the plan. Exposure now uses a pale continuous wash with long draught strokes, fading along the existing rider-search routes from entrances and shafts. Shut doors stop it. Protected passages stay darker and still; historical searches leave small floor tracks. Dark-theme figures and room marks use dark ink against the pale exposed floor.

Room and door readings replace the status copy beside/below the map. The map and tools retain their bounds, automatic framing stays fixed during inspection, and long readings scroll below the close control. The clock stays visible. Temporary hints join previews in the journal control rather than covering the plan. Opening shelter or the Game menu replaces the reading.

Cost: the compact reading requires scrolling for longer room and door explanations. The wash shows existing rider-search reach, not physical illumination, and historical tracks describe past searches. No simulation, edition, input, dependency or export rule changed. Revert this follow-up's UI hunks in `src/ui/draw.ts`, `app.ts` and `style.css`; retain the 0.3.0 ruleset. Adam's acceptance play and the lead designer's fresh source-unread retest remain acceptance work.

## Design change 2026-10-20 (owner may veto)

Follow-up c, after Kofi's live retest: a held chalk or beds stroke reads its estimated capacity and exposure before release. The dashed plan carries the same exposure wash. Look reads an unbuilt plan. These are hypothetical readings after all chalk is dug, not present sleeping places. Disconnected space is named as unreachable. The bell says its six-game-hour duration and observed expiry. Its live reading pairs named answers with actual journeys, current tasks and next choice times; a future choice remains uncertain. Immediate explanations open in the dock without line clamping. Last reading reopens them; bell readings resume live updates.

Kofi: “I left without confidence that I understood the warning, the call and shelter readiness together” (fresh retest `scratch/design-round/retest/warren.md`; no new ledger id assigned). His best moment was “finding Hasan actually carving the rolling stone”. This extends F-246/F-259's shelter/call readings and F-254's stable phone plan. The new information supports physical planning and visible work without directing a best move.

Costs: hypothetical excavation can open a route that is presently blocked; readings explicitly say “if dug”. A docked long reading scrolls, but its close control and the tools stay fixed. An assent is not a binding promise; timing names the next choice rather than inventing a departure. Prayer has no countdown. Rule results, editions, HF 2.8.0 and exports are unchanged. Revert this UI with the follow-up-c commit's UI/test changes; keep its live replay baseline as evidence. New runs remain 0.3.0.

### Follow-up d — edition 0.4.0

Mirela's quit was explicit: “I would not spend the rest of my break repeating the bell” (F-259). The ranked proposals in `fun-warren.md`, section 5, now change the rules for **new runs only, edition 0.4.0**. A call rung during smoke or riders stands until that raid's all-clear. Repeated rings during it are rejected before any interruption. HF still weighs the standing suggestion at later choices and reviews; people may refuse, defer or choose another activity. Quiet-time calls still expire after six game hours. Quiet-door help states that a false alarm can weaken trust.

A harmless scouting visit still records search tracks and named exposure. It awards neither `heldAt` nor defence reputation, and imposes no failed-defence penalty. A later real defence still earns the existing reward. During smoke or riders, sleep and shelter offers prefer an available protected bed, then the nearest by the existing weighted walking route. Protected-bed preference excludes stale-air routes and unreachable beds. Sleeping and sheltering journeys reserve the existing three places per bed cell; a person may retain their own place. With no such bed, ordinary sleep keeps its nearest available option and shelter can use other reachable breathable space. A full bed cell is excluded from the shelter fallback. The person still chooses whether to accept any offer.

Costs and risks: a longer suggestion can affect choices and learned trust throughout a raid, and removing the unearned scouting bonus can slow arrivals. Bed reservations can move someone to another place; present rider protection does not guarantee future protection if a shaft opens or a door changes. These are testable behavior changes, not evidence of greater enjoyment or retention. Room-safety cues and individual speech remain. Adam's acceptance play and a fresh source-unread retest remain outstanding.

Revert: new runs start on the previous edition by setting `DEFAULT_EDITION` in `src/sim/game.ts` to `'0.3.0'`. Keep all three rulesets so existing 0.2.0, 0.3.0 and 0.4.0 exports continue on their recorded edition. The exact HF pin remains 2.8.0. `test/fixtures/edition-before-d.json` captures the clean live f9550e8 bundle before simulation edits: 36 full-state hashes across prior editions, three seeds, plain/watch logs, day-20 checkpoints, loaded continuations and endpoints. `scripts/compare-editions.ts` compares unchanged bot/watch policies and a separately labeled renewal policy; full results and shipping receipts are in the external Follow-up d report.

## Design change 2026-10-20b (owner may veto)

Ines (F-275) asked: “Keep the immediate safety response visible: tell me how to protect these beds or shut this door before the panel cuts off.” She also asked: “Make it easier to select a person on the phone and tell me whether they need help” and “Acknowledge the storage designation directly, so I know whether my tap worked.”

The Warren adopts lab kit 0.2.0's phone stage. A fitted sheet occupies its own row below the scene; on desktop it docks beside it. The state strip keeps the date, current task, sleeping capacity and exposed count visible during inspection and marking. Bed and door remedies lead the reading. Door candidates and bell replies sit behind More or Replies; a person's activity and words sit behind their own labelled disclosure. Essential readings grow instead of scrolling inside a fixed text box. Bell, tools and the chosen speed remain in a separate commit row while marking. All inspection slows playback; closing it restores the chosen rate. This serves DL-13, DL-15, DL-22..25 and DL-30..31.

People opens a named selection list with at least 44 px targets. A selected person remains in the visible scene, including during a journey. Their card says whether food, water, rest or care is needed, without meters or claims about unknown motives. The body summary never contradicts known illness or poor health. Live updates preserve the open disclosure and focus. A successful storage mark says “Store marked. People can bring grain to these jars.” Repeating an unchanged mark says it is already a store. These are readings of existing state, not orders to a person.

Cost: a long reading leaves less hill visible; the ordinary phone fixture retains at least 120 px of canvas. Optional details and long people/journal/save lists scroll, while return controls remain reachable. At enlarged text (computed game type above 24 px) or below 600 px viewport height, the stage uses page flow with a 280 px scene. The strip then scrolls with the page so enlarged words and controls remain readable. Real-device reflow follow-up is due 2026-11-03. The phone audit flags offscreen list controls and geometric overlaps with the privacy footer; these controls are clipped by the scrolling list until scrolled into view, rather than covered visible targets.

Rules, simulation sources, HF 2.8.0 pin, save/export format and editions remain unchanged. Existing export and checkpoint replay tests remain exact. Chalk, rooms, lamps and doors remain direct acts in the scene (DL-32..33); this change adds no hands-on simulation verb or claim about retention. Release completion means checked UI, pushed main, matching clean live release metadata and green CI; Adam's acceptance remains his own play, as recorded above. Revert the shipping commit for this dated section to restore the previous UI and lab-kit pin. No save migration or simulation edition rollback is required.


**Round 2 (2026-10-20).** Yusra’s fresh retest of 6c00dab says “I had spent more time opening readings than carving rooms” and asks “Keep the place I am marking stable and obvious while I choose tools and read the result.” Her report has no ledger id yet; this extends the F-275 phone work and fun-warren §5 recommendations 1–2. The 360×690 working scene keeps the same position, scale and height across tools and readings. Excavation no longer reframes the camera automatically; Fit hill, zoom, gestures and explicit person selection change it. Every pressed cell gets an outline before release. Ordinary marks remain one gesture; a new surface entrance asks once in words, and cancel or another gesture discards that pending selection. Essential plan/bed/door readings are shorter. Compound plan conditions use compact counts; full route explanations sit behind Route details and remain available through Last reading. A complete named work sentence sits beside Open journal. Bed capacity updates in the same input as its reading. The journal starts with the complete newest safety entry, with earlier entries behind a labelled disclosure; changing tabs returns to the top. These serve DL-13–15, DL-22–25 and DL-30–33 without changing simulation, editions, saves or the HF pin.

Round-2 cost and revert: reserving the reading space keeps a 120 px canvas even when the reading is closed at 360×690; the 156 px strip and 320 px sheet stay fixed. Two Zoom + presses reach at least 44 px cells; deeper building may need deliberate Fit hill or pan. Very short/enlarged-text layouts retain page flow and the existing 2026-11-03 real-device follow-up. Optional lists and disclosures still scroll. Action availability is unchanged: seed 7, 301 one-second samples over five default-speed minutes each had a verified legal direct chalk action, longest sampled unavailable gap zero; replay 9f124635. This does not measure enjoyment or attention. Revert the Round-2 shipping commit to restore the preceding UI; retain edition 0.4.0 and HF 2.8.0. Adam still accepts by playing.

## Owner pacing update (2026-10-21)
The speed chooser is removed. Automatic playback stops at the first delivered event, waits for reading, and holds during inspections, information, menus and unanswered raid warnings. Menus preserve the remaining reading beat. The existing hill and route/door information remains in native dismissible information popovers; records of people and earlier events keep their gameplay disclosures. No simulation, edition, save format, tally or HF change. Adam accepts feel.
