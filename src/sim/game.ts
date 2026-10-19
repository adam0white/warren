/**
 * The game around the hill: the keeper's inputs (each applied at an exact minute on a quantum boundary, so a run
 * replays), saves and the playtest export (seed + input log + state JSON).
 */
import { FRAMEWORK_VERSION, restore, snapshot } from '@adam0white/human-framework';
import { USE, type UseName } from './grid.ts';
import {
  advanceTo,
  newWarren,
  placeDoor,
  placeLamp,
  QUANTUM,
  resetCaches,
  ringBell,
  setChalk,
  setUse,
  syncCommunity,
  takeLamp,
  type WarrenState,
} from './warren.ts';

export const GAME_VERSION = '0.1.0';

export type Input =
  | { at: number; verb: 'chalk'; cells: number[]; on: boolean }
  | { at: number; verb: 'use'; cells: number[]; use: UseName }
  | { at: number; verb: 'lamp'; cell: number }
  | { at: number; verb: 'unlamp'; cell: number }
  | { at: number; verb: 'door'; cell: number }
  | { at: number; verb: 'bell' };

export type Order = Input extends infer I ? (I extends Input ? Omit<I, 'at'> : never) : never;

export interface Game {
  s: WarrenState;
  inputs: Input[];
}

export function newGame(seed: number): Game {
  resetCaches();
  return { s: newWarren(seed), inputs: [] };
}

/** Apply an input now and log it. Inputs wait for the next quantum boundary (the UI steps in quanta). */
export function act(g: Game, o: Order): boolean {
  const i = { ...o, at: g.s.minute } as Input;
  const ok = apply(g.s, i);
  if (ok) g.inputs.push(i);
  return ok;
}

function apply(s: WarrenState, i: Input): boolean {
  switch (i.verb) {
    case 'chalk':
      return setChalk(s, i.cells, i.on) > 0;
    case 'use':
      return setUse(s, i.cells, USE[i.use]) > 0;
    case 'lamp':
      return placeLamp(s, i.cell);
    case 'unlamp':
      return takeLamp(s, i.cell);
    case 'door':
      return placeDoor(s, i.cell);
    case 'bell':
      return ringBell(s);
  }
}

/** Advance to `to`, rounded down to a quantum. */
export function advance(g: Game, to: number) {
  const q = Math.floor(to / QUANTUM) * QUANTUM;
  if (q > g.s.minute) advanceTo(g.s, q);
}

// ---------- saves and export ----------

export interface Saved {
  game: string;
  framework: string;
  seed: number;
  minute: number;
  inputs: Input[];
  state: WarrenState;
  fingerprint: string;
}

/** HF `restore` drops an empty family record; drop it here too so a save and its restore print the same. */
function tidy<T>(p: T): T {
  const q = p as { family?: Record<string, unknown> };
  if (q.family && Object.keys(q.family).length === 0) delete q.family;
  return p;
}

export function stateJson(s: WarrenState): WarrenState {
  syncCommunity(s);
  const { people, ...rest } = s;
  return { ...structuredClone(rest), people: people.map((p) => tidy(snapshot(p))) } as WarrenState;
}

export function restoreState(json: WarrenState): WarrenState {
  resetCaches();
  const { people, ...rest } = json;
  return { ...structuredClone(rest), people: people.map((p) => restore(p)) } as WarrenState;
}

function sorted(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sorted);
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(o).sort()) out[k] = sorted(o[k]);
    return out;
  }
  return v;
}

/** A stable hash of the state (keys sorted; a restored person may hold fields in another order). */
export function fingerprint(s: WarrenState): string {
  const j = stateJson(s);
  for (const p of j.people) tidy(p);
  const text = JSON.stringify(sorted(j));
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

export function save(g: Game): Saved {
  return {
    game: GAME_VERSION,
    framework: FRAMEWORK_VERSION,
    seed: g.s.seed,
    minute: g.s.minute,
    inputs: structuredClone(g.inputs),
    state: stateJson(g.s),
    fingerprint: fingerprint(g.s),
  };
}

export function load(saved: Saved): Game {
  return { s: restoreState(saved.state), inputs: structuredClone(saved.inputs) };
}

/** Replay a run from its seed and inputs to `minute`. */
export function replay(seed: number, inputs: readonly Input[], minute: number): Game {
  const g = newGame(seed);
  for (const i of inputs) {
    advance(g, i.at);
    apply(g.s, i);
    g.inputs.push(structuredClone(i));
  }
  advance(g, minute);
  return g;
}
