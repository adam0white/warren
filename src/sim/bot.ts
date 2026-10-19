/**
 * A plain bot keeper for the headless measure and tests: it chalks rooms off the cellar, marks stores and beds,
 * hangs lamps at dark faces, digs down toward the water and a shaft for air, carves a door, and rings the bell
 * when it sees smoke. It reads only what the screen shows (faces, notes, the sky), never people's minds.
 */
import { act, type Game } from './game.ts';
import { cellsWithUse, faces, idx, K, SURF, USE, W } from './grid.ts';
import { activeRaid, airAndLight, faceState } from './warren.ts';

const rect = (x0: number, y0: number, x1: number, y1: number) => {
  const out: number[] = [];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) out.push(idx(x, y));
  return out;
};

/** The bot's plan: rooms in order; each is chalked once the previous is mostly open. */
const PLAN: { cells: number[]; use?: 'store' | 'beds'; door?: number }[] = [
  { cells: rect(12, SURF + 3, 15, SURF + 3), use: 'store' },
  { cells: rect(12, SURF + 4, 15, SURF + 4), use: 'store' },
  { cells: rect(17, SURF + 4, 17, SURF + 7) },
  { cells: rect(14, SURF + 7, 20, SURF + 8), use: 'beds', door: idx(17, SURF + 5) },
  { cells: rect(10, SURF + 7, 13, SURF + 8), use: 'beds' },
  { cells: rect(21, SURF, 21, SURF + 6) },
  { cells: rect(8, SURF + 8, 9, SURF + 24) },
  { cells: rect(4, SURF + 22, 7, SURF + 24), use: 'beds' },
  { cells: rect(10, SURF + 22, 14, SURF + 23), use: 'store' },
  { cells: rect(21, SURF + 9, 25, SURF + 9) },
];

export interface BotState {
  step: number;
  rang: number;
  tried: Set<number>;
}

export const newBot = (): BotState => ({ step: 0, rang: -1, tried: new Set() });

export function botStep(g: Game, state: BotState) {
  const s = g.s;
  const h = s.hill;
  const stepPlan = PLAN[state.step];
  if (stepPlan) {
    const todo = stepPlan.cells.filter((c) => h.kind[c] !== K.open && !h.chalk[c] && !state.tried.has(c));
    if (todo.length && !stepPlan.cells.some((c) => h.chalk[c])) {
      for (const c of todo) state.tried.add(c);
      act(g, { verb: 'chalk', cells: todo, on: true });
    }
    const open = stepPlan.cells.filter((c) => h.kind[c] === K.open);
    const stuck =
      !stepPlan.cells.some((c) => h.chalk[c]) &&
      stepPlan.cells.every((c) => h.kind[c] === K.open || state.tried.has(c));
    if (open.length >= stepPlan.cells.length * 0.8 || stuck) {
      if (stepPlan.use) act(g, { verb: 'use', cells: open, use: stepPlan.use });
      if (stepPlan.door !== undefined && h.kind[stepPlan.door] === K.open)
        act(g, { verb: 'door', cell: stepPlan.door });
      state.step++;
    }
  }
  // Lamps at dark faces.
  const { lit, air } = airAndLight(s);
  for (const f of faces(h)) {
    if (faceState(s, f.face, f.stand, lit, air) === 'dark' && h.lampsWanted.length === 0) {
      act(g, { verb: 'lamp', cell: f.stand });
      break;
    }
  }
  // Stale air at a face: sink a shaft from the sky straight down beside it.
  for (const f of faces(h)) {
    if (faceState(s, f.face, f.stand, lit, air) !== 'stale') continue;
    const x = f.face % W;
    const col = rect(x, SURF, x, Math.floor(f.face / W) - 1).filter(
      (c) => h.kind[c] !== K.open && !h.chalk[c] && !state.tried.has(c),
    );
    if (col.length) {
      for (const c of col) state.tried.add(c);
      act(g, { verb: 'chalk', cells: col, on: true });
    }
    break;
  }
  const raid = activeRaid(s);
  if (raid && raid.stage === 'smoke' && state.rang !== raid.smoke) {
    state.rang = raid.smoke;
    act(g, { verb: 'bell' });
  }
  void cellsWithUse;
  void USE;
}
