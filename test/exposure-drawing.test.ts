import { describe, expect, it } from 'vitest';
import { HOUR } from '../src/sim/calendar.ts';
import { newGame } from '../src/sim/game.ts';
import { idx, K, SURF, USE } from '../src/sim/grid.ts';
import { draw, type Ink } from '../src/ui/draw.ts';

const themes: Ink[] = [
  {
    paper: '#fffaf0',
    paper2: '#eee4d1',
    ink: '#30281e',
    soft: '#887e70',
    rope: '#a42',
    moss: '#474',
    sky: '#48a',
    dark: false,
  },
  {
    paper: '#1e1b16',
    paper2: '#28241e',
    ink: '#e8dfcd',
    soft: '#ac9e87',
    rope: '#c96',
    moss: '#797',
    sky: '#8ad',
    dark: true,
  },
];
const cs = 17;
type Fill = { args: number[]; colour: string; alpha: number };
type Stroke = { colour: string; points: number[][]; lines: number[][]; alpha: number; width: number };
function render(s: ReturnType<typeof newGame>['s'], ink: Ink) {
  const fills: Fill[] = [];
  const strokes: Stroke[] = [];
  const filledEllipses: Fill[] = [];
  let ellipses: number[][] = [];
  let points: number[][] = [];
  let lines: number[][] = [];
  const properties = { fillStyle: '', strokeStyle: '', globalAlpha: 1, lineWidth: 1 };
  const stack: (typeof properties)[] = [];
  const context = new Proxy(properties, {
    get(target, key) {
      if (key in target) return target[key as keyof typeof target];
      if (key === 'save') return () => stack.push({ ...target });
      if (key === 'restore') return () => Object.assign(target, stack.pop());
      if (key === 'fillRect')
        return (...args: number[]) =>
          fills.push({ args, colour: target.fillStyle, alpha: target.globalAlpha });
      if (key === 'beginPath')
        return () => {
          points = [];
          lines = [];
          ellipses = [];
        };
      if (['moveTo', 'lineTo', 'quadraticCurveTo', 'bezierCurveTo'].includes(String(key)))
        return (...args: number[]) => {
          if (key === 'lineTo') lines.push([...(points.at(-1) ?? []), ...args]);
          points.push(args.slice(-2));
        };
      if (key === 'ellipse') return (...args: number[]) => ellipses.push(args);
      if (key === 'fill')
        return () => {
          for (const args of ellipses)
            filledEllipses.push({ args, colour: target.fillStyle, alpha: target.globalAlpha });
        };
      if (key === 'stroke')
        return () =>
          strokes.push({
            colour: target.strokeStyle,
            points: [...points],
            lines: [...lines],
            alpha: target.globalAlpha,
            width: target.lineWidth,
          });
      if (key === 'measureText') return () => ({ width: 10 });
      return () => {};
    },
  }) as unknown as CanvasRenderingContext2D;
  draw(context, s, { cs, x: 0, y: 0, w: 1000, h: 1000 }, ink, {
    preview: new Set(),
    previewKind: null,
    selected: null,
    t: s.minute,
  });
  const cellFills = (x: number, y: number) =>
    fills.filter(({ args }) => args[0] === x * cs && args[1] === y * cs && args[2] === cs && args[3] === cs);
  return {
    cellFills,
    floorTracks(x: number, y: number) {
      return filledEllipses.filter(
        ({ args: [px = 0, py = 0, rx = 0, ry = 0], colour, alpha }) =>
          px > x * cs &&
          px < (x + 1) * cs &&
          py > (y + 0.7) * cs &&
          py < (y + 1) * cs &&
          rx > 0 &&
          rx <= cs * 0.1 &&
          ry > rx &&
          ry <= cs * 0.1 &&
          colour === ink.soft &&
          alpha > 0,
      );
    },
    brightness(x: number, y: number) {
      let rgb = [0, 0, 0];
      for (const fill of cellFills(x, y)) {
        const hex = fill.colour.slice(1);
        const expanded = hex.length === 3 ? [...hex].map((c) => c + c).join('') : hex;
        const source = [0, 2, 4].map((at) => Number.parseInt(expanded.slice(at, at + 2), 16));
        rgb = rgb.map((channel, at) => channel * (1 - fill.alpha) + (source[at] ?? 0) * fill.alpha);
      }
      return rgb.reduce((sum, n) => sum + n, 0) / 3;
    },
    bedInk(x: number, y: number) {
      return strokes.find(
        ({ points }) =>
          points.length === 6 &&
          points.every(
            ([px, py]) =>
              (px ?? 0) > x * cs &&
              (px ?? 0) < (x + 1) * cs &&
              (py ?? 0) > (y + 0.7) * cs &&
              (py ?? 0) < (y + 1) * cs,
          ),
      )?.colour;
    },
    flowing(x: number, y: number) {
      return strokes.filter(
        ({ points, lines, alpha, width }) =>
          alpha >= 0.35 &&
          width >= 1 &&
          points.length >= 2 &&
          points.every(
            ([px, py]) =>
              (px ?? 0) > x * cs &&
              (px ?? 0) < (x + 1) * cs &&
              (py ?? 0) > y * cs &&
              (py ?? 0) < (y + 1) * cs,
          ) &&
          lines.some(([start, , end]) => Math.abs((end ?? 0) - (start ?? 0)) >= cs * 0.65),
      );
    },
  };
}
function layout() {
  const s = newGame(7).s;
  s.minute = 12 * HOUR;
  s.hill.kind.fill(K.rock);
  s.hill.use.fill(0);
  s.hill.lamp.fill(0);
  for (let y = SURF; y <= SURF + 12; y++) s.hill.kind[idx(8, y)] = K.open;
  s.hill.kind[idx(9, SURF + 3)] = K.open;
  for (let y = SURF; y <= SURF + 3; y++) s.hill.kind[idx(16, y)] = K.open;
  s.hill.kind[idx(19, SURF + 4)] = K.open;
  s.version++;
  return s;
}
for (const ink of themes)
  describe(`daylight and draught in the ${ink.dark ? 'dark' : 'light'} theme`, () => {
    it('makes the entrance pale, fades by route depth and keeps protected rooms darker', () => {
      const s = layout();
      const plan = render(s, ink);
      expect(plan.brightness(8, SURF)).toBeGreaterThan(plan.brightness(8, SURF + 5) + 8);
      expect(plan.brightness(8, SURF + 5)).toBeGreaterThan(plan.brightness(8, SURF + 9) + 5);
      expect(plan.brightness(8, SURF + 9)).toBeGreaterThan(plan.brightness(8, SURF + 12) + 8);
      expect(plan.brightness(8, SURF)).toBeGreaterThan(190);
    });
    it('places phone-sized flowing texture on exactly the reached routes, including a separate shaft', () => {
      const plan = render(layout(), ink);
      expect(plan.flowing(8, SURF).length).toBeGreaterThan(0);
      expect(plan.flowing(8, SURF + 9).length).toBeGreaterThan(0);
      expect(plan.flowing(9, SURF + 3).length).toBeGreaterThan(0);
      expect(plan.flowing(16, SURF + 3).length).toBeGreaterThan(0);
      expect(plan.flowing(8, SURF + 10)).toHaveLength(0);
      expect(plan.flowing(19, SURF + 4)).toHaveLength(0);
    });
    it('keeps bed marks dark against pale routes through the deepest reached cell', () => {
      const s = layout();
      for (const depth of [0, 9, 12]) s.hill.use[idx(8, SURF + depth)] = USE.beds;
      const plan = render(s, ink);
      for (const depth of [0, 9]) {
        const colour = plan.bedInk(8, SURF + depth);
        expect(colour).toBeDefined();
        const hex = colour?.slice(1) ?? '';
        const markBrightness =
          [0, 2, 4].reduce((sum, at) => sum + Number.parseInt(hex.slice(at, at + 2), 16), 0) / 3;
        expect(plan.brightness(8, SURF + depth) - markBrightness).toBeGreaterThan(90);
      }
      expect(plan.bedInk(8, SURF + 12)).toBe(ink.ink);
    });
    it('stops the wash and flowing texture at a shut door; history stays only as small tracks', () => {
      const s = layout();
      const door = idx(8, SURF + 2);
      s.hill.use[door] = USE.door;
      s.hill.shut[door] = 1;
      s.version++;
      const unscouted = render(s, ink);
      const raid = s.raids[0];
      if (!raid) throw new Error('No raid');
      raid.scouted = [idx(8, SURF + 5)];
      const before = JSON.stringify(s);
      const scouted = render(s, ink);
      expect(unscouted.floorTracks(8, SURF + 5)).toHaveLength(0);
      expect(scouted.floorTracks(8, SURF + 5)).toHaveLength(2);
      expect(scouted.cellFills(8, SURF + 5)).toEqual(unscouted.cellFills(8, SURF + 5));
      expect(scouted.flowing(8, SURF + 2)).toHaveLength(0);
      expect(scouted.flowing(8, SURF + 5)).toHaveLength(0);
      expect(scouted.flowing(16, SURF + 3).length).toBeGreaterThan(0);
      expect(JSON.stringify(s)).toBe(before);
    });
  });
