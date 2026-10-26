/** Visible work and structural rules only. No future threat clock or private decision explanation. */
import { cellsWithUse, faces, SURF, USE, xOf, yOf } from '../sim/grid.ts';
import { activeRaid, airAndLight, faceState, V, type WarrenState } from '../sim/warren.ts';
import { activityWords } from './words.ts';

export const ROUTE_HELP = `An open route is a connected passage from an opening to the sky. Riders search ${V.riderReach} passage steps from each opening. Space more than ${V.riderReach} steps along every route is beyond that search. Count passage steps, not just depth. A finished stone door blocks a route only while shut. A new shaft can create a shorter route.`;

export function waterHelpWords(s: WarrenState): string {
  const wells = cellsWithUse(s.hill, USE.well);
  const carrying = s.people.filter((p) => p.body.alive && p.activity?.action === 'fetch-water');
  return `${wells.length ? 'Digging has opened a well below. People can carry its water to the hearth jars.' : 'People carry water from the spring to the hearth jars. A well is water found by digging damp stone; it is not a furnishing you place.'} ${activeRaid(s)?.stage === 'riders' && !wells.length ? 'Fetching from the spring is unavailable while riders are here.' : 'People choose when to fetch it; a warning can clear after a completed water trip.'}${carrying.length ? ` ${carrying.map((p) => `${p.name} is ${s.minute < (s.trips[p.id]?.workFrom ?? 0) ? 'on the water trip' : 'fetching water'}`).join('; ')}.` : ' Nobody is fetching water now.'}`;
}

export function markedWorkWords(s: WarrenState, selected?: number): string {
  const fs = faces(s.hill).filter((f) => selected === undefined || f.face === selected);
  const worker = s.people.find(
    (p) =>
      p.body.alive &&
      p.activity?.action === 'dig' &&
      (selected === undefined || p.activity.targetId === String(selected)),
  );
  if (worker?.activity) {
    const walking = s.minute < (s.trips[worker.id]?.workFrom ?? 0);
    return activityWords(worker.activity.affordance.label, walking, worker.name);
  }
  if (!fs.length)
    return 'This mark waits for a connecting passage. Start at a wall touching the cellar and join the chalk marks to it.';
  const { lit, air } = airAndLight(s);
  const states = fs.map((f) => faceState(s, f.face, f.stand, lit, air));
  const words: string[] = [];
  if (states.includes('ready'))
    words.push(
      'The mark is available for work. Nobody is digging it now. People may choose another task or rest.',
    );
  if (states.includes('dark')) words.push('The marked wall is dark. Hang a lamp on the open side of it.');
  if (states.includes('stale'))
    words.push(
      'The marked wall needs fresh air from an opening to the sky. A shaft also gives riders a way in.',
    );
  if (states.includes('spoil'))
    words.push('Loose rock blocks the marked wall. People must carry it away first.');
  return words.join(' ');
}

/** Coordinates are on the visible grid, relative to the labelled entrance row. */
export function cellLocationWords(s: WarrenState, cell: number): string {
  const dx = xOf(cell) - s.hill.surface.entrance;
  const down = yOf(cell) - SURF;
  return `${dx === 0 ? 'in the entrance column' : `${Math.abs(dx)} ${Math.abs(dx) === 1 ? 'square' : 'squares'} ${dx < 0 ? 'left' : 'right'} of the entrance`}, ${down === 0 ? 'on its row' : `${down} rows below its row`}`;
}
