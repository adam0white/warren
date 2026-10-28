/**
 * The hill as an HF host: world truth (rock, rooms, grain, water, raids, the neighbours) and the HF `World` its
 * people decide in. Every figure is a full HF4 actor in one community Run; there are no
 * lightweight agents (measured in scripts/measure.ts; see docs/design.md, performance).
 *
 * The keeper's marks are world shaping, not orders. Chalk makes a face that can be dug, a lamp makes a passage
 * quicker and lets a pick work, a store or beds mark makes a room somewhere people can carry grain or sleep. People
 * choose among the offers this module makes, whose durations come from real paths on the hill; worn and lit
 * routes are quicker, so they are chosen more and wear further (the human version of a pheromone trail). Crews
 * form because an offer names the people already doing it (`alongside`, HF 2.8.0). The one voice is the
 * dig-master's bell: a standing suggestion to shelter, which people weigh and answer, with trust that moves.
 *
 * The sim advances in fixed quanta (QUANTUM minutes) in play and replay alike; inputs apply at quantum boundaries.
 */

import type { Input as HFInput, PersonAuthoring, RunArchive, StepResult } from '@adam0white/human-framework';
import { type AdaVisit, completeAdaCare, requestAdaEnd } from './ada-care.ts';
import {
  type AdaTalk,
  adaTalkOffers,
  adaTalkSuggestion,
  captureAdaTalkAnswer,
  finishAdaTalk,
  observeAdaTalk,
} from './ada-talk.ts';
import {
  DAY,
  daylight,
  dayOfMinute,
  doyOf,
  HOUR,
  isLight,
  minuteOfDay,
  seasonOf,
  yearOf,
} from './calendar.ts';
import {
  type CutDiscussion,
  cutOffers,
  cutSuggestion,
  finishCutStatement,
  observeCutDiscussion,
} from './cut-discussion.ts';
import {
  AIR_REACH,
  airSteps,
  BEDS_PER_CELL,
  cellsWithUse,
  DIG_HOURS,
  diggable,
  type Field,
  faces,
  grainBelow,
  type Hill,
  idx,
  K,
  lighting,
  neighbours,
  newHill,
  paths,
  RIDGE,
  refreshKnown,
  route,
  SPOIL_BLOCK,
  STORE_CAP,
  SURF,
  stepCost,
  surfaceCell,
  THEIR_X,
  USE,
  W,
  xOf,
  yOf,
} from './grid.ts';
import {
  type Activity,
  type Affordance,
  ageYears,
  archiveOf,
  createWarrenRun,
  type DecisionRecord,
  enqueue,
  hfRunOf,
  interruptPerson,
  type Outcome,
  type Percept,
  type Person,
  readBody,
  type SimEvent,
  type Suggestion,
  type SuggestionResolution,
  sendInjury,
  stepWarren,
  syncReadings,
  type World,
} from './hf4.ts';
import { arrivingFamily, BELL, founders, type House, USTA_ID } from './people.ts';
import {
  captureResidentAnswer,
  type DoorRequest,
  finishResidentWork,
  observeResidentTalk,
  type ResidentRequests,
  recordOrdinaryReopening,
  residentOffers,
  residentSuggestion,
} from './resident-requests.ts';
import { DRAW, hashUnit, strHash } from './rng.ts';
import { assignmentFor, finishRoleWork, ROLE_TASKS, roleTask, supervised } from './roles.ts';
import { releaseVisit, visit } from './visits.ts';

export const QUANTUM = 30;

// ---------- engineering constants (tuned by scripts/measure.ts) ----------
export const V = {
  /** Kile a person eats a day (about 200 kg of grain a year at 25 kg a kile). */
  ration: 0.03,
  /** Kile a person carries in one trip (two sacks on a back). */
  load: 2,
  /** Drinks a carried water jar holds. */
  drinksPerLoad: 12,
  /** Water jars the hearth holds. */
  hearthWater: 8,
  /** Kile reaped an hour at skill 0.5. */
  reapRate: 0.9,
  /** Steps from the entrance the riders search, unless a shut door stops them. */
  riderReach: 9,
  /** Bell suggestion strength. */
  bellStrength: 0.7,
  /** Hours the bell's call stands. */
  bellHours: 6,
};

export type NoteKind =
  | 'story'
  | 'dig'
  | 'find'
  | 'raid'
  | 'arrival'
  | 'answer'
  | 'path'
  | 'habit'
  | 'theft'
  | 'hurt'
  | 'goal'
  | 'day';

export interface Note {
  at: number;
  kind: NoteKind;
  text: string;
  who?: string;
  cell?: number;
  /** How much it matters (0..3): the notebook shows heavier notes first. */
  weight: number;
}

/** Where a person is going and when, so the swarm can be drawn and wear laid down. */
export interface Trip {
  action: string;
  cells: number[];
  times: number[];
  /** Minute the work itself starts (after the walk). */
  workFrom: number;
  /** What they carry on which legs: index into cells from which they are loaded. */
  loadedFrom?: number;
  load?: 'spoil' | 'grain' | 'water';
  /** The face or cell worked. */
  target?: number;
  end: number;
}

export interface Raid {
  /** Minute smoke is seen. */
  smoke: number;
  /** Minute riders reach the hill. */
  riders: number;
  /** Minute they leave. */
  leave: number;
  /** How hard they search (0..1). */
  force: number;
  stage: 'coming' | 'smoke' | 'riders' | 'gone';
  /** What they took (kile) and who was hurt, for the note. */
  took: number;
  hurt: string[];
  /** New edition only: places searched and people who would have been caught during the scare. */
  scouted?: number[];
  wouldCatch?: string[];
}

export interface Answer {
  at: number;
  who: string;
  verdict: SuggestionResolution['verdict'];
  says: string;
}

export interface WarrenState {
  /** Absent in legacy saves; never added when continuing them. */
  edition?: '0.3.0' | '0.4.0' | '0.5.0' | '0.6.0' | '0.7.0';
  adaVisit?: AdaVisit;
  /** Created only by a recorded public ask-ada input. */
  adaTalks?: AdaTalk[];
  nativeDepartures?: Record<
    string,
    {
      person: unknown;
      care?: AdaVisit;
      preparedAt: number;
      guard: unknown;
    }
  >;
  recoveries?: { who: string; injury: string; part: string; severity: number }[];
  seed: number;
  minute: number;
  hill: Hill;
  /** Bumped when rock, rooms, lamps or doors change (path and light caches key on it). */
  version: number;
  people: Person[];
  houses: House[];
  hf: RunArchive;
  hfEventCursor?: string;
  hfPhase?: {
    from: number;
    to: number;
    target: number;
    steps: number;
    result?: StepResult;
    events?: SimEvent[];
    lastNote?: Note;
  };
  hfActive: Record<string, Activity>;
  hfOffers: Record<string, { revision: number; offers: Affordance[] }>;
  hfQueue: HFInput[];
  pos: Record<string, number>;
  trips: Record<string, Trip>;
  fields: { size: number; standing: number; sown: number; floor: number };
  raids: Raid[];
  bell: { at: number; until: number; real: boolean } | null;
  answers: Answer[];
  /** What travellers say about the hill (0..1); brings families. */
  word: number;
  heldAt: number;
  arrivals: number;
  linked: boolean;
  linkCell: number;
  /** The neighbours' grievance (0..1+). */
  grudge: number;
  theirGrain: number;
  thefts: { at: number; who: string; noticed: boolean }[];
  queued: Record<string, Percept[]>;
  notes: Note[];
  /** Each person's last account of why they chose what they are doing (HF narration). */
  why?: Record<string, string>;
  /** Opt-in 0.7 host outcomes. Absent from all earlier editions. */
  refuge?: {
    slept: Record<string, number>;
    raids: Record<string, { present: string[]; exposed: string[]; behindDoor: boolean }>;
    forage: { day: number; gathered: number };
  };
  /** Unchecked next-slice configuration only; ordinary 0.6/0.7 state never gains this field. */
  next?: {
    config: 'warren-next/1' | 'warren-next/2' | 'warren-rest/1';
    requests?: ResidentRequests;
    discussion?: CutDiscussion;
    attention?: string[];
    away?: {
      elapsedMs: number;
      simulatedMinutes: number;
      remainderMs: number;
      stopReason: 'attention' | 'event' | 'elapsed' | 'computation';
      events: string[];
    };
  };
  /** Created only by a recorded try-door input; never changes the hill configuration. */
  doorTrials?: DoorRequest[];
  goals: Record<string, number>;
  flags: Record<string, number>;
  stats: {
    dug: number;
    firstPick?: number;
    firstChalk?: number;
    hurt: number;
    died: number;
    bell: Record<string, number>;
    peak: number;
  };
  usedNames: string[];
}

// ---------- setup ----------

export function newWarren(
  seed: number,
  canonical = true,
  incoming?: (opening: PersonAuthoring) => PersonAuthoring,
  openingMinute = 5 * HOUR,
): WarrenState {
  if (!Number.isSafeInteger(openingMinute * 60_000)) throw Error('The authored opening time is unsupported.');
  const now = openingMinute;
  const hill = newHill(seed);
  const { houses, people } = founders(seed, now, canonical);
  const pos: Record<string, number> = {};
  for (const h of houses) for (const m of h.members) pos[m] = surfaceCell(h.x);
  pos[USTA_ID] = idx(17, SURF + 3);
  const r = (k: number) => hashUnit(seed, DRAW.raid, k);
  const first = (11 + Math.floor(r(1) * 4)) * DAY + (9 + Math.floor(r(2) * 6)) * HOUR;
  const raids: Raid[] = [];
  const add = (smoke: number, force: number, k: number) => {
    const riders = smoke + (6 + Math.floor(r(k) * 8)) * HOUR;
    raids.push({
      smoke,
      riders,
      leave: riders + (18 + Math.floor(r(k + 1) * 22)) * HOUR,
      force,
      stage: 'coming',
      took: 0,
      hurt: [],
    });
  };
  add(first, 0.6, 10);
  add(first + (34 + Math.floor(r(3) * 10)) * DAY + 8 * HOUR, 0.7, 20);
  // Year two: one in late spring, a large one at harvest.
  add((270 + Math.floor(r(4) * 20)) * DAY + 10 * HOUR, 0.75, 30);
  add((352 + Math.floor(r(5) * 12)) * DAY + 13 * HOUR, 1, 40);
  const s: WarrenState = {
    seed,
    minute: now,
    hill,
    version: 0,
    people: [],
    hf: null as unknown as RunArchive,
    hfActive: {},
    hfOffers: {},
    hfQueue: [],
    houses,
    pos,
    trips: {},
    fields: { size: 70, standing: 70, sown: 0, floor: 0 },
    raids,
    bell: null,
    answers: [],
    word: 0.3,
    heldAt: -1,
    arrivals: 0,
    linked: false,
    linkCell: -1,
    grudge: 0,
    theirGrain: 140,
    thefts: [],
    queued: {},
    notes: [],
    goals: {},
    flags: {},
    stats: { dug: 0, hurt: 0, died: 0, bell: {}, peak: people.length },
    usedNames: [...people.map((p) => p.identity.name), 'house:Kaya', 'house:Demir', 'house:Usta'],
  };
  const localGoals = new Map(people.map((person) => [person.id, structuredClone(person.state.agenda.goals)]));
  const admitted = people.map((person) => (incoming ? incoming(person) : person));
  createWarrenRun(s, admitted);
  // Retained admission requires an empty opening agenda. Local work goals enter through HF inputs afterwards.
  for (const person of admitted)
    if (person.portable?.person.version === 2) {
      for (const goal of localGoals.get(person.id) ?? [])
        enqueue(s, 'agenda.requested', { person: person.id, request: { type: 'goal', goal } });
    }
  note(s, {
    kind: 'story',
    text: 'The barley was ripe. Riders had burned two villages to the south in spring. The cellar under Yusuf’s house held one jar.',
    weight: 3,
  });
  // Everyone has heard about the burned villages: a fear the season keeps alive.
  for (const p of people)
    queue(s, p.id, {
      at: now + 1,
      channel: 'told',
      kind: 'rumour',
      actorId: 'travellers',
      salience: 0.8,
      valence: -0.6,
      threat: { severity: 0.5, chance: 0.5, sourceId: 'riders' },
      summary: 'Riders burned two villages to the south this spring.',
    });
  return s;
}

export function note(s: WarrenState, n: Omit<Note, 'at'> & { at?: number }) {
  s.notes.push({ at: n.at ?? s.minute, ...n });
  if (s.notes.length > 400) s.notes.splice(0, s.notes.length - 400);
}

export const personOf = (s: WarrenState, id: string) => s.people.find((p) => p.id === id);
export const houseOf = (s: WarrenState, pid: string) => s.houses.find((h) => h.members.includes(pid));
const adult = (p: Person) => ageYears(p) >= 14;
const elder = (p: Person) => ageYears(p) >= 68;

/** Read-only: the living people whose offers can include digging now (same gates as `offersFor`). */
export function diggingAdults(s: WarrenState): Person[] {
  const later = s.edition === '0.6.0' || s.edition === '0.7.0';
  return s.people.filter(
    (p) =>
      p.body.alive &&
      (later ? ageYears(p) >= 18 : adult(p)) &&
      !elder(p) &&
      !(later && ['tariq', 'kian'].includes(p.id)) &&
      !s.flags[`released:${p.id}`],
  );
}

// ---------- caches (not saved; rebuilt from state) ----------

interface Cache {
  key: string;
  air: Int16Array;
  lit: Uint8Array;
}
let cache: Cache | null = null;
let anchorCache: { key: string; fields: Map<number, Field> } | null = null;

export function airAndLight(s: WarrenState): { air: Int16Array; lit: Uint8Array } {
  const day = isLight(s.minute);
  const key = `${s.seed}:${s.version}:${day ? 1 : 0}`;
  if (cache?.key === key) return cache;
  const air = airSteps(s.hill);
  const lit = lighting(s.hill, air, day);
  cache = { key, air, lit };
  return cache;
}

function anchorField(s: WarrenState, from: number): Field {
  const key = `${s.seed}:${s.version}:${Math.floor(s.minute / QUANTUM)}:${s.linked ? 1 : 0}`;
  if (anchorCache?.key !== key) anchorCache = { key, fields: new Map() };
  let f = anchorCache.fields.get(from);
  if (!f) {
    f = paths(s.hill, from, airAndLight(s).lit, s.linked);
    anchorCache.fields.set(from, f);
  }
  return f;
}

export function resetCaches() {
  // Keep the state we are leaving whole: its community lives in the cache until synced.

  cache = null;
  anchorCache = null;
}

export function touch(s: WarrenState) {
  s.version++;
  refreshKnown(s.hill);
}

// ---------- places ----------

