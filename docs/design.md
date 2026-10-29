# Resident voices and HF 4.10 — 2026-10-29

Remaining: exact CI, merge and clean deployment. Adam accepts feel by playing.

The focused voice/protocol tests pass (5/5). The headless control proves exact complete game/HF replay, pending-boundary identity, active continuation and read-only preview. The 360×690 browser control uses public Begin, bell and download, then verifies the complete simulation state and input log; it reports no page errors. See `docs/playtests/hf410-voice-*-2026-10-29.json` and `scripts/voice-control.ts`.

HF 4.10.0, client 0.5.9 and kit 0.5.26 are pinned. New hills carry Warren’s four-alternative general phrasebook and six resident voices in the HF lexicon. HF owns event-time seeded selection and its no-repeat history. Replies use the actual suggestion-resolved event and its verdict; Warren explains its recorded reason using the same recorded variant. Deferred and modified replies include the chosen activity through HF narration. Unknown reasons add no invented explanation. Sleeping and dead people produce no spoken reply. No raw reason-code fallback or old HF sentence rewrite remains.

HF’s closed narration catalog has no reason slot in suggestion.resolved. The host’s reason table therefore accompanies the narrated verdict; it does not parse HF prose or select another random phrase. This is an ordinary wording decision, not a second decision model. Per-person peer skips and existing shared heads remain intact. New arrivals without a named profile use the general phrasebook. Archives use HF’s public history reader. Old HF saves remain downloadable and receive a plain start-fresh message; no migration is attempted.

# The Warren: design

**What done means.** The first increment ends with a public playable build at
https://warren.adamwhite.work, a playtest export that replays, at least two
playtest-and-fix rounds recorded verbatim in `docs/playtests/`, and an entry at
https://human.adamwhite.work/games/. Adam accepts it by playing. Technical delivery
and acceptance are separate. Later work belongs in Deferred with a date.

## Imported duties and individual arrival — 2026-10-28

A failed arrival skips only that person. Each shelf head is read and validated separately; HF admits a candidate before Warren claims it. A refused person begins locally and keeps their shared head. Successful candidates retain their source projections in the chapter export. The existing batch compare-and-swap still refuses concurrent ownership changes rather than overwriting them. Peer certification remains the published client's responsibility.

Imported norm definitions retain their exact source meaning and provenance. Exact matching Warren action IDs remain usable locally; unsupported actions are retained as historical obligations. Warren never turns a duty to return to another place into a local watch duty or claims it was fulfilled. Conflicting norm definitions remain subject to HF admission. Native save/replay and fresh local opening catalogues stay unchanged.

Old hills are downloadable before replacement. The title keeps the existing explicit replacement confirmation. `/file/` shows one plain refusal and keeps diagnostic detail inside collapsed Debug.

## Shared people readiness — 2026-10-28

HF 4.8.1, client 0.5.7 and kit 0.5.24 form the published compatible graph. Before each shared arrival claim, checkpoint or terminal write, the client checks whether other games bound to that person have verified compatible live deployments and per-person skips. The current certification list is empty; all six Warren shared roles are skipped and named, their prior records stay unchanged, and new hills still start locally. A permitted role can use the retained-person bridge and shelf compare-and-swap. Loaded hills retain their recorded actors. Recheck peer certification by 2026-11-03. This is not proof of a completed shared journey. Saves from a different HF version are refused and preserved.

## Earlier shared people safety — 2026-10-28

The published compatible graph is HF 4.8.0, client 0.5.5 and kit 0.5.23. Client 0.5.6 adds a per-person shared write gate, but kit 0.5.23 does not support that client. Until a compatible kit is published and integrated, fresh hills refuse when any shelf head exists; an empty shelf permits local play without claims. Checkpoints and terminal writes are disabled, including for retained local ownership. Existing shared records and local hills remain intact; saves made with another HF version are refused rather than migrated. This is a temporary host capability refusal, not an HF gap or proof of a shared journey. Revisit the compatible graph on 2026-10-29, or earlier on release; recheck peer deployment certification by 2026-11-03.

## HF4 port correction — 2026-10-28

**Remaining:** finish the restored HF4 candidate, prove complete game export/replay
and the existing ten-millisecond simulation/frame budget, then deliver through
review, exact CI and a clean verified deployment. Adam accepts feel separately.
The historical candidate targeted HF 4.7.0 with client 0.5.3 / kit 0.5.21; see the current safety entry above.
The public menu opens `/file/`. A file must replay exactly before play. File play does not open native storage or claim shared people. It cannot replace the native hill.
Production remains on HF3 until delivery. Profile-only portable v1 refuses explicitly; it cannot stand in for retained v2 runtime history. No HF or vendor source is patched.

