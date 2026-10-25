import { ageYears } from '@adam0white/human-framework';
import { paths, surfaceCell } from '../sim/grid.ts';
import { activeRaid, airAndLight, type WarrenState } from '../sim/warren.ts';
import { displayWords } from './words.ts';

/** Explain the existing door choices; the keeper cannot roll the stone directly. */
export function doorWords(s: WarrenState, cell: number, lit: boolean): string {
  if (s.hill.doorWork[cell])
    return lit
      ? 'People decide whether to carve this door. They must finish it before anyone can roll it shut.'
      : 'Hang a lamp near this dark door mark. People decide whether to carve the door. They must finish it before anyone can shut it.';
  if (s.hill.shut[cell])
    return 'The door is rolled shut. An adult may reopen it when there is no smoke, no riders and no bell call.';
  const raid = activeRaid(s);
  const ringing = !!s.bell && s.bell.until > s.minute;
  if (raid || ringing)
    return `The door is open. A nearby adult who can reach it can choose to roll it shut. ${raid ? 'Smoke or riders give a reason to shut it.' : 'The bell is sounding.'}`;
  return 'Ring the bell. A nearby adult who can reach this open door may choose to shut it. Calls without raids last six game hours. False alarms can weaken trust.';
}

/** Live task details stay available without hiding the immediate door choice. */
export function doorDetailWords(s: WarrenState, cell: number): string {
  if (s.hill.doorWork[cell] || s.hill.shut[cell]) return '';
  const candidates = doorCandidates(s, cell);
  return candidates.length
    ? `Nearby adults: ${candidates
        .map((p) => {
          const trip = s.trips[p.id];
          const label = p.activity ? displayWords(p.activity.affordance.label) : undefined;
          return `${p.name}: ${trip && s.minute < trip.workFrom ? `on the way to ${label ?? 'the current task'}` : (label ?? 'no task recorded')}`;
        })
        .join('; ')}. Each person decides whether to shut the door.`
    : 'No living adult nearby can reach this door now.';
}

/** Same age, current sim origin and weighted distance gate as the shut-door offer. */
export function doorCandidates(s: WarrenState, cell: number) {
  const { lit } = airAndLight(s);
  return s.people.filter((p) => {
    if (!p.body.alive || ageYears(p) < (s.edition === '0.6.0' || s.edition === '0.7.0' ? 18 : 14))
      return false;
    const from = s.pos[p.id] ?? surfaceCell(10);
    return (paths(s.hill, from, lit, s.linked).dist[cell] ?? Infinity) <= 40;
  });
}
