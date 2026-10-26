/**
 * The game around the hill: the keeper's inputs (each applied at an exact minute on a quantum boundary, so a run
 * replays), saves and the playtest export (seed + input log + state JSON).
 */
import { FRAMEWORK_VERSION, restore, snapshot } from '@adam0white/human-framework';
import type { PersonaEnvelope } from '@adam0white/lab-client';
import { requestAdaEnd } from './ada-care.ts';
import type { Chapter } from './cast.ts';
import { endCutDiscussion, inviteCutDiscussion } from './cut-discussion.ts';
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
export const TEXT_VERSION = 'plain3';
const DEFAULT_EDITION = GAME_VERSION;
export type Edition = '0.2.0' | '0.3.0' | '0.4.0' | '0.5.0' | '0.6.0' | '0.7.0';

export function editionOf(version: string): Edition {
  if (/^0\.2\.\d+$/.test(version)) return '0.2.0';
  if (
    version === '0.3.0' ||
    version === '0.4.0' ||
    version === '0.5.0' ||
    version === '0.6.0' ||
    version === '0.7.0'
  )
    return version;
  throw new Error(`This version of Warren cannot load game version ${version}. Start a new game.`);
}

export type Input =
  | { at: number; verb: 'chalk'; cells: number[]; on: boolean }
  | { at: number; verb: 'use'; cells: number[]; use: UseName }
  | { at: number; verb: 'lamp'; cell: number }
  | { at: number; verb: 'unlamp'; cell: number }
  | { at: number; verb: 'door'; cell: number }
  | { at: number; verb: 'bell' }
  | { at: number; verb: 'discuss-cut' | 'end-cut-discussion' | 'acknowledge' }
  | { at: number; verb: 'away'; elapsedMs: number; quanta: number }
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

