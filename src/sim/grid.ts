/**
 * The hill in cross-section: world truth about rock, open space, marks, lamps, doors, stores and wear. Plain JSON
 * (arrays of numbers), so a save is the hill itself.
 *
 * Geometry. Columns 0..W-1, rows 0..H-1. Rows above SURF are sky; row SURF-1 is the ground people walk on; rock
 * starts at SURF. Our side is columns 0..RIDGE-1, a low ridge at RIDGE..RIDGE+1, the neighbours' village beyond.
 *
 * Stigmergy, honestly: nothing here tells a person what to do. A worn floor is quicker to walk, a lit passage is
 * quicker and is where a pick can work, spoil left at a face blocks it. People choose among offers whose
 * durations come from these paths (see warren.ts), so a worn route is chosen more and wears further.
 */
import { DRAW, hashUnit, stream } from './rng.ts';

export const W = 34;
export const H = 58;
export const SURF = 8;
export const RIDGE = 24;
export const THEIR_X = 26;

export const K = {
  sky: 0,
  rock: 1,
  hard: 2,
  loose: 3,
  seam: 4,
  /** An old chamber nobody alive remembers: a void that opens when a pick breaks into it. */
  old: 5,
  open: 6,
  /** The neighbours' open passages and rooms, unknown until heard or broken into. */
  theirs: 7,
  bedrock: 8,
} as const;

export const USE = { none: 0, store: 1, beds: 2, hearth: 3, well: 4, door: 5 } as const;
export type UseName = keyof typeof USE;

/** Person-hours to dig one cell, by rock (engineering assumption, tuned by the measure: soft tuff cuts easily). */
export const DIG_HOURS: Record<number, number> = {
  [K.rock]: 5,
  [K.hard]: 16,
  [K.loose]: 2.5,
  [K.seam]: 6,
};

/** Kile of grain one store cell holds (jars along the walls). */
export const STORE_CAP = 30;
/** Sleepers one beds cell holds. */
export const BEDS_PER_CELL = 3;
/** Loads of spoil that block a face. */
export const SPOIL_BLOCK = 3;
/** Steps from a lamp that it lights. */
export const LAMP_REACH = 4;
/** Steps from an opening to the sky beyond which the air is stale (no lamp burns, people ache). */
/** Air reach in thirds of a step: 18 cells sideways from an opening, or three times as far straight down a shaft. */
export const AIR_SIDE = 3;
export const AIR_UP = 1;
export const AIR_REACH = 18 * AIR_SIDE;

export interface Hill {
  kind: number[];
  /** 0..1 of a cell dug toward open. */
  dig: number[];
  /** Loads of loose stone lying in an open cell. */
  spoil: number[];
  /** Chalk: 1 = dig here. */
  chalk: number[];
  use: number[];
  lamp: number[];
  /** Door state for door cells: 1 = rolled shut. A door is carved first (doorWork, hours left). */
  shut: number[];
  doorWork: number[];
  grain: number[];
  /** Footfall, decaying daily. */
  wear: number[];
  /** Cells whose rock the keeper has seen (adjacent to open space). */
  known: number[];
  /** Water in the jars at a well or the hearth (loads). */
  water: number[];
  /** Surface features by column. */
  surface: {
    spring: number;
    fields: [number, number];
    houses: number[];
    floor: number;
    heap: number;
    entrance: number;
  };
  /** Lamps carried but not hung. */
  lampsSpare: number;
  /** Lamps the keeper has asked for (ghosts) beyond those in hand. */
  lampsWanted: number[];
  /** The old chamber's cells, for the find note. */
  oldCells: number[];
  /** Their store cells (beyond the ridge). */
  theirStore: number[];
  /** Their westward tunnel head (they dig toward us slowly). */
  theirHead: number;
}

export const idx = (x: number, y: number) => y * W + x;
export const xOf = (i: number) => i % W;
export const yOf = (i: number) => Math.floor(i / W);
export const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H;

export function neighbours(i: number): number[] {
  const x = xOf(i);
  const y = yOf(i);
  const out: number[] = [];
  if (x > 0) out.push(i - 1);
  if (x < W - 1) out.push(i + 1);
  if (y > 0) out.push(i - W);
  if (y < H - 1) out.push(i + W);
  return out;
}

