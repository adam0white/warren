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
| 7. Compounding, idle pull [S] | Four speeds (slow, walk, trot, gallop); nothing pauses. The journal fills while you watch. After an absence the hill moves on up to one day, and says so. |
| 8. Stories you retell [S] | The journal records breakthroughs, finds, raids, refusals, habits and deaths in past tense. People answer the bell in their own words. |

**Naughty edges, by design, a little fun and inside the model:** crying wolf with the bell (false alarms make sheltering a poor outcome, so trust in the bell falls and later the bell is ignored); digging into the neighbours' store (above); peering into everyone's lives through the cross-section; overworking the diggers (fatigue builds over days in HF's slow store; tired people stop, slow down, or get hurt on loose stone).

**Natural difficulty first:** stale air beyond reach of a sky opening (no lamp burns, people avoid the face); darkness; spoil blocking faces until carried up; hard stone; loose stone that can fall; thirst and water carrying; the harvest and the winter; riders; crowding. No arbitrary caps beyond three doors.

## Core loop

1. Chalk stone beside open ground. Someone who sees it may take up a pick (within the hour in daylight).
2. The dug space opens; spoil piles up and is carried to the heap; feet wear the path.
3. Mark rooms (store, beds); grain and sleepers move below. Hang lamps where the dark stops the picks; sink a shaft where the air goes stale.
4. Smoke comes. Ring the bell, or not. People shelter, shut doors, hide, or keep reaping.
5. The hill holds or it does not. Word spreads; families come; the warren must grow.

## How HF is used

- Every figure is a full HF `Person` (no lightweight agents), stepped with `stepCommunity` in 30-minute quanta.
- World callbacks offer real affordances with real paths (Dijkstra over the cross-section, costs from wear, light and spoil).
- Goals (`refuge`), material pay (`material` on work offers), `alongside`, habits, fatigue store, injuries, norms (theft, help) and a voice (`usta`, the bell) carry the behaviour. Psychological need terms alone are too small to drive work (see [hf-requests.md](hf-requests.md)).
- Faith stays quiet: devout adults keep a dusk prayer; it is a line in the journal, never a mechanic.

## Determinism, saves and export

- One seed; all randomness is hashed from the seed and the event. Inputs are logged at the minute they apply (always a quantum boundary).
- Saves: the full state as gzip in IndexedDB (a year with 60 people is several megabytes of JSON).
- Export (notebook → page): seed, input log, state JSON and fingerprint. `replay(seed, inputs, minute)` reproduces the fingerprint (tested; a 365-day bot run matched).

## Performance (measured, M-series Mac, machine under heavy parallel load)

| People | ms per sim-day | Notes |
|---|---|---|
| 9 | 35–60 | first weeks |
| 35 | ~135 | day 120 |
| 81 | ~810 | before the population cap; now capped at 60 |

At gallop a sim-day is 1.25 real seconds, so 60 people is about 40–50% of one core on this machine. The frame loop gives the sim at most 10 ms a frame; if it cannot keep up, time slows and the page says "the days pass as fast as they can". **Decision date for moving the sim to a Web Worker: 2026-10-26**, after phone playtests.

## Deferred

- Web Worker sim if phones lag at gallop (decide 2026-10-26).
- Collapsing infrastructure as the expendable part of "sacrifice without guilt" (2026-11-02).
- Lab telemetry client, when `@adam0white/lab-client` is published (check 2026-10-26).