export type NextConfig = 'warren-next/1' | 'warren-next/2';
function supportedConfig(config: unknown): config is NextConfig {
  return config === 'warren-next/1' || config === 'warren-next/2';
}
export function newGame(
  seed: number,
  edition: string = DEFAULT_EDITION,
  chapter?: Chapter,
  config?: NextConfig,
): Game {
  resetCaches();
  const rules = editionOf(edition);
  const s = chapter
    ? restoreState(chapter.initial)
    : newWarren(seed, rules === '0.5.0' || rules === '0.6.0' || rules === '0.7.0');
  if (
    chapter &&
    (chapter.version !== (rules === '0.6.0' || rules === '0.7.0' ? 'warren-cast/2' : 'warren-cast/1') ||
      s.seed !== seed ||
      (rules !== '0.5.0' && rules !== '0.6.0' && rules !== '0.7.0'))
  )
    throw new Error('This version cannot load the saved starting state. Start a new game.');
  if (rules !== '0.2.0') s.edition = rules;
  if (!chapter && (rules === '0.6.0' || rules === '0.7.0')) seedRoleGoals(s);
  if (!chapter && rules === '0.7.0') s.refuge = { slept: {}, raids: {}, forage: { day: -1, gathered: 0 } };
  if (config !== undefined) {
    if (!supportedConfig(config) || rules !== '0.7.0')
      throw new Error('This hill configuration is not supported.');
    if (!chapter) s.next = { config };
    else if (s.next?.config !== config) throw new Error('The saved starting configuration does not match.');
  } else if (s.next) throw new Error('The saved hill needs its recorded configuration.');
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
    case 'acknowledge':
      if (!s.next?.attention) return false;
      delete s.next.attention;
      return true;
    case 'end-cut-discussion':
      return endCutDiscussion(s);
    case 'discuss-cut':
      return inviteCutDiscussion(s);
    case 'away':
      return runAway(s, i.elapsedMs, i.quanta);
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

/**
 * SCOPE: opt-in hill catch-up at one game minute per real minute. Every quantum runs the
 * ordinary HF/world path. New notes and existing choices stop it at the first input boundary.
 * The caller measures CPU time; only its actual completed work is pinned in replay input.
 * No clock is read by replay, no reward is minted, and unplayed time is reported, not banked.
 */
function needsAttention(s: WarrenState): boolean {
  return (
    !!s.next?.attention ||
    !!s.bell ||
    !!(s.next?.discussion && s.next.discussion.endedAt === undefined) ||
    s.raids.some((r) => r.stage === 'smoke' || r.stage === 'riders') ||
    Object.keys(s.flags).some(
      (k) => k.startsWith('invitation-pending:') || k.startsWith('release-pending:'),
    ) ||
    !!(s.adaVisit && s.adaVisit.endedAt === undefined && s.adaVisit.returnBy <= s.minute + QUANTUM)
  );
}
function validAway(s: WarrenState, elapsedMs: number, quanta: number): boolean {
  return (
    !!s.next &&
    supportedConfig(s.next.config) &&
    Number.isSafeInteger(elapsedMs) &&
    elapsedMs >= 0 &&
    Number.isSafeInteger(quanta) &&
    quanta >= 0 &&
    quanta <= Math.floor(elapsedMs / (QUANTUM * 60_000))
  );
}
function runAway(s: WarrenState, elapsedMs: number, limit: number, yieldWork?: () => boolean): boolean {
  const next = s.next;
  if (!next || !validAway(s, elapsedMs, limit)) return false;
  const from = s.minute;
  const events: string[] = [];
  let reason: 'attention' | 'event' | 'elapsed' | 'computation' = 'elapsed';
  let steps = 0;
  while (steps < limit) {
    if (needsAttention(s)) {
      reason = 'attention';
      break;
    }
    const last = s.notes.at(-1);
    advanceTo(s, s.minute + QUANTUM);
    steps++;
    const index = last ? s.notes.indexOf(last) + 1 : 0;
    const added = s.notes.slice(index);
    events.push(...added.map((n) => n.text));
    if (added.length) {
      next.attention = added.map((n) => n.text);
      reason = 'event';
      break;
    }
    if (needsAttention(s)) {
      reason = 'attention';
      break;
    }
    if (steps < Math.floor(elapsedMs / (QUANTUM * 60_000)) && yieldWork?.()) {
      reason = 'computation';
      break;
    }
  }
  if (needsAttention(s) && !steps) reason = 'attention';
  if (reason === 'elapsed' && steps < Math.floor(elapsedMs / (QUANTUM * 60_000))) reason = 'computation';
  next.away = {
    elapsedMs,
    simulatedMinutes: s.minute - from,
    remainderMs: elapsedMs - (s.minute - from) * 60_000,
    stopReason: reason,
    events,
  };
  return true;
}
export function catchUp(g: Game, elapsedMs: number, yieldWork?: () => boolean): boolean {
  const quanta = Math.floor(elapsedMs / (QUANTUM * 60_000));
  if (!validAway(g.s, elapsedMs, quanta)) return false;
  const at = g.s.minute;
  const started = performance.now();
  runAway(g.s, elapsedMs, quanta, yieldWork ?? (() => performance.now() - started >= 8));
  g.inputs.push({ at, verb: 'away', elapsedMs, quanta: (g.s.minute - at) / QUANTUM });
  return true;
}

// ---------- saves and export ----------

export interface Saved {
  config?: NextConfig;
  textVersion?: string;
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
    ...(g.s.next ? { config: g.s.next.config } : {}),
    textVersion: TEXT_VERSION,
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
  if (saved.framework !== FRAMEWORK_VERSION)
    throw new Error(
      'This saved game uses an older version of the Human Framework. Start fresh with a new game.',
    );
  if (saved.textVersion !== TEXT_VERSION)
    throw new Error('This saved game uses a different version. Start a new game.');
  const edition = editionOf(saved.game);
  if (
    saved.config !== saved.state.next?.config ||
    (saved.config && (!supportedConfig(saved.config) || edition !== '0.7.0'))
  )
    throw new Error('The saved configuration does not match its state.');
  if ((saved.state.edition ?? '0.2.0') !== edition)
    throw new Error('The saved game’s version does not match its recorded state. Start a new game.');
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
  config?: NextConfig,
): Game {
  const g = newGame(seed, edition, chapter, config);
  for (const i of inputs) {
    advance(g, i.at);
    apply(g.s, i);
    g.inputs.push(structuredClone(i));
  }
  advance(g, minute);
  return g;
}