const hearthCell = (s: WarrenState) => cellsWithUse(s.hill, USE.hearth)[0] ?? idx(17, SURF + 3);
const heapCell = (s: WarrenState) => surfaceCell(s.hill.surface.heap);
const floorCell = (s: WarrenState) => surfaceCell(s.hill.surface.floor);
const springCell = (s: WarrenState) => surfaceCell(s.hill.surface.spring);
const homeCell = (h: House) => surfaceCell(h.x);
const fieldCells = (s: WarrenState) => {
  const out: number[] = [];
  for (let x = s.hill.surface.fields[0]; x <= s.hill.surface.fields[1]; x++) out.push(surfaceCell(x));
  return out;
};

export function bedsBelow(s: WarrenState): number {
  return cellsWithUse(s.hill, USE.beds).length * BEDS_PER_CELL;
}

function sleepersAt(s: WarrenState, cell: number): number {
  let n = 0;
  for (const p of s.people) {
    const t = s.trips[p.id];
    if (p.activity?.mode === 'sleep' && t?.end === cell) n++;
  }
  return n;
}

/** New-edition bed reservations include shelter journeys; a person may keep their own place. */
function bedAvailable(s: WarrenState, cell: number, who: string): boolean {
  let n = 0;
  for (const p of s.people) {
    if (!p.body.alive || p.id === who) continue;
    if (s.trips[p.id]?.end === cell && (p.activity?.mode === 'sleep' || p.activity?.action === 'shelter'))
      n++;
  }
  return n < BEDS_PER_CELL;
}

/** Offer a protected bed only along a reachable route with breathable air, nearest by walking cost. */
function protectedBed(s: WarrenState, f: Field, air: Int16Array, who: string): number {
  const exposed = riderCells(s);
  let best = -1;
  let distance = Number.POSITIVE_INFINITY;
  for (const c of cellsWithUse(s.hill, USE.beds)) {
    const d = f.dist[c] ?? Number.POSITIVE_INFINITY;
    if (d >= distance || exposed.has(c) || !bedAvailable(s, c, who)) continue;
    if (route(f, c).some((i) => yOf(i) >= SURF && (air[i] ?? 32000) > AIR_REACH)) continue;
    best = c;
    distance = d;
  }
  return best;
}

/** Cells reachable from the entrance within the riders' reach, not past a shut door. */
export function riderCells(s: WarrenState): Map<number, number> {
  const h = s.hill;
  const out = new Map<number, number>();
  // Every opening to the sky is a way down: the entrance and any shaft dug up through the top row.
  const d = new Map<number, number>();
  const q: number[] = [];
  for (let x = 0; x < W; x++) {
    const c = idx(x, SURF);
    if (h.kind[c] === K.open && xOf(c) < RIDGE) {
      d.set(c, 0);
      q.push(c);
    }
  }
  for (let qi = 0; qi < q.length; qi++) {
    const i = q[qi] ?? 0;
    const di = d.get(i) ?? 0;
    if (h.use[i] === USE.door && h.shut[i]) continue;
    out.set(i, di);
    if (di >= V.riderReach) continue;
    for (const j of neighbours(i)) {
      if (h.kind[j] !== K.open || d.has(j)) continue;
      d.set(j, di + 1);
      q.push(j);
    }
  }
  return out;
}

export function activeRaid(s: WarrenState): Raid | undefined {
  return s.raids.find((r) => r.stage === 'smoke' || r.stage === 'riders');
}

function underThreat(s: WarrenState): 'riders' | 'smoke' | 'bell' | null {
  const r = activeRaid(s);
  if (r?.stage === 'riders') return 'riders';
  if (r?.stage === 'smoke') return 'smoke';
  if (s.bell && s.bell.until > s.minute) return 'bell';
  return null;
}

// ---------- offers ----------

interface Plan {
  cells: number[];
  times: number[];
  workFrom: number;
  loadedFrom?: number;
  load?: Trip['load'];
  target?: number;
  end: number;
}
/** Trip plans for the offers just made, by person and offer id (transient; consumed at begin). */
const plans = new Map<string, Map<string, Plan>>();

function walkTimes(s: WarrenState, cells: number[], t0: number, lit: Uint8Array, loaded = false): number[] {
  const times: number[] = [];
  let t = t0;
  for (let k = 0; k < cells.length; k++) {
    if (k > 0) {
      const a = cells[k - 1] ?? 0;
      const b = cells[k] ?? 0;
      t += stepCost(s.hill, b, lit) * (Math.abs(a - b) === W ? 1.25 : 1) * (loaded ? 1.3 : 1);
    }
    times.push(t);
  }
  return times;
}

/** A plan that walks to `to`, works `work` minutes there; optionally then carries to `dest` from anchor field. */
function plan(
  s: WarrenState,
  from: Field,
  _start: number,
  to: number,
  _work: number,
  lit: Uint8Array,
  carry?: { dest: number; destField: Field; load: Trip['load']; handle?: number },
): Plan | null {
  if (!Number.isFinite(from.dist[to] ?? Number.POSITIVE_INFINITY)) return null;
  const leg1 = route(from, to);
  const t1 = walkTimes(s, leg1, s.minute, lit);
  const arrive = t1.at(-1) ?? s.minute;
  if (!carry) return { cells: leg1, times: t1, workFrom: arrive, target: to, end: to };
  const back = route(carry.destField, to).reverse();
  if (back.length === 0 || back[0] !== to) return null;
  const handle = carry.handle ?? 4;
  const t2 = walkTimes(s, back, arrive + handle, lit, true);
  return {
    cells: [...leg1, ...back.slice(1)],
    times: [...t1, ...t2.slice(1)],
    workFrom: arrive,
    loadedFrom: leg1.length - 1,
    load: carry.load,
    target: to,
    end: carry.dest,
  };
}

function minutesOf(p: Plan, work: number): number {
  const walk = (p.times.at(-1) ?? 0) - (p.times[0] ?? 0);
  return Math.max(5, Math.round(walk + work));
}

function nearestStoreWithSpace(s: WarrenState, f: Field): number {
  let best = -1;
  let bd = Number.POSITIVE_INFINITY;
  for (const c of cellsWithUse(s.hill, USE.store)) {
    if ((s.hill.grain[c] ?? 0) > STORE_CAP - 0.5) continue;
    const d = f.dist[c] ?? Number.POSITIVE_INFINITY;
    if (d < bd) {
      bd = d;
      best = c;
    }
  }
  return best;
}

function nearestStoreWithGrain(s: WarrenState, f: Field): number {
  let best = -1;
  let bd = Number.POSITIVE_INFINITY;
  for (let c = 0; c < s.hill.grain.length; c++) {
    if ((s.hill.grain[c] ?? 0) < 0.05 || yOf(c) < SURF || s.hill.kind[c] !== K.open) continue;
    const d = f.dist[c] ?? Number.POSITIVE_INFINITY;
    if (d < bd) {
      bd = d;
      best = c;
    }
  }
  return best;
}

function people(s: WarrenState, pred: (t: Trip, p: Person) => boolean): string[] {
  const out: string[] = [];
  for (const p of s.people) {
    const t = s.trips[p.id];
    if (t && p.activity && pred(t, p)) out.push(p.id);
  }
  return out;
}

function riskOutside(s: WarrenState): Affordance['risk'] | undefined {
  const r = activeRaid(s);
  if (r?.stage === 'riders') return { chance: 0.35, severity: 0.6, kind: 'riders' };
  return undefined;
}