export const diggable = (k: number) => k === K.rock || k === K.hard || k === K.loose || k === K.seam;

/** Walkable: open ground below the sky line, the surface row, and (once linked) their passages. */
export function walkable(h: Hill, i: number, linked: boolean): boolean {
  const k = h.kind[i] ?? K.bedrock;
  if (k === K.open) return !(h.use[i] === USE.door && h.shut[i] === 1);
  if (k === K.theirs) return linked;
  if (k === K.sky) return yOf(i) === SURF - 1;
  return false;
}

export function newHill(seed: number): Hill {
  const n = W * H;
  const z = () => new Array<number>(n).fill(0);
  const kind = z();
  const r = stream(seed, DRAW.rock);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = idx(x, y);
      if (y < SURF) kind[i] = K.sky;
      else if (y >= H - 2) kind[i] = K.bedrock;
      else kind[i] = K.rock;
    }
  // A hard band about a dozen rows down, with soft gaps a lucky pick can find.
  const band = SURF + 12 + Math.floor(r() * 3);
  for (let x = 0; x < W; x++)
    for (let y = band; y < band + 3; y++) {
      const gap = Math.abs(x - (5 + Math.floor(hashUnit(seed, DRAW.rock, 99) * 14))) <= 1;
      if (!gap) kind[idx(x, y)] = K.hard;
    }
  // A deeper hard band.
  const band2 = SURF + 30 + Math.floor(r() * 4);
  for (let x = 0; x < W; x++)
    for (let y = band2; y < band2 + 2; y++) if (r() < 0.85) kind[idx(x, y)] = K.hard;
  // Loose pockets east of the entrance.
  for (let k = 0; k < 5; k++) {
    const x = 19 + Math.floor(r() * 5);
    const y = SURF + 6 + Math.floor(r() * 10);
    for (const [dx, dy] of [
      [0, 0],
      [1, 0],
      [0, 1],
    ] as const)
      if (inside(x + dx, y + dy) && x + dx < RIDGE) kind[idx(x + dx, y + dy)] = K.loose;
  }
  // The water seam: a damp layer below the hard band, under the fields.
  const seamY = band + 7 + Math.floor(r() * 3);
  const seamX0 = 2 + Math.floor(r() * 4);
  for (let x = seamX0; x < seamX0 + 9; x++) kind[idx(x, seamY)] = K.seam;
  // The old chamber: a void above the hard band, west of the entrance.
  const ox = 3 + Math.floor(r() * 7);
  const oy = SURF + 5 + Math.floor(r() * 5);
  const oldCells: number[] = [];
  for (let x = ox; x < ox + 4; x++)
    for (let y = oy; y < oy + 2; y++) {
      kind[idx(x, y)] = K.old;
      oldCells.push(idx(x, y));
    }
  // The neighbours: an entrance, a stair down, a store room level with our cellar's depth plus a few rows.
  const theirStore: number[] = [];
  const tx = 29;
  for (let y = SURF; y < SURF + 9; y++) kind[idx(tx, y)] = K.theirs;
  for (let x = THEIR_X; x <= 31; x++)
    for (let y = SURF + 9; y < SURF + 11; y++) {
      kind[idx(x, y)] = K.theirs;
      if (x <= 28) theirStore.push(idx(x, y));
    }
  for (let y = SURF + 11; y < SURF + 17; y++) kind[idx(31, y)] = K.theirs;
  for (let x = 27; x <= 31; x++) kind[idx(x, SURF + 17)] = K.theirs;
  const theirHead = idx(27, SURF + 17);
  // Our start: the entrance, a short stair, the old cellar under the dig-master's house with its hearth.
  const ex = 18;
  const use = z();
  for (let y = SURF; y < SURF + 3; y++) kind[idx(ex, y)] = K.open;
  for (let x = 16; x <= 19; x++) kind[idx(x, SURF + 3)] = K.open;
  use[idx(16, SURF + 3)] = USE.store;
  use[idx(17, SURF + 3)] = USE.hearth;
  const grain = z();
  const water = z();
  water[idx(17, SURF + 3)] = 2;
  const lamp = z();
  lamp[idx(17, SURF + 3)] = 1;
  const hill: Hill = {
    kind,
    dig: z(),
    spoil: z(),
    chalk: z(),
    use,
    lamp,
    shut: z(),
    doorWork: z(),
    grain,
    wear: z(),
    known: z(),
    water,
    surface: { spring: 1, fields: [2, 9], houses: [10, 12, 14], floor: 16, heap: 21, entrance: ex },
    lampsSpare: 2,
    lampsWanted: [],
    oldCells,
    theirStore,
    theirHead,
  };
  refreshKnown(hill);
  return hill;
}

