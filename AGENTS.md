# Warren

Read HANDOFF.md and docs/design.md before changing the game. Follow [the plain-English policy](docs/lab/plain-english.md) for player-facing text.

Stack: HF 3.0.0 (engine 2.23.0), lab-client 0.4.10, lab-kit 0.5.11, TypeScript 7.0.2, Vite 8.3.5, Vitest 5.0.5, Biome 2.6.3, Wrangler 4.152.0, Playwright 1.64.1 and Knip 6.43.0. Worker compatibility date: 2026-10-25.

Use Node 24 or newer, with `/opt/homebrew/bin` first in PATH. Use managed worktrees. Run full suites and check:lane through the machine-wide human-framework/scripts/suite-lock.ts wrapper. Run check:lane before every signed commit. Rebase origin/main before pushing. Preserve simulation, save and replay contracts. Adam accepts game feel by playing; technical delivery is separate.