export function offersFor(s: WarrenState, p: Person): Affordance[] {
  if (
    p.id === 'kian' &&
    !p.activity &&
    s.adaVisit &&
    (s.adaVisit.endRequested || s.minute >= s.adaVisit.returnBy)
  )
    requestAdaEnd(s);
  if (s.flags[`invitation-pending:${p.id}`] && !p.activity && !s.raids.some((r) => r.stage === 'riders'))
    visit(s, p.id);
  if (s.flags[`release-pending:${p.id}`] && !p.activity) releaseVisit(s, p.id);
  if (s.flags[`released:${p.id}`] === s.minute + 1) return [];
  const at = s.minute;
  const h = s.hill;
  const { air, lit } = airAndLight(s);
  const from = s.pos[p.id] ?? surfaceCell(10);
  const f = paths(h, from, lit, s.linked);
  const mine = new Map<string, Plan>();
  plans.set(p.id, mine);
  const out: Affordance[] = [];
  const offer = (a: Affordance, pl: Plan | null, work: number) => {
    if (!pl) return;
    a.duration = minutesOf(pl, work);
    mine.set(a.id, pl);
    out.push(a);
  };
  const mod = minuteOfDay(at);
  const doy = doyOf(dayOfMinute(at));
  const season = seasonOf(doy);
  const { rise, set } = daylight(doy);
  const light = mod >= rise && mod < set - 20;
  const threat = underThreat(s);
  const preferProtectedBed =
    (s.edition === '0.4.0' || s.edition === '0.5.0' || s.edition === '0.6.0' || s.edition === '0.7.0') &&
    !!activeRaid(s);
  const outside = riskOutside(s);
  const house = houseOf(s, p.id);
  const sleepy = !light || p.body.sleepPressure > 0.7 || p.body.sleepDebtHours > 0.5 || p.body.health < 0.5;
  const winter = season === 'winter';
  const hearth = hearthCell(s);
  for (const a of adaTalkOffers(s, p)) offer(a, plan(s, f, at, hearth, 30, lit), 30);
  for (const a of cutOffers(s, p)) offer(a, plan(s, f, at, hearth, 30, lit), 30);
  for (const r of residentOffers(s, p)) offer(r.offer, plan(s, f, at, r.cell, r.minutes, lit), r.minutes);
  const below = yOf(from) >= SURF;
  const isAdult = s.edition === '0.6.0' || s.edition === '0.7.0' ? ageYears(p) >= 18 : adult(p);
  const old = elder(p);

  if (
    (s.edition === '0.6.0' || s.edition === '0.7.0') &&
    !s.flags[`released:${p.id}`] &&
    s.flags[`role-note:${p.id}`] !== Math.floor(s.minute / DAY) + 1 &&
    light &&
    !threat
  ) {
    const task = roleTask(p.id, assignmentFor(s, p.id));
    const destination = ['maryam', 'tamar', 'kian'].includes(p.id) && house ? homeCell(house) : hearth;
    const enough =
      task?.action !== 'cook' ||
      (house && house.jars > V.ration && (house.prepared ?? 0) < V.ration * house.members.length * 2);
    if (task && enough && supervised(s, p.id, destination, (id) => positionAt(s, id, s.minute)))
      offer(
        {
          id: `role-${task.action}`,
          action: task.action,
          label: task.label,
          placeId: house && destination === homeCell(house) ? `house:${house.id}` : 'hearth',
          duration: 0,
          effort: 0.12,
          advertises: { competence: 0.12, belonging: 0.08 },
          advances: ['canonical-role', 'between-games-assignment'],
          tags: ['work', 'bounded-role'],
        },
        plan(s, f, at, destination, task.minutes, lit),
        task.minutes,
      );
  }
  if (
    p.id === 'kian' &&
    s.adaVisit &&
    s.adaVisit.endedAt === undefined &&
    at < s.adaVisit.returnBy &&
    !threat &&
    house &&
    house.jars >= 0.1 &&
    (h.water[hearth] ?? 0) >= 0.1 &&
    s.flags['ada-care-request']
  ) {
    offer(
      {
        id: 'care-ada',
        action: 'care-ada',
        label: 'share household grain and jar water with Ada, then rest together',
        targetId: 'ada',
        placeId: 'hearth',
        duration: 0,
        effort: 0.08,
        advertises: { belonging: 0.5, meaning: 0.4 },
        tags: ['bounded-role'],
      },
      plan(s, f, at, hearth, 30, lit),
      30,
    );
  }
  // Sleep: at home on the surface, or below if there are beds there.
  if (sleepy) {
    const untilDawn = light ? 120 : Math.max(60, Math.min(540, ((rise + DAY - mod) % DAY) + 15));
    if (house) {
      const pl = plan(s, f, at, homeCell(house), untilDawn, lit);
      offer(
        {
          id: 'sleep-home',
          action: 'sleep',
          label: 'sleep at home',
          placeId: `house:${house.id}`,
          duration: 0,
          effort: 0,
          mode: 'sleep',
          advertises: winter ? { sleep: 0.6, rest: 0.25 } : { sleep: 0.8, rest: 0.4 },
          tags: ['sleep'],
          ...(outside ? { risk: outside } : {}),
        },
        pl,
        untilDawn,
      );
    }
    const beds = cellsWithUse(h, USE.beds).filter((c) =>
      s.edition === '0.4.0' || s.edition === '0.5.0' || s.edition === '0.6.0' || s.edition === '0.7.0'
        ? bedAvailable(s, c, p.id)
        : sleepersAt(s, c) < BEDS_PER_CELL,
    );
    let bc = -1;
    let bd = Number.POSITIVE_INFINITY;
    for (const c of beds) {
      const d = f.dist[c] ?? Number.POSITIVE_INFINITY;
      if (d < bd) {
        bd = d;
        bc = c;
      }
    }
    if (preferProtectedBed) {
      const protectedCell = protectedBed(s, f, air, p.id);
      if (protectedCell >= 0) bc = protectedCell;
    }
    if (bc >= 0) {
      const stale = (air[bc] ?? 0) > AIR_REACH;
      offer(
        {
          id: 'sleep-below',
          action: 'sleep',
          label: 'sleep below',
          placeId: 'beds',
          duration: 0,
          effort: 0,
          mode: 'sleep',
          advertises: {
            sleep: winter ? 0.8 : 0.7,
            rest: winter ? 0.45 : 0.3,
            ...(threat ? { safety: 0.3 } : {}),
            ...(stale ? { rest: 0.1 } : {}),
          },
          tags: ['sleep'],
        },
        plan(s, f, at, bc, untilDawn, lit),
        untilDawn,
      );
    } else if (threat && below) {
      offer(
        {
          id: 'sleep-floor',
          action: 'sleep',
          label: 'sleep on the floor below',
          placeId: 'below',
          duration: 0,
          effort: 0,
          mode: 'sleep',
          advertises: { sleep: 0.55, rest: 0.15, safety: 0.25 },
          tags: ['sleep'],
        },
        plan(s, f, at, from, untilDawn, lit),
        untilDawn,
      );
    }
  }

  // Rest and talk at the hearth; rest where you are.
  offer(
    {
      id: 'rest',
      action: 'rest',
      label: below ? 'sit and rest' : 'rest in the shade',
      placeId: below ? 'below' : 'surface',
      duration: 0,
      effort: 0,
      advertises: { rest: 0.3, leisure: 0.1 },
      tags: ['rest'],
    },
    plan(s, f, at, from, 80, lit),
    80,
  );
  const breakTime = !light || mod < rise + 60 || (mod >= 12 * HOUR && mod < 13 * HOUR) || mod >= set - 90;
  if (breakTime || !isAdult || old || winter) {
    const there = people(s, (t, q) => q.activity?.action === 'chat' && t.end === hearth);
    const partner =
      s.edition === '0.7.0' && positionAt(s, p.id, at) === hearth
        ? s.people.find(
            (q) => q.id !== p.id && q.body.alive && !q.body.asleep && positionAt(s, q.id, at) === hearth,
          )
        : undefined;
    offer(
      {
        id: 'chat',
        action: 'chat',
        label: old ? 'sit by the hearth and talk' : 'sit at the hearth with the others',
        placeId: 'hearth',
        duration: 0,
        effort: 0.05,
        advertises: { belonging: 0.25, leisure: 0.15, ...(s.people.length > 1 ? {} : {}) },
        tags: ['social', 'leisure', ...(partner ? ['conversation'] : [])],
        ...(partner ? { targetId: partner.id } : {}),
        ...(there.length ? { alongside: there.slice(0, 4) } : {}),
      },
      plan(s, f, at, hearth, 75, lit),
      75,
    );
  }

  // Water: drink at the hearth jars, at a well below, or at the spring.
  const wells = cellsWithUse(h, USE.well);
  const thirsty = readBody(p).perceived.thirst > 0.3;
  if (!thirsty) {
    // nothing: they drink with meals and when they feel it
  } else if ((h.water[hearth] ?? 0) > 0.05) {
    offer(
      {
        id: 'drink',
        action: 'drink',
        label: 'drink from the jar',
        placeId: 'hearth',
        duration: 0,
        effort: 0.02,
        advertises: { water: 0.6 },
      },
      plan(s, f, at, hearth, 4, lit),
      4,
    );
  } else if (wells[0] !== undefined) {
    offer(
      {
        id: 'drink-well',
        action: 'drink',
        label: 'drink at the well',
        placeId: 'well',
        duration: 0,
        effort: 0.05,
        advertises: { water: 0.6 },
      },
      plan(s, f, at, wells[0], 4, lit),
      4,
    );
  }
  if (thirsty && !(threat === 'riders' && below)) {
    offer(
      {
        id: 'drink-spring',
        action: 'drink',
        label: 'drink at the spring',
        placeId: 'spring',
        duration: 0,
        effort: 0.05,
        advertises: { water: 0.6 },
        ...(outside ? { risk: outside } : {}),
      },
      plan(s, f, at, springCell(s), 4, lit),
      4,
    );
  }

  // Food: the jars at home, or a store below eaten at the hearth.
  const meal =
    (mod >= rise - 30 && mod < rise + 120) ||
    (mod >= 12 * HOUR && mod < 14 * HOUR) ||
    (mod >= set - 30 && mod < set + 150);
  if (meal || p.body.satiety < 0.35) {
    const lean =
      s.people.length * V.ration * 20 >
      grainBelow(h) + s.houses.reduce((a, x) => a + x.jars + (x.prepared ?? 0), 0);
    if (house && house.jars + (house.prepared ?? 0) > 0.05 && !(threat === 'riders' && below)) {
      offer(
        {
          id: 'eat-home',
          action: 'eat',
          label: 'eat at home',
          placeId: `house:${house.id}`,
          duration: 0,
          effort: 0.05,
          advertises: { food: lean ? 0.4 : 0.6, water: 0.35 },
          tags: ['food'],
          ...(outside ? { risk: outside } : {}),
        },
        plan(s, f, at, homeCell(house), 30, lit),
        30,
      );
    }
    const store = nearestStoreWithGrain(s, anchorField(s, hearth));
    if (store >= 0 && Number.isFinite(f.dist[hearth] ?? Number.POSITIVE_INFINITY)) {
      offer(
        {
          id: 'eat-hearth',
          action: 'eat',
          label: 'eat at the hearth',
          placeId: 'hearth',
          duration: 0,
          effort: 0.05,
          advertises: { food: lean ? 0.4 : 0.6, water: 0.35, belonging: 0.05 },
          tags: ['food'],
        },
        plan(s, f, at, hearth, 30, lit),
        30,
      );
    }
  }

  // Quiet worship at dusk, for those who keep it.
  if (
    p.agenda.commitments.some(
      (c) => c.kind === 'worship' && c.status === 'pending' && c.from <= at && c.until > at,
    )
  ) {
    const where = below || !house ? hearth : homeCell(house);
    offer(
      {
        id: 'pray',
        action: 'pray',
        label: 'pray',
        placeId: below || !house ? 'hearth' : `house:${house.id}`,
        duration: 0,
        effort: 0.05,
        advertises: { meaning: 0.1 },
        norms: [{ normId: 'salah', relation: 'fulfills' }],
        tags: ['worship'],
      },
      plan(s, f, at, where, 12, lit),
      12,
    );
  }

  // Shelter: smoke, riders, or the bell.
  if (threat) {
    const bed = preferProtectedBed ? protectedBed(s, f, air, p.id) : -1;
    const deep = bed >= 0 ? bed : deepestSafe(s, f, p.id);
    if (deep >= 0 && deep !== from) {
      const safety = threat === 'riders' ? 0.7 : threat === 'smoke' ? 0.5 : 0.2;
      const going = people(s, (_t, q) => q.activity?.action === 'shelter').slice(0, 4);
      offer(
        {
          id: 'shelter',
          action: 'shelter',
          label: 'go below and stay there',
          placeId: 'below',
          duration: 0,
          effort: 0.1,
          advertises: { safety, belonging: 0.05 },
          tags: ['safety'],
          ...(going.length ? { alongside: going } : {}),
        },
        plan(s, f, at, deep, 150, lit),
        150,
      );
    }
    for (const d of cellsWithUse(h, USE.door)) {
      if (h.doorWork[d] || h.shut[d]) continue;
      if (!Number.isFinite(f.dist[d] ?? Number.POSITIVE_INFINITY) || (f.dist[d] ?? 0) > 40) continue;
      if (!isAdult) continue;
      offer(
        {
          id: `shut-${d}`,
          action: 'shut-door',
          label: 'roll the stone door shut',
          targetId: String(d),
          placeId: 'door',
          duration: 0,
          effort: 0.6,
          advertises: { safety: threat === 'bell' ? 0.1 : 0.35, esteem: 0.05 },
          tags: ['safety', 'work'],
        },
        plan(s, f, at, d, 8, lit),
        8,
      );
    }
    if (threat === 'riders' && !below) {
      offer(
        {
          id: 'hide',
          action: 'hide',
          label: 'hide in the gorge',
          placeId: 'gorge',
          duration: 0,
          effort: 0.3,
          advertises: { safety: 0.35 },
          tags: ['safety'],
        },
        plan(s, f, at, surfaceCell(0), 120, lit),
        120,
      );
    }
  } else {
    // Doors stay shut until someone rolls them back.
    for (const d of cellsWithUse(h, USE.door)) {
      if (!h.shut[d] || !isAdult) continue;
      const near = neighbours(d).find((j) => Number.isFinite(f.dist[j] ?? Number.POSITIVE_INFINITY));
      if (near === undefined) continue;
      offer(
        {
          id: `open-${d}`,
          action: 'open-door',
          label: 'roll the door back',
          targetId: String(d),
          placeId: 'door',
          duration: 0,
          effort: 0.5,
          advertises: { autonomy: 0.05, competence: 0.03 },
          tags: ['work'],
        },
        plan(s, f, at, near, 8, lit),
        8,
      );
    }
  }

  if (!isAdult) {
    // Children play where the others are, and fetch a little.
    offer(
      {
        id: 'play',
        action: 'play',
        label: below ? 'play in the passages' : 'play by the houses',
        placeId: below ? 'below' : 'surface',
        duration: 0,
        effort: 0.25,
        advertises: { leisure: 0.3, belonging: 0.1 },
        tags: ['leisure'],
      },
      plan(s, f, at, from, 100, lit),
      100,
    );
    return out;
  }
  if (old) {
    // The dig-master walks down to a face to show the stroke.
    const fs = faces(h).filter(
      (x) =>
        lit[x.stand] && people(s, (t, q) => q.activity?.action === 'dig' && t.target === x.face).length > 0,
    );
    const fc = fs[0];
    if (fc && light) {
      offer(
        {
          id: 'show',
          action: 'show',
          label: 'go underground and show them how to swing the pick',
          placeId: 'face',
          duration: 0,
          effort: 0.3,
          advertises: { meaning: 0.12, esteem: 0.06, belonging: 0.05 },
          tags: ['social', 'work'],
          requires: { moving: 0.3 },
        },
        plan(s, f, at, fc.stand, 60, lit),
        60,
      );
    }
    return out;
  }

  const working = !threat || threat === 'bell';
  // The fields.
  if (light && !(threat === 'riders') && season === 'harvest' && s.fields.standing > 0.5) {
    const fc = fieldCells(s);
    const cell = fc[(strHash(p.id) >>> 0) % fc.length] ?? surfaceCell(5);
    const reaping = people(s, (_t, q) => q.activity?.action === 'reap').slice(0, 4);
    offer(
      {
        id: 'reap',
        action: 'reap',
        label: 'harvest the barley',
        placeId: 'field',
        duration: 0,
        effort: 0.7,
        skill: { id: 'farming', difficulty: 0.3 },
        advertises: { safety: 0.16, competence: 0.06, belonging: 0.05 },
        material: 2,
        tags: ['work', 'outdoors'],
        ...(reaping.length ? { alongside: reaping } : {}),
        ...(outside ? { risk: outside } : {}),
      },
      plan(s, f, at, cell, 180, lit),
      180,
    );
  }
  // Gleaning and the goats: a thin living from the hills when the jars run low. It keeps people alive, not fed.
  const jarsNow = grainBelow(h) + s.houses.reduce((a, x) => a + x.jars + (x.prepared ?? 0), 0);
  if (
    light &&
    working &&
    !threat &&
    house &&
    jarsNow < s.people.length * V.ration * 12 &&
    (s.edition !== '0.7.0' ||
      !s.refuge ||
      s.refuge.forage.day !== Math.floor(at / DAY) ||
      s.refuge.forage.gathered < (season === 'winter' ? 0.03 : 0.06))
  ) {
    offer(
      {
        id: 'forage',
        action: 'forage',
        label:
          season === 'winter'
            ? 'take the goats out to feed'
            : 'gather leftover grain and wild food in the hills',
        placeId: 'hills',
        duration: 0,
        effort: 0.6,
        advertises: { food: 0.08, competence: 0.03 },
        material: 1.2,
        tags: ['work', 'outdoors'],
        ...(outside ? { risk: outside } : {}),
      },
      plan(s, f, at, surfaceCell(1), 240, lit),
      240,
    );
  }
  if (
    light &&
    working &&
    (season === 'autumn' || (season === 'harvest' && s.fields.standing < 0.5)) &&
    s.fields.sown < 1 &&
    seedAvailable(s) > 0.5
  ) {
    const fc = fieldCells(s);
    offer(
      {
        id: 'sow',
        action: 'sow',
        label: 'plough the fields and plant grain',
        placeId: 'field',
        duration: 0,
        effort: 0.6,
        skill: { id: 'farming', difficulty: 0.3 },
        advertises: { safety: 0.14, competence: 0.06 },
        material: 2,
        tags: ['work', 'outdoors'],
      },
      plan(s, f, at, fc[(strHash(p.id) >>> 0) % fc.length] ?? surfaceCell(5), 180, lit),
      180,
    );
  }
  // Carry grain below: from the threshing floor, or from home jars.
  const smoke = threat === 'smoke' || threat === 'riders';
  if (!(threat === 'riders')) {
    const srcs: { cell: number; id: string; label: string }[] = [];
    if (s.fields.floor > 0.3)
      srcs.push({
        cell: floorCell(s),
        id: 'carry-floor',
        label: 'carry bundles of harvested grain down to the store',
      });
    if (house && house.jars > 0.3)
      srcs.push({ cell: homeCell(house), id: 'carry-jars', label: 'carry our jars down' });
    for (const src of srcs) {
      const sf = anchorField(s, src.cell);
      const dest = nearestStoreWithSpace(s, sf);
      if (dest < 0) continue;
      const carrying = people(s, (t) => t.load === 'grain').slice(0, 3);
      offer(
        {
          id: src.id,
          action: 'carry-grain',
          label: src.label,
          targetId: String(src.cell),
          placeId: 'store',
          duration: 0,
          effort: 0.55,
          advertises: { safety: smoke ? 0.4 : 0.14, esteem: 0.04, belonging: 0.05 },
          // A sack carried below is a sack the riders will not find (engineering assumption: valued as wealth kept).
          material: smoke ? 3 : 1.2,
          tags: ['work'],
          ...(carrying.length ? { alongside: carrying } : {}),
        },
        plan(s, f, at, src.cell, 4, lit, { dest, destField: anchorField(s, dest), load: 'grain' }),
        4,
      );
    }
  }
  // Water: fill the hearth jars from the well or the spring.
  if ((h.water[hearth] ?? 0) < V.hearthWater - 1 && !(threat === 'riders' && wells.length === 0)) {
    const src = wells[0] ?? (threat === 'riders' ? -1 : springCell(s));
    if (src >= 0) {
      const dry = (h.water[hearth] ?? 0) < 1;
      offer(
        {
          id: 'fetch-water',
          action: 'fetch-water',
          label: wells.length ? 'fill the jars at the well' : 'fetch water from the spring',
          targetId: String(src),
          placeId: wells.length ? 'well' : 'spring',
          duration: 0,
          effort: 0.45,
          // Household work, paid in the household's water: it has to beat a rest, like any chore.
          material: dry ? 1.2 : 0.5,
          advertises: { water: dry ? 0.2 : 0.04, belonging: 0.08, esteem: 0.04 },
          tags: ['work'],
          ...(wells.length || !outside ? {} : { risk: outside }),
        },
        plan(s, f, at, src, 4, lit, { dest: hearth, destField: anchorField(s, hearth), load: 'water' }),
        4,
      );
    }
  }
  // Lamps: someone makes one at the hearth when the keeper wants more than there are.
  if (h.lampsWanted.length > 0 && h.lampsSpare === 0) {
    offer(
      {
        id: 'make-lamp',
        action: 'make-lamp',
        label: 'shape a clay lamp and bake it in a fire',
        placeId: 'hearth',
        duration: 0,
        effort: 0.2,
        focus: 0.4,
        advertises: { competence: 0.07, esteem: 0.03 },
        material: 1,
        tags: ['work', 'craft'],
      },
      plan(s, f, at, hearth, 150, lit),
      150,
    );
  }
  // Doors to carve.
  for (let d = 0; d < h.use.length; d++) {
    if (h.use[d] !== USE.door || !(h.doorWork[d] ?? 0)) continue;
    if (!lit[d] && !neighbours(d).some((j) => lit[j])) continue;
    offer(
      {
        id: `carve-${d}`,
        action: 'carve-door',
        label: 'carve the stone door',
        targetId: String(d),
        placeId: 'door',
        duration: 0,
        effort: 0.75,
        skill: { id: 'digging', difficulty: 0.5 },
        advances: ['refuge'],
        material: 1.5,
        advertises: { competence: 0.08, safety: 0.12, esteem: 0.05 },
        tags: ['work'],
      },
      plan(s, f, at, d, 120, lit),
      120,
    );
    break;
  }
  // Digging: the nearest faces that can be worked, up to three.
  if (working) {
    const fs = faces(h)
      .filter((x) => faceState(s, x.face, x.stand, lit, air) === 'ready')
      .map((x) => ({ ...x, d: f.dist[x.stand] ?? Number.POSITIVE_INFINITY }))
      .filter((x) => Number.isFinite(x.d))
      .sort((a, b) => a.d - b.d || a.face - b.face)
      .slice(0, 3);
    for (const x of fs) {
      const k = h.kind[x.face] ?? K.rock;
      const there = people(
        s,
        (t, q) =>
          q.activity?.action === 'dig' &&
          Math.abs(xOf(t.target ?? 0) - xOf(x.face)) + Math.abs(yOf(t.target ?? 0) - yOf(x.face)) <= 2,
      );
      offer(
        {
          id: `dig-${x.face}`,
          action: 'dig',
          label:
            k === K.hard
              ? 'cut at the hard rock'
              : k === K.loose
                ? 'dig at the loose stone wall'
                : 'dig at the wall marked with chalk',
          targetId: String(x.face),
          placeId: 'face',
          duration: 0,
          effort: 0.75,
          skill: { id: 'digging', difficulty: k === K.hard ? 0.6 : 0.3 },
          advances: ['refuge'],
          advertises: { safety: 0.12, competence: 0.1, esteem: 0.06, meaning: 0.06 },
          tags: ['work'],
          ...(k === K.loose ? { risk: { chance: 0.12, severity: 0.5, kind: 'collapse' } } : {}),
          ...(there.length ? { alongside: there.slice(0, 4) } : {}),
        },
        plan(s, f, at, x.stand, 150, lit),
        150,
      );
    }
    // Spoil: the nearest pile and the biggest, carried up to the heap.
    const piles: number[] = [];
    let near = -1;
    let nd = Number.POSITIVE_INFINITY;
    let big = -1;
    let bs = 0;
    for (let c = 0; c < h.spoil.length; c++) {
      const sp = h.spoil[c] ?? 0;
      if (sp <= 0) continue;
      const d = f.dist[c] ?? Number.POSITIVE_INFINITY;
      if (!Number.isFinite(d)) continue;
      if (d < nd) {
        nd = d;
        near = c;
      }
      if (sp > bs) {
        bs = sp;
        big = c;
      }
    }
    if (near >= 0) piles.push(near);
    if (big >= 0 && big !== near) piles.push(big);
    const heap = heapCell(s);
    for (const c of piles) {
      const carrying = people(s, (t) => t.load === 'spoil').slice(0, 4);
      offer(
        {
          id: `spoil-${c}`,
          action: 'carry-spoil',
          label: 'carry loose stone up to the pile above ground',
          targetId: String(c),
          placeId: 'heap',
          duration: 0,
          effort: 0.6,
          advances: ['refuge'],
          advertises: { safety: 0.06, esteem: 0.05, belonging: 0.07 },
          tags: ['work'],
          ...(carrying.length ? { alongside: carrying } : {}),
        },
        plan(s, f, at, c, 3, lit, { dest: heap, destField: anchorField(s, heap), load: 'spoil', handle: 3 }),
        3,
      );
    }
  }
  // The neighbours' jars, once a passage reaches them.
  if (s.linked && s.theirGrain > 1 && !(threat === 'riders')) {
    const theirs = s.hill.theirStore.filter((c) => Number.isFinite(f.dist[c] ?? Number.POSITIVE_INFINITY));
    const tc = theirs[0];
    if (tc !== undefined) {
      const sf = anchorField(s, tc);
      const dest = nearestStoreWithSpace(s, sf);
      if (dest >= 0) {
        const lean =
          s.people.length * V.ration * 30 >
          grainBelow(h) + s.houses.reduce((a, x) => a + x.jars + (x.prepared ?? 0), 0);
        const going = people(s, (_t, q) => q.activity?.action === 'take').slice(0, 2);
        offer(
          {
            id: 'take',
            action: 'take',
            label: 'bring back a sack from the next village’s store',
            targetId: String(tc),
            placeId: 'theirs',
            duration: 0,
            effort: 0.55,
            advertises: { food: lean ? 0.25 : 0.05, safety: lean ? 0.1 : 0.02 },
            material: 2,
            norms: [{ normId: 'theft', relation: 'violates' }],
            tags: ['risky'],
            risk: { chance: 0.2, severity: 0.25, kind: 'caught' },
            ...(going.length ? { alongside: going } : {}),
          },
          plan(s, f, at, tc, 6, lit, { dest, destField: anchorField(s, dest), load: 'grain' }),
          6,
        );
      }
    }
  }
  const scoped =
    (s.edition === '0.6.0' || s.edition === '0.7.0') && ['tariq', 'kian'].includes(p.id)
      ? out.filter(
          (a) =>
            a.tags?.includes('bounded-role') || (!a.tags?.includes('work') && !a.tags?.includes('risky')),
        )
      : out;
  return s.flags[`released:${p.id}`]
    ? scoped.filter((a) =>
        ['eat', 'drink', 'sleep', 'rest', 'pray', 'shelter', 'hide', 'shut-door'].includes(a.action),
      )
    : scoped;
}