/** Rock next to open space (or the surface) is seen; the rest is guessed. */
export function refreshKnown(h: Hill) {
  for (let i = 0; i < h.kind.length; i++) {
    if (h.known[i]) continue;
    const k = h.kind[i] ?? 0;
    if (k === K.open || k === K.sky) {
      h.known[i] = 1;
      continue;
    }
    if (k === K.theirs || k === K.old) continue;
    for (const j of neighbours(i)) {
      const kj = h.kind[j];
      if (kj === K.open || (kj === K.sky && yOf(j) === SURF - 1)) {
        h.known[i] = 1;
        break;
      }
    }
  }
}

// ---------- paths ----------

export interface Field {
  dist: Float64Array;
  prev: Int32Array;
}

/** Minutes to walk a cell (engineering assumption): worn floors are quicker, dark and cluttered ones slower. */
export function stepCost(h: Hill, i: number, lit: Uint8Array): number {
  const y = yOf(i);
  if (y === SURF - 1) return 0.7;
  const worn = Math.min(1, (h.wear[i] ?? 0) / 24);
  let c = 1.3 * (1 - 0.4 * worn);
  if (!lit[i]) c *= 1.6;
  if ((h.spoil[i] ?? 0) >= 2) c *= 1.5;
  return c;
}

/** Dijkstra from `from` over walkable cells. */
export function paths(h: Hill, from: number, lit: Uint8Array, linked: boolean): Field {
  const n = h.kind.length;
  const dist = new Float64Array(n).fill(Number.POSITIVE_INFINITY);
  const prev = new Int32Array(n).fill(-1);
  const heap: number[] = [];
  const hd: number[] = [];
  const push = (i: number, d: number) => {
    heap.push(i);
    hd.push(d);
    let k = heap.length - 1;
    while (k > 0) {
      const p = (k - 1) >> 1;
      if ((hd[p] ?? 0) <= d) break;
      heap[k] = heap[p] ?? 0;
      hd[k] = hd[p] ?? 0;
      heap[p] = i;
      hd[p] = d;
      k = p;
    }
  };
  const pop = (): number => {
    const top = heap[0] ?? -1;
    const li = heap.pop() ?? 0;
    const ld = hd.pop() ?? 0;
    if (heap.length > 0) {
      heap[0] = li;
      hd[0] = ld;
      let k = 0;
      for (;;) {
        const a = 2 * k + 1;
        const b = a + 1;
        let m = k;
        if (a < heap.length && (hd[a] ?? 0) < (hd[m] ?? 0)) m = a;
        if (b < heap.length && (hd[b] ?? 0) < (hd[m] ?? 0)) m = b;
        if (m === k) break;
        const ti = heap[k] ?? 0;
        const td = hd[k] ?? 0;
        heap[k] = heap[m] ?? 0;
        hd[k] = hd[m] ?? 0;
        heap[m] = ti;
        hd[m] = td;
        k = m;
      }
    }
    return top;
  };
  dist[from] = 0;
  push(from, 0);
  while (heap.length) {
    const d0 = hd[0] ?? 0;
    const i = pop();
    if (d0 > (dist[i] ?? 0)) continue;
    for (const j of neighbours(i)) {
      if (!walkable(h, j, linked)) continue;
      const vertical = Math.abs(j - i) === W ? 1.25 : 1;
      const d = d0 + stepCost(h, j, lit) * vertical;
      if (d < (dist[j] ?? 0)) {
        dist[j] = d;
        prev[j] = i;
        push(j, d);
      }
    }
  }
  return { dist, prev };
}

export function route(f: Field, to: number): number[] {
  const out: number[] = [];
  let i = to;
  let guard = 0;
  while (i >= 0 && guard++ < 5000) {
    out.push(i);
    i = f.prev[i] ?? -1;
  }
  return out.reverse();
}

