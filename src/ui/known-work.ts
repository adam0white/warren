/**
 * Visible work and structural rules only. No future threat clock or private decision explanation, except one:
 * whether each digger still holds the refuge goal, which people would say aloud if asked.
 */

import { DAY, isLight } from '../sim/calendar.ts';
import {
  airSteps,
  cellsWithUse,
  faces,
  K,
  lighting,
  paths,
  STORE_CAP,
  SURF,
  surfaceCell,
  USE,
  xOf,
  yOf,
} from '../sim/grid.ts';
import { rallyBlock, refugeGoal } from '../sim/rally.ts';
import {
  activeRaid,
  airAndLight,
  carrying,
  diggingAdults,
  faceState,
  V,
  type WarrenState,
} from '../sim/warren.ts';
import { activityWords } from './words.ts';

export const ROUTE_HELP = `An open route is a connected passage from an opening to the sky. Riders search ${V.riderReach} passage steps from each opening. Space more than ${V.riderReach} steps along every route is beyond that search. Count passage steps, not just depth. A finished stone door blocks a route only while shut. A new shaft can create a shorter route.`;

/** Routes use only visible ground, never an undiscovered chamber. */
function knownRoute(s: WarrenState, from: number, to: number): boolean {
  const h = { ...s.hill, kind: s.hill.kind.slice() };
  for (let c = 0; c < h.kind.length; c++) if (yOf(c) >= SURF && !h.known[c]) h.kind[c] = K.rock;
  const lit = lighting(h, airSteps(h), isLight(s.minute));
  return Number.isFinite(paths(h, from, lit, s.linked).dist[to]);
}

function placeWords(s: WarrenState, c: number): string {
  if (c === surfaceCell(s.hill.surface.spring)) return 'the spring';
  if (c === surfaceCell(s.hill.surface.floor)) return 'the threshing floor';
  const home = s.houses.find((h) => surfaceCell(h.x) === c);
  if (home) return `${home.name} jars`;
  const use = s.hill.use[c];
  return `${use === USE.hearth ? 'the hearth jars' : use === USE.well ? 'the discovered well' : use === USE.store ? 'the store' : 'ground'} ${cellLocationWords(s, c)}`;
}

function supplyWorkers(s: WarrenState, action: string): string[] {
  return s.people.flatMap((p) => {
    const a = p.activity;
    if (!p.body.alive || !a || a.action !== action || a.endsAt <= s.minute) return [];
    const t = s.trips[p.id];
    if (!t || t.action !== action)
      return [`${p.name} is ${a.affordance.label}; no current route is recorded.`];
    const source = Number(a.targetId);
    const phase = carrying(s, p.id, s.minute)
      ? 'carrying'
      : s.minute < t.workFrom
        ? 'travelling to collect'
        : 'collecting';
    return [
      `${p.name} is ${phase} ${action === 'fetch-water' ? 'water' : 'grain'}${Number.isInteger(source) && source >= 0 ? ` from ${placeWords(s, source)}` : ''} to ${placeWords(s, t.end)}.`,
    ];
  });
}

export function waterHelpWords(s: WarrenState): string {
  const wells = cellsWithUse(s.hill, USE.well).filter((c) => s.hill.known[c]);
  const hearth = cellsWithUse(s.hill, USE.hearth)[0];
  const source = wells[0] ?? surfaceCell(s.hill.surface.spring);
  const workers = supplyWorkers(s, 'fetch-water');
  const words = [
    wells.length
      ? `Digging has opened a well below: ${placeWords(s, source)}.`
      : 'Water comes from the spring. A well is water found by digging damp stone; it is not a furnishing you place.',
  ];
  if (hearth !== undefined) {
    words.push(`Water goes from ${placeWords(s, source)} to ${placeWords(s, hearth)}.`);
    if (activeRaid(s)?.stage === 'riders' && !wells.length)
      words.push('Fetching from the spring is unavailable while riders are here.');
    else if (!knownRoute(s, source, hearth))
      words.push(
        'No open route through known ground connects this source to the hearth jars. Inspect the passage; chalk can connect stone and lamps can light open ground.',
      );
  }
  words.push(
    ...(workers.length
      ? workers
      : ['Nobody is fetching water now. This does not tell us why nobody chose the work.']),
  );
  words.push(
    'People choose when to fetch it; the jars refill only after a completed water trip. Use Look to inspect the route.',
  );
  return words.join(' ');
}

