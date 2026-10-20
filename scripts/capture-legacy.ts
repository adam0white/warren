// Run against the unmodified 0.2.0 simulation before adding edition branches.
import { writeFileSync } from 'node:fs';
import { botStep, newBot } from '../src/sim/bot.ts';
import { DAY, HOUR } from '../src/sim/calendar.ts';
import { advance, fingerprint, load, newGame, type Saved, save } from '../src/sim/game.ts';

const runs = [];
for (const seed of [1, 7, 19])
  for (const policy of ['plain', 'watch'] as const) {
    const g = newGame(seed, '0.2.0');
    const bot = newBot();
    let checkpoint: Saved | undefined;
    for (let hour = 0; hour < 65 * 24; hour++) {
      if (policy === 'plain') botStep(g, bot);
      advance(g, g.s.minute + HOUR);
      if (hour === 20 * 24 - 1) checkpoint = save(g);
    }
    if (!checkpoint) throw new Error('No checkpoint');
    const continued = load(checkpoint);
    advance(continued, checkpoint.minute + 2 * DAY);
    writeFileSync(
      `/Users/abdul/code/.lab-scratch/design-round/warren-${seed}-${policy}-legacy-checkpoint.json`,
      JSON.stringify(checkpoint),
    );
    runs.push({
      seed,
      policy,
      minute: g.s.minute,
      inputs: g.inputs,
      fingerprint: fingerprint(g.s),
      checkpoint: {
        minute: checkpoint.minute,
        inputs: checkpoint.inputs,
        fingerprint: checkpoint.fingerprint,
        continuationMinute: continued.s.minute,
        continuationFingerprint: fingerprint(continued.s),
      },
    });
    console.log(seed, policy, runs.at(-1)?.fingerprint);
  }
writeFileSync(
  'test/fixtures/edition-legacy.json',
  `${JSON.stringify({ capturedFrom: '172c384', game: '0.2.0', runs }, null, 2)}\n`,
);
