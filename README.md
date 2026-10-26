# The Warren

[Play The Warren](https://warren.adamwhite.work/). Dig a shelter where the village can survive attacks by riders. You mark work and ring the bell. Each person chooses what to do.

## How to play

1. Choose **Begin**, or **Resume** a compatible saved hill. **New game** asks before replacing the saved hill.
2. Choose **chalk**, then drag across stone beside the cellar. People need access, fresh air and light to dig. Use **rub out** to remove marks.
3. Open **furnish** to mark stores or beds, hang lamps, or place doors. Doors need a passage one square wide with open ground on opposite sides.
4. Use **look** to inspect stone and people. Open **Journal** for events and **What the village has done** for progress. Tap the people count to inspect shelter conditions.
5. Watch for smoke and riders. Ring the **bell** to call people below. People weigh the call; it does not command them.

Choose Slow, Steady or Fast. The menu pauses play. Rules 0.7 slows gameplay readings; earlier rules retain their reading holds. The hill waits while you are away.

Drag in look mode to move the view. Two fingers move and pinch the view. Mouse wheel pans; Ctrl+wheel zooms. The +, − and Fit hill buttons also control the view.

The unchecked **New rules for this new hill** choice starts rules 0.7.0. It enables completed-sleep and actual raid-protection outcomes, limited wild food and warned damage to local furnishings. It also adds ongoing digging display and slower gameplay readings. Leaving it unchecked starts 0.6.0. Resuming or importing keeps recorded rules. Existing adult helper rules and body needs also apply in 0.6.0.

## Saves, recording and files

The game saves the current hill in this browser’s IndexedDB as compressed data. Resume depends on compatible data and available browser storage. New game replaces that saved hill after confirmation. A local save and lab recording are separate.

The ordinary menu contains Resume, Feedback, Full screen, All games, Recording and New game. Recording on links recorded play across games on this device. DNT/GPC set the initial recording default off; turning Recording on explicitly enables it. Feedback offers an optional unchecked sharing choice when Recording is off. Submitting it checked enables recording/linkage and includes an available run; unchecked sends the answer, note and optional name alone. An optional name labels linked play on this device.

Exact `?lab=1` exposes **People between chapters**, **Open current playtest file**, browser-shelf/native Watch diagnostics, and Feedback’s **Keep a copy of this run** and version preview. These are not ordinary menu controls. There is no ordinary stored-runs browser. The current playtest export contains seed, timed inputs, state, fingerprint and any pinned chapter/source records. Source `replay` reconstructs a run from its pinned start and inputs; no ordinary replay viewer is exposed.

Current save loading requires matching HF package and `plain3` text metadata. A rules edition alone does not guarantee compatibility. Older text versions receive a start-new-game message. Finite historical person-source routes retain their specific identity, role, dialect, duty and care checks. Imported files do not gain ownership of browser-shelf records. The selected Kian/Meryem native Watch handoff is a bounded route; it does not establish general cross-host ownership or atomic publication. Keep complete exports and raw source histories.

## Human Framework and versions

The [Human Framework](https://human.adamwhite.work/) supplies people’s needs, goals, habits, memories, social decisions and responses to the bell. Warren supplies the hill, work opportunities, resources, hazards, controls and presentation. People choose among offered actions rather than obeying player orders. The existing game footer credits HF.

| Value                                    | Current source             |
| ---------------------------------------- | -------------------------- |
| App package / default rules              | 0.6.0                      |
| Explicit new-hill rules option           | 0.7.0                      |
| HF npm package                           | 3.0.0                      |
| HF engine                                | 2.23.0                     |
| Immutable lab-client / lab-kit artifacts | 0.4.10 / 0.5.11            |
| TypeScript                               | 7.0.2; support requires 7+ |

Package version, rules edition and engine version have different meanings. `package.json` and the lockfile pin dependencies. `/release.json` identifies a deployed build. See [HANDOFF](HANDOFF.md) for dated deployment evidence and remaining owner review.

## Development

Use Node 24+ and put `/opt/homebrew/bin` first in PATH. In fish:

```fish
set -gx PATH /opt/homebrew/bin $PATH
npm ci
npm run dev
```

`npm run build` stamps release metadata and builds with Vite. `npm run preview` serves the build. `npm run lint`, `npm run typecheck` and `npm run check:unused` run Biome, TypeScript and Knip. `npm test` runs Vitest with the repository’s 60-second test timeout. `npm run check:lane` runs lint, typecheck and the full test suite in this repository.

Use managed worktrees. Run full suites and check:lane through the machine-wide shared lock, without nesting locks:

```fish
node /Users/abdul/code/human-framework/scripts/suite-lock.ts -- npm run check:lane
```

Run check:lane before each signed commit. Fetch and rebase origin/main before pushing; require green CI on the exact commit. `npm run deploy` runs check, build and Wrangler deployment and also needs the shared wrapper. Source-only documentation requires no app deployment.

Read [AGENTS](AGENTS.md), [HANDOFF](HANDOFF.md), [design](docs/design.md) and the [plain-English policy](docs/lab/plain-english.md) before changing the game. Preserve simulation, save and replay contracts. Adam accepts game feel by playing; technical delivery is separate. Lab-panel rounds belong to the playtest director. Friends’ playtests and Show HN remain paused.
