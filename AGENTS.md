# Warren

Read HANDOFF.md and docs/design.md before changing the game. Follow [the plain-English policy](docs/lab/plain-english.md) for player-facing text.

Stack: HF 3.0.0 (engine 2.23.0), lab-client 0.4.11, lab-kit 0.5.12, TypeScript 7.0.2, Vite 8.3.5, Vitest 5.0.5, Biome 2.6.3, Wrangler 4.152.0, Playwright 1.64.1 and Knip 6.43.0. Worker compatibility date: 2026-10-25.

Use the shared Node 26.12.0 and pnpm 12.14.0, with `/opt/homebrew/bin` first in PATH. Use managed worktrees. Run full suites and check:lane through the machine-wide human-framework/scripts/suite-lock.ts wrapper. Run check:lane before every signed commit. Rebase origin/main before pushing. Preserve simulation, save and replay contracts. Adam accepts game feel by playing; technical delivery is separate.

App package/default rules are 0.6.0; only the unchecked new-hill option selects 0.7.0. HF package 3.0.0 and engine 2.23.0 are separate values. TypeScript support requires 7+. Lab client/kit remain immutable release artifacts; do not replace archives in place or adopt an npm SDK route. Read current HANDOFF before copying historical status.

Lab-panel rounds on HF 3 builds are allowed under the playtest director. Friends’ playtests and Show HN remain paused. Owner readiness review is targeted for 2026-11-03; technical delivery does not establish acceptance.

- Moral and spiritual faculty: Islam-guided. **User, 2026-10-04:** aim roughly for a post-sectarian, united understanding; where schools differ, take the most common position overall (not only Hanafi), recorded in [HF research/decisions.md](https://github.com/adam0white/human-framework/blob/main/research/decisions.md). No scholarly review is expected: decide pragmatically within the allowance for a game framework, without contorting religion into a mere game. The framework models modern people's understanding. Keep revealed sources, interpretation, empirical findings and engineering assumptions distinct, with provenance on norm definitions. Never compute divine acceptance, assign quantities to the ruh, or name the RNG or scheduler after divine attributes. Represent a person's _understanding_ of a norm, not a ruling. Do not let agents invent rulings; source them from the Human Framework repository’s `research/`.
- **Games keep faith gentle (user, 2026-10-04):** the framework stays Islam-guided, but games do not focus on religion. Prayer, fasting and the like appear as quiet parts of a character's life, never the theme, goal or central mechanic. Simulated playtest profiles (e.g. Game 2's naughty players) may push on faith like any other part of a character's life (user, 2026-10-04); that is measurement, not theme.
