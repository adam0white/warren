import { ageYears } from '@adam0white/human-framework';
import { paths, surfaceCell } from '../sim/grid.ts';
import { activeRaid, airAndLight, type WarrenState } from '../sim/warren.ts';

/** Explain the existing door choices; the keeper cannot roll the stone directly. */
export function doorWords(s: WarrenState, cell: number, lit: boolean): string {
  if (s.hill.doorWork[cell])
    return lit
      ? 'A door being carved. People can choose to carve it as they find the time. The stone must be finished before anyone can roll it shut.'
      : 'A door marked, in the dark. Hang a lamp near so people can choose to carve it. The stone must be finished before anyone can roll it shut.';
  if (s.hill.shut[cell])
    return 'The stone door, rolled shut. When there is no smoke, no riders and no sounding bell, an adult can choose to roll it back.';
  const candidates = doorCandidates(s, cell);
  const workers = candidates.length
    ? `Nearby adults: ${candidates
        .map((p) => {
          const trip = s.trips[p.id];
          const label = p.activity?.affordance.label;
          return `${p.name}: ${trip && s.minute < trip.workFrom ? `on the way to ${label ?? 'their task'}` : (label ?? 'no task recorded')}`;
        })
        .join('; ')}. The choice is theirs.`
    : 'No living adult nearby can reach this door now.';
  const raid = activeRaid(s);
  const ringing = !!s.bell && s.bell.until > s.minute;
  if (raid || ringing)
    return `The stone door, rolled back. ${raid ? 'With smoke or riders at the hill' : 'While the bell is sounding'}, an adult with the door nearby and reachable can choose to roll it shut. ${workers}`;
  return `The stone door, rolled back. A quiet-time false alarm can weaken trust in the bell. Ring the bell so an adult nearby and reachable can choose to shut it. Quiet-time calls last six game hours. Smoke or riders also make shutting it a choice. ${workers}`;
}

/** Same age, current sim origin and weighted distance gate as the shut-door offer. */
export function doorCandidates(s: WarrenState, cell: number) {
  const { lit } = airAndLight(s);
  return s.people.filter((p) => {
    if (!p.body.alive || ageYears(p) < 14) return false;
    const from = s.pos[p.id] ?? surfaceCell(10);
    return (paths(s.hill, from, lit, s.linked).dist[cell] ?? Infinity) <= 40;
  });
}
