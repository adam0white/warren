# The Warren: design

**What done means.** The first increment ends with a public playable build at
https://warren.adamwhite.work, a playtest export that replays, at least two
playtest-and-fix rounds recorded verbatim in `docs/playtests/`, and an entry at
https://human.adamwhite.work/games/. Adam accepts it by playing. Technical delivery
and acceptance are separate. Later work belongs in Deferred with a date.

## HF4 port blocked — 2026-10-28

**Remaining:** resolve the measured G2 lived-history admission refusal, meet the
existing ten-millisecond simulation/frame constraint (G1; evaluate G6), then retry
the preserved candidate and perform its review, CI, clean deployment and owner
acceptance. Warren stays on the released HF3 build. No owner question is pending.
Next blocker review: **2026-11-03**. The matching shared rows are **G2** and **G6**
in `human-framework/docs/hf4-game-needs.md`; that repository was not changed.

The candidate used the latest npm patch available at the final check, HF 4.5.2,
and immutable lab-client 0.5.2 and kit 0.5.19. HF 4.5.2 was published during the port
and fixes actual sleep/wake settlement. No HF or vendor source was patched.

**G2 blocks delivery.** After ordinary public chalk, ten hours of play, public
release of Meryem's optional work and another quantum, public persona projection
succeeds. The receiving Warren run refuses that exact passport with
`invalid-admission` at `$.portable`. The remembered history includes the actor
`travellers` and places `house:usta`, `field`, `hearth`, `surface` and `below`.
Published admission accepts entity references only from declared person sources,
current people or lifecycle entities. The opening lifecycle offers kin
premises/scopes, not world-place registration. Inventing people or kin for
places, changing their identity, or deleting memory would alter the history.
An empty-goal opening admitted successfully; that did not prove lived carryover.
Required resolution: a supported opening route for non-person historical entities
and places, with mappings that preserve their meaning. Re-run this lived passport
through admission and exact replay before retrying the port.

The [standalone public consumer](probes/hf4-g2-2026-10-28/README.md) retains the
complete compressed HF source archive and actual receiving inputs. Its isolated
frozen install and run exited 0. It verifies exact source replay, restores and
reprojects the same passport, then reproduces the admission refusal. It uses
only public calls and no candidate game code. This is one measured refusal, not
a claim that every passport fails.

**G6 workload remains unmet.** The six-person headless candidate
control replays exactly, including pending, active and partial-phase checkpoints.
The primary run covers minutes 300–900 (ten hours). Public marked cutting reached 0.032942272274438786 versus 0 unmarked. The raw
export was 4,160,173 bytes. Across the control arms, 2,321 warmed public HF calls, wall p95 was 15.215 ms
and max 95.639 ms; process CPU p95 was 13.528 ms and max 91.492 ms on the loaded Node
machine. One-minute HF slices kept the thirty-minute physical cadence, but these
measurements do not establish the required ten-millisecond frame constraint.
They also do not prove phone performance, first-raid survival or a full season.
The [control result](playtests/hf4-control-blocked-2026-10-28.json) is candidate
evidence, not a released-game receipt.

The complete uncommitted port is preserved outside the repository at
`~/code/.lab-scratch/stale-patches/warren-codex-hf4-20261028.patch`,
`.untracked.tar.gz` and `.manifest.json`, based on
`82a006ee31687eed66b7e2b07838535914eb7f25`. Apply the patch and restore the tar
in a fresh managed worktree when the contract is available; reconcile these
blocker notes instead of replacing later documentation. Re-run all gates.

## Source and public rules

This nine-path public-rules candidate is based on origin/main
`f18a46ef7d46eeca06b02cb189a82fb5b0b7c796`. Git establishes source contents;
it does not establish the current live deployment. Review, signed source, exact CI,
root merge, clean deploy, live checks and cleanup remain separate delivery gates.

Ordinary Begin and confirmed New game use existing rules 0.7.0 with `warren-rest/1`.
There is no gameplay feature selector. Loaded hills retain their exact recorded
edition/configuration. The app package and low-level constructor default stay
0.6.0 for compatibility. HF stays 3.0.0, engine 2.23.0. No framework logic belongs
in the game. Client/kit remain immutable release artifacts; the npm SDK route is
excluded by the owner artifact rule. No private framework or vendor patch is used.

## The game and people

A plateau village digs a refuge into soft tuff, drawn in cross-section. The player
is the keeper, with the dig-master's chalk and bell. The people choose what to do.
The setting is unnamed, in the old days, inspired by central Anatolia's underground
cities. Raiders are not named by people or era. The actual-ant concept was rejected.

Every figure is a full HF Person, stepped through `stepCommunity` in thirty-minute
quanta. HF owns needs, goals, habits, fatigue, norms, fear and social decisions.
Warren supplies physical opportunities, Dijkstra paths, work, food, water and danger.
The canonical foreground is Yusuf Usta, Meryem, Hajja Maryam, Tariq, Kian and Tamar
of the Wall. Seeded arriving households do not become canonical by a matching name.
The keeper is a player office. See [canonical cast](canonical-cast.md).