function seedAvailable(s: WarrenState): number {
  return s.fields.floor + grainBelow(s.hill) + s.houses.reduce((a, h) => a + h.jars, 0);
}

/** The safest reachable open cell: deepest past a door if any, else the deepest reachable. */
function deepestSafe(s: WarrenState, f: Field, who: string): number {
  const h = s.hill;
  const exposed = riderCells(s);
  let best = -1;
  let score = -1;
  for (let i = 0; i < h.kind.length; i++) {
    if (h.kind[i] !== K.open || !Number.isFinite(f.dist[i] ?? Number.POSITIVE_INFINITY)) continue;
    if (s.edition === '0.4.0' || s.edition === '0.5.0' || s.edition === '0.6.0' || s.edition === '0.7.0') {
      if (h.use[i] === USE.beds && !bedAvailable(s, i, who)) continue;
      const { air } = airAndLight(s);
      if (route(f, i).some((c) => yOf(c) >= SURF && (air[c] ?? 32000) > AIR_REACH)) continue;
    }
    const sc =
      yOf(i) * 2 + (exposed.has(i) ? 0 : 40) + (h.use[i] === USE.beds || h.use[i] === USE.hearth ? 6 : 0);
    if (sc > score) {
      score = sc;
      best = i;
    }
  }
  return best;
}

export type FaceState = 'ready' | 'dark' | 'stale' | 'spoil' | 'busy' | 'unreached';

/** Why a chalked face is or is not being worked: what the keeper can read on the wall. */
export function faceState(
  s: WarrenState,
  face: number,
  stand: number,
  lit: Uint8Array,
  air: Int16Array,
): FaceState {
  const h = s.hill;
  if (yOf(stand) >= SURF && (air[stand] ?? 32000) > AIR_REACH) return 'stale';
  if (!lit[stand] && !lit[face]) return 'dark';
  if ((h.spoil[stand] ?? 0) >= SPOIL_BLOCK) return 'spoil';
  const diggers = people(
    s,
    (t, q) => q.activity?.action === 'dig' && t.target === stand && Number(q.activity.targetId) === face,
  ).length;
  if (diggers >= 2) return 'busy';
  return 'ready';
}

// ---------- outcomes ----------

function workDone(t: Trip | undefined, act: Activity, now: number): number {
  const from = t?.workFrom ?? act.startedAt;
  const span = Math.max(1, act.endsAt - from);
  return Math.max(0, Math.min(1, (now - from) / span)) * ((act.endsAt - from) / 60);
}

/** Host work only: the same earned cut used by resolution and by the read-only drawing. */
function cutProgress(s: WarrenState, p: Person, act: Activity, now: number): number {
  const skill = p.skills.digging?.level ?? 0.4;
  const cap = readBody(p).capacity;
  const rate = (0.55 + 0.9 * skill) * (0.4 + 0.6 * cap) * (act.protest ? 0.6 : 1);
  const per = DIG_HOURS[s.hill.kind[Number(act.targetId)] ?? K.rock] ?? 5;
  return (workDone(s.trips[p.id], act, now) * rate) / per;
}

/** Approximate visible cut during an ongoing pick stroke. Does not award or save work. */
export function digProgress(s: WarrenState, face: number, at = s.minute): number {
  let progress = s.hill.dig[face] ?? 0;
  if (s.edition === '0.7.0')
    for (const p of s.people) {
      const act = p.activity;
      if (p.body.alive && act?.action === 'dig' && Number(act.targetId) === face && s.trips[p.id])
        progress += cutProgress(s, p, act, Math.min(at, act.endsAt));
    }
  return Math.max(0, Math.min(1, progress));
}

function storeGrain(s: WarrenState, cell: number, kile: number): number {
  const h = s.hill;
  let left = kile;
  const put = (c: number) => {
    const room = Math.max(0, STORE_CAP - (h.grain[c] ?? 0));
    const k = Math.min(room, left);
    h.grain[c] = (h.grain[c] ?? 0) + k;
    left -= k;
  };
  if (h.use[cell] === USE.store) put(cell);
  for (const c of cellsWithUse(h, USE.store)) {
    if (left <= 0.01) break;
    put(c);
  }
  if (left > 0.01) h.grain[cell] = (h.grain[cell] ?? 0) + left; // set down on the floor
  return kile;
}

function takeGrain(s: WarrenState, near: number, kile: number): number {
  const h = s.hill;
  const f = anchorField(s, near);
  let left = kile;
  for (let guard = 0; left > 0.001 && guard < 40; guard++) {
    const c = nearestStoreWithGrain(s, f);
    if (c < 0) break;
    const k = Math.min(h.grain[c] ?? 0, left);
    h.grain[c] = (h.grain[c] ?? 0) - k;
    left -= k;
  }
  return kile - left;
}

