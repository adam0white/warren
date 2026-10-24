import {
  BEDS_PER_CELL,
  diggable,
  idx,
  K,
  neighbours,
  RIDGE,
  SURF,
  THEIR_X,
  USE,
  xOf,
  yOf,
} from '../sim/grid.ts';
import { riderCells, type WarrenState } from '../sim/warren.ts';
import { numberWords } from './shelter.ts';

export type PlanKind = 'chalk' | 'beds';

/** A copied hill: all accepted chalk and the current chalk stroke have been excavated. */
export function planGeometry(s: WarrenState, cells: Iterable<number> = [], kind: PlanKind = 'chalk') {
  const planned = new Set<number>();
  const hill = { ...s.hill, kind: [...s.hill.kind] };
  const add = (i: number) => {
    if (!Number.isInteger(i) || i < 0 || i >= hill.kind.length || yOf(i) < SURF || xOf(i) >= THEIR_X) return;
    const k = hill.kind[i] ?? K.bedrock;
    if (!diggable(k) && k !== K.old && k !== K.theirs) return;
    planned.add(i);
    hill.kind[i] = K.open;
  };
  for (let i = 0; i < s.hill.chalk.length; i++) if (s.hill.chalk[i]) add(i);
  if (kind === 'chalk') for (const i of cells) add(i);
  const state = { ...s, hill };
  return { state, planned, exposure: riderCells(state) };
}

export interface PlanSafety {
  words: string;
  context?: string;
  capacity: number;
  protectedCapacity: number;
  exposedCapacity: number;
  unreachableCapacity: number;
  cells: number[];
  planned: Set<number>;
  exposure: Map<number, number>;
}

/** Read a connected chalk plan or bed room, never treating unbuilt space as present shelter. */
export function planSafety(s: WarrenState, cells: Iterable<number>, kind: PlanKind): PlanSafety {
  const selected = [...cells];
  const geometry = planGeometry(s, selected, kind);
  const { state, planned, exposure } = geometry;
  const candidates = kind === 'chalk' ? planned : new Set<number>();
  if (kind === 'beds') {
    for (let i = 0; i < s.hill.kind.length; i++)
      if (s.hill.kind[i] === K.open && s.hill.use[i] === USE.beds) candidates.add(i);
    for (const i of selected)
      if (
        s.hill.kind[i] === K.open &&
        yOf(i) >= SURF &&
        (s.hill.use[i] === USE.none ||
          s.hill.use[i] === USE.beds ||
          (s.hill.use[i] === USE.store && !(s.hill.grain[i] ?? 0)))
      )
        candidates.add(i);
  }
  const room = new Set(selected.filter((i) => candidates.has(i)));
  const q = [...room];
  for (let qi = 0; qi < q.length; qi++)
    for (const j of neighbours(q[qi] ?? 0))
      if (candidates.has(j) && !room.has(j)) {
        room.add(j);
        q.push(j);
      }

  // Structural connection ignores door position; protection below names shut doors explicitly.
  const accessible = new Set<number>();
  const walk: number[] = [];
  for (let x = 0; x < RIDGE; x++) {
    const i = idx(x, SURF);
    if (state.hill.kind[i] === K.open) {
      accessible.add(i);
      walk.push(i);
    }
  }
  for (let qi = 0; qi < walk.length; qi++)
    for (const j of neighbours(walk[qi] ?? 0))
      if (state.hill.kind[j] === K.open && !accessible.has(j)) {
        accessible.add(j);
        walk.push(j);
      }

  let exposed = 0;
  let protectedCells = 0;
  let unreachable = 0;
  for (const i of room) {
    if (!accessible.has(i)) unreachable++;
    else if (exposure.has(i)) exposed++;
    else protectedCells++;
  }
  const capacity = room.size * BEDS_PER_CELL;
  const exposedCapacity = exposed * BEDS_PER_CELL;
  const protectedCapacity = protectedCells * BEDS_PER_CELL;
  const unreachableCapacity = unreachable * BEDS_PER_CELL;
  const prefix =
    kind === 'chalk'
      ? 'If dug, this space would have'
      : planned.size
        ? 'If the chalk is dug, this space would have'
        : 'These beds have';
  let words = capacity
    ? `${prefix} about ${numberWords(capacity)} sleeping places.`
    : 'This selection has no sleeping space.';
  if (exposed && protectedCells)
    words += ` ${numberWords(protectedCapacity).replace(/^./, (c) => c.toUpperCase())} places are beyond riders’ reach; ${numberWords(exposedCapacity)} are exposed.`;
  if (exposed) {
    // Trace decreasing rider distances to a real sky entry. No invented shaft direction.
    const trace = [...room].filter((i) => exposure.has(i));
    const seen = new Set(trace);
    let shaft = false;
    for (let qi = 0; qi < trace.length; qi++) {
      const i = trace[qi] ?? 0;
      if (exposure.get(i) === 0 && xOf(i) !== s.hill.surface.entrance) shaft = true;
      for (const j of neighbours(i))
        if (!seen.has(j) && exposure.has(j) && (exposure.get(j) ?? 0) < (exposure.get(i) ?? 0)) {
          seen.add(j);
          trace.push(j);
        }
    }
    const cause = shaft ? 'An open shaft admits riders.' : 'The entrance admits riders.';
    words += ` ${cause}`;
    const shut = [...state.hill.shut];
    let openDoor = false;
    for (let i = 0; i < shut.length; i++)
      if (state.hill.use[i] === USE.door && !state.hill.doorWork[i] && !shut[i]) {
        shut[i] = 1;
        openDoor = true;
      }
    if (openDoor) {
      const closedReach = riderCells({ ...state, hill: { ...state.hill, shut } });
      if ([...room].some((i) => exposure.has(i) && !closedReach.has(i)))
        words += ' Ring the bell so a nearby adult can choose to shut open stone doors. Check other routes.';
    }
  }
  if (exposed && !words.includes('shut open stone doors'))
    words += ' Dig deeper, or shut doors on every open route.';
  let doorProtected = false;
  if (protectedCells) {
    const shut = [...state.hill.shut];
    let hasDoor = false;
    for (let i = 0; i < shut.length; i++)
      if (state.hill.use[i] === USE.door && shut[i]) {
        shut[i] = 0;
        hasDoor = true;
      }
    if (hasDoor) {
      const openReach = riderCells({ ...state, hill: { ...state.hill, shut } });
      if ([...room].some((i) => !exposure.has(i) && openReach.has(i))) {
        doorProtected = true;
        words = `${words.slice(0, -1)}; keep protective stone doors shut.`;
      }
    }
  }
  if (protectedCells && !exposed && !doorProtected) words = `This space is beyond riders’ reach. ${words}`;
  if (unreachable)
    words += ` ${numberWords(unreachableCapacity)} places cannot be reached. Connect a passage.`;
  if (kind === 'chalk') words += ' People choose when to dig.';
  let context: string | undefined;
  if ((exposed && doorProtected) || (unreachable && (exposed || protectedCells))) {
    context = words;
    words = `${prefix} about ${capacity} places. ${protectedCapacity} places are protected, ${exposedCapacity} are exposed, and ${unreachableCapacity} cannot be reached.`;
    if (exposed) words += ' Dig deeper or shut route doors.';
    if (doorProtected) words += ' Keep protective doors shut.';
    if (unreachable) words += ' Connect unreachable space.';
    if (kind === 'chalk') words += ' People choose when to dig.';
  }
  return {
    words,
    context,
    capacity,
    protectedCapacity,
    exposedCapacity,
    unreachableCapacity,
    cells: [...room],
    planned,
    exposure,
  };
}