**The G2 blocker conclusion in PR #8 was wrong.** The negative control omitted
receiving-world declarations. Published HF registers subjects in `world.facts`
as lifecycle entities. Declaring Warren’s actual remembered places and the
travellers group admits the unchanged lived passport on 4.5.2; its target archive
replays exactly. No fabricated people/kin or deleted memory is needed. The
[corrected standalone consumer](probes/hf4-g2-2026-10-28/README.md) retains the
original negative case and the successful world-declaration control. The shared
**G2** row in `human-framework/docs/hf4-game-needs.md` remains broader journey
acceptance work; this refusal is not a missing HF contract. HF was not edited.

The earlier workload result is historical evidence, not a proved G6 blocker.
Current public step-horizon measurements on the same six-person checkpoint show
no established atomic HF ten-millisecond floor. The candidate now schedules one
public call per animation frame and slows its clock when computation falls behind.
A browser control starts after twelve hours (minutes 300–1020), then plays ninety
more simulated minutes: 111 frames, simulation-frame p95 7.8 ms / max 11.1 ms,
one sample over 10 ms on this machine. An atomic call can exceed the budget; no
second HF call is batched into that frame. It took 1.82 seconds versus 1.25 nominal;
the control explicitly reports 41 simulated minutes of nominal-speed lag. This
is a bounded machine measurement, not a phone or worst-case guarantee. Exporting
2.25 MB took 79.7 ms separately, outside the simulation-frame result. Scripts and
exact control receipts accompany the candidate. The original
[4.5.2 result](playtests/hf4-control-blocked-2026-10-28.json) retains its measured
ten-hour run and loaded-Node timings. Matching inventory rows: G1 and G6.

The candidate was restored from the full patch and untracked archive under
`~/code/.lab-scratch/stale-patches/warren-codex-hf4-20261028.*`, base
`82a006ee31687eed66b7e2b07838535914eb7f25`. Those preserved files predate this
correction. Apply both only in a fresh managed worktree and reconcile later docs.

## Player evidence on HF4 — design decision, 2026-10-28

The condition panel gives an approximate reading from HF host inspection. It uses
Warren's authored phrases for inability to stand, poor health, illness, bleeding,
injury, pain, hunger, thirst and need for rest. It shows no condition numbers.
Fatigue and sleepiness change figure lean and walking stride; active injuries add
a shoulder mark. These are display cues from HF state, not another resident's
knowledge, a diagnosis, or a promise of safety. Historical journal injuries remain
explicitly historical. No body model, gameplay switch, simulation or replay rule is
added. This restores the pre-port signs under the owner's 2026-10-28 brief and
supersedes the earlier decision to hide host condition readings. Adam accepts
feel separately from technical delivery.

## Source and public rules

This nine-path public-rules candidate is based on origin/main
`f18a46ef7d46eeca06b02cb189a82fb5b0b7c796`. Git establishes source contents;
it does not establish the current live deployment. Review, signed source, exact CI,
root merge, clean deploy, live checks and cleanup remain separate delivery gates.

Ordinary Begin and confirmed New game use rules 0.7.0 with `warren-rest/2`. Recorded rest/1 hills keep the exact served f4 continuation. Rest/2 includes every rest/1 faculty and adds the autonomous marked-cut opportunity and its refusal-reply guard.
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
establish HF speech, hearing or a conversation cost. The literal planning ask does not require a new conversation. A costed reply is
not an additional delivery condition. Actual understanding and Emre’s return
remain separate player outcomes.

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

The earlier port automatically claimed supported shared people; the current safety entry above suspends those writes.
Loaded hills never refresh actors from newer shelf heads. Cast controls and generic
persona experiments belong on the central shelf. Few diagnostics sit in one closed
Debug beside Lab privacy; gameplay remains public. The host offers download/status,
and opens saved files at /file/. Low-level canonical file compatibility remains as implemented;
files gain no shared-history ownership. Do not infer a public import feature from
historical generic notes. Recording and explicit Feedback sharing retain SDK privacy
contracts. Feedback drafts send nothing until Submit.

Current HF4 hills explicitly refuse older Kian/Meryem Watch preparation before any new input, departure or pending-quantum settlement. They preserve the complete notebook. The historical Watch care/dialect/role/identity/calendar contracts remain evidence, not an active HF4 route. Shared portable publication uses current HF projection, exact source/claim/parent validation and the published per-person peer gate. No completed cross-game journey is established.

