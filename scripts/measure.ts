// Headless measure: a plain bot keeper over N days. Reports chalk-to-pick latency, digging pace, the first raid's
// real-time minute at each speed, population, the bell's answers, cost per sim-day and save size.
// Usage: node scripts/measure.ts [days] [seed]
import { gzipSync } from 'node:zlib';
import { botStep, newBot } from '../src/sim/bot.ts';
import { DAY, HOUR } from '../src/sim/calendar.ts';
import { advance, fingerprint, newGame, replay, save } from '../src/sim/game.ts';
import { grainBelow } from '../src/sim/grid.ts';
import { bedsBelow, currentGoal, storesWords } from '../src/sim/warren.ts';

const days = Number(process.argv[2] ?? 30);
const seed = Number(process.argv[3] ?? 1);
const REAL_SECONDS_PER_DAY = 20; // speed 1
const g = newGame(seed);
const bot = newBot();
const t0 = performance.now();
let worst = 0;
const daily: string[] = [];
for (let d = 0; d < days; d++) {
  const ds = performance.now();
  for (let h = 0; h < 24; h++) {
    botStep(g, bot);
    advance(g, g.s.minute + HOUR);
  }
  const ms = performance.now() - ds;
  worst = Math.max(worst, ms);
  const alive = g.s.people.filter((p) => p.body.alive).length;
  daily.push(
    `day ${String(d + 1).padStart(3)} pop ${alive} dug ${g.s.stats.dug} grain↓ ${grainBelow(g.s.hill).toFixed(0)} floor ${g.s.fields.floor.toFixed(0)} standing ${g.s.fields.standing.toFixed(0)} beds ${bedsBelow(g.s)} ${storesWords(g.s)} | ${currentGoal(g.s)?.id ?? '-'} | ${ms.toFixed(0)}ms`,
  );
}
const total = performance.now() - t0;
console.log(daily.join('\n'));
const s = g.s;
const lat =
  s.stats.firstPick !== undefined && s.stats.firstChalk !== undefined
    ? s.stats.firstPick - s.stats.firstChalk
    : NaN;
console.log('\n--- summary');
console.log(
  `chalk → first pick: ${lat} sim-min = ${((lat / DAY) * REAL_SECONDS_PER_DAY).toFixed(1)} s real at speed 1`,
);
const r0 = s.raids[0];
if (r0) {
  const m = r0.smoke / DAY;
  console.log(
    `first smoke day ${m.toFixed(2)}: ${((m * REAL_SECONDS_PER_DAY) / 60).toFixed(1)} min real at speed 1, ${((m * REAL_SECONDS_PER_DAY) / 240).toFixed(1)} at speed 4; took ${r0.took} kile, hurt ${r0.hurt.length}`,
  );
}
console.log(
  'raids',
  s.raids
    .map((r) => `${(r.smoke / DAY).toFixed(1)}:${r.stage}:took ${r.took}:hurt ${r.hurt.length}`)
    .join('  '),
);
console.log('bell answers', JSON.stringify(s.stats.bell));
console.log(
  'arrivals',
  s.arrivals,
  'peak',
  s.stats.peak,
  'hurt',
  s.stats.hurt,
  'died',
  s.stats.died,
  'word',
  s.word.toFixed(2),
);
console.log(
  'goals',
  JSON.stringify(Object.fromEntries(Object.entries(s.goals).map(([k, v]) => [k, (v / DAY).toFixed(1)]))),
);
console.log(
  `cost: ${(total / days).toFixed(1)} ms per sim-day (worst ${worst.toFixed(0)}), ${s.people.length} people`,
);
const sv = JSON.stringify(save(g));
console.log(
  `save: ${(sv.length / 1024).toFixed(0)} KB json, ${(gzipSync(sv).length / 1024).toFixed(0)} KB gzip`,
);
console.log(
  'notes:\n' +
    s.notes
      .filter((n) => n.weight >= 1.5)
      .map((n) => `  ${(n.at / DAY).toFixed(1)} ${n.text}`)
      .join('\n'),
);
if (process.argv.includes('--replay')) {
  const fp = fingerprint(g.s);
  const r = replay(seed, g.inputs, g.s.minute);
  console.log('replay', fp === fingerprint(r.s) ? 'MATCH' : 'DIFFERS', fp);
}