/** The first observable supply gap, not an explanation of anyone’s decision. */
export function grainHelpWords(s: WarrenState, selected?: number): string {
  const stores = cellsWithUse(s.hill, USE.store).filter((c) => s.hill.known[c]);
  const destinations = selected === undefined ? stores : stores.filter((c) => c === selected);
  const words = [
    selected !== undefined && (s.hill.grain[selected] ?? 0) <= 0.5
      ? 'This store is empty.'
      : `${stores.length && stores.every((c) => (s.hill.grain[c] ?? 0) <= 0.5) ? 'The stores below are empty. ' : ''}The harvest goes from the threshing floor or home jars to stores below.`,
  ];
  const workers = supplyWorkers(s, 'carry-grain');
  if (!destinations.length)
    words.push('There is no marked store here. Use Store on open ground for grain jars.');
  else if (destinations.every((c) => (s.hill.grain[c] ?? 0) > STORE_CAP - 0.5))
    words.push('These stores have no room for another load. Use Store on more open ground.');
  const sources = [
    ...(s.fields.floor > 0.3
      ? [{ cell: surfaceCell(s.hill.surface.floor), words: 'Harvested grain is on the threshing floor.' }]
      : []),
    ...s.houses
      .filter((h) => h.jars > 0.3)
      .map((h) => ({ cell: surfaceCell(h.x), words: `Grain remains in ${h.name} jars.` })),
  ];
  if (!sources.length) {
    words.push(
      s.fields.standing > 0.5
        ? 'Barley is standing in the fields; there is no harvested grain on the threshing floor or in home jars to carry below.'
        : 'There is no grain on the threshing floor or in home jars to carry below.',
    );
    const reapers = s.people.filter(
      (p) => p.body.alive && p.activity?.action === 'reap' && p.activity.endsAt > s.minute,
    );
    words.push(
      reapers.length
        ? `${reapers.map((p) => p.name).join(', ')} is harvesting now.`
        : 'Nobody is harvesting now. This does not tell us why.',
    );
  } else {
    words.push(...sources.map((source) => source.words));
    const room = destinations.filter((c) => (s.hill.grain[c] ?? 0) <= STORE_CAP - 0.5);
    const connected = sources.some((source) => room.some((c) => knownRoute(s, source.cell, c)));
    if (room.length && !connected)
      words.push(
        'No open route through known ground connects this grain to the store. Inspect the passage; use Chalk to connect stone, or Lamp to light open ground.',
      );
    else if (connected)
      words.push(
        'An open route through known ground connects grain to the store. A route alone does not mean someone has chosen to carry it.',
      );
  }
  if (activeRaid(s)?.stage === 'riders')
    words.push('Grain carrying from the surface is unavailable while riders are here.');
  words.push(
    ...(workers.length
      ? workers
      : [
          'Nobody is carrying grain to a store now. This does not tell us whether anyone will choose it next.',
        ]),
  );
  return words.join(' ');
}

/** True when a marked wall (the selected one, or any) is ready to cut and nobody is cutting it. */
export function readyMark(s: WarrenState, selected?: number): boolean {
  if (selected !== undefined && s.hill.kind[selected] === K.open) return false;
  const { lit, air } = airAndLight(s);
  return faces(s.hill).some(
    (f) =>
      (selected === undefined || f.face === selected) && faceState(s, f.face, f.stand, lit, air) === 'ready',
  );
}