## Optional ring and string exercise — 2026-10-28

After the exact retained Maryam invitation note, the keeper can ask her to loosen one crossing or draw it toward the wooden ring. A visit flag alone cannot recover the offer. This is one prospective authored prop: the ring is threaded on a closed loop with one loose crossing. Loosening leaves slack; drawing cinches it. Neither frees the ring. Maryam keeps the prop. No skill, gift, duty, expertise or agreement is awarded.

Published HF chooses among the unique exercise offer and ordinary work/rest. Warren uses its registered leisure action and keeper request voice; existing Run definitions stay literal. Routes determine real travel. The exercise then needs at least thirty minutes at the hearth. New exercise duration rounds upward so fractional travel cannot shorten that work. Danger, absence, duty, sleep and withdrawal prevent completion. Host geometry and authored words describe only actual completed work. A public attended observation, checked at each result boundary, establishes observation; a host story note alone does not.

Complete native and downloaded files retain the inputs, host fixture, full Run archive and continuation. Local physical-history checks compare complete replay, including when removable exercise markers were stripped. Unowned current native snapshots remain readable. Files require complete replay consistency. Neither form grants permission to prepare or publish a source. Shared publication refuses exercise history until the published generic prop contract supports it. Exact creation, claims, current source metadata, parent heads and complete producer receipts govern other shared checkpoints. A producer must match this hill’s complete opening and ordered input prefix; stale async work stops before writes. Replay equality is consistency, not authentication of independently rewritten history.

Invitation host notes surface in the working view without reopening a person. No deadline or expiry is invented. Actual request answers/speech/hearing, marked-work starts/completion, Ada conversation, cut discussion, physical exercise and contextual reply use the normal nonzero reading slowdown. Menus still pause. The bounded contextual reply quotes an opposed loose-cut statement that the original listener actually attended. It uses a new voluntary choice, travel, thirty minutes and an awake listener; it changes no chalk and forces no agreement. Existing Yusuf note/date and Kian/Tamar words remain intact.

## Later household visits — 2026-10-29

Actual admitted later households have their own optional visits. Their seeded names,
members and arrival day remain their own identity; matching a canonical name adds
no biography. A retained arrival or personal hill-work note can supply exact dated
context. Missing history stays unknown. Children younger than six have no
independent keeper invitation. Older children may visit and look with the keeper;
this assigns no adult work or expertise.

The keeper invites one person to the hearth. HF chooses whether to take the offer,
with ordinary activities, needs and faith still competing. Authored words follow
only a completed choice, real travel and thirty minutes at the hearth. HF's actual
answer is labeled separately. The visitor asks which visible open place the keeper
would like to look at together. The keeper can leave the exchange there or choose
one place. A second voluntary choice, travel and thirty minutes there precede a
reading of its actual current furnishings and ground. Initial and final readings
remain distinct. No safety, assent, duty, reconciliation or private feeling is
inferred. The keeper is a player office; no HF listener attendance is claimed.
Danger, sleep, death, withdrawal or another chosen activity can end the finite
exchange. Time and actual answers remain. No invitation changes arrival frequency,
family-generation RNG draws or uninvited hill choices. The public arrival bridge
registers actual forward household identities with partial scopes and no new kin
premises before admitting the unchanged generated people. Full saved population
order survives cold HF restoration. Public invitation decisions are observed even
when a review continues the person's current activity. Complete host/HF/RNG saves,
files and deterministic replay retain these records. Existing source authority and
publication refusals remain binding. This local existing-person feature does not
require generic family custody or an Ada actor.

## Deferred and acceptance

The original117 plus18 R2 register preserves literal asks, source hashes, return
qualifications, dates and aliases. This batch changes access, not whole-ask closure.
Door trial, Kian/Ada and retained door-history mechanisms already exist in the source
base above; their source presence is distinct from current live delivery evidence.

The bounded newcomer delivery88de249 addresses F1200/GDI1345 and the existing-arrival clauses of F649/GDI835 and F655/GDI841 with finite local invitations and walks. Public readings use names, practical places and completed words. Exact source attribution, identifiers, times and HF decisions remain in Debug and exports. The delivered Maryam exercise, invitation cue, event slowdown and contextual reply remain intact. Its source/main CI and live controls belong to root’s bounded newcomer delivery receipt. This remainder still requires HANDOFF’s gates. The bounded remainder below composes another prospective story trial, optional autonomous cut words and false-bell repair. F1193’s note/plan mechanism remains read-only; no extra conversation is required by the literal ask. Owner acceptance remains separate.

