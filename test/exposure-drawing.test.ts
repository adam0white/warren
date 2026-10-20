import { describe, expect, it } from 'vitest';
import { newGame } from '../src/sim/game.ts';
import { idx, K, SURF, USE } from '../src/sim/grid.ts';
import { draw, type Ink } from '../src/ui/draw.ts';

const ink: Ink = {
  paper: '#fff',
  paper2: '#eee',
  ink: '#222',
  soft: '#888',
  rope: '#a42',
  moss: '#474',
  sky: '#48a',
  dark: false,
};
function washes(s: ReturnType<typeof newGame>['s']) {
  const cells: number[][] = [];
  const context = new Proxy(
    { fillStyle: '' },
    {
      get(target, key) {
        if (key in target) return target[key as keyof typeof target];
        if (key === 'fillRect')
          return (...args: number[]) => {
            if (target.fillStyle === ink.sky && args[2] === 24 && args[3] === 24) cells.push(args);
          };
        if (key === 'measureText') return () => ({ width: 10 });
        return () => {};
      },
    },
  ) as unknown as CanvasRenderingContext2D;
  draw(context, s, { cs: 24, x: 0, y: 0, w: 1000, h: 1000 }, ink, {
    preview: new Set(),
    previewKind: null,
    selected: null,
    t: s.minute,
  });
  return cells;
}
describe('the plan exposes exactly the open rider routes', () => {
  it('washes reachable cells, leaves deep cells still and retains the first-scare observations after a door closes', () => {
    const s = newGame(7).s;
    s.hill.kind.fill(K.rock);
    const x = s.hill.surface.entrance;
    for (let y = SURF; y <= SURF + 12; y++) s.hill.kind[idx(x, y)] = K.open;
    const near = [x * 24, (SURF + 5) * 24, 24, 24];
    const deep = [x * 24, (SURF + 12) * 24, 24, 24];
    expect(washes(s)).toContainEqual(near);
    expect(washes(s)).not.toContainEqual(deep);
    const door = idx(x, SURF + 2);
    s.hill.use[door] = USE.door;
    s.hill.shut[door] = 1;
    expect(washes(s)).not.toContainEqual(near);
    const raid = s.raids[0];
    if (!raid) throw new Error('No raid');
    raid.scouted = [idx(x, SURF + 5)];
    const before = JSON.stringify(s);
    expect(washes(s)).toContainEqual(near);
    expect(JSON.stringify(s)).toBe(before);
  });
});