function resolveActivity(s: WarrenState, p: Person, act: Activity, reason: 'ended' | 'interrupted'): Outcome {
  const now = p.now;
  const base: Outcome = {
    affordanceId: act.affordanceId,
    action: act.action,
    status: reason === 'interrupted' ? 'interrupted' : 'completed',
    at: now,
  };
  if (act.targetId !== undefined) base.targetId = act.targetId;
  const t = s.trips[p.id];
  const h = s.hill;
  const done = reason === 'ended';
  const hours = workDone(t, act, now);
  // Where they are now.
  s.pos[p.id] = done ? (t?.end ?? s.pos[p.id] ?? 0) : positionAt(s, p.id, now);
  const adaTalk = finishAdaTalk(s, p, act, done);
  if (adaTalk) return { ...base, ...adaTalk };
  const residentWork = finishResidentWork(s, p, act, done);
  if (residentWork) return { ...base, ...residentWork };
  const cutSpeech = finishCutStatement(s, p, act, done);
  if (cutSpeech) return { ...base, ...cutSpeech };
  const house = houseOf(s, p.id);
  if (
    (s.edition === '0.6.0' || s.edition === '0.7.0') &&
    ROLE_TASKS[p.id]?.some((task) => task.action === act.action) &&
    !supervised(s, p.id, s.pos[p.id] ?? 0, (id) => positionAt(s, id, p.now))
  )
    return { ...base, status: 'interrupted' };
  if (
    (s.edition === '0.6.0' || s.edition === '0.7.0') &&
    done &&
    act.action === 'cook' &&
    (!house || house.jars <= 0)
  )
    return { ...base, status: 'interrupted' };
  if ((s.edition === '0.6.0' || s.edition === '0.7.0') && finishRoleWork(s, p, act.action, done, V.ration))
    return { ...base, needs: { competence: done ? 0.05 : 0, belonging: done ? 0.03 : 0 } };
  if (act.action === 'care-ada')
    return { ...base, status: completeAdaCare(s, p, done, hearthCell(s)) ? 'completed' : 'interrupted' };
  if (p.id === 'kian' && s.adaVisit && done && ['shelter', 'hide', 'sleep'].includes(act.action)) {
    const cell = s.pos[p.id] ?? 0;
    s.adaVisit.protection = yOf(cell) >= SURF && !riderCells(s).has(cell) ? 'protected' : 'exposed';
  }
  if (
    s.edition === '0.7.0' &&
    s.refuge &&
    done &&
    act.action === 'sleep' &&
    hours >= 1 &&
    yOf(s.pos[p.id] ?? 0) >= SURF &&
    h.use[s.pos[p.id] ?? 0] === USE.beds
  ) {
    const first = s.refuge.slept[p.id] === undefined;
    s.refuge.slept[p.id] = now;
    if (first)
      note(s, {
        kind: 'story',
        who: p.id,
        cell: s.pos[p.id],
        text: `${p.name} slept in the marked beds below the hill.`,
        weight: 1,
      });
  }
  switch (act.action) {
    case 'dig': {
      const face = Number(act.targetId);
      const k = h.kind[face] ?? K.rock;
      if (!diggable(k)) return { ...base, needs: { competence: 0.02 } };
      h.dig[face] = (h.dig[face] ?? 0) + cutProgress(s, p, act, now);
      s.stats.firstPick ??= act.startedAt;
      if ((h.dig[face] ?? 0) >= 1) return { ...base, ...openCell(s, p, face, t?.end ?? face) };
      return { ...base, needs: { competence: 0.03 } };
    }
    case 'carry-spoil': {
      if (!done) return base;
      const c = Number(act.targetId);
      if ((h.spoil[c] ?? 0) > 0) h.spoil[c] = Math.max(0, (h.spoil[c] ?? 0) - 1);
      return { ...base, needs: { competence: 0.02 } };
    }
    case 'carry-grain': {
      if (!done || !t) return base;
      const src = Number(act.targetId);
      let k = 0;
      if (act.affordanceId === 'carry-floor') {
        k = Math.min(V.load, s.fields.floor);
        s.fields.floor -= k;
      } else if (house) {
        k = Math.min(V.load, house.jars);
        house.jars -= k;
      }
      void src;
      if (k > 0) storeGrain(s, t.end, k);
      return { ...base, needs: { safety: 0.03 }, material: 0 };
    }
    case 'take': {
      if (!done || !t) return base;
      const k = Math.min(V.load, s.theirGrain);
      s.theirGrain -= k;
      storeGrain(s, t.end, k);
      const noticed =
        hashUnit(s.seed, DRAW.theft, Math.floor(now / QUANTUM), strHash(p.id)) <
        0.22 + (isLight(now) ? 0.15 : 0);
      s.thefts.push({ at: now, who: p.id, noticed });
      if (noticed) s.grudge += 0.3;
      if (s.thefts.length === 1)
        note(s, {
          kind: 'theft',
          who: p.id,
          text: `${p.name} came back through the east passage with a sack that was not ours.`,
          weight: 2.5,
          cell: t.end,
        });
      return { ...base, material: k, needs: { food: 0.05 } };
    }
    case 'fetch-water': {
      if (!done || !t) return base;
      h.water[t.end] = Math.min(V.hearthWater, (h.water[t.end] ?? 0) + 1);
      return { ...base, needs: { competence: 0.02 } };
    }
    case 'drink': {
      const hearth = hearthCell(s);
      if (act.affordanceId === 'drink' && done)
        h.water[hearth] = Math.max(0, (h.water[hearth] ?? 0) - 1 / V.drinksPerLoad);
      return { ...base, needs: { water: 0.6 * (done ? 1 : 0.3) } };
    }
    case 'eat': {
      let got = 0;
      const want = V.ration / 3;
      if (act.affordanceId === 'eat-home' && house) {
        const prepared = Math.min(want, house.prepared ?? 0);
        if (house.prepared !== undefined) house.prepared -= prepared;
        const raw = Math.min(want - prepared, house.jars);
        house.jars -= raw;
        got = prepared + raw;
      } else got = takeGrain(s, hearthCell(s), want);
      const share = got / want;
      return { ...base, needs: { food: 0.6 * share * (done ? 1 : 0.5), water: 0.35 * (done ? 1 : 0.5) } };
    }
    case 'reap': {
      const skill = p.skills.farming?.level ?? 0.5;
      const amt = Math.min(
        s.fields.standing,
        V.reapRate * hours * (0.6 + 0.8 * skill) * (act.protest ? 0.6 : 1),
      );
      s.fields.standing -= amt;
      s.fields.floor += amt;
      return { ...base, needs: { competence: 0.04, safety: 0.03 }, material: amt * 0.2 };
    }
    case 'forage': {
      const season = seasonOf(doyOf(s.minute));
      const rate = season === 'winter' ? 0.012 : season === 'spring' ? 0.03 : 0.022;
      let amt = rate * hours * (act.protest ? 0.6 : 1);
      if (s.edition === '0.7.0' && s.refuge) {
        const day = Math.floor(now / DAY);
        const forage = s.refuge.forage;
        if (forage.day !== day) {
          forage.day = day;
          forage.gathered = 0;
        }
        const available = season === 'winter' ? 0.03 : 0.06;
        amt = Math.min(amt, Math.max(0, available - forage.gathered));
        forage.gathered += amt;
      }
      if (house) house.jars += amt;
      return { ...base, needs: { competence: 0.02 }, material: amt * 4 };
    }
    case 'sow': {
      const seedPer = s.fields.size * 0.12;
      const want = Math.min(
        1 - s.fields.sown,
        hours * 0.022 * (0.6 + 0.8 * (p.skills.farming?.level ?? 0.5)),
      );
      let need = want * seedPer;
      const fromFloor = Math.min(need, s.fields.floor);
      s.fields.floor -= fromFloor;
      need -= fromFloor;
      if (need > 0 && house) {
        const j = Math.min(need, house.jars);
        house.jars -= j;
        need -= j;
      }
      if (need > 0) need -= takeGrain(s, idx(h.surface.entrance, SURF), need);
      const sown = want - Math.max(0, need) / Math.max(0.01, seedPer);
      s.fields.sown = Math.min(1, s.fields.sown + Math.max(0, sown));
      return { ...base, needs: { competence: 0.04, safety: 0.03 } };
    }
    case 'make-lamp': {
      if (!done) return base;
      const at = h.lampsWanted.shift();
      if (at !== undefined && h.kind[at] === K.open) {
        h.lamp[at] = 1;
        touch(s);
        note(s, {
          kind: 'story',
          who: p.id,
          text: `${p.name} baked a clay lamp in a fire and hung it where you had marked.`,
          cell: at,
          weight: 1,
        });
      } else h.lampsSpare++;
      return { ...base, needs: { competence: 0.06 } };
    }
    case 'carve-door': {
      const d = Number(act.targetId);
      h.doorWork[d] = Math.max(
        0,
        (h.doorWork[d] ?? 0) - hours * (0.6 + 0.8 * (p.skills.digging?.level ?? 0.4)),
      );
      if (!h.doorWork[d]) {
        touch(s);
        if (!s.flags[`door:${d}`]) {
          s.flags[`door:${d}`] = 1;
          note(s, {
            kind: 'dig',
            who: p.id,
            text: `The stone door was ready in its groove. ${p.name} rolled it once to test it.`,
            cell: d,
            weight: 1.5,
          });
        }
      }
      return { ...base, needs: { competence: 0.04 } };
    }
    case 'shut-door': {
      if (!done) return base;
      const d = Number(act.targetId);
      if (h.use[d] === USE.door && !h.doorWork[d]) {
        h.shut[d] = 1;
        touch(s);
      }
      return { ...base, needs: { safety: 0.1 } };
    }
    case 'open-door': {
      if (!done) return base;
      const d = Number(act.targetId);
      const wasShut = h.shut[d];
      h.shut[d] = 0;
      touch(s);
      if (wasShut) recordOrdinaryReopening(s, p, act);
      return base;
    }
    case 'shelter': {
      const raid = s.raids.find(
        (r) => r.stage === 'riders' || r.stage === 'smoke' || (r.stage === 'gone' && r.leave > now - DAY),
      );
      if (raid) return { ...base, needs: { safety: 0.3 } };
      // The bell rang and nobody came: a wasted afternoon in the dark.
      return { ...base, needs: { autonomy: -0.05, leisure: -0.05 }, quality: 0.3 };
    }
    case 'show': {
      if (!done || !t) return base;
      for (const q of s.people) {
        const tq = s.trips[q.id];
        if (
          q.activity?.action === 'dig' &&
          tq &&
          Math.abs(xOf(tq.end) - xOf(t.end)) + Math.abs(yOf(tq.end) - yOf(t.end)) <= 2
        )
          queue(s, q.id, {
            at: now,
            channel: 'saw',
            kind: 'lesson',
            actorId: p.id,
            salience: 0.5,
            valence: 0.2,
            demonstrates: { skill: 'digging', level: p.skills.digging?.level ?? 0.9, minutes: 50 },
            summary: `${p.name} showed me how to swing the pick at the stone wall`,
          });
      }
      return { ...base, needs: { meaning: 0.1, esteem: 0.05 } };
    }
    case 'chat':
      return { ...base, needs: { belonging: 0.2 * (done ? 1 : 0.5), leisure: 0.1 } };
    case 'play':
      return { ...base, needs: { leisure: 0.25, belonging: 0.05 } };
    case 'pray':
      return { ...base, needs: { meaning: 0.08 } };
    default:
      return base;
  }
}

/** A face broke through. */
function openCell(s: WarrenState, p: Person, face: number, stand: number): Partial<Outcome> {
  const h = s.hill;
  const k = h.kind[face] ?? K.rock;
  // Loose ground: the roof may come down instead.
  if (k === K.loose && hashUnit(s.seed, DRAW.collapse, face, Math.floor(s.minute / QUANTUM)) < 0.3) {
    h.dig[face] = 0;
    h.spoil[stand] = (h.spoil[stand] ?? 0) + 2;
    for (const j of neighbours(face)) if (h.kind[j] === K.rock && yOf(j) > SURF) h.kind[j] = K.loose;
    if (
      s.edition === '0.7.0' &&
      s.flags[`loose-warning:${face}`] !== undefined &&
      h.use[stand] !== USE.hearth &&
      h.use[stand] !== USE.well
    ) {
      const broken = [
        h.lamp[stand] ? 'the lamp' : '',
        h.use[stand] === USE.beds
          ? 'the beds'
          : h.use[stand] === USE.store
            ? 'the grain jars'
            : h.use[stand] === USE.door
              ? 'the stone door'
              : '',
      ].filter(Boolean);
      if (broken.length) {
        h.lamp[stand] = 0;
        h.use[stand] = USE.none;
        h.shut[stand] = 0;
        h.doorWork[stand] = 0;
        delete s.flags[`door:${stand}`];
        h.grain[stand] = Math.max(0, (h.grain[stand] ?? 0) - 2);
        note(s, {
          kind: 'dig',
          cell: stand,
          text: `Falling loose stone broke ${broken.join(' and ')} beside the cut wall. The passage is still open. These furnishings can be replaced.`,
          weight: 2,
        });
      }
    }
    s.stats.hurt++;
    note(s, {
      kind: 'hurt',
      who: p.id,
      cell: face,
      text: `The roof fell where the stone was loose. People dug ${p.name} out. ${p.life.sex === 'female' ? 'She' : p.life.sex === 'male' ? 'He' : p.name} had hurt a shoulder.`,
      weight: 3,
    });
    touch(s);
    return {
      injury: { part: 'shoulder', severity: 0.45, healRatePerDay: 0.04 },
      needs: { safety: -0.3 },
      quality: 0.2,
    };
  }
  h.kind[face] = K.open;
  h.dig[face] = 0;
  h.chalk[face] = 0;
  if (yOf(face) === SURF && xOf(face) !== h.surface.entrance && !s.flags[`sky:${xOf(face)}`]) {
    s.flags[`sky:${xOf(face)}`] = s.minute;
    note(s, {
      kind: 'dig',
      who: p.id,
      cell: face,
      text: `${p.name} came up under the open sky. Air will come down this shaft now, and so could riders. A door below would close it.`,
      weight: 2,
    });
  }
  h.spoil[stand] = (h.spoil[stand] ?? 0) + (k === K.hard ? 3 : 2);
  s.stats.dug++;
  if (s.stats.dug === 1)
    note(s, {
      kind: 'dig',
      who: p.id,
      cell: face,
      text: `${p.name} broke through the first chalked wall and stood in the new space, coughing dust.`,
      weight: 2,
    });
  if (k === K.seam) {
    h.use[face] = USE.well;
    h.water[face] = 99;
    if (!s.flags.water) {
      s.flags.water = s.minute;
      note(s, {
        kind: 'find',
        who: p.id,
        cell: face,
        text: `${p.name}’s pick entered the damp stone. Water came out slowly, then began to flow. There is now a well under the hill.`,
        weight: 3,
      });
    }
  }
  // Breaking into the old chamber.
  const oldNext = neighbours(face).some((j) => h.kind[j] === K.old);
  if (oldNext) {
    for (const c of h.oldCells) {
      h.kind[c] = K.open;
      h.known[c] = 1;
    }
    h.lampsSpare += 2;
    note(s, {
      kind: 'find',
      who: p.id,
      cell: face,
      text: `${p.name}’s pick opened an old room that nobody alive had dug. The ceiling was black with smoke. A long basin was cut into the wall. Two clay lamps stood in a small hollow in the wall.`,
      weight: 3,
    });
  }
  // Breaking into the neighbours.
  if (!s.linked) {
    const theirs = neighbours(face).find((j) => h.kind[j] === K.theirs);
    if (theirs !== undefined) link(s, face, p.name);
  }
  touch(s);
  return { needs: { competence: 0.1, esteem: 0.05, meaning: 0.05 } };
}

function link(s: WarrenState, at: number, who: string | null) {
  s.linked = true;
  s.linkCell = at;
  for (let i = 0; i < s.hill.kind.length; i++) if (s.hill.kind[i] === K.theirs) s.hill.known[i] = 1;
  note(s, {
    kind: 'find',
    cell: at,
    text: who
      ? `${who} broke through into a dark passage belonging to the next village. Its floor was swept. A lamp stood in a hollow in the wall, with jars nearby. The next village has been digging too.`
      : 'The knocking in the east wall stopped. Then someone carrying a lamp came through. The next village’s diggers had reached our passages.',
    weight: 3,
  });
}

// ---------- trips ----------

/** Where a person stands at minute `t`, from their trip. */
export function positionAt(s: WarrenState, pid: string, t: number): number {
  const tr = s.trips[pid];
  const at = s.pos[pid] ?? 0;
  if (!tr || tr.cells.length === 0) return at;
  if (t <= (tr.times[0] ?? 0)) return tr.cells[0] ?? at;
  for (let k = 1; k < tr.cells.length; k++) if ((tr.times[k] ?? 0) > t) return tr.cells[k - 1] ?? at;
  return tr.cells.at(-1) ?? at;
}

/** Fractional position for drawing: [x, y] in cells. */
export function drawPosition(s: WarrenState, pid: string, t: number): [number, number] {
  const tr = s.trips[pid];
  const c = s.pos[pid] ?? 0;
  const p = personOf(s, pid);
  if (!tr || !p?.activity || tr.cells.length === 0) return [xOf(c), yOf(c)];
  for (let k = 1; k < tr.cells.length; k++) {
    const t1 = tr.times[k] ?? 0;
    if (t1 > t) {
      const a = tr.cells[k - 1] ?? 0;
      const b = tr.cells[k] ?? 0;
      const t0 = tr.times[k - 1] ?? 0;
      const u = t0 >= t1 ? 1 : Math.max(0, Math.min(1, (t - t0) / (t1 - t0)));
      return [xOf(a) + (xOf(b) - xOf(a)) * u, yOf(a) + (yOf(b) - yOf(a)) * u];
    }
  }
  const e = tr.cells.at(-1) ?? c;
  return [xOf(e), yOf(e)];
}

export function carrying(s: WarrenState, pid: string, t: number): Trip['load'] | undefined {
  const tr = s.trips[pid];
  if (!tr?.load || tr.loadedFrom === undefined) return undefined;
  const t0 = tr.times[tr.loadedFrom] ?? 0;
  const t1 = tr.times.at(-1) ?? 0;
  return t >= t0 && t <= t1 ? tr.load : undefined;
}

function beginTrip(s: WarrenState, p: Person, offer: Affordance) {
  const pl = plans.get(p.id)?.get(offer.id);
  if (!pl) {
    const c = s.pos[p.id] ?? 0;
    s.trips[p.id] = { action: offer.action, cells: [c], times: [s.minute], workFrom: s.minute, end: c };
    return;
  }
  const shift = p.now - (pl.times[0] ?? p.now);
  const tr: Trip = {
    action: offer.action,
    cells: pl.cells,
    times: pl.times.map((x) => x + shift),
    workFrom: pl.workFrom + shift,
    end: pl.end,
  };
  if (pl.loadedFrom !== undefined) tr.loadedFrom = pl.loadedFrom;
  if (pl.load) tr.load = pl.load;
  if (pl.target !== undefined) tr.target = pl.target;
  s.trips[p.id] = tr;
  const w = s.hill.wear;
  for (const c of pl.cells) if (yOf(c) >= SURF) w[c] = (w[c] ?? 0) + 1;
}

/**
 * HF narrates `material` as money ("It pays."). Here material is the household's keep, not a wage, so those lines
 * become the work's own reason (see docs/hf-requests.md, item 6).
 */
