import { expect, it } from 'vitest';
import { idx, SURF } from '../src/sim/grid.ts';
import { draw, type Ink } from '../src/ui/draw.ts';
import { conditionFixture } from './condition-fixture.ts';

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
function render(change?: Parameters<typeof conditionFixture>[0]) {
  const { s, p } = conditionFixture(change);
  s.people = [p];
  s.trips[p.id] = {
    action: 'walk',
    cells: [idx(17, SURF - 1), idx(18, SURF - 1)],
    times: [s.minute, s.minute + 10],
    workFrom: s.minute + 10,
    end: s.minute + 20,
  };
  const paths: { method: string; args: number[]; colour: string; alpha: number }[] = [];
  const context = new Proxy(
    { fillStyle: '', strokeStyle: '', globalAlpha: 1 },
    {
      get(target, key) {
        if (key in target) return target[key as keyof typeof target];
        if (key === 'measureText') return () => ({ width: 10 });
        return (...args: number[]) =>
          paths.push({ method: String(key), args, colour: target.fillStyle, alpha: target.globalAlpha });
      },
    },
  ) as unknown as CanvasRenderingContext2D;
  const before = JSON.stringify(s);
  draw(context, s, { cs: 24, x: 0, y: 0, w: 1000, h: 1000 }, ink, {
    preview: new Set(),
    previewKind: null,
    selected: null,
    t: s.minute + 1,
  });
  expect(JSON.stringify(s)).toBe(before);
  // The person's head uniquely uses this radius; legs immediately precede it.
  const head = paths.findIndex(
    (p) => p.method === 'arc' && Math.abs((p.args[2] ?? Number.NaN) - 24 * 0.8 * 0.13) < 0.001,
  );
  expect(head).toBeGreaterThan(0);
  return {
    head: paths[head]?.args ?? [],
    legs: paths.slice(head - 8, head).filter((p) => p.method === 'moveTo' || p.method === 'lineTo'),
    marks: paths.filter(
      (p) =>
        p.method === 'arc' &&
        Math.abs((p.args[2] ?? Number.NaN) - 24 * 0.8 * 0.07) < 0.001 &&
        p.colour === ink.rope &&
        p.alpha === 0.8,
    ),
  };
}
it.each(['fatigue', 'sleepiness'])('draws %s as a leaning figure with a shorter walking stride', (trait) => {
  const fresh = render();
  const tired = render((b) => {
    if (trait === 'fatigue') b.exertion = 0.95;
    else {
      b.sleepPressure = 1;
      b.sleepDebtHours = 24;
    }
  });
  expect(tired.head[0]).toBeGreaterThan(fresh.head[0] ?? Number.NaN);
  const stride = (r: ReturnType<typeof render>) =>
    Math.abs((r.legs[0]?.args[0] ?? Number.NaN) - (r.legs[2]?.args[0] ?? Number.NaN));
  expect(stride(tired)).toBeLessThan(stride(fresh));
});
it('draws an HF injury as a shoulder mark without a condition counter', () => {
  expect(render().marks).toHaveLength(0);
  expect(
    render((b) => {
      b.injuries = [{ id: 'cut', part: 'arm', severity: 0.3, since: b.since, healRatePerDay: 0.1 }];
    }).marks,
  ).toHaveLength(1);
});
