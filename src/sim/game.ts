/**
 * The game around the hill: the keeper's inputs (each applied at an exact minute on a quantum boundary, so a run
 * replays), saves and the playtest export (seed + input log + state JSON).
 */
import { FRAMEWORK_VERSION, restore, snapshot } from '@adam0white/human-framework';
import type { PersonaEnvelope } from '@adam0white/lab-client';
import { requestAdaEnd } from './ada-care.ts';
import type { Chapter } from './cast.ts';
import { USE, type UseName } from './grid.ts';
import { prepareNativeReturn } from './native-return.ts';
import { seedRoleGoals } from './roles.ts';
import { releaseVisit, visit } from './visits.ts';
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

export const GAME_VERSION = '0.6.0';
export const DEFAULT_EDITION = GAME_VERSION;
export type Edition = '0.2.0' | '0.3.0' | '0.4.0' | '0.5.0' | '0.6.0';

export function editionOf(version: string): Edition {
  if (/^0\.2\.\d+$/.test(version)) return '0.2.0';
  if (version === '0.3.0' || version === '0.4.0' || version === '0.5.0' || version === '0.6.0')
    return version;
  throw new Error(`Unsupported Warren edition: ${version}`);
}

export type Input =
  | { at: number; verb: 'chalk'; cells: number[]; on: boolean }
  | { at: number; verb: 'use'; cells: number[]; use: UseName }
  | { at: number; verb: 'lamp'; cell: number }
  | { at: number; verb: 'unlamp'; cell: number }
  | { at: number; verb: 'door'; cell: number }
  | { at: number; verb: 'bell' }
  | { at: number; verb: 'visit'; who: string }
  | { at: number; verb: 'release'; who: string }
  | { at: number; verb: 'care-ada' | 'end-ada-visit' }
  | { at: number; verb: 'prepare-native-return'; who: 'kian' | 'meryem' };

export type Order = Input extends infer I ? (I extends Input ? Omit<I, 'at'> : never) : never;

export interface Game {
  s: WarrenState;
  inputs: Input[];
  chapter?: Chapter;
  ownedHeads?: Record<string, PersonaEnvelope>;
  nativeReturnHeads?: Record<string, PersonaEnvelope>;
  sourceArchives?: Record<string, unknown>;
  fileOrigin?: boolean;
}

export function newGame(seed: number, edition: string = DEFAULT_EDITION, chapter?: Chapter): Game {
  resetCaches();
  const rules = editionOf(edition);
  const s = chapter ? restoreState(chapter.initial) : newWarren(seed, rules === '0.5.0' || rules === '0.6.0');
  if (
    chapter &&
    (chapter.version !== (rules === '0.6.0' ? 'warren-cast/2' : 'warren-cast/1') ||
      s.seed !== seed ||
      (rules !== '0.5.0' && rules !== '0.6.0'))
  )
    throw new Error('Unsupported pinned chapter.');
  if (rules !== '0.2.0') s.edition = rules;
  if (!chapter && rules === '0.6.0') seedRoleGoals(s);
  return { s, inputs: [], ...(chapter ? { chapter: structuredClone(chapter) } : {}) };
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
    case 'prepare-native-return':
      return prepareNativeReturn(s, i.who);
    case 'end-ada-visit':
      return requestAdaEnd(s);
    case 'care-ada':
      if (
        !s.people.find((p) => p.id === 'kian')?.body.alive ||
        !s.adaVisit ||
        s.adaVisit.endedAt !== undefined ||
        s.minute >= s.adaVisit.returnBy
      )
        return false;
      s.flags['ada-care-request'] = s.minute + 1;
      return true;
    case 'release':
      return releaseVisit(s, i.who);
    case 'visit':
      return visit(s, i.who);
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
  chapter?: Chapter;
  ownedHeads?: Record<string, PersonaEnvelope>;
  nativeReturnHeads?: Record<string, PersonaEnvelope>;
  sourceArchives?: Record<string, unknown>;
  fileOrigin?: boolean;
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
    game: g.s.edition ?? '0.2.0',
    framework: FRAMEWORK_VERSION,
    seed: g.s.seed,
    minute: g.s.minute,
    inputs: structuredClone(g.inputs),
    state: stateJson(g.s),
    fingerprint: fingerprint(g.s),
    ...(g.chapter ? { chapter: structuredClone(g.chapter) } : {}),
    ...(g.ownedHeads ? { ownedHeads: structuredClone(g.ownedHeads) } : {}),
    ...(g.nativeReturnHeads ? { nativeReturnHeads: structuredClone(g.nativeReturnHeads) } : {}),
    ...(g.sourceArchives ? { sourceArchives: structuredClone(g.sourceArchives) } : {}),
    ...(g.fileOrigin ? { fileOrigin: true } : {}),
  };
}

export function load(saved: Saved): Game {
  if (saved.framework !== FRAMEWORK_VERSION) throw new Error('Older framework notebook. Start fresh.');
  const edition = editionOf(saved.game);
  if ((saved.state.edition ?? '0.2.0') !== edition) throw new Error('Save edition does not match its state');
  return {
    s: restoreState(saved.state),
    inputs: structuredClone(saved.inputs),
    ...(saved.chapter ? { chapter: structuredClone(saved.chapter) } : {}),
    ...(saved.ownedHeads ? { ownedHeads: structuredClone(saved.ownedHeads) } : {}),
    ...(saved.nativeReturnHeads ? { nativeReturnHeads: structuredClone(saved.nativeReturnHeads) } : {}),
    ...(saved.sourceArchives ? { sourceArchives: structuredClone(saved.sourceArchives) } : {}),
    ...(saved.fileOrigin ? { fileOrigin: true } : {}),
  };
}

/** Replay on the recorded edition. Unversioned calls retain the legacy 0.2.x contract. */
export function replay(
  seed: number,
  inputs: readonly Input[],
  minute: number,
  edition: string = '0.2.0',
  chapter?: Chapter,
): Game {
  const g = newGame(seed, edition, chapter);
  for (const i of inputs) {
    advance(g, i.at);
    apply(g.s, i);
    g.inputs.push(structuredClone(i));
  }
  advance(g, minute);
  return g;
}