const WORK_WHY: Record<string, string> = {
  dig: 'We need more room under the hill before the frost.',
  'carry-spoil': 'Someone must clear the loose stone so people can keep digging.',
  'fetch-water': 'The jars at the hearth were low.',
  reap: 'The barley must be harvested before it is ruined.',
  sow: 'We must plant grain now for next year’s bread.',
  'carve-door': 'We need a door before the riders come again.',
  'make-lamp': 'They need light down there.',
  forage: 'There is food in the hills if you know where to look.',
  'carry-grain': 'Grain is harder for riders to reach below ground.',
};
function whyLine(narration: string, action: string): string {
  if (!/money|pays|paid|wage|coin/i.test(narration)) return narration;
  return WORK_WHY[action] ?? 'This work needs to be done.';
}

/** Why a raid went as it did, in a sentence the keeper would write: where people were caught, what the door did. */
function raidWhy(s: WarrenState, r: Raid): string {
  const lines = s.notes.filter((n) => n.at >= r.riders && n.kind === 'raid' && / was caught /.test(n.text));
  const above = lines.filter((n) => /above ground/.test(n.text)).length;
  const entrance = lines.length - above;
  const doors = cellsWithUse(s.hill, USE.door).filter((d) => !s.hill.doorWork[d]);
  const why: string[] = [];
  if (above)
    why.push(
      above === 1
        ? 'One person was still above ground.'
        : `${NUMW[above] ?? above} people were still above ground.`,
    );
  if (entrance)
    why.push(
      doors.length
        ? 'The rest were caught on the near side of the door, where the riders could still reach.'
        : 'Below ground, they were caught near the entrance. Nothing blocked the riders.',
    );
  if (lost(r) > 3 && !doors.length && grainBelow(s.hill) > 0)
    why.push('The riders found the jars near the entrance. They did not find the jars farther inside.');
  return why.length ? ` ${why.join(' ')}` : '';
}
const lost = (r: Raid) => r.took;
const NUMW = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'];

/** A bell with no riders: the hill answers it, a little more drily each time. Trust itself moves in HF. */
function falseAlarm(s: WarrenState, at: number) {
  const k = (s.flags.falseBells ?? 0) + 1;
  s.flags.falseBells = k;
  const came = s.answers.filter((a) => a.at >= at && (a.verdict === 'assented' || a.verdict === 'complied'));
  const one = personOf(s, came[0]?.who ?? '');
  const name = one?.name.split(' ')[0];
  const text =
    k === 1
      ? 'No riders came. People climbed back above ground, blinking in the light. They looked at the bell, then at you.'
      : k === 2
        ? `Again, no riders came. ${name ? `${name} hung a wet shawl on the bell rope to dry.` : 'Someone hung a wet shawl on the bell rope to dry.'}`
        : came.length
          ? `No riders came. ${came.length === 1 ? 'Only one person' : `Only ${came.length} people`} went underground this time and came back up quickly.`
          : 'No riders came. Nobody went underground. The children ring the bell now, for fun.';
  note(s, { kind: 'answer', ...(one ? { who: one.id } : {}), text, weight: 1.5 });
}

// ---------- the bell's answers ----------

function captureAnswer(s: WarrenState, p: Person, offer: Affordance, record: DecisionRecord) {
  const res =
    record.suggestion?.voiceId === BELL
      ? record.suggestion
      : record.suggestions?.find((r) => r.voiceId === BELL);
  if (!res || !s.bell) return;
  if (record.review && res.verdict === 'assented' && offer.action !== 'shelter') return;
  const prev = s.answers.findLast((a) => a.who === p.id && a.at >= (s.bell?.at ?? 0));
  if (prev && prev.verdict === res.verdict) return;
  s.answers.push({ at: p.now, who: p.id, verdict: res.verdict, says: res.says });
  if (s.answers.length > 200) s.answers.splice(0, s.answers.length - 200);
  s.stats.bell[res.verdict] = (s.stats.bell[res.verdict] ?? 0) + 1;
  if (res.verdict !== 'refused' && res.verdict !== 'deferred') return;
  // Someone who has stopped believing the bell says so at a real raid: the cost of crying wolf, in the journal.
  const trust = p.will.voices.find((v) => v.voiceId === BELL)?.trust ?? 0.5;
  const doubting = s.bell.real && (s.flags.falseBells ?? 0) > 0 && trust < 0.4;
  const text = doubting
    ? `${p.name} heard the bell and continued to ${offer.label.replace(/^(the|a) /, 'the ')}. ${p.life.sex === 'female' ? 'She' : 'He'} had heard it before.`
    : `${p.name}: “${res.says}”`;
  // One stock answer once per ringing: the second person to say "After I pray" joins the first line.
  const bellAt = s.bell.at;
  if (!doubting) {
    const same = s.notes.findLast(
      (n) => n.kind === 'answer' && n.at >= bellAt && n.text.endsWith(`“${res.says}”`),
    );
    if (same) {
      const speaker = personOf(s, same.who ?? '')?.name ?? 'One person';
      same.text = `${speaker} and others gave the same reply. ${speaker} said: “${res.says}”`;
      return;
    }
  }
  note(s, { kind: 'answer', who: p.id, text, weight: doubting ? 2 : 1.2, cell: s.pos[p.id] ?? 0 });
}

// ---------- the HF world ----------

function queue(s: WarrenState, pid: string, pc: Percept) {
  const q = s.queued[pid] ?? [];
  q.push(pc);
  s.queued[pid] = q;
}

export function makeWorld(s: WarrenState): World {
  return {
    observed: (at) => {
      const minute = s.minute;
      s.minute = at;
      try {
        observeAdaTalk(s);
        observeCutDiscussion(s);
        observeResidentTalk(s, false);
      } finally {
        s.minute = minute;
      }
    },
    converse: (speaker, listener) =>
      s.edition === '0.7.0' &&
      !speaker.body.asleep &&
      !listener.body.asleep &&
      positionAt(s, speaker.id, speaker.now) === hearthCell(s) &&
      positionAt(s, listener.id, speaker.now) === hearthCell(s)
        ? { placeId: 'hearth' }
        : false,
    now: () => s.minute,
    affordancesFor: (p) => offersFor(s, p),
    perceptsFor: (p, since, until) => {
      const q = s.queued[p.id];
      if (!q || q.length === 0) return [];
      const out = q.filter((x) => x.at <= until).map((x) => ({ ...x, at: Math.max(x.at, since + 1) }));
      s.queued[p.id] = q.filter((x) => x.at > until);
      return out;
    },
    scarcityFor: () => {
      const need = s.people.length * V.ration * 60;
      const have = grainBelow(s.hill) + s.fields.floor + s.houses.reduce((a, h) => a + h.jars, 0);
      return Math.max(0, Math.min(1, 1 - have / Math.max(1, need)));
    },
    beginOptions: (p, offer, record) => {
      // The person's own account of the choice (HF narration), shown on their card as the why.
      if (!record.review && record.narration) {
        s.why ??= {};
        s.why[p.id] = whyLine(record.narration, offer.action);
      }
      beginTrip(s, p, offer);
      captureAnswer(s, p, offer, record);
      captureResidentAnswer(s, p, offer, record);
      captureAdaTalkAnswer(s, p, offer, record);
      return undefined;
    },
    resolve: (p, act, reason) => resolveActivity(s, p, act, reason),
  };
}

export function communityOf(s: WarrenState) {
  return { people: s.people, state: s };
}
export function syncCommunity(s: WarrenState) {
  s.hf = archiveOf(s);
}

// ---------- the step loop ----------

interface PendingAdvance {
  generator: Generator<void, SimEvent[], void>;
  target: number;
}
const pendingAdvances = new WeakMap<WarrenState, PendingAdvance>();
/** Complete any admitted partial quantum before a player input, save or synchronous replay. */
export function drainAdvance(s: WarrenState): SimEvent[] {
  let pending = pendingAdvances.get(s);
  if (!pending && s.hfPhase) {
    pending = { generator: advancing(s, s.hfPhase.to), target: s.hfPhase.to };
    pendingAdvances.set(s, pending);
  }
  if (!pending) return [];
  let result = pending.generator.next();
  while (!result.done) result = pending.generator.next();
  pendingAdvances.delete(s);
  return result.value;
}
/** Advance at most one physical quantum, yielding between public HF calls. World hazards remain30-minute work. */
export function advanceFrame(s: WarrenState, budgetMs = 0): boolean {
  let pending = pendingAdvances.get(s);
  if (!pending) {
    const target = s.hfPhase?.to ?? (Math.floor(s.minute / QUANTUM) + 1) * QUANTUM;
    pending = { generator: advancing(s, target), target };
    pendingAdvances.set(s, pending);
  }
  const start = performance.now();
  do {
    const result = pending.generator.next();
    if (result.done) {
      pendingAdvances.delete(s);
      return true;
    }
  } while (performance.now() - start < budgetMs);
  return false;
}
export function advanceTo(s: WarrenState, to: number, observeIdle?: (person: Person) => void): SimEvent[] {
  const events = drainAdvance(s),
    generator = advancing(s, to, observeIdle);
  let result = generator.next();
  while (!result.done) result = generator.next();
  return [...events, ...result.value];
}
function* advancing(
  s: WarrenState,
  to: number,
  observeIdle?: (person: Person) => void,
): Generator<void, SimEvent[], void> {
  const events: SimEvent[] = [];
  while (s.minute < to || s.hfPhase) {
    const from = s.hfPhase?.from ?? s.minute;
    const lastNote = s.hfPhase?.lastNote ?? s.notes.at(-1);
    const next = s.hfPhase?.to ?? Math.min(to, (Math.floor(s.minute / QUANTUM) + 1) * QUANTUM);
    const suggestions: Record<string, Suggestion> = {};
    for (const p of s.people) {
      const suggestion = residentSuggestion(s, p) ?? cutSuggestion(s, p) ?? adaTalkSuggestion(s, p);
      if (suggestion) suggestions[p.id] = suggestion;
    }
    if (s.bell && s.bell.until > s.minute)
      for (const p of s.people)
        suggestions[p.id] = { voiceId: BELL, action: 'shelter', strength: V.bellStrength, since: s.bell.at };
    const ev = yield* stepWarren(s, makeWorld, next, suggestions, observeIdle);
    for (const e of ev) if (e.kind === 'died') events.push(e);
    const day0 = dayOfMinute(from);
    s.minute = next;
    delete s.hfPhase;
    afterQuantum(s, ev);
    if (dayOfMinute(s.minute) !== day0) endOfDay(s, day0);
    if (s.next) {
      const added = s.notes.slice(
        lastNote ? s.notes.findLastIndex((n) => JSON.stringify(n) === JSON.stringify(lastNote)) + 1 : 0,
      );
      if (added.length) s.next.attention = added.map((n) => n.text);
    }
  }
  return events;
}

/** Sample actual positions each quantum, including entry and departure boundaries. No forecasts. */
export function observeRefuge(s: WarrenState) {
  if (!s.refuge) return;
  for (const { face } of faces(s.hill))
    if (
      s.hill.kind[face] === K.loose &&
      s.hill.known[face] &&
      s.flags[`loose-warning:${face}`] === undefined
    ) {
      s.flags[`loose-warning:${face}`] = s.minute;
      note(s, {
        kind: 'story',
        cell: face,
        text: 'Loose stone can fall when people cut it. A fall can break a lamp, beds, jars or a stone door beside the wall. The passage will stay open.',
        weight: 2,
      });
    }
  const reach = riderCells(s);
  const openDoors = riderCells({ ...s, hill: { ...s.hill, shut: s.hill.shut.map(() => 0) } });
  for (const r of s.raids.slice(1)) {
    if (r.stage !== 'riders') continue;
    const record = s.refuge.raids[String(r.riders)] ?? { present: [], exposed: [], behindDoor: false };
    s.refuge.raids[String(r.riders)] = record;
    for (const p of s.people.filter((p) => p.body.alive)) {
      if (!record.present.includes(p.id)) record.present.push(p.id);
      const cell = positionAt(s, p.id, s.minute);
      if ((yOf(cell) < SURF || reach.has(cell)) && !record.exposed.includes(p.id)) record.exposed.push(p.id);
      if (yOf(cell) >= SURF && !reach.has(cell) && openDoors.has(cell)) record.behindDoor = true;
    }
  }
}

function afterQuantum(s: WarrenState, ev: SimEvent[]) {
  observeAdaTalk(s);
  observeCutDiscussion(s);
  observeResidentTalk(s);
  if (s.edition === '0.7.0')
    for (const e of ev) {
      if (e.kind !== 'converse' || !e.withId) continue;
      const speaker = personOf(s, e.personId),
        listener = personOf(s, e.withId);
      if (!speaker || !listener) continue;
      const key = `conversation:${[speaker.id, listener.id].sort().join(':')}`;
      const day = Math.floor(e.at / DAY) + 1;
      if (s.flags[key] === day) continue;
      s.flags[key] = day;
      note(s, {
        at: e.at,
        kind: 'story',
        who: speaker.id,
        cell: positionAt(s, speaker.id, e.at),
        text: `${speaker.name} spoke with ${listener.name}.`,
        weight: 1,
      });
    }
  for (const e of ev) {
    if (e.kind !== 'died') continue;
    const p = personOf(s, e.personId);
    if (!p) continue;
    if (s.edition === '0.7.0' && s.refuge)
      for (const r of s.raids) {
        const record = s.refuge.raids[String(r.riders)];
        if (r.stage === 'riders' && record?.present.includes(p.id) && !record.exposed.includes(p.id))
          record.exposed.push(p.id);
      }
    s.stats.died++;
    note(s, {
      kind: 'story',
      who: p.id,
      text: `${p.name} died ${p.id === USTA_ID ? 'by the hearth, in his sleep' : 'below the hill'}.`,
      weight: 3,
    });
  }
  if (s.edition === '0.7.0') observeRefuge(s);
  raidStep(s);
  if (s.edition === '0.7.0') observeRefuge(s);
  if (s.edition) recoveryWords(s);
  if (s.bell && s.bell.until <= s.minute) {
    if (!s.bell.real) falseAlarm(s, s.bell.at);
    s.bell = null;
  }
  goalsStep(s);
}

function everyone(s: WarrenState, pc: Omit<Percept, 'at'>, interrupt: boolean) {
  const c = communityOf(s);
  for (const p of c.people) {
    queue(s, p.id, { ...pc, at: s.minute } as Percept);
    if (interrupt) interruptPerson(c, p, Math.max(p.now, s.minute), `percept:${pc.kind}`);
  }
}

