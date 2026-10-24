import { ageYears } from '@adam0white/human-framework';
import { paths, surfaceCell } from '../sim/grid.ts';
import { activeRaid, airAndLight, type WarrenState } from '../sim/warren.ts';

/** Explain the existing door choices; the keeper cannot roll the stone directly. */
export function doorWords(s: WarrenState, cell: number, lit: boolean): string {
  if (s.hill.doorWork[cell])
    return lit
      ? 'People choose to carve this door. It must be finished before anyone can roll it shut.'
      : 'Hang a lamp near this dark door mark. People choose to carve it; it must be finished before anyone can shut it.';
  if (s.hill.shut[cell])
    return 'Door rolled shut. An adult may reopen it when smoke, riders and the bell are quiet.';
  const raid = activeRaid(s);
  const ringing = !!s.bell && s.bell.until > s.minute;
  if (raid || ringing)
    return `Door rolled back. A nearby adult who can reach it can choose to roll it shut. ${raid ? 'Smoke or riders make this a choice.' : 'The bell is sounding.'}`;
  return 'Ring the bell. Door rolled back; a nearby adult who can reach it may choose to shut it. False alarms can weaken trust. Quiet-time calls last six game hours.';
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
    if (!p.body.alive || ageYears(p) < (s.edition === '0.6.0' ? 18 : 14)) return false;
    const from = s.pos[p.id] ?? surfaceCell(10);
    return (paths(s.hill, from, lit, s.linked).dist[cell] ?? Infinity) <= 40;
  });
}