Faith stays quiet: prayer is part of a person's life, not the game's theme or goal.
Keep the Islam-guided provenance and hard rules in AGENTS.md. Never compute divine
acceptance, quantify the ruh, invent rulings or name RNG/scheduling after divine
attributes. Model a person's understanding; use HF research for norms.

The player marks stone, sleeping places, stores, lamps and doors. People may dig,
carry spoil, harvest, fetch water, rest or refuse. Openings admit both air and riders.
Shut doors stop the corresponding search route. Depth alone gives no universal
safety guarantee. Beds provide capacity, not proof of occupancy or protection.
The bell is a suggestion; an assent is not a binding promise. False alarms can
weaken trust. Smoke provides the existing approximate half-day warning. Future
raid dates remain unknown. No difficulty, damage, care or refusal is softened.

In 0.7 rules, sleep credit needs completed sleep in marked beds. Raid protection
uses actual positions throughout the search; scouting or exposure cannot earn it.
Door credit needs protection that actually depends on the shut door. Wild food has
a bounded shared daily yield, lower in winter; empty jars give no food. A warned
loose-stone fall can damage only adjacent local furnishing/lamp, spill at most two
grain units and never destroy the hearth/well or fill the passage. Existing seeded
falls and injuries remain. Work can replace damaged furnishings.

## Deliberate conversations and door tests

A marked, known loose cut allows an invitation on Yusuf/Meryem's card. Speech
requires travel, thirty work minutes and an awake listener at the hearth. Offers
compete with ordinary work, food, sleep and rest. Actual hearing matters. Current
rest/1 uses the existing elicited-position encounter: a heard position enters HF
as a claim, not a command or standing advice to repeat it. Both people may agree.
Only mutually attended opposing statements establish the bounded disagreement.
No anger, insult, motive, promise, excavation or protection is invented.

The keeper can ask an adult to talk about rest. A further talk needs the actual
heard disagreement and a participating speaker. HF may decline or do something
else. Withdrawal stops waiting and preserves spent time, answers, hearing and
world state. This is a finite authored encounter, not general social cognition.

Ask Kian about Ada addresses Samir's F666: “Let me ask Kian about Ada. That was the
thread I wanted to follow.” F678 asks: “Let me follow Meryem’s need for rest, or
Kian’s concern for Ada, beyond a status line.” Kian/Tamar may travel and spend
thirty minutes per utterance. Speech uses dated Ada care records or actual new-story
facts, attended words and current jars. Ada remains a referenced dependent under
the finite contract; do not fabricate an admitted Person or current condition.
Talking does not feed her, clear a duty, finish a return or accept a project.

A finished-door reading offers a quiet test on held hills. The keeper chooses a
reachable adult; assent does not roll the door. Closing and reopening each need
existing travel and eight work minutes. Another adult may choose reopening.
A refusal, interruption or incomplete reopening does not finish the trial. A shut
door stays shut until actual reopening. Old held hills append `try-door`; rest/1
keeps its existing `test-door`. No bell, alarm erasure or legacy conversion occurs.
Night, sleep, care, coverage and faith rules still apply. Withdrawal keeps history.

The public Journal's Door requests and bell calls reading projects retained times,
answers, chosen activities, work boundaries, withdrawal and actual alarm outcomes.
A past closure without a dated receipt remains unknown. Current bodies or doors
cannot supply past truth. Original summaries and raw saved notes remain exact.

## Yusuf’s invitation note and selected chalk

F1193 asks: “Let me understand how Yusuf’s stopping line applies to the work I am
planning.” The selected chalk reading now places the retained Yusuf invitation
note and its date beside the current selected square. Show connections retains
its existing known-ground geometry. The note is matched to the existing
visit flag's actor, minute and authored words. A surviving visit flag alone
cannot supply a trimmed note. Missing original words and date remain unknown. The
legacy public visit writes an authored story note when Yusuf is free. It does not
establish HF speech, hearing or a conversation cost. A broader actual costed reply
remains separate available engineering, targeted for 2026-10-28.

The clue records no stopping-line endpoints or agreement about the selected work.
The reading says so. It leaves the keeper to keep the plan, use Rub out to remove
marks or use Chalk to plan digging. Reading makes no chalk change and supplies no
safety, agreement or completed-project credit. Material readings no longer assign
Yusuf’s historical line to a particular present wall. Persons, simulation, raw
history, formats, editions and public actions retain their existing contracts.

## Clocks, reading and presentation

Slow, Steady and Fast are public. Gameplay readings, event beats and unanswered
warnings slow 0.7 visible play; menus pause. Older recorded editions retain their
existing reading holds. The actual return reading waits for dismissal. New-event
attention is retained for offline boundaries; visible playback acknowledges it
through the existing reading beat. No clock, RNG or simulation quantum changes.

