/**
 * The game around the hill: the keeper's inputs (each applied at an exact minute on a quantum boundary, so a run
 * replays), saves and the playtest export (seed + input log + state JSON).
 */
import { type PersonAuthoring, restoreRun } from '@adam0white/human-framework';
import type { PersonaEnvelope } from '@adam0white/lab-client';
import { requestAdaEnd } from './ada-care.ts';
import { askAda, withdrawAdaTalk } from './ada-talk.ts';
import type { Chapter } from './cast.ts';
import { endCutDiscussion, inviteCutDiscussion } from './cut-discussion.ts';
import { H, USE, type UseName, W } from './grid.ts';
import { FRAMEWORK_VERSION, need, syncReadings } from './hf4.ts';
import { prepareNativeReturn } from './native-return.ts';
import { rally } from './rally.ts';
import {
  requestDoor,
  requestDoorTrial,
  requestTalk,
  withdrawDoorTrial,
  withdrawRequest,
} from './resident-requests.ts';
import { releaseVisit, visit } from './visits.ts';
import {
  advanceFrame,
  advanceTo,
  drainAdvance,
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

export const GAME_VERSION = '0.7.0';
export const TEXT_VERSION = 'plain3';
const DEFAULT_EDITION = '0.7.0';
export type Edition = '0.2.0' | '0.3.0' | '0.4.0' | '0.5.0' | '0.6.0' | '0.7.0';

export function editionOf(version: string): Edition {
  if (version === '0.7.0') return version;
  throw new Error('This hill uses an older game version. Keep its file and start fresh with a new hill.');
}

export type Input =
  | { at: number; verb: 'ask-ada' | 'withdraw-ada-talk' }
  | { at: number; verb: 'chalk'; cells: number[]; on: boolean }
  | { at: number; verb: 'use'; cells: number[]; use: UseName }
  | { at: number; verb: 'lamp'; cell: number }
  | { at: number; verb: 'unlamp'; cell: number }
  | { at: number; verb: 'door'; cell: number }
  | { at: number; verb: 'bell' }
  | { at: number; verb: 'rally' }
  | { at: number; verb: 'discuss-cut' | 'end-cut-discussion' | 'acknowledge' }
  | { at: number; verb: 'away'; elapsedMs: number; quanta: number }
  | { at: number; verb: 'talk-rest' | 'talk-disagreement'; who: string }
  | { at: number; verb: 'test-door' | 'try-door'; who: string; cell: number }
  | { at: number; verb: 'withdraw-door-trial' }
  | { at: number; verb: 'withdraw-request'; kind: 'rest' | 'disagreement' | 'door' }
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

export type NextConfig = 'warren-next/1' | 'warren-next/2' | 'warren-rest/1';
function supportedConfig(config: unknown): config is NextConfig {
  return config === 'warren-next/1' || config === 'warren-next/2' || config === 'warren-rest/1';
}
export function newGame(
  seed: number,
  edition: string = DEFAULT_EDITION,
  chapter?: Chapter,
  config?: NextConfig,
  incoming?: (opening: PersonAuthoring) => PersonAuthoring,
): Game {
  resetCaches();
  const rules = editionOf(edition);
  const s = chapter ? restoreState(chapter.initial) : newWarren(seed, true, incoming);
  if (
    chapter &&
    (chapter.version !== 'warren-hf4-cast/1' ||
      s.seed !== seed ||
      (rules !== '0.5.0' && rules !== '0.6.0' && rules !== '0.7.0'))
  )
    throw new Error('This version cannot load the saved starting state. Start a new game.');
  if (rules !== '0.2.0') s.edition = rules;
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
  drainAdvance(g.s);
  const i = { ...o, at: g.s.minute } as Input;
  const ok = apply(g.s, i);
  if (ok) g.inputs.push(i);
  return ok;
}

function apply(s: WarrenState, i: Input): boolean {
  switch (i.verb) {
    case 'ask-ada':
      return askAda(s);
    case 'withdraw-ada-talk':
      return withdrawAdaTalk(s);
    case 'talk-rest':
      return requestTalk(s, i.who, 'rest');
    case 'talk-disagreement':
      return requestTalk(s, i.who, 'disagreement');
    case 'try-door':
      return requestDoorTrial(s, i.who, i.cell);
    case 'withdraw-door-trial':
      return withdrawDoorTrial(s);
    case 'test-door':
      return requestDoor(s, i.who, i.cell);
    case 'withdraw-request':
      return withdrawRequest(s, i.kind);
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
    case 'rally':
      return rally(s);
  }
}

/** Advance to `to`, rounded down to a quantum. */
export function advance(g: Game, to: number) {
  const q = Math.floor(to / QUANTUM) * QUANTUM;
  if (g.s.hfPhase || q > g.s.minute) advanceTo(g.s, q);
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
    !!(s.next?.requests && Object.values(s.next.requests).some((r) => r.endedAt === undefined)) ||
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
    const index = last ? s.notes.findLastIndex((n) => JSON.stringify(n) === JSON.stringify(last)) + 1 : 0;
    const added = s.notes.slice(index);
    events.push(...added.map((n) => n.text));
    if (added.length) {
      s.next!.attention = added.map((n) => n.text);
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
  s.next!.away = {
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
  drainAdvance(g.s);
  const at = g.s.minute;
  const started = performance.now();
  runAway(g.s, elapsedMs, quanta, yieldWork ?? (() => performance.now() - started >= 8));
  g.inputs.push({ at, verb: 'away', elapsedMs, quanta: (g.s.minute - at) / QUANTUM });
  return true;
}

// ---------- saves and export ----------

export type PhaseCheckpoint = { from: number; to: number; steps: number };
export interface Saved {
  phase?: PhaseCheckpoint;
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

export function stateJson(s: WarrenState): WarrenState {
  syncCommunity(s);
  return JSON.parse(JSON.stringify(s)) as WarrenState;
}
export function restoreState(json: WarrenState): WarrenState {
  resetCaches();
  if (
    !json ||
    !json.hf ||
    !Array.isArray(json.houses) ||
    !Array.isArray(json.notes) ||
    !Array.isArray(json.hill?.kind) ||
    !Number.isSafeInteger(json.seed) ||
    !Number.isSafeInteger(json.minute) ||
    !json.hfActive ||
    !json.hfOffers ||
    !Array.isArray(json.hfQueue)
  )
    throw new Error('This saved hill is unsupported. Keep its file and start fresh.');
  need(restoreRun(json.hf));
  const restored = structuredClone(json);
  syncReadings(restored);
  return restored;
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
  return fingerprintJson(stateJson(s));
}
export function fingerprintJson(j: WarrenState): string {
  const text = JSON.stringify(sorted(j));
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

export function save(g: Game): Saved {
  const state = stateJson(g.s);
  return {
    ...(g.s.next ? { config: g.s.next.config } : {}),
    textVersion: TEXT_VERSION,
    game: g.s.edition ?? '0.2.0',
    framework: FRAMEWORK_VERSION,
    seed: g.s.seed,
    minute: g.s.minute,
    inputs: structuredClone(g.inputs),
    state,
    ...(state.hfPhase
      ? { phase: { from: state.hfPhase.from, to: state.hfPhase.to, steps: state.hfPhase.steps } }
      : {}),
    fingerprint: fingerprintJson(state),
    ...(g.chapter ? { chapter: structuredClone(g.chapter) } : {}),
    ...(g.ownedHeads ? { ownedHeads: structuredClone(g.ownedHeads) } : {}),
    ...(g.nativeReturnHeads ? { nativeReturnHeads: structuredClone(g.nativeReturnHeads) } : {}),
    ...(g.sourceArchives ? { sourceArchives: structuredClone(g.sourceArchives) } : {}),
    ...(g.fileOrigin ? { fileOrigin: true } : {}),
  };
}

/** Decode the current player tape before replay or restore. Unknown inputs are refused. */
function validInput(value: unknown): value is Input {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const input = value as Record<string, unknown>;
  if (
    !Number.isSafeInteger(input.at) ||
    typeof input.at !== 'number' ||
    input.at % QUANTUM !== 0 ||
    typeof input.verb !== 'string'
  )
    return false;
  const cell = (v: unknown) => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 && v < W * H;
  const who = typeof input.who === 'string' && input.who.length > 0;
  let keys: string[];
  switch (input.verb) {
    case 'ask-ada':
    case 'withdraw-ada-talk':
    case 'bell':
    case 'rally':
    case 'discuss-cut':
    case 'end-cut-discussion':
    case 'acknowledge':
    case 'withdraw-door-trial':
    case 'care-ada':
    case 'end-ada-visit':
      keys = [];
      break;
    case 'chalk':
      if (!Array.isArray(input.cells) || !input.cells.every(cell) || typeof input.on !== 'boolean')
        return false;
      keys = ['cells', 'on'];
      break;
    case 'use':
      if (
        !Array.isArray(input.cells) ||
        !input.cells.every(cell) ||
        typeof input.use !== 'string' ||
        !Object.hasOwn(USE, input.use)
      )
        return false;
      keys = ['cells', 'use'];
      break;
    case 'lamp':
    case 'unlamp':
    case 'door':
      if (!cell(input.cell)) return false;
      keys = ['cell'];
      break;
    case 'talk-rest':
    case 'talk-disagreement':
    case 'visit':
    case 'release':
      if (!who) return false;
      keys = ['who'];
      break;
    case 'test-door':
    case 'try-door':
      if (!who || !cell(input.cell)) return false;
      keys = ['who', 'cell'];
      break;
    case 'prepare-native-return':
      if (!['kian', 'meryem'].includes(String(input.who))) return false;
      keys = ['who'];
      break;
    case 'withdraw-request':
      if (!['rest', 'disagreement', 'door'].includes(String(input.kind))) return false;
      keys = ['kind'];
      break;
    case 'away':
      if (
        typeof input.elapsedMs !== 'number' ||
        !Number.isSafeInteger(input.elapsedMs) ||
        input.elapsedMs < 0 ||
        typeof input.quanta !== 'number' ||
        !Number.isSafeInteger(input.quanta) ||
        input.quanta < 0
      )
        return false;
      keys = ['elapsedMs', 'quanta'];
      break;
    default:
      return false;
  }
  return Object.keys(input).every((key) => ['at', 'verb', ...keys].includes(key));
}
function validTape(inputs: unknown, start: number, end: number): inputs is Input[] {
  if (!Array.isArray(inputs)) return false;
  let previous = start;
  for (const input of inputs) {
    if (!validInput(input) || input.at < previous || input.at > end) return false;
    previous = input.at;
  }
  return true;
}

export function load(saved: Saved): Game {
  if (
    !saved ||
    typeof saved !== 'object' ||
    !saved.state ||
    !Number.isSafeInteger(saved.seed) ||
    !Number.isFinite(saved.minute) ||
    saved.seed !== saved.state.seed ||
    saved.minute !== saved.state.minute ||
    !saved.state.hf ||
    saved.minute !== Math.floor(saved.state.hf.current.at / 60_000) ||
    !validTape(saved.inputs, saved.state.hf.initial.spec.start / 60_000, saved.minute)
  )
    throw Error('This saved hill or input log is invalid. Keep its file and start fresh.');
  if (saved.framework !== FRAMEWORK_VERSION)
    throw new Error(
      'This saved game uses an older version of the Human Framework. Start fresh with a new game.',
    );
  if (saved.textVersion !== TEXT_VERSION)
    throw new Error('This saved game uses a different version. Start a new game.');
  if (
    saved.phase?.from !== saved.state.hfPhase?.from ||
    saved.phase?.to !== saved.state.hfPhase?.to ||
    saved.phase?.steps !== saved.state.hfPhase?.steps
  )
    throw Error('The partial checkpoint header is invalid. Keep the file and start fresh.');
  const edition = editionOf(saved.game);
  if (
    saved.config !== saved.state.next?.config ||
    (saved.config && (!supportedConfig(saved.config) || edition !== '0.7.0'))
  )
    throw new Error('The saved configuration does not match its state.');
  if ((saved.state.edition ?? '0.2.0') !== edition)
    throw new Error('The saved game’s version does not match its recorded state. Start a new game.');
  const game: Game = {
    s: restoreState(saved.state),
    inputs: structuredClone(saved.inputs),
    ...(saved.chapter ? { chapter: structuredClone(saved.chapter) } : {}),
    ...(saved.ownedHeads ? { ownedHeads: structuredClone(saved.ownedHeads) } : {}),
    ...(saved.nativeReturnHeads ? { nativeReturnHeads: structuredClone(saved.nativeReturnHeads) } : {}),
    ...(saved.sourceArchives ? { sourceArchives: structuredClone(saved.sourceArchives) } : {}),
    ...(saved.fileOrigin ? { fileOrigin: true } : {}),
  };
  if (fingerprint(game.s) !== saved.fingerprint)
    throw Error('The saved state does not match its verification code. Keep the file and start fresh.');
  return game;
}

/** Replay current ordered inputs and the exact persisted partial-quantum checkpoint. */
export function replay(
  seed: number,
  inputs: readonly Input[],
  minute: number,
  edition: string = '0.7.0',
  chapter?: Chapter,
  config?: NextConfig,
  phase?: PhaseCheckpoint,
): Game {
  const g = newGame(seed, edition, chapter, config);
  if (
    !Number.isFinite(minute) ||
    minute < g.s.minute ||
    !validTape(inputs, g.s.minute, phase?.from ?? minute)
  )
    throw Error('The input log or replay time is invalid. Keep the file and start fresh.');
  for (const i of inputs) {
    advance(g, i.at);
    if (g.s.minute !== i.at || !apply(g.s, i))
      throw Error('A recorded input is not accepted by this game. Keep its file and start fresh.');
    g.inputs.push(structuredClone(i));
  }
  advance(g, phase?.from ?? minute);
  if (phase) {
    if (
      !Number.isSafeInteger(phase.steps) ||
      phase.steps < 1 ||
      phase.steps > 10000 ||
      phase.to !== phase.from + QUANTUM
    )
      throw new Error('Unsupported partial hill checkpoint. Keep the file and start fresh.');
    for (let n = 0; n < phase.steps; n++) advanceFrame(g.s, 0);
    if (
      g.s.minute !== minute ||
      g.s.hfPhase?.from !== phase.from ||
      g.s.hfPhase?.to !== phase.to ||
      g.s.hfPhase?.steps !== phase.steps
    )
      throw new Error('The partial hill checkpoint does not match its input log.');
  }
  if (!phase && g.s.minute !== minute)
    throw Error('The replay time does not name a complete quantum. Keep the file and start fresh.');
  return g;
}
