// Compare unchanged plain-bot/watch-only controls and a separate renewal policy. No player quit inference.
// Usage: node scripts/compare-editions.ts [output.json]
import { writeFileSync } from 'node:fs';
import { botStep, newBot } from '../src/sim/bot.ts';
import { DAY, HOUR } from '../src/sim/calendar.ts';
import { act, advance, type Edition, fingerprint, newGame } from '../src/sim/game.ts';
import { BEDS_PER_CELL, K, SURF, USE, yOf } from '../src/sim/grid.ts';
import { activeRaid, positionAt, QUANTUM, riderCells } from '../src/sim/warren.ts';

function measure(
  seed: number,
  edition: Edition,
  policy: 'plain-bot' | 'watch-only' | 'renewal-responsive',
  days: number,
) {
  const g = newGame(seed, edition);
  const bot = newBot();
  const injuries = new Map<string, { peak: number; last: number }>();
  const improved = new Set<string>();
  const healed = new Set<string>();
  const disappearedOnDeath = new Set<string>();
  let allDeadAt: number | null = null;
  const raidSamples = g.s.raids.map(() => ({
    people: new Set<string>(),
    shelteredInProtectedBeds: new Set<string>(),
    sleepingInProtectedBeds: new Set<string>(),
    livingPersonMinutes: 0,
    riderPhaseLivingPersonMinutes: 0,
    riderExposedPersonMinutes: 0,
    inactiveDangerMinutes: 0,
    shelteredOutsideProtectedBeds: new Set<string>(),
    protectedBedOccupantMinutes: 0,
    peakProtectedBedCapacity: 0,
    peakProtectedBedOccupants: 0,
  }));
  // Left-endpoint samples describe each following quantum. The final instant has no duration.
  const observeRaid = (duration: number) => {
    const s = g.s;
    const rIndex = s.raids.findIndex((r) => r.smoke <= s.minute && s.minute < r.leave);
    if (rIndex < 0) return;
    const r = s.raids[rIndex];
    const m = raidSamples[rIndex];
    if (!r || !m) throw new Error('Missing raid measurement');
    if (!s.bell || s.bell.until <= s.minute) m.inactiveDangerMinutes += duration;
    const reach = riderCells(s);
    const protectedBeds = new Set<number>();
    for (let c = 0; c < s.hill.kind.length; c++) {
      if (s.hill.kind[c] === K.open && s.hill.use[c] === USE.beds && !reach.has(c)) protectedBeds.add(c);
    }
    m.peakProtectedBedCapacity = Math.max(m.peakProtectedBedCapacity, protectedBeds.size * BEDS_PER_CELL);
    let occupants = 0;
    for (const p of s.people) {
      if (!p.body.alive) continue;
      m.people.add(p.id);
      m.livingPersonMinutes += duration;
      const c = positionAt(s, p.id, s.minute);
      if (s.minute >= r.riders) {
        m.riderPhaseLivingPersonMinutes += duration;
        if ((yOf(c) < SURF || reach.has(c)) && p.activity?.action !== 'hide')
          m.riderExposedPersonMinutes += duration;
      }
      // Count arrival and the activity in progress, not a destination reservation or a passer-by.
      const t = s.trips[p.id];
      if (p.activity?.action === 'shelter' && t?.end === c && t.workFrom <= s.minute && !protectedBeds.has(c))
        m.shelteredOutsideProtectedBeds.add(p.id);
      if (!protectedBeds.has(c) || !t || t.end !== c || t.workFrom > s.minute) continue;
      const sleep = p.activity?.mode === 'sleep';
      const shelter = p.activity?.action === 'shelter';
      if (sleep) m.sleepingInProtectedBeds.add(p.id);
      if (shelter) m.shelteredInProtectedBeds.add(p.id);
      if (sleep || shelter) occupants++;
    }
    m.protectedBedOccupantMinutes += occupants * duration;
    m.peakProtectedBedOccupants = Math.max(m.peakProtectedBedOccupants, occupants);
  };
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
    if (policy !== 'watch-only') botStep(g, bot);
    if (policy === 'renewal-responsive' && activeRaid(g.s) && (!g.s.bell || g.s.bell.until <= g.s.minute))
      act(g, { verb: 'bell' });
    const hourEnd = g.s.minute + HOUR;
    while (g.s.minute < hourEnd) {
      observeRaid(QUANTUM);
      advance(g, g.s.minute + QUANTUM);
      observe();
    }
  }
  return {
    seed,
    edition,
    policy,
    elapsedDays: days,
    endDay: g.s.minute / DAY,
    finalFingerprint: fingerprint(g.s),
    raids: g.s.raids.map((r, i) => ({
      ordinal: i + 1,
      smokeDay: r.smoke / DAY,
      ridersDay: r.riders / DAY,
      leaveDay: r.leave / DAY,
      stage: r.stage,
      injuries: r.hurt.length,
      bellRings: g.inputs.filter(
        (input) => input.verb === 'bell' && r.smoke <= input.at && input.at < r.leave,
      ).length,
      observedPeople: raidSamples[i]?.people.size ?? 0,
      inactiveDangerHours: (raidSamples[i]?.inactiveDangerMinutes ?? 0) / HOUR,
      uniqueShelteringOutsideProtectedMarkedBeds: raidSamples[i]?.shelteredOutsideProtectedBeds.size ?? 0,
      protectedMarkedBeds: (() => {
        const m = raidSamples[i];
        if (!m) throw new Error('Missing raid measurement');
        return {
          uniqueSheltering: m.shelteredInProtectedBeds.size,
          uniqueSleeping: m.sleepingInProtectedBeds.size,
          uniqueEither: new Set([...m.shelteredInProtectedBeds, ...m.sleepingInProtectedBeds]).size,
          peakCapacity: m.peakProtectedBedCapacity,
          peakOccupants: m.peakProtectedBedOccupants,
          occupantHours: m.protectedBedOccupantMinutes / HOUR,
        };
      })(),
      exposure: (() => {
        const m = raidSamples[i];
        if (!m) throw new Error('Missing raid measurement');
        return {
          livingPersonHoursSmokeThroughLeave: m.livingPersonMinutes / HOUR,
          livingPersonHoursRidersPresent: m.riderPhaseLivingPersonMinutes / HOUR,
          riderExposedPersonHours: m.riderExposedPersonMinutes / HOUR,
          injuryEventsPer100RiderExposedPersonHours:
            m.riderExposedPersonMinutes > 0
              ? (r.hurt.length / (m.riderExposedPersonMinutes / HOUR)) * 100
              : null,
        };
      })(),
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
for (const policy of ['plain-bot', 'watch-only', 'renewal-responsive'] as const) {
  for (const seed of [1, 7, 19]) {
    for (const edition of ['0.3.0', '0.4.0'] as const) {
      runs.push(measure(seed, edition, policy, policy === 'watch-only' ? 300 : 70));
    }
  }
}
const report = {
  method:
    'Exact existing newBot/botStep called hourly before advance; watch-only calls no bot. Separate renewal-responsive policy keeps hourly building bot and then rings if activeRaid exists and no standing bell remains. Advance split at each QUANTUM without changing bot timing. Injury transitions sampled every QUANTUM. Raid occupancy and exposure use left-endpoint QUANTUM samples in [smoke, leave). Days are elapsed from initial game minute. No tuning.',
  definitions: {
    bellRings: 'Successful logged bell inputs with smoke <= at < leave, including repeats.',
    protectedMarkedBeds:
      'Open cells marked beds absent from current riderCells. An occupant must be alive, physically there, past trip workFrom, at trip.end, and sleeping or sheltering. Unique sets cover the raid, not simultaneous capacity.',
    capacity:
      'Marked bed capacity is BEDS_PER_CELL (three) per cell. Edition 0.3.0 sleep capacity counts activity.mode sleep reservations by trip.end, including travelers. Edition 0.3.0 shelter does not reserve capacity. Edition 0.4.0 protected-bed selection counts sleep and shelter destination reservations; fallback shelter can use other space. Measurements do not impose a separate occupancy cap or cap unique people at simultaneous capacity.',
    exposure:
      'Sampled living person-hours during rider phase; exposed means surface or current riderCells, excluding hide activity, as in raid harm eligibility. This is descriptive exposure, not a causal or calibrated individual risk estimate. Scouting has zero injury eligibility despite spatial exposure.',
  },
  limitations: [
    'QUANTUM samples can miss arrivals, departures and activity changes between sample boundaries. Left-endpoint person-hours approximate exposure rather than exact event-time integration.',
    'Current rider protection does not certify fresh air or a safe route; occupancy counts actual arrivals but does not assert their journey was safe.',
    'Bots and watch-only runs do not measure enjoyment, retention or player quits. Three fixed seeds do not establish general effects.',
    'Injury events and exposure can differ with population, raid duration, geometry and individual choices; normalized counts do not isolate the edition effect.',
  ],
  runs,
};
const json = `${JSON.stringify(report, null, 2)}\n`;
if (process.argv[2]) writeFileSync(process.argv[2], json);
console.log(json);