/** Air distance from every sky opening through open cells, in thirds of a sideways step (see AIR_SIDE, AIR_UP). */
export function airSteps(h: Hill): Int16Array {
  const n = h.kind.length;
  const d = new Int16Array(n).fill(32000);
  const q: number[] = [];
  for (let x = 0; x < W; x++) {
    const i = idx(x, SURF);
    if (h.kind[i] === K.open) {
      d[i] = 0;
      q.push(i);
    }
  }
  for (let qi = 0; qi < q.length; qi++) {
    const i = q[qi] ?? 0;
    for (const j of neighbours(i)) {
      if (h.kind[j] !== K.open) continue;
      // Air rises and falls through a shaft far more easily than it creeps sideways along a passage.
      const step = yOf(j) === yOf(i) ? AIR_SIDE : AIR_UP;
      if ((d[j] ?? 0) <= (d[i] ?? 0) + step) continue;
      d[j] = (d[i] ?? 0) + step;
      q.push(j);
    }
  }
  return d;
}

/** Lit cells: lamps burning in good air, daylight near the openings, the surface by day. */
export function lighting(h: Hill, air: Int16Array, day: boolean): Uint8Array {
  const n = h.kind.length;
  const lit = new Uint8Array(n);
  const q: number[] = [];
  const reach = new Int16Array(n).fill(-1);
  for (let i = 0; i < n; i++) {
    if (yOf(i) === SURF - 1 && day) lit[i] = 1;
    if (h.kind[i] !== K.open) continue;
    if (h.lamp[i] && (air[i] ?? 32000) <= AIR_REACH) {
      reach[i] = LAMP_REACH;
      q.push(i);
    }
    if (day && (air[i] ?? 32000) <= 2) {
      if ((reach[i] ?? -1) < 2 - (air[i] ?? 0)) {
        reach[i] = 2 - (air[i] ?? 0);
        q.push(i);
      }
    }
  }
  for (let qi = 0; qi < q.length; qi++) {
    const i = q[qi] ?? 0;
    lit[i] = 1;
    const r = reach[i] ?? 0;
    if (r <= 0) continue;
    for (const j of neighbours(i)) {
      if (h.kind[j] !== K.open) {
        // A lamp lights the face it stands at.
        if (diggable(h.kind[j] ?? 0)) lit[j] = 1;
        continue;
      }
      if ((reach[j] ?? -1) >= r - 1) continue;
      reach[j] = r - 1;
      q.push(j);
    }
  }
  return lit;
}

/** A face: a chalked, diggable cell next to open ground (or the surface walk), and where a digger stands for it. */
export function faces(h: Hill): { face: number; stand: number }[] {
  const out: { face: number; stand: number }[] = [];
  for (let i = 0; i < h.kind.length; i++) {
    if (!h.chalk[i] || !diggable(h.kind[i] ?? 0)) continue;
    if (xOf(i) >= THEIR_X) continue;
    let best = -1;
    for (const j of neighbours(i)) {
      const k = h.kind[j];
      if (k === K.open || (k === K.sky && yOf(j) === SURF - 1)) {
        // Prefer standing beside or above over standing below (stone falls on whoever digs upward).
        if (best < 0 || yOf(j) <= yOf(best)) best = j;
      }
    }
    if (best >= 0) out.push({ face: i, stand: best });
  }
  return out;
}

/** Open cells in one 4-connected region of the same use (a room). */
export function roomOf(h: Hill, i: number): number[] {
  const u = h.use[i];
  if (!u || h.kind[i] !== K.open) return [];
  const seen = new Set([i]);
  const q = [i];
  for (let qi = 0; qi < q.length; qi++) {
    for (const j of neighbours(q[qi] ?? 0)) {
      if (seen.has(j) || h.kind[j] !== K.open || h.use[j] !== u) continue;
      seen.add(j);
      q.push(j);
    }
  }
  return q;
}

export function cellsWithUse(h: Hill, u: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < h.use.length; i++) if (h.use[i] === u && h.kind[i] === K.open) out.push(i);
  return out;
}

export const surfaceCell = (x: number) => idx(x, SURF - 1);

/** Grain held below ground, kile. */
export function grainBelow(h: Hill): number {
  let g = 0;
  for (let i = 0; i < h.grain.length; i++) if (yOf(i) >= SURF) g += h.grain[i] ?? 0;
  return g;
}