F649/GDI835 and F655/GDI841 meeting Ada need a maintained shared cast identity/profile, authored biography/backstory/secrets, age-appropriate agency and outcome/carry/return contract. Current dependent care and Kian/Tamar’s conversation do not establish meeting her. Owner: central HF cast/release director; its source is reserved by the release train. Checkpoint2026-10-29. Do not invent an Ada actor or family facts. New family/prop custody and generic lifecycle remain separate. Original Maya’s conditional return requires understanding stalled digging; this exercise does not establish it.
F595's rest request and F629's door request remain bounded mechanisms. F678 stays
a compound ask. GDI089 now has the finite autonomous opportunity below as well as the prior
keeper-initiated encounter and heard reply. Neither guarantees a quarrel or
establishes a motive or reconciliation. No fabricated game end or unsupported onward route.

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

## Coherent local remainder candidate — 2026-10-29

Remaining: focused/full and production-bundle proof, signed rebased source, one
coordinator review via ROOT and exact CI, then root integration/deployment/live/cleanup. This
is not delivery or Adam’s acceptance. The original117+18 and328 inventory aliases
are reconciled externally in recovery-warren-remainder-rowmap.json; root owns
canonical inventory/ledger edits. No previous evidence was overwritten.

Tariq’s exact retained boat note unlocks one prospective dry balance trial. The
keeper supplies the test pieces now; a historical gift is not authenticated. A
wooden hull spans forty millimetres, on a support twenty millimetres wide. A clay
load weighs twice the centered hull. With the load in the middle, the combined
center of mass lies over the support; at the hull’s edge it lies outside and the
boat tips into the dry tray. This is a finite authored balance model, not
buoyancy or boat expertise. Drinking water is unused. HF chooses participation,
real travel and at least half an hour of terminal work. Public observation alone
establishes Tariq’s receipt. No gift/skill/duty/ownership transfer is awarded.
Refusal, other work, withdrawal, release/death/danger and finite expiry remain.
Full host/Run/RNG/input data replay; stripped or inconsistent physical history refuses. Replay equality is consistency, not authentication of an independently rewritten whole history.
The current portable prop contract cannot carry it, so preparation/publication
refuses before writes. Local reading/download stays available.

A known marked loose cut now supplies one autonomous conversation opportunity for
Yusuf Usta and Meryem. There is no keeper request, standing advice or forced
interruption. They can choose either opposed position, ordinary work or rest.
Only completed real travel and speech work can produce an invitation. The other
person can answer only after actual public hearing. Opposed mutually heard words
alone count as disagreement. Initial opportunity lasts three hours; a heard first
statement leaves a bounded reply window, capped at six hours from opening. The
chalk, difficulty, collapse risk and RNG draw sites remain unchanged. No anger,
private motive, agreement, reconciliation or safe ground is inferred.

F651/GDI837 and F656/GDI842 were actual remaining source gaps. A quiet-hill bell
tap now asks before ringing; cancellation adds no bell input. Reading still slows
rather than pauses. Actual smoke/riders still permit a direct alarm. After a
retained false call, one adult who actually answered it can choose to hear the
keeper’s apology at the hearth. Travel and half an hour precede the words. Public
hearing establishes receipt; a review’s assent followed by cooking or other work
does not. No forgiveness, trust refund, duty or erased cost follows. Current person
readings drop ended bell quotations; the complete dated past remains in Journal
and exports. The player’s Nov3 judgment remains separate.

F676/GDI862 and related F664 receive a person-linked reading of actual current
grain work. From an actual harvester/carrier/cook, Follow this grain work explains
the known harvest/threshing-floor/home-jar/store chain, current carriers/routes
and practical existing tools. This is a read-only observation of work, not invented
person speech, a paid conversation or moved grain. It preserves Samir’s full
conditional return. F1193 retains its exact Yusuf note/date, selected known chalk,
unknown endpoints and actual Chalk/Rub out choices; an extra conversation is not
required by Emre’s literal ask.

Actual Ada and the unidentified injured worker still need authoritative identities
and maintained backstory/agency/outcome contracts from central cast/release, target
2026-10-29/check2026-10-30. No substitute person is invented. Generic peer/custody
and HF reach/performance contracts remain separate. They do not block these local
experiments. Camera widening and taste/return acceptance require Adam’s actual
Nov3 choice/play. Player/panel/friends/ShowHN remain paused.