function raidStep(s: WarrenState) {
  for (const r of s.raids) {
    const scare = !!s.edition && r === s.raids[0];
    if (r.stage === 'coming' && s.minute >= r.smoke) {
      r.stage = 'smoke';
      const first = s.raids.indexOf(r) === 0;
      note(s, {
        kind: 'raid',
        text: first
          ? 'There is smoke on the southern hills, more than a field fire makes. Riders may arrive in half a day or less.'
          : 'There is smoke in the south again.',
        weight: 3,
      });
      everyone(
        s,
        {
          channel: 'saw',
          kind: 'smoke',
          salience: 0.9,
          valence: -0.6,
          near: true,
          threat: { severity: 0.6 * r.force + 0.2, chance: 0.7, sourceId: 'riders' },
          summary: 'There is smoke in the south. Riders are coming.',
        },
        true,
      );
    }
    if (r.stage === 'smoke' && s.minute >= r.riders) {
      r.stage = 'riders';
      if (scare) scout(s, r);
      else {
        // The surface: what lies out is taken.
        let took = s.fields.floor;
        s.fields.floor = 0;
        for (const h of s.houses) {
          took += h.jars + (h.prepared ?? 0);
          h.jars = 0;
          if (h.prepared !== undefined) h.prepared = 0;
        }
        const trampled = s.fields.standing * 0.35 * r.force;
        s.fields.standing -= trampled;
        // Below: whatever their torches reach.
        const reach = riderCells(s);
        for (const [c, di] of reach) {
          // Near the entrance they take it all; deeper in the dark they take what they stumble on.
          const frac = Math.max(0, 1 - di / (V.riderReach + 1)) * (s.hill.lamp[c] ? 1 : 0.6);
          const g = (s.hill.grain[c] ?? 0) * frac;
          took += g;
          s.hill.grain[c] = (s.hill.grain[c] ?? 0) - g;
          if (s.hill.lamp[c] && c !== hearthCell(s)) {
            s.hill.lamp[c] = 0;
            touch(s);
          }
        }
        r.took = Math.round(took);
      }
      note(s, {
        kind: 'raid',
        text: scare
          ? 'Riders searched the entrances and looked in. They were checking the village. No one was struck. They may return with more riders.'
          : 'Riders are on the hill. We hear horses above us and voices at the entrance.',
        weight: 3,
      });
      everyone(
        s,
        {
          channel: 'heard',
          kind: 'riders',
          salience: 0.95,
          valence: -0.8,
          near: true,
          threat: { severity: 0.8 * r.force, chance: 0.8, sourceId: 'riders' },
          summary: 'Riders are on the hill.',
        },
        true,
      );
    }
    if (r.stage === 'riders') {
      // Each hour, anyone they can reach may be hurt.
      if (scare) scout(s, r);
      if (!scare && s.minute % HOUR === 0) {
        const reach = riderCells(s);
        for (const p of s.people) {
          if (!p.body.alive) continue;
          const c = positionAt(s, p.id, s.minute);
          const exposed = yOf(c) < SURF || reach.has(c);
          if (!exposed || p.activity?.action === 'hide' || r.hurt.includes(p.id)) continue;
          const odds = (yOf(c) < SURF ? 0.04 : 0.02) * r.force;
          if (hashUnit(s.seed, DRAW.harm, strHash(p.id), Math.floor(s.minute / HOUR)) < odds) {
            sendInjury(s, p, {
              part: hashUnit(s.seed, DRAW.harm, 7, s.minute) < 0.5 ? 'arm' : 'head',
              severity: 0.3 + 0.25 * r.force,
              healRatePerDay: 0.03,
              bleeding: 0.08,
            });
            r.hurt.push(p.id);
            s.stats.hurt++;
            queue(s, p.id, {
              at: s.minute,
              channel: 'felt',
              kind: 'harm',
              actorId: 'riders',
              salience: 1,
              valence: -0.9,
              summary: 'A rider struck me.',
            });
            note(s, {
              kind: 'hurt',
              who: p.id,
              cell: c,
              text: `${p.name} was caught ${yOf(c) < SURF ? 'above ground' : 'near the entrance'} and hit.`,
              weight: 3,
            });
          }
        }
      }
      if (s.minute >= r.leave) {
        r.stage = 'gone';
        const lost = r.took;
        const presence = s.refuge?.raids[String(r.riders)];
        const protectedPresence =
          s.edition !== '0.7.0' || (!!presence?.present.length && presence.exposed.length === 0);
        const held = protectedPresence && r.hurt.length === 0 && lost < s.people.length * V.ration * 30;
        if (
          !(
            (s.edition === '0.4.0' ||
              s.edition === '0.5.0' ||
              s.edition === '0.6.0' ||
              s.edition === '0.7.0') &&
            scare
          )
        ) {
          if (held) {
            s.heldAt = s.minute;
            s.word = Math.min(1, s.word + 0.25);
          } else s.word = Math.max(0, s.word - 0.1);
        }
        note(s, {
          kind: 'raid',
          text: scare
            ? 'The scouts rode off north. No one was struck and nothing was taken. The pale tracks show where they searched. Next time they may strike.'
            : held
              ? `They rode off north. They found ${lost > 1 ? 'a little' : 'nothing'} above ground and nothing below. The refuge protected the village.`
              : `They rode off north ${lost === 0 ? 'without taking grain' : `with ${lost > 0.5 * (lost + grainBelow(s.hill)) ? 'much of our grain' : lost > 3 ? 'some of our grain' : 'very little grain'}`}${r.hurt.length ? `, and ${r.hurt.length === 1 ? 'one of us was' : `${r.hurt.length} of us were`} hurt` : ''}.${raidWhy(s, r)}`,
          weight: 3,
        });
        everyone(
          s,
          {
            channel: 'heard',
            kind: 'all-clear',
            salience: 0.7,
            valence: 0.5,
            near: true,
            summary: 'The riders have gone.',
          },
          true,
        );
      }
    }
  }
}

/** Stable place names use the visible layout, rather than pretending rooms have authored names. */
function scoutPlace(s: WarrenState, cell: number): string {
  if (yOf(cell) < SURF) return 'the ground above the hill';
  const dx = xOf(cell) - s.hill.surface.entrance;
  const side =
    dx === 0
      ? 'under the entrance'
      : `${Math.abs(dx)} ${Math.abs(dx) === 1 ? 'step' : 'steps'} ${dx < 0 ? 'west' : 'east'} of the entrance`;
  const place = s.hill.use[cell] === USE.beds ? 'sleeping place' : 'passage';
  const depth = yOf(cell) - SURF;
  return depth === 0
    ? `the ${place} ${dx === 0 ? 'just inside the entrance' : side}, at ground level`
    : `the ${place} ${side}, ${depth} ${depth === 1 ? 'level' : 'levels'} below ground`;
}

function scout(s: WarrenState, r: Raid) {
  r.scouted ??= [];
  r.wouldCatch ??= [];
  const reach = riderCells(s);
  for (const c of reach.keys()) {
    if (r.scouted.includes(c)) continue;
    r.scouted.push(c);
    note(s, { kind: 'raid', cell: c, text: `The scouts searched ${scoutPlace(s, c)}.`, weight: 1.5 });
  }
  for (const p of s.people) {
    if (!p.body.alive || p.activity?.action === 'hide' || r.wouldCatch.includes(p.id)) continue;
    const c = positionAt(s, p.id, s.minute);
    if (yOf(c) >= SURF && !reach.has(c)) continue;
    r.wouldCatch.push(p.id);
    const doing = p.activity?.mode === 'sleep' ? 'sleeping' : 'still in view';
    note(s, {
      kind: 'raid',
      cell: c,
      who: p.id,
      text: `The scouts searched ${scoutPlace(s, c)}. ${p.name} was ${doing} there. If the riders had attacked, ${p.life.sex === 'female' ? 'she' : p.life.sex === 'male' ? 'he' : p.name} would have been caught. Nobody was hurt.`,
      weight: 3,
    });
  }
}

/** HF owns healing. These words report observed changes, without changing an injury or a choice. */
function recoveryWords(s: WarrenState) {
  for (const tracked of s.recoveries ?? []) {
    const p = personOf(s, tracked.who);
    if (!p?.body.alive) continue;
    const injury = p.body.injuries.find((i) => i.id === tracked.injury);
    if (!injury || tracked.severity - injury.severity >= 0.1) {
      note(s, {
        kind: 'hurt',
        who: p.id,
        text: injury
          ? `${p.name}: “The wound on my ${tracked.part} hurts less today. It still aches.”`
          : `${p.name}: “The wound on my ${tracked.part} has healed.”`,
        weight: 1.5,
      });
      if (injury) tracked.severity = injury.severity;
    }
  }
  if (s.recoveries)
    s.recoveries = s.recoveries.filter(
      (t) =>
        personOf(s, t.who)?.body.alive && personOf(s, t.who)?.body.injuries.some((i) => i.id === t.injury),
    );
  for (const p of s.people) {
    if (!p.body.alive) continue;
    for (const injury of p.body.injuries) {
      if (s.recoveries?.some((t) => t.who === p.id && t.injury === injury.id)) continue;
      s.recoveries ??= [];
      s.recoveries.push({ who: p.id, injury: injury.id, part: injury.part, severity: injury.severity });
      note(s, {
        kind: 'hurt',
        who: p.id,
        text: `${p.name}: “My ${injury.part} hurts. It will take days to heal.”`,
        weight: 1.5,
      });
    }
  }
}

function endOfDay(s: WarrenState, day: number) {
  const h = s.hill;
  for (let i = 0; i < h.wear.length; i++) {
    const before = h.wear[i] ?? 0;
    const w = before * 0.9;
    h.wear[i] = w < 0.05 ? 0 : w;
  }
  // A worn path the keeper never drew a lamp along: noticed once.
  if (!s.flags.path) {
    for (let i = 0; i < h.wear.length; i++) {
      if ((h.wear[i] ?? 0) > 22 && yOf(i) > SURF + 1 && !h.lamp[i]) {
        s.flags.path = s.minute;
        note(s, {
          kind: 'path',
          cell: i,
          text: 'People have worn the floor smooth along the busiest passage. They walk faster there now.',
          weight: 1.5,
        });
        break;
      }
    }
  }
  // Habits: the first person who goes to the faces of their own accord.
  if (!s.flags.habit) {
    for (const p of s.people) {
      const hb = s.notes.some((n) => n.who === p.id && n.kind === 'dig');
      if (hb) {
        s.flags.habit = s.minute;
        note(s, {
          kind: 'habit',
          who: p.id,
          text: `${p.name} goes down to dig at the stone walls every morning now. Nobody has to ask.`,
          weight: 2,
        });
        break;
      }
    }
  }
  // Fields: grow over winter and spring; ripen at harvest.
  const doy = doyOf(day + 1);
  if (seasonOf(doy) === 'harvest' && seasonOf(doyOf(day)) !== 'harvest') {
    const yieldF = 0.75 + 0.35 * hashUnit(s.seed, DRAW.weather, yearOf(day + 1));
    s.fields.standing += s.fields.sown * s.fields.size * yieldF;
    s.fields.sown = 0;
    note(s, { kind: 'story', text: 'The barley is ripe again.', weight: 1.5 });
  }
  if (seasonOf(doy) === 'winter' && seasonOf(doyOf(day)) !== 'winter') {
    s.fields.standing = 0; // what was not reaped by winter is gone
    note(s, {
      kind: 'story',
      text: 'The first frost has come. The houses above ground are cold at night now. Below the hill, it is as warm as it was in autumn.',
      weight: 1.5,
    });
  }
  // The neighbours dig west toward us, a cell every few days, until they hear us.
  if (!s.linked && day % 3 === 2) {
    const head = h.theirHead;
    const nx = xOf(head) - 1;
    const ny = yOf(head);
    if (nx >= 18) {
      const n = idx(nx, ny);
      if (h.kind[n] === K.open) link(s, n, null);
      else if (diggable(h.kind[n] ?? 0)) {
        h.kind[n] = K.theirs;
        h.theirHead = n;
        if (neighbours(n).some((j) => h.kind[j] === K.open)) link(s, n, null);
        else if (!s.flags.knock) {
          // Heard through the rock once their head is within three cells of our space.
          for (let dx = -3; dx <= 3; dx++)
            for (let dy = -3; dy <= 3; dy++) {
              const j = idx(Math.max(0, Math.min(W - 1, nx + dx)), Math.max(0, Math.min(57, ny + dy)));
              if (!s.flags.knock && h.kind[j] === K.open) {
                s.flags.knock = s.minute;
                h.known[n] = 1;
                note(s, {
                  kind: 'find',
                  cell: n,
                  text: 'At night, we hear steady knocking in the east wall, like a pick hitting stone. Someone is digging toward us.',
                  weight: 2.5,
                });
              }
            }
        }
      }
    }
  }
  // The neighbours and their grievance.
  if (s.linked) {
    s.grudge = Math.max(0, s.grudge - 0.02);
    if (s.grudge >= 0.6 && !s.flags.wall) {
      const reach = paths(h, s.linkCell, airAndLight(s).lit, true);
      const store = nearestStoreWithGrain(s, reach);
      if (store >= 0 && hashUnit(s.seed, DRAW.theft, day, 3) < 0.5) {
        const k = Math.min(h.grain[store] ?? 0, 4 + 4 * hashUnit(s.seed, DRAW.theft, day, 4));
        h.grain[store] = (h.grain[store] ?? 0) - k;
        s.grudge -= 0.2;
        note(s, {
          kind: 'theft',
          cell: store,
          text: 'The jars in the store were half empty this morning. Footprints marked the dust by the east passage. The neighbours took back their grain and some of ours.',
          weight: 2.5,
        });
        everyone(
          s,
          {
            channel: 'saw',
            kind: 'theft',
            actorId: 'neighbours',
            salience: 0.6,
            valence: -0.5,
            summary: 'Someone from the next village took grain from our store.',
          },
          false,
        );
      }
    }
    if (s.grudge >= 1 && !s.flags.wall) {
      s.flags.wall = s.minute;
      // They wall their side.
      for (const j of neighbours(s.linkCell)) if (h.kind[j] === K.theirs) h.kind[j] = K.rock;
      s.linked = false;
      s.word = Math.max(0, s.word - 0.2);
      note(s, {
        kind: 'theft',
        cell: s.linkCell,
        text: 'The neighbours blocked their side of the east passage with a wall. They are telling people in the market that we are thieves.',
        weight: 3,
      });
      touch(s);
    }
  }
  // Word, and families who come because they heard.
  wordStep(s, day);
  stallStep(s);
  refreshKnown(h);
  s.stats.peak = Math.max(s.stats.peak, s.people.filter((p) => p.body.alive).length);
}

