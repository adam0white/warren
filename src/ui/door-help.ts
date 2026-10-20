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
  const raid = activeRaid(s);
  const ringing = !!s.bell && s.bell.until > s.minute;
  if (raid || ringing)
    return `A nearby adult who can reach this door can choose to roll it shut. It is rolled back. ${raid ? 'Smoke or riders make this a choice.' : 'The bell is sounding.'}`;
  return 'Ring the bell. A nearby adult who can reach this door can choose to shut it. It is rolled back. Quiet-time false alarms can weaken trust in the bell. Quiet-time calls last six game hours.';
}

/** Live task details stay available without hiding the immediate door choice. */
export function doorDetailWords(s: WarrenState, cell: number): string {
  if (s.hill.doorWork[cell] || s.hill.shut[cell]) return '';
  const candidates = doorCandidates(s, cell);
  return candidates.length
    ? `Nearby adults: ${candidates
        .map((p) => {
          const trip = s.trips[p.id];
          const label = p.activity?.affordance.label;
          return `${p.name}: ${trip && s.minute < trip.workFrom ? `on the way to ${label ?? 'their task'}` : (label ?? 'no task recorded')}`;
        })
        .join('; ')}. The choice is theirs.`
    : 'No living adult nearby can reach this door now.';
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