Away play uses one game minute per real minute through ordinary simulation. Resume
and visibility return sample elapsed milliseconds once. Logged elapsed time and
actual completed quanta reproduce the run without reading wall time during replay.
Food, sleep, work, travel and ageing retain their costs. Events, pending choices,
calls, smoke/riders, active discussion or imminent recorded care return can prevent
further stepping. Computation stops after the existing budget; an atomic quantum
may exceed it. Unplayed elapsed time and partial quanta are reported and discarded.
Old hills without away configuration keep waiting while absent.

The working camera stays fixed during reading, construction and card refresh.
Selecting a person may frame them once. Zoom, gestures and Fit hill remain deliberate.
Phone people lists use full names and at least44px targets. The working scene and
reading have separate space; short/enlarged screens scroll. Long readings retain
complete words and reachable return controls. Tab/Shift+Tab stay in the menu;
Escape returns to its opener. Tool selection does not change the simulation.

Selected plans explain actual light, air, reach, spoil and known loose stone.
Capacity previews say potential sleeping space; actual beds must still be marked.
Empty-store and dry-water readings distinguish standing crops, threshing, household
jars, existing storage, spring/well, routes and actual carriers without inventing
private reasons. Work receipts describe observed starts/completions and locations.
Only exact low-weight unlocated routine repeats group in display. Distinct people,
places, arrivals, injuries and results remain. Raw histories are never rewritten.

## Save, replay, care and public controls

Full native saves retain state, seed, inputs, rules, configuration, fingerprints,
complete Persons/RNG and source archives. Compact replay uses the recorded edition,
configuration and pinned chapter initial state. Current exports require HF3 and
plain3 text metadata. Unsupported versions retain a visible refusal. Starting over
requires confirmation even for an unsupported hill. Failed preparation preserves it.
Do not clear storage or manufacture recovery. Preserve full/compact readers and caps.

Historical next/1 keeps its original scoped standing-advice path. Recorded next/2
and rest/1 retain their elicited-position semantics. No old save gains an action,
configuration, rewritten word or away play just because new hills use latest rules.

Fresh hills automatically claim supported shared people through the released shelf.
Loaded hills never refresh actors from newer shelf heads. Cast controls and generic
persona experiments belong on the central shelf. Few diagnostics sit in one closed
Debug beside Lab privacy; gameplay remains public. The host offers download/status,
not a file chooser. Low-level canonical file compatibility remains as implemented;
files gain no shared-history ownership. Do not infer a public import feature from
historical generic notes. Recording and explicit Feedback sharing retain SDK privacy
contracts. Feedback drafts send nothing until Submit.

Public Kian/Meryem Watch preparation retains its finite source guards. It refuses
next/rest configurations, including ordinary new hills. Older supported sources
retain their exact path. Kian/Ada need the released accompaniment contract, both
assents, a completed source meal and the exact pending return duty. Ada's reservoirs
and dependent provenance remain pinned; further care consumes real grain/water.
Ending optional refuge work does not complete return or erase duties. Native
preparation spends ordinary play toward a quiet boundary. Preserve complete raw
archives, care/dialect/role/identity/calendar checks and recorded permissions.
No general cross-host ownership or atomic compare-and-swap is established.

## Deferred and acceptance

The original117 plus18 R2 register preserves literal asks, source hashes, return
qualifications, dates and aliases. This batch changes access, not whole-ask closure.
Door trial, Kian/Ada and retained door-history mechanisms already exist in the source
base above; their source presence is distinct from current live delivery evidence.

Engineering target2026-10-28: F1189 costed Maryam knot/gift/story continuation;
F649/F655/F1200 actual newcomer exchanges and Ada actor contract; contextual replies
to heard refusals; any F1193 clauses beyond the bounded invitation-note projection; F1192 invitation-answer
notice; F1199 other actual setup-event coverage; every uncovered compound clause.
F595's rest request and F629's door request remain bounded mechanisms. F678 stays
a compound ask. GDI089's general/spontaneous quarrels remain wider than this finite
heard-disagreement encounter. No fabricated game end or unsupported onward route.

F199 automatic widening versus the fixed working camera remains Adam's actual
2026-11-03 decision. Feel, food pressure, losses, goals, pacing and readability also
need Adam's play. No player/panel/retest is authorized by engineering checks.
Friends' playtests and Show HN remain paused. Decision-cost profiling and generic
reach APIs belong to HF; no host reimplementation. The no-server guardrail remains;
owner-approved action/real-time approaches do not remove it. A worker-simulation
rewrite is conditional on measured stutter, not a standing requirement.

Historical source design and handoff notes were preserved completely in the private
`warren-gd-resume-warren-public-rules-source-doc-history.tar.gz` archive under
`~/code/.lab-scratch/stale-patches/`. Every member was fully read and SHA256/mode
verified before replacing source guidance. The receipt and complete117+18 register
are beside `~/code/.lab-scratch/games-deferred/gd-resume-warren-public-rules`.
See [HANDOFF](../HANDOFF.md) for this candidate's remaining delivery gates.