/** When every chalked face is dark or airless for a day, the journal says the picks have stopped, and why. */
function stallStep(s: WarrenState) {
  const fs = faces(s.hill);
  if (!fs.length) return;
  const { lit, air } = airAndLight(s);
  const st = fs.map((f) => faceState(s, f.face, f.stand, lit, air));
  if (!st.every((x) => x === 'dark' || x === 'stale')) {
    delete s.flags.stallSince;
    return;
  }
  s.flags.stallSince ??= s.minute;
  if (s.minute - s.flags.stallSince < DAY || s.minute - (s.flags.stallTold ?? -99 * DAY) < 6 * DAY) return;
  s.flags.stallTold = s.minute;
  note(s, {
    kind: 'story',
    text: st.every((x) => x === 'stale')
      ? 'People have stopped digging. Every wall marked with chalk has too little fresh air, and the lamps burn weakly. A shaft to the surface would bring air down.'
      : 'People have stopped digging. Every wall marked with chalk is dark. A lamp beside one would let people dig there again.',
    weight: 2,
  });
}

function wordStep(s: WarrenState, day: number) {
  const h = s.hill;
  const alive = s.people.filter((p) => p.body.alive);
  const food =
    grainBelow(h) +
    s.fields.floor +
    s.houses.reduce((a, x) => a + x.jars + (x.prepared ?? 0), 0) +
    s.fields.standing * 0.8;
  const days = food / Math.max(1, alive.length * V.ration);
  const rooms = cellsWithUse(h, USE.beds).length + cellsWithUse(h, USE.store).length;
  const target =
    0.15 +
    (s.flags.water ? 0.2 : 0) +
    Math.min(0.2, rooms * 0.02) +
    (days > 200 ? 0.15 : days > 90 ? 0.08 : 0) +
    (s.heldAt >= 0 && s.minute - s.heldAt < 60 * DAY ? 0.25 : 0);
  s.word += (target - s.word) * 0.1;
  const season = seasonOf(doyOf(day));
  const free = bedsBelow(s) + s.houses.length * 2 - alive.length;
  if (day < 4 || alive.length >= 60) return;
  const chance =
    (season === 'winter' ? 0.04 : 0.18) *
    (alive.length > 30 ? 0.5 : 1) *
    s.word *
    (s.heldAt >= 0 && s.minute - s.heldAt < 15 * DAY ? 2 : 1);
  if (hashUnit(s.seed, DRAW.arrival, day) >= chance) return;
  if (free < 2) {
    // Word brought them, but there was nowhere to sleep: growth waits on beds, and the journal says so.
    if (s.minute - (s.flags.turnedAway ?? -99 * DAY) < 12 * DAY) return;
    s.flags.turnedAway = s.minute;
    note(s, {
      kind: 'arrival',
      text: 'A family stopped at the spring and asked about room below. There were no beds to spare; they watered the donkey and went on.',
      weight: 1.5,
      cell: springCell(s),
    });
    return;
  }
  const used = new Set(s.usedNames);
  const xs = [8, 6, 20, 4, 22, 3, 7, 5, 9, 11, 13, 15, 19, 23];
  const taken = new Set(s.houses.map((x) => x.x));
  const x = xs.find((v) => !taken.has(v)) ?? 20;
  s.arrivals++;
  const fam = arrivingFamily(s.seed, s.arrivals, s.minute, x, used);
  s.usedNames = [...used];
  s.houses.push(fam.house);
  s.fields.size = Math.min(
    150,
    s.fields.size +
      7 *
        fam.people.filter((p) => (s.minute * 60000 - p.identity.birthAt) / (365.25 * 86400000) >= 16).length,
  );
  for (const p of fam.people) {
    s.pos[p.id] = surfaceCell(x);
    enqueue(s, 'person.arrived', { authored: p, arrivalEvidenceId: `arrival:${p.id}` });
  }
  const head = fam.people[0];
  note(s, {
    kind: 'arrival',
    who: head?.id,
    text: `${fam.house.name.replace(/^the /, 'The ').replace(/ house$/, ' family')} came up the road with a donkey. There were ${fam.people.length} people in the family. ${s.heldAt >= 0 ? 'They had heard the refuge protected the village.' : s.flags.water ? 'They had heard there was water under the hill.' : 'They had heard there was room.'}`,
    weight: 2,
    cell: surfaceCell(x),
  });
}

// ---------- goals (the notebook's next line) ----------

export interface Goal {
  id: string;
  text: string;
  done: (s: WarrenState) => boolean;
  shown: (s: WarrenState) => boolean;
}

export const GOALS: Goal[] = [
  {
    id: 'chalk',
    text: 'Mark a stone wall with chalk where you want people to dig.',
    done: (s) => s.hill.chalk.some((c) => c) || s.stats.dug > 0,
    shown: () => true,
  },
  {
    id: 'first',
    text: 'Wait for someone to start digging.',
    done: (s) => s.stats.dug > 0,
    shown: () => true,
  },
  {
    id: 'store',
    text: 'Mark a storage room so people can carry the harvested grain below ground.',
    done: (s) => grainBelow(s.hill) >= 45,
    shown: () => true,
  },
  {
    id: 'lamp',
    text: 'Hang a lamp where people cannot dig because it is dark.',
    done: (s) => s.hill.lamp.filter((l) => l).length >= 2,
    shown: (s) => s.stats.dug >= 3,
  },
  {
    id: 'raid',
    text: 'Live through the first visit from the riders.',
    done: (s) => s.raids[0]?.stage === 'gone',
    shown: (s) => s.raids[0]?.stage !== 'coming',
  },
  {
    id: 'door',
    text: 'Build a stone door that can block the riders.',
    done: (s) => cellsWithUse(s.hill, USE.door).some((d) => !s.hill.doorWork[d]),
    shown: (s) => s.raids[0]?.stage === 'gone',
  },
  {
    id: 'beds',
    text: 'Make sleeping space below ground for everyone before the frost.',
    done: (s) => bedsBelow(s) >= s.people.filter((p) => p.body.alive).length,
    shown: (s) => s.raids[0]?.stage === 'gone',
  },
  {
    id: 'water',
    text: 'Find water under the hill.',
    done: (s) => !!s.flags.water,
    shown: (s) => s.stats.dug >= 12,
  },
  {
    id: 'grow',
    text: 'Grow the village to thirty people.',
    done: (s) => s.people.filter((p) => p.body.alive).length >= 30,
    shown: (s) => s.arrivals > 0,
  },
  {
    id: 'deep',
    text: 'Dig below the layer of hard stone.',
    done: (s) => deepest(s) >= SURF + 16,
    shown: (s) => deepest(s) >= SURF + 10,
  },
  {
    id: 'year',
    text: 'Spend a year under the hill.',
    done: (s) => s.minute >= 365 * DAY,
    shown: (s) => s.minute > 60 * DAY,
  },
];

export function deepest(s: WarrenState): number {
  let d = 0;
  for (let i = 0; i < s.hill.kind.length; i++)
    if (s.hill.kind[i] === K.open && xOf(i) < RIDGE) d = Math.max(d, yOf(i));
  return d;
}

/** What Yusuf Usta says when a goal first shows: where to look, in the fiction. */
const TOLD: Record<string, string> = {
  water:
    'Yusuf Usta said his father once found water under the fields to the west, far below the layer of hard stone. Damp stone appears first.',
  deep: 'The stone below here is hard and takes longer to dig. Yusuf Usta says it becomes softer again farther down.',
  lamp: 'People stop digging where daylight no longer reaches. A lamp beside a stone wall lets them dig there.',
};

export function goalsFor(s: WarrenState): Goal[] {
  if (s.edition !== '0.7.0') return GOALS;
  const protectedVisit = (state: WarrenState) =>
    state.raids.slice(1).some((r) => {
      const seen = state.refuge?.raids[String(r.riders)];
      return r.stage === 'gone' && !!seen?.present.length && seen.exposed.length === 0;
    });
  return GOALS.map((g) =>
    g.id === 'beds'
      ? {
          ...g,
          text: 'Let everyone sleep in the marked beds below ground.',
          done: (state: WarrenState) =>
            state.people.some((p) => p.body.alive) &&
            state.people.filter((p) => p.body.alive).every((p) => state.refuge?.slept[p.id] !== undefined),
        }
      : g.id === 'raid'
        ? {
            ...g,
            text: 'Shelter everyone beyond the riders’ reach through a real raid.',
            done: protectedVisit,
          }
        : g.id === 'door'
          ? {
              ...g,
              text: 'Shelter behind a closed stone door while riders search.',
              done: (state: WarrenState) =>
                state.raids
                  .slice(1)
                  .some((r) => r.stage === 'gone' && state.refuge?.raids[String(r.riders)]?.behindDoor),
            }
          : g,
  );
}

function goalsStep(s: WarrenState) {
  for (const g of goalsFor(s)) {
    const told = TOLD[g.id];
    if (told && !s.flags[`told:${g.id}`] && s.goals[g.id] === undefined && g.shown(s)) {
      s.flags[`told:${g.id}`] = s.minute;
      note(s, { kind: 'story', who: USTA_ID, text: told, weight: 1 });
    }
    if (s.goals[g.id] !== undefined) continue;
    if (g.shown(s) && g.done(s)) {
      s.goals[g.id] = s.minute;
      note(s, { kind: 'goal', text: `✓ ${g.text}`, weight: 1 });
    }
  }
}

export function currentGoal(s: WarrenState): Goal | undefined {
  return goalsFor(s).find((g) => s.goals[g.id] === undefined && g.shown(s));
}

// ---------- the keeper's marks ----------

export function setChalk(s: WarrenState, cells: number[], on: boolean): number {
  const h = s.hill;
  let n = 0;
  for (const c of cells) {
    if (c < 0 || c >= h.kind.length || xOf(c) >= THEIR_X || yOf(c) < SURF) continue;
    if (!diggable(h.kind[c] ?? 0) && !(h.kind[c] === K.old) && !(h.kind[c] === K.theirs)) continue;
    if (h.chalk[c] === (on ? 1 : 0)) continue;
    h.chalk[c] = on ? 1 : 0;
    n++;
  }
  if (n && on && !s.flags.ridgeChalk && cells.some((c) => h.chalk[c] && xOf(c) >= RIDGE)) {
    s.flags.ridgeChalk = s.minute;
    note(s, {
      kind: 'story',
      who: USTA_ID,
      text: 'You marked stone under the ridge. Beyond the ridge, the stone belongs to the neighbours. Yusuf Usta looked at the mark for a long time. He said only that people can hear digging through stone.',
      weight: 1.5,
    });
  }
  if (n && on && s.edition === '0.7.0') {
    for (const cell of cells)
      if (h.kind[cell] === K.loose && h.known[cell] && !s.flags[`loose-warning:${cell}`]) {
        s.flags[`loose-warning:${cell}`] = s.minute;
        note(s, {
          kind: 'story',
          cell,
          text: 'Loose stone can fall when people cut it. A fall can break a lamp, beds, jars or a stone door beside the wall. The passage will stay open.',
          weight: 2,
        });
      }
  }
  if (n && on) {
    s.stats.firstChalk ??= s.minute;
    // People notice fresh chalk at their next look; nearby idle people look now.
    const c = communityOf(s);
    for (const p of c.people)
      if (!p.activity && adult(p) && !elder(p)) interruptPerson(c, p, Math.max(p.now, s.minute), 'chalk');
  }
  if (n) touch(s);
  return n;
}

export function setUse(s: WarrenState, cells: number[], use: number): number {
  const h = s.hill;
  let n = 0;
  for (const c of cells) {
    if (h.kind[c] !== K.open || yOf(c) < SURF) continue;
    const u = h.use[c] ?? 0;
    if (u === USE.hearth || u === USE.well || u === USE.door) continue;
    if (u === USE.store && use !== USE.store && (h.grain[c] ?? 0) > 0) continue; // jars stay where they are
    if (u === use) continue;
    h.use[c] = use;
    n++;
  }
  if (n) touch(s);
  return n;
}

export function placeLamp(s: WarrenState, cell: number): boolean {
  const h = s.hill;
  if (h.kind[cell] !== K.open || h.lamp[cell] || yOf(cell) < SURF) return false;
  if (h.lampsWanted.includes(cell)) return false;
  if (h.lampsSpare > 0) {
    h.lampsSpare--;
    h.lamp[cell] = 1;
  } else h.lampsWanted.push(cell);
  touch(s);
  return true;
}

export function takeLamp(s: WarrenState, cell: number): boolean {
  const h = s.hill;
  const w = h.lampsWanted.indexOf(cell);
  if (w >= 0) {
    h.lampsWanted.splice(w, 1);
    return true;
  }
  if (!h.lamp[cell] || h.use[cell] === USE.hearth) return false;
  h.lamp[cell] = 0;
  h.lampsSpare++;
  touch(s);
  return true;
}

export function placeDoor(s: WarrenState, cell: number): boolean {
  const h = s.hill;
  if (h.kind[cell] !== K.open || yOf(cell) < SURF || (h.use[cell] ?? 0) !== USE.none) return false;
  // A door goes in a passage: open on two opposite sides only.
  const x = xOf(cell);
  const y = yOf(cell);
  const o = (dx: number, dy: number) =>
    h.kind[idx(x + dx, y + dy)] === K.open || (y + dy === SURF - 1 && dy === -1);
  const horiz = o(-1, 0) && o(1, 0) && !o(0, -1) && !o(0, 1);
  const vert = o(0, -1) && o(0, 1) && !o(-1, 0) && !o(1, 0);
  if (!horiz && !vert) return false;
  if (cellsWithUse(h, USE.door).length >= 3) return false;
  h.use[cell] = USE.door;
  h.doorWork[cell] = 14;
  touch(s);
  return true;
}

export function ringBell(s: WarrenState): boolean {
  if (s.bell && s.bell.until > s.minute) return false;
  const r = activeRaid(s);
  s.bell = {
    at: s.minute,
    until:
      (s.edition === '0.4.0' || s.edition === '0.5.0' || s.edition === '0.6.0' || s.edition === '0.7.0') && r
        ? r.leave
        : s.minute + V.bellHours * HOUR,
    real: !!r,
  };
  note(s, {
    kind: 'story',
    text: r ? 'You rang the bell.' : 'You rang the bell, though no one had seen smoke.',
    weight: 1,
  });
  const c = communityOf(s);
  for (const p of c.people) interruptPerson(c, p, Math.max(p.now, s.minute), 'bell');
  return true;
}

/** Stores below in words, never a number: what the keeper would write. */
export function storesWords(s: WarrenState): string {
  const alive = s.people.filter((p) => p.body.alive).length;
  const days = grainBelow(s.hill) / Math.max(1, alive * V.ration);
  if (days < 3) return 'The jars below ground are empty.';
  if (days < 20) return 'There are a few jars of grain below ground.';
  if (days < 60) return 'The grain below ground will last about a month.';
  if (days < 150) return 'The grain below ground will only just last through winter.';
  return 'The grain below ground will last a year.';
}

export function waterWords(s: WarrenState): string {
  if (s.flags.water) return 'There is a well below ground.';
  const w = s.hill.water[hearthCell(s)] ?? 0;
  if (w < 0.3) return 'The water jars are dry.';
  if (w < 3) return 'There is a little water at the hearth.';
  return 'The water jars at the hearth are full.';
}