export function markedWorkWords(s: WarrenState, selected?: number): string {
  if (selected !== undefined && s.hill.kind[selected] === K.open)
    return 'This ground is open now. Digging here is complete; furnishings need their own marks.';
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
      'The mark is available for work: the wall has light, air and room for spoil. Nobody is digging it now.',
      waitingWords(s),
    );
  if (states.includes('dark')) words.push('The marked wall is dark. Hang a lamp on the open side of it.');
  if (states.includes('stale'))
    words.push(
      'The marked wall needs fresh air from an opening to the sky. A shaft also gives riders a way in.',
    );
  if (states.includes('spoil'))
    words.push('Loose rock blocks the marked wall. People must carry it away first.');
  if (selected !== undefined && (s.hill.dig[selected] ?? 0) > 0)
    words.unshift('Some stone has already been cut here.');
  if (selected !== undefined && s.hill.known[selected])
    words.push(
      s.hill.kind[selected] === K.loose
        ? 'This wall is loose stone: it can fall when people cut it.'
        : s.hill.kind[selected] === K.hard
          ? 'This wall is hard rock: it takes longer to cut. It is not loose stone.'
          : 'This wall is ordinary stone.',
    );
  return words.join(' ');
}

const listNames = (names: string[]) =>
  names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : (names[0] ?? '');

/** Who could take a ready mark, and whether the refuge still matters to them. Approximate, from state. */
export function waitingWords(s: WarrenState): string {
  const diggers = diggingAdults(s);
  if (!diggers.length) return 'Nobody on the hill takes digging work now.';
  const keen: string[] = [];
  const fading: { name: string; days: number }[] = [];
  const gone: string[] = [];
  const done: string[] = [];
  for (const p of diggers) {
    const g = refugeGoal(p);
    if (g?.status === 'achieved') done.push(p.name);
    else if (g?.status !== 'active') gone.push(p.name);
    else if (g.importance < (g.baseImportance ?? g.importance) - 1e-9)
      fading.push({ name: p.name, days: Math.floor((s.minute - (g.lastAdvancedAt ?? g.adoptedAt)) / DAY) });
    else keen.push(p.name);
  }
  const out = [
    `${diggers.length <= 3 ? 'Only ' : ''}${listNames(diggers.map((p) => p.name))} ${diggers.length === 1 ? 'takes' : 'take'} digging work; elders advise, and others keep to their own duties.`,
  ];
  if (keen.length)
    out.push(
      `${listNames(keen)} still ${keen.length === 1 ? 'wants' : 'want'} the refuge, but meals, harvest and rest come first when they are needed.`,
    );
  for (const f of fading)
    out.push(
      `${f.name} has not worked on the refuge for ${f.days === 1 ? 'a day' : `${f.days} days`}, and it matters less to them each day.`,
    );
  if (done.length)
    out.push(
      `${listNames(done)} ${done.length === 1 ? 'feels' : 'feel'} they have done their share of the refuge, whatever the chalk still asks.`,
    );
  if (gone.length) out.push(`${listNames(gone)} ${gone.length === 1 ? 'has' : 'have'} let the refuge go.`);
  if (fading.length || gone.length || done.length) {
    const block = rallyBlock(s);
    out.push(block ? block : 'You can ask Yusuf Usta to walk the marks with them.');
  }
  return out.join(' ');
}

/** Coordinates are on the visible grid, relative to the labelled entrance row. */
export function cellLocationWords(s: WarrenState, cell: number): string {
  const dx = xOf(cell) - s.hill.surface.entrance;
  const down = yOf(cell) - SURF;
  return `${dx === 0 ? 'in the entrance column' : `${Math.abs(dx)} ${Math.abs(dx) === 1 ? 'square' : 'squares'} ${dx < 0 ? 'left' : 'right'} of the entrance`}, ${down === 0 ? 'on its row' : `${down} rows below its row`}`;
}
