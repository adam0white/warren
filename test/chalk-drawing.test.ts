import { describe, expect, it } from 'vitest';
import { fingerprint, newGame } from '../src/sim/game.ts';
import { idx } from '../src/sim/grid.ts';
import { draw, type Ink } from '../src/ui/draw.ts';

type Stroke = { color: string; dash: number[]; path: [string, ...number[]][] };
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

function recordingContext() {
  const strokes: Stroke[] = [];
  let dash: number[] = [];
  let path: Stroke['path'] = [];
  const context = new Proxy(
    { strokeStyle: '', globalAlpha: 1 },
    {
      get(target, name) {
        if (name in target) return target[name as keyof typeof target];
        if (name === 'setLineDash') return (next: number[]) => (dash = [...next]);
        if (name === 'beginPath') return () => (path = []);
        if (name === 'stroke')
          return () => strokes.push({ color: target.strokeStyle, dash: [...dash], path: [...path] });
        if (name === 'measureText') return () => ({ width: 10 });
        return (...args: number[]) => path.push([String(name), ...args]);
      },
    },
  ) as unknown as CanvasRenderingContext2D;
  return { context, strokes, currentDash: () => dash };
}

describe('planned excavation drawing', () => {
  for (const preview of [false, true]) {
    it(`draws ${preview ? 'the chalk preview' : 'accepted chalk'} as an outlined dig cell and pick without changing the run`, () => {
      const s = newGame(7).s;
      const cell = idx(10, 15);
      s.hill.chalk.fill(0);
      if (!preview) s.hill.chalk[cell] = 1;
      const before = fingerprint(s);
      const { context, strokes, currentDash } = recordingContext();
      draw(context, s, { cs: 24, x: 10, y: 15, w: 24, h: 24 }, ink, {
        preview: new Set(preview ? [cell] : []),
        previewKind: preview ? 'chalk' : null,
        selected: null,
        t: s.minute,
      });
      const outline = strokes.filter((stroke) => stroke.color === ink.rope && stroke.dash.length > 0);
      expect(outline).toHaveLength(1);
      expect(outline[0]?.path).toEqual([['rect', 243.36, 363.36, 17.28, 17.28]]);
      const pick = strokes.find((stroke) => stroke.color === ink.rope && stroke.path[0]?.[0] === 'moveTo');
      expect(pick?.dash).toEqual([]);
      expect(pick?.path.map(([name]) => name)).toEqual(['moveTo', 'lineTo', 'moveTo', 'quadraticCurveTo']);
      expect(currentDash()).toEqual([]);
      expect(fingerprint(s)).toBe(before);
    });
  }
});
