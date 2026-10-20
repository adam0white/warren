// Compare unchanged plain-bot policy and watch-only runs. No player quit inference.
// Usage: node scripts/compare-editions.ts [output.json]
import { writeFileSync } from 'node:fs';
import { botStep, newBot } from '../src/sim/bot.ts';
import { DAY, HOUR } from '../src/sim/calendar.ts';
import { advance, type Edition, newGame } from '../src/sim/game.ts';

function measure(seed: number, edition: Edition, policy: 'plain-bot' | 'watch-only', days: number) {
  const g = newGame(seed, edition);
  const bot = newBot();
  const injuries = new Map<string, { peak: number; last: number }>();
  const improved = new Set<string>();
  const healed = new Set<string>();
  const disappearedOnDeath = new Set<string>();
  let allDeadAt: number | null = null;
  const observe = () => {
    const present = new Set<string>();
    for (const p of g.s.people) {
      for (const i of p.body.injuries) {
        const key = `${p.id}:${i.id}`;
        present.add(key);
        const previous = injuries.get(key);
        if (previous && i.severity < previous.peak - 1e-9) improved.add(key);
        injuries.set(key, { peak: Math.max(previous?.peak ?? 0, i.severity), last: i.severity });
      }
    }
    for (const key of injuries.keys()) {
      if (present.has(key) || healed.has(key) || disappearedOnDeath.has(key)) continue;
      const p = g.s.people.find((person) => key.startsWith(`${person.id}:`));
      if (p?.body.alive) healed.add(key);
      else disappearedOnDeath.add(key);
    }
    if (allDeadAt === null && g.s.people.every((p) => !p.body.alive)) allDeadAt = g.s.minute;
  };
  observe();
  for (let h = 0; h < days * 24; h++) {
    if (policy === 'plain-bot') botStep(g, bot);
    advance(g, g.s.minute + HOUR);
    observe();
  }
  return {
    seed,
    edition,
    policy,
    elapsedDays: days,
    endDay: g.s.minute / DAY,
    raids: g.s.raids.map((r, i) => ({
      ordinal: i + 1,
      smokeDay: r.smoke / DAY,
      ridersDay: r.riders / DAY,
      leaveDay: r.leave / DAY,
      stage: r.stage,
      injuries: r.hurt.length,
      grainTaken: r.took,
      wouldCatch: r.wouldCatch?.length ?? null,
    })),
    deaths: g.s.stats.died,
    population: { alive: g.s.people.filter((p) => p.body.alive).length, total: g.s.people.length },
    allDeadVillageLoss: allDeadAt !== null,
    allDeadAtDay: allDeadAt === null ? null : allDeadAt / DAY,
    playerQuits: null,
    playerQuitsStatus: 'unmeasured; bot and watch-only runs cannot measure player quits',
    injuries: {
      totalInjuryEvents: g.s.stats.hurt,
      raidInjuryEvents: g.s.raids.reduce((n, r) => n + r.hurt.length, 0),
      observedDistinct: injuries.size,
      severityDecreased: improved.size,
      fullyHealedWhileAlive: healed.size,
      disappearedOnDeath: disappearedOnDeath.size,
      remaining: g.s.people.reduce((n, p) => n + p.body.injuries.length, 0),
    },
  };
}

const runs = [];
for (const policy of ['plain-bot', 'watch-only'] as const) {
  for (const seed of [1, 7, 19]) {
    for (const edition of ['0.2.0', '0.3.0'] as const) {
      runs.push(measure(seed, edition, policy, policy === 'plain-bot' ? 70 : 300));
    }
  }
}
const report = {
  method:
    'Exact existing newBot/botStep called hourly before advance; watch-only calls no bot. Injury transitions sampled hourly. Days are elapsed from initial game minute. No tuning.',
  runs,
};
const json = `${JSON.stringify(report, null, 2)}\n`;
if (process.argv[2]) writeFileSync(process.argv[2], json);
console.log(json);
