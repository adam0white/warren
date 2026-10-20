/**
 * The hill as an HF host: world truth (rock, rooms, grain, water, raids, the neighbours) and the HF `World` its
 * people decide in. Every figure on screen is an HF `Person` lived in full by `stepCommunity`; there are no
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
import {
  type Activity,
  type Affordance,
  addPerson,
  ageYears,
  type Community,
  type CommunityState,
  communityState,
  createCommunity,
  type DecisionRecord,
  injure,
  interruptPerson,
  type Outcome,
  type Percept,
  type Person,
  readBody,
  type SimEvent,
  type Suggestion,
  type SuggestionResolution,
  stepCommunity,
  type World,
} from '@adam0white/human-framework';
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
  walkable,
  xOf,
  yOf,
} from './grid.ts';
import { arrivingFamily, BELL, founders, type House, USTA_ID } from './people.ts';
import { DRAW, hashUnit, strHash } from './rng.ts';

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
  edition?: '0.3.0';
  recoveries?: { who: string; injury: string; part: string; severity: number }[];
  seed: number;
  minute: number;
  hill: Hill;
  /** Bumped when rock, rooms, lamps or doors change (path and light caches key on it). */
  version: number;
  people: Person[];
  houses: House[];
  community?: CommunityState;
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

export function newWarren(seed: number): WarrenState {
  const now = 5 * HOUR;
  const hill = newHill(seed);
  const { houses, people } = founders(seed, now);
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
    people,
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
    usedNames: [...people.map((p) => p.name), 'house:Kaya', 'house:Demir', 'house:Usta'],
  };
  note(s, {
    kind: 'story',
    text: 'The barley stood ripe. Riders had burned two villages to the south in spring, and the cellar under Yusuf’s house held one jar.',
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
      summary: 'riders burned two villages to the south this spring',
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
  if (community && communityFor) communityFor.community = communityState(community);
  cache = null;
  anchorCache = null;
  community = null;
  communityFor = null;
  world = null;
  worldFor = null;
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
  const outside = riskOutside(s);
  const house = houseOf(s, p.id);
  const sleepy = !light || p.body.sleepPressure > 0.7 || p.body.sleepDebt > 0.5 || p.body.health < 0.5;
  const winter = season === 'winter';
  const hearth = hearthCell(s);
  const below = yOf(from) >= SURF;
  const isAdult = adult(p);
  const old = elder(p);

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
    const beds = cellsWithUse(h, USE.beds).filter((c) => sleepersAt(s, c) < BEDS_PER_CELL);
    let bc = -1;
    let bd = Number.POSITIVE_INFINITY;
    for (const c of beds) {
      const d = f.dist[c] ?? Number.POSITIVE_INFINITY;
      if (d < bd) {
        bd = d;
        bc = c;
      }
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
    offer(
      {
        id: 'chat',
        action: 'chat',
        label: old ? 'sit by the hearth and talk' : 'sit at the hearth with the others',
        placeId: 'hearth',
        duration: 0,
        effort: 0.05,
        advertises: { belonging: 0.25, leisure: 0.15, ...(s.people.length > 1 ? {} : {}) },
        tags: ['social', 'leisure'],
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
    const lean = s.people.length * V.ration * 20 > grainBelow(h) + s.houses.reduce((a, x) => a + x.jars, 0);
    if (house && house.jars > 0.05 && !(threat === 'riders' && below)) {
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
    const deep = deepestSafe(s, f);
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
          label: 'go down and show them the stroke',
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
        label: 'reap the barley',
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
  const jarsNow = grainBelow(h) + s.houses.reduce((a, x) => a + x.jars, 0);
  if (light && working && !threat && house && jarsNow < s.people.length * V.ration * 12) {
    offer(
      {
        id: 'forage',
        action: 'forage',
        label: season === 'winter' ? 'walk the goats out' : 'glean and gather in the hills',
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
        label: 'plough and sow',
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
      srcs.push({ cell: floorCell(s), id: 'carry-floor', label: 'carry sheaves down to the store' });
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
        label: 'shape and fire a clay lamp',
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
        label: 'carve the rolling stone',
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
                ? 'dig at the loose face'
                : 'dig at the chalked face',
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
          label: 'carry spoil up to the heap',
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
          s.people.length * V.ration * 30 > grainBelow(h) + s.houses.reduce((a, x) => a + x.jars, 0);
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
  return out;
}

function seedAvailable(s: WarrenState): number {
  return s.fields.floor + grainBelow(s.hill) + s.houses.reduce((a, h) => a + h.jars, 0);
}

/** The safest reachable open cell: deepest past a door if any, else the deepest reachable. */
function deepestSafe(s: WarrenState, f: Field): number {
  const h = s.hill;
  const exposed = riderCells(s);
  let best = -1;
  let score = -1;
  for (let i = 0; i < h.kind.length; i++) {
    if (h.kind[i] !== K.open || !Number.isFinite(f.dist[i] ?? Number.POSITIVE_INFINITY)) continue;
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
  const house = houseOf(s, p.id);
  switch (act.action) {
    case 'dig': {
      const face = Number(act.targetId);
      const k = h.kind[face] ?? K.rock;
      if (!diggable(k)) return { ...base, needs: { competence: 0.02 } };
      const skill = p.skills.digging?.level ?? 0.4;
      const cap = readBody(p).capacity;
      const rate = (0.55 + 0.9 * skill) * (0.4 + 0.6 * cap) * (act.protest ? 0.6 : 1);
      const per = DIG_HOURS[k] ?? 5;
      h.dig[face] = (h.dig[face] ?? 0) + (hours * rate) / per;
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
        got = Math.min(want, house.jars);
        house.jars -= got;
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
      const amt = rate * hours * (act.protest ? 0.6 : 1);
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
          text: `${p.name} fired a lamp and hung it where you had marked.`,
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
            text: `The rolling stone stood in its groove. ${p.name} rolled it once to see.`,
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
      h.shut[d] = 0;
      touch(s);
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
            summary: `${p.name} showed me the stroke at the face`,
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
    s.stats.hurt++;
    note(s, {
      kind: 'hurt',
      who: p.id,
      cell: face,
      text: `The roof came down at the loose face. They dug ${p.name} out with a hurt shoulder.`,
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
        text: `Water. ${p.name}’s pick went into the damp layer and it seeped, then ran. A well under the hill.`,
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
      text: `${p.name}’s pick went through into a room nobody alive had dug: soot on the ceiling, a trough cut in the wall, two clay lamps in a niche.`,
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
      ? `${who} broke through into someone else’s dark: a swept floor, a lamp niche, jars along a wall. The next village has been digging too.`
      : 'The knocking in the east wall stopped. Then a lamp came through it: the next village’s diggers had reached ours.',
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
  dig: 'The hill needs room before the frost.',
  'carry-spoil': 'Somebody has to clear it, or nobody digs.',
  'fetch-water': 'The jars at the hearth were low.',
  reap: 'The barley will not wait.',
  sow: 'Next year’s bread goes in now.',
  'carve-door': 'A door, before they come again.',
  'make-lamp': 'They need light down there.',
  forage: 'There is food in the hills if you know where.',
  'carry-grain': 'Better below than above when they come.',
};
function whyLine(narration: string, action: string): string {
  if (!/money|pays|paid|wage|coin/i.test(narration)) return narration;
  return WORK_WHY[action] ?? 'It needs doing.';
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
      above === 1 ? 'One was still above ground.' : `${NUMW[above] ?? above} were still above ground.`,
    );
  if (entrance)
    why.push(
      doors.length
        ? 'The rest were caught on the near side of the door, where the riders could still reach.'
        : 'Below, they were caught within reach of the entrance; nothing stood between.',
    );
  if (lost(r) > 3 && !doors.length && grainBelow(s.hill) > 0)
    why.push('The near jars were found; the far ones were not.');
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
      ? 'No riders came. They climbed back up blinking and looked at the bell, and then at you.'
      : k === 2
        ? `No riders again. ${name ? `${name} hung a wet shawl on the bell rope to dry.` : 'Someone hung a wet shawl on the bell rope to dry.'}`
        : came.length
          ? `No riders. ${came.length === 1 ? 'Only one' : `Only ${came.length}`} went down this time, and came up quickly.`
          : 'No riders. Nobody went down. The children ring the bell now, for fun.';
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
    ? `${p.name} heard the bell and kept on with ${offer.label.replace(/^(the|a) /, 'the ')}. ${p.life.sex === 'female' ? 'She' : 'He'} had heard it before.`
    : `${p.name}: “${res.says}”`;
  // One stock answer once per ringing: the second person to say "After I pray" joins the first line.
  const bellAt = s.bell.at;
  if (!doubting) {
    const same = s.notes.findLast(
      (n) => n.kind === 'answer' && n.at >= bellAt && n.text.endsWith(`“${res.says}”`),
    );
    if (same) {
      if (!same.text.includes(' and others')) same.text = same.text.replace(/:/, ' and others:');
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
      return undefined;
    },
    resolve: (p, act, reason) => resolveActivity(s, p, act, reason),
  };
}

let world: World | null = null;
let worldFor: WarrenState | null = null;
let community: Community | null = null;
let communityFor: WarrenState | null = null;

function worldOf(s: WarrenState): World {
  if (worldFor !== s || !world) {
    world = makeWorld(s);
    worldFor = s;
  }
  return world;
}

export function communityOf(s: WarrenState): Community {
  if (communityFor !== s || !community) {
    if (community && communityFor && communityFor !== s) communityFor.community = communityState(community);
    community = createCommunity(
      s.people.filter((p) => p.body.alive),
      s.community,
    );
    communityFor = s;
  }
  return community;
}

export function syncCommunity(s: WarrenState) {
  s.community = communityState(communityOf(s));
}

// ---------- the step loop ----------

export function advanceTo(s: WarrenState, to: number): SimEvent[] {
  const events: SimEvent[] = [];
  while (s.minute < to) {
    const next = Math.min(to, (Math.floor(s.minute / QUANTUM) + 1) * QUANTUM);
    const c = communityOf(s);
    const suggestions: Record<string, Suggestion> = {};
    if (s.bell && s.bell.until > s.minute)
      for (const p of c.people)
        suggestions[p.id] = { voiceId: BELL, action: 'shelter', strength: V.bellStrength, since: s.bell.at };
    const ev = stepCommunity(c, worldOf(s), next, {
      suggestions,
      lifecourse: { mortality: true },
      maxEvents: 2000,
      contagion: false,
    });
    for (const e of ev) if (e.kind === 'died') events.push(e);
    const day0 = dayOfMinute(s.minute);
    s.minute = next;
    afterQuantum(s, ev);
    if (dayOfMinute(s.minute) !== day0) endOfDay(s, day0);
  }
  return events;
}

function afterQuantum(s: WarrenState, ev: SimEvent[]) {
  for (const e of ev) {
    if (e.kind !== 'died') continue;
    const p = personOf(s, e.personId);
    if (!p) continue;
    s.stats.died++;
    note(s, {
      kind: 'story',
      who: p.id,
      text: `${p.name} died ${p.id === USTA_ID ? 'by the hearth, in his sleep' : 'below the hill'}.`,
      weight: 3,
    });
  }
  raidStep(s);
  if (s.edition === '0.3.0') recoveryWords(s);
  if (s.bell && s.bell.until <= s.minute) {
    if (!s.bell.real) falseAlarm(s, s.bell.at);
    s.bell = null;
  }
  goalsStep(s);
}

function everyone(s: WarrenState, pc: Omit<Percept, 'at'>, interrupt: boolean) {
  const c = communityOf(s);
  for (const p of c.people) {
    queue(s, p.id, { ...pc, at: s.minute });
    if (interrupt) interruptPerson(c, p, Math.max(p.now, s.minute), `percept:${pc.kind}`);
  }
}

function raidStep(s: WarrenState) {
  for (const r of s.raids) {
    const scare = s.edition === '0.3.0' && r === s.raids[0];
    if (r.stage === 'coming' && s.minute >= r.smoke) {
      r.stage = 'smoke';
      const first = s.raids.indexOf(r) === 0;
      note(s, {
        kind: 'raid',
        text: first
          ? 'Smoke on the southern hills, more than a field fire makes. Riders, then. Half a day, maybe less.'
          : 'Smoke again in the south.',
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
          summary: 'smoke in the south: riders coming',
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
          took += h.jars;
          h.jars = 0;
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
          ? 'Riders searched the entrances and looked in. They were scouting; no one was struck. They may return in force.'
          : 'Riders on the hill. Hooves over our heads, voices at the entrance.',
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
          summary: 'riders on the hill',
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
            injure(p, {
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
              summary: 'a rider struck me',
            });
            note(s, {
              kind: 'hurt',
              who: p.id,
              cell: c,
              text: `${p.name} was caught ${yOf(c) < SURF ? 'above ground' : 'near the entrance'} and struck.`,
              weight: 3,
            });
          }
        }
      }
      if (s.minute >= r.leave) {
        r.stage = 'gone';
        const lost = r.took;
        const held = r.hurt.length === 0 && lost < s.people.length * V.ration * 30;
        if (held) {
          s.heldAt = s.minute;
          s.word = Math.min(1, s.word + 0.25);
        } else s.word = Math.max(0, s.word - 0.1);
        note(s, {
          kind: 'raid',
          text: scare
            ? 'The scouts rode off north. No one was struck and nothing was taken. The pale tracks show where they searched. Next time they may strike.'
            : held
              ? `They rode off north. They found ${lost > 1 ? 'a little' : 'nothing'} above ground and nothing below. The hill held.`
              : `They rode off north with ${lost > 0.5 * (lost + grainBelow(s.hill)) ? 'much of our grain' : lost > 3 ? 'some of our grain' : 'little'}${r.hurt.length ? `, and ${r.hurt.length === 1 ? 'one of us was' : `${r.hurt.length} of us were`} hurt` : ''}.${raidWhy(s, r)}`,
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
            summary: 'the riders have gone',
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
    dx === 0 ? 'under the entrance' : `${Math.abs(dx)} paces ${dx < 0 ? 'west' : 'east'} of the entrance`;
  const place = s.hill.use[cell] === USE.beds ? 'sleeping place' : 'passage';
  return `the ${place} ${side}, ${yOf(cell) - SURF} levels down`;
}

function scout(s: WarrenState, r: Raid) {
  r.scouted ??= [];
  r.wouldCatch ??= [];
  const reach = riderCells(s);
  for (const c of reach.keys()) {
    if (r.scouted.includes(c)) continue;
    r.scouted.push(c);
    note(s, { kind: 'raid', cell: c, text: `They looked into ${scoutPlace(s, c)}.`, weight: 1.5 });
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
      text: `They looked into ${scoutPlace(s, c)}, where ${p.name} was ${doing}. ${p.name} would have been caught. No one was struck.`,
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
          ? `${p.name}: “The wound on my ${tracked.part} is easier today. It still aches.”`
          : `${p.name}: “The wound on my ${tracked.part} has mended.”`,
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
        text: `${p.name}: “My ${injury.part} hurts. It will take days.”`,
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
          text: 'The floor is worn smooth now along the busiest passage, and they walk it quicker for that.',
          weight: 1.5,
        });
        break;
      }
    }
  }
  // Habits: the first person who goes to the faces of their own accord.
  if (!s.flags.habit) {
    for (const p of s.people) {
      const hb = p.habits.find((x) => x.action === 'dig' && x.strength > 0.25);
      if (hb) {
        s.flags.habit = s.minute;
        note(s, {
          kind: 'habit',
          who: p.id,
          text: `${p.name} goes down to the faces every morning now. Nobody asks.`,
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
      text: 'First frost. The houses on top are cold at night now; below the hill it is as warm as it was in autumn.',
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
                  text: 'A knocking in the east wall at night, regular as a pick. Someone is digging toward us.',
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
          text: 'Jars half empty in the store this morning, and the dust by the east passage scuffed. They came back for theirs, and more.',
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
            summary: 'someone from the next village took from our store',
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
        text: 'They walled the east passage from their side, and in the market they say what we are.',
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
      ? 'The picks have stopped. At every chalked face the air is stale and the lamps gutter. A shaft to the sky would bring air down.'
      : 'The picks have stopped. Every chalked face is in the dark. A lamp hung beside one would start them again.',
    weight: 2,
  });
}

function wordStep(s: WarrenState, day: number) {
  const h = s.hill;
  const alive = s.people.filter((p) => p.body.alive);
  const food =
    grainBelow(h) + s.fields.floor + s.houses.reduce((a, x) => a + x.jars, 0) + s.fields.standing * 0.8;
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
  s.fields.size = Math.min(150, s.fields.size + 7 * fam.people.filter((p) => ageYears(p) >= 16).length);
  const c = communityOf(s);
  for (const p of fam.people) {
    p.now = s.minute;
    s.people.push(p);
    s.pos[p.id] = surfaceCell(x);
    addPerson(c, p);
  }
  const head = fam.people[0];
  note(s, {
    kind: 'arrival',
    who: head?.id,
    text: `${fam.house.name.replace(/^the /, 'The ')} came up the road with a donkey and ${fam.people.length - 1 > 0 ? `${fam.people.length - 1 === 1 ? 'one other' : `${fam.people.length - 1} others`}` : 'nobody else'}. ${s.heldAt >= 0 ? 'They had heard the hill held.' : s.flags.water ? 'They had heard there was water under the hill.' : 'They had heard there was room.'}`,
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
    text: 'Chalk a wall where you would dig.',
    done: (s) => s.hill.chalk.some((c) => c) || s.stats.dug > 0,
    shown: () => true,
  },
  {
    id: 'first',
    text: 'Wait for someone to take up a pick.',
    done: (s) => s.stats.dug > 0,
    shown: () => true,
  },
  {
    id: 'store',
    text: 'Mark a room for jars, and get the harvest below.',
    done: (s) => grainBelow(s.hill) >= 45,
    shown: () => true,
  },
  {
    id: 'lamp',
    text: 'Hang a lamp where the dark stops the picks.',
    done: (s) => s.hill.lamp.filter((l) => l).length >= 2,
    shown: (s) => s.stats.dug >= 3,
  },
  {
    id: 'raid',
    text: 'Live through the first riders.',
    done: (s) => s.raids[0]?.stage === 'gone',
    shown: (s) => s.raids[0]?.stage !== 'coming',
  },
  {
    id: 'door',
    text: 'A stone door the riders cannot pass.',
    done: (s) => cellsWithUse(s.hill, USE.door).some((d) => !s.hill.doorWork[d]),
    shown: (s) => s.raids[0]?.stage === 'gone',
  },
  {
    id: 'beds',
    text: 'Beds below for everyone before the frost.',
    done: (s) => bedsBelow(s) >= s.people.filter((p) => p.body.alive).length,
    shown: (s) => s.raids[0]?.stage === 'gone',
  },
  {
    id: 'water',
    text: 'Water under the hill.',
    done: (s) => !!s.flags.water,
    shown: (s) => s.stats.dug >= 12,
  },
  {
    id: 'grow',
    text: 'Room for those who hear of us: thirty souls.',
    done: (s) => s.people.filter((p) => p.body.alive).length >= 30,
    shown: (s) => s.arrivals > 0,
  },
  {
    id: 'deep',
    text: 'Below the hard band.',
    done: (s) => deepest(s) >= SURF + 16,
    shown: (s) => deepest(s) >= SURF + 10,
  },
  {
    id: 'year',
    text: 'A year under the hill.',
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
    'Yusuf Usta said his father struck water once, under the fields to the west, a good way below the hard band. Damp stone shows first.',
  deep: 'Below here the stone turns hard and slow. Yusuf Usta says it softens again further down.',
  lamp: 'Where the daylight stops, the picks stop. A lamp hung beside a face lets them work it.',
};

function goalsStep(s: WarrenState) {
  for (const g of GOALS) {
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
  return GOALS.find((g) => s.goals[g.id] === undefined && g.shown(s));
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
      text: 'Chalk under the ridge. Past it the stone is the neighbours’. Yusuf Usta looked at the mark a long time and said only that sound carries in stone.',
      weight: 1.5,
    });
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
  s.bell = { at: s.minute, until: s.minute + V.bellHours * HOUR, real: !!r };
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
  if (days < 3) return 'the jars below are empty';
  if (days < 20) return 'a few jars below';
  if (days < 60) return 'jars below for a month or so';
  if (days < 150) return 'jars below for the winter, just';
  return 'jars below for the year';
}

export function waterWords(s: WarrenState): string {
  if (s.flags.water) return 'a well below';
  const w = s.hill.water[hearthCell(s)] ?? 0;
  if (w < 0.3) return 'the water jars are dry';
  if (w < 3) return 'a little water at the hearth';
  return 'water jars full at the hearth';
}

export function walkableCell(s: WarrenState, i: number): boolean {
  return walkable(s.hill, i, s.linked);
}
