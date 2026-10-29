# The Warren

[Play The Warren](https://warren.adamwhite.work/). Dig a shelter where the village can survive attacks by riders. You mark work and ring the bell. Each person chooses what to do.

## How to play

1. Choose **Begin**, or **Resume** a compatible saved hill. **New game** asks before replacing the saved hill.
2. Choose **chalk**, then drag across stone beside the cellar. People need access, fresh air and light to dig. Use **rub out** to remove marks.
3. Open **furnish** to mark stores or beds, hang lamps, or place doors. Doors need a passage one square wide with open ground on opposite sides.
4. Use **look** to inspect stone and people. Open **Journal** for events and **What the village has done** for progress. Tap the people count to inspect shelter conditions.
5. Watch for smoke and riders. Ring the **bell** to call people below. People weigh the call; it does not command them.

Choose Slow, Steady or Fast. The Game menu, village sheet and person cards opened from it pause play. Journal and growth readings slow play. Away catch-up stops at new records, pending choices or danger. Older HF3 hills require a fresh start.

Drag in look mode to move the view. Two fingers move and pinch the view. Mouse wheel pans; Ctrl+wheel zooms. The +, − and Fit hill buttons also control the view.

Every new hill starts with rules 0.7.0 and the `warren-rest/2` configuration. Sleep and shelter outcomes, limited wild food, warned furnishing damage, quiet away play and resident conversation requests are public. Only hills with that configuration can be opened; keep unsupported originals and start fresh.

One real minute away plays one game minute through ordinary simulation. Play stops for events, pending choices or a computation limit. The return reading reports completed play and unplayed time; unplayed time is not banked. You can invite Yusuf Usta and Meryem to discuss a marked, known loose cut, or stop waiting. Speech needs travel, thirty work minutes and an awake listener at the hearth. HF chooses their actions. Hearing a position does not force agreement or disagreement. You can ask an adult to talk about rest. A further conversation needs an actual mutually heard disagreement. People may decline. Door tests remain deliberate requests on a finished door.

HF4 refuses older Watch handoffs. Keep older notebooks in their original version; start a fresh hill here.

## Saves, recording and files

The game saves the current hill in this browser’s IndexedDB as compressed data. Resume depends on compatible data and available browser storage. New game replaces that saved hill after confirmation. A local save and lab recording are separate.

The ordinary menu contains Resume, Feedback, Full screen, All games, Recording and New game. Recording on links recorded play across games on this device. DNT/GPC set the initial recording default off; turning Recording on explicitly enables it. Feedback offers an optional unchecked sharing choice when Recording is off. Submitting it checked enables recording/linkage and includes an available run; unchecked sends the answer, note and optional name alone. An optional name labels linked play on this device.

Feedback’s optional **I'm stopping** and **I'm confused** choices change only the local draft. Tap the selected choice again to clear it. They leave the note field unchanged and send nothing until you choose **Submit**. Submit includes the selected choice with any verdict and note through the existing sharing path.

The menu offers a link to the central browser shelf for cast controls. Shared people continue automatically on a fresh hill. Resume keeps the people, history and local receipts saved in that hill; it does not replace them from the shelf. **Download this run** is public in the menu. Status sits in **Debug**, which starts collapsed beside **Lab privacy**. Feedback keeps its version/run preview and download in the same collapsed Debug position. **Open a saved hill** opens `/file/`. The file must replay exactly before play. This separate page never writes the hill saved on this device. Imported files do not establish shared-history ownership.

HF4 uses supported available portable people automatically. Occupied, terminal or older unsupported shelf records stay unchanged; a new story cannot overwrite them. Imports have no shelf publication authority. Actor state stays in HF, including retained history and duties. The receiving game validates calendar and reference mappings.

Current exports include the exact HF4 archive, complete host state and ordered player inputs. Unsupported older saves are refused with a keep-file/start-fresh message. Current exports must replay exactly on their pinned version. Person cards say when current condition information is unavailable; private bodily needs and bell trust are not displayed as outward observations. Earlier injuries remain dated journal records.

## Human Framework and versions

The [Human Framework](https://human.adamwhite.work/) supplies people’s needs, goals, habits, memories, social decisions and responses to the bell. Warren supplies the hill, work opportunities, resources, hazards, controls and presentation. Its loose-cut encounter supplies offers and records attended positions as claims; it does not force a quarrel or turn a heard position into standing advice. People choose among offered actions rather than obeying player orders. The existing game footer credits HF.

| Value                                    | Current source             |
| ---------------------------------------- | -------------------------- |
| App package                              | 0.7.0                      |
| Ordinary new-hill rules / configuration  | 0.7.0 / warren-rest/2      |
| HF npm package                           | 4.7.0                      |
| HF engine                                | 4.7.0                      |
| Immutable lab-client / lab-kit artifacts | 0.5.3 / 0.5.21             |
| TypeScript                               | 7.0.2; support requires 7+ |

Package version, rules edition and engine version have different meanings. `package.json` and the lockfile pin dependencies. `/release.json` identifies a deployed build. See [HANDOFF](HANDOFF.md) for dated deployment evidence and remaining owner review.

## Development

Use the shared Node 26.12.0 and pnpm 12.14.0. Put `/opt/homebrew/bin` first in PATH. In fish:

```fish
set -gx PATH /opt/homebrew/bin $PATH
pnpm install --frozen-lockfile
pnpm run dev
```

`pnpm run build` stamps release metadata and builds with Vite. `pnpm run preview` serves the build. `pnpm run lint`, `pnpm run typecheck` and `pnpm run check:unused` run Biome, TypeScript and Knip. `pnpm test` runs Vitest with the repository’s 60-second test timeout. `pnpm run check:lane` runs lint, typecheck and the full test suite in this repository.

Use managed worktrees. Run full suites and check:lane through the machine-wide shared lock, without nesting locks:

```fish
node /Users/abdul/code/human-framework/scripts/suite-lock.ts -- pnpm run check:lane
```

Run check:lane before each signed commit. Fetch and rebase origin/main before pushing; require green CI on the exact commit. `pnpm run deploy` runs check, build and Wrangler deployment and also needs the shared wrapper. Source-only documentation requires no app deployment.

The exact Node pin is `.node-version`; private-root engines and strict engine checks enforce it. Use the existing shared `/opt/homebrew/bin/node`; do not download a project runtime. `pnpm-workspace.yaml` disables hoisting, uses shared-store hardlinks, enforces strict peers and a 1440-minute release age, exempts only owned `@adam0white/*` packages, and owns the exact install-script approvals and overrides. `verifyDepsBeforeRun: error` rejects stale modules. Normal `npm run` wrappers still work but bypass this pnpm guard.

After updating an existing npm tree, preserve dirty source changes, remove only that tree's root and workspace `node_modules`, run `pnpm install --frozen-lockfile`, and delete `dist`, `.types` and `*.tsbuildinfo`. Preserve the immutable local SDK archives. This installer migration requires no deployment.

Read [AGENTS](AGENTS.md), [HANDOFF](HANDOFF.md), [design](docs/design.md) and the [plain-English policy](docs/lab/plain-english.md) before changing the game. Preserve simulation, save and replay contracts. Adam accepts game feel by playing; technical delivery is separate. Lab-panel rounds belong to the playtest director. Friends’ playtests and Show HN remain paused.
