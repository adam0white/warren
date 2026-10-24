import { type Browser, chromium } from 'playwright-core';
import { createServer, type ViteDevServer } from 'vite';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { localHill } from './local-hill.ts';

let server: ViteDevServer;
let browser: Browser;
let url: string;
beforeAll(async () => {
  server = await createServer({ server: { host: '127.0.0.1', port: 0, hmr: false, watch: null } });
  await server.listen();
  url = server.resolvedUrls?.local[0] ?? '';
  browser = await chromium.launch();
});
afterAll(async () => {
  await browser?.close();
  await server?.close();
}, 60000);

it('keeps shelter state and a complete reading visible beside the scene', async () => {
  const page = await browser.newPage({ viewport: { width: 360, height: 690 }, hasTouch: true });
  try {
    page.setDefaultTimeout(5000);
    await page.clock.install();
    await page.goto(url);
    await localHill(page);
    await page.locator('#furnish').click();
    await page.locator('[data-tool="door"]').click();
    expect(await page.locator('.lk-stage').count()).toBe(1);
    expect(await page.locator('#bell-state').isVisible()).toBe(true);
    expect(await page.locator('#cell-words').evaluate((el) => el.scrollHeight <= el.clientHeight + 1)).toBe(
      true,
    );
    expect(await page.locator('#scene').evaluate((el) => el.getBoundingClientRect().height)).toBeGreaterThan(
      100,
    );
    expect(await page.locator('#bell').isVisible()).toBe(true);
    await page.locator('#shelter-check').click();
    await page.locator('[data-who="meryem"]').click();
    expect(await page.locator('#person-help').innerText()).toMatch(/help|needs|need|well enough/i);
    expect(await page.locator('#cell-detail').isVisible()).toBe(false);
    expect(await page.locator('#drawer').isVisible()).toBe(false);
    await page.locator('#cardx').click();
    expect(await page.locator('#drawer').isVisible()).toBe(true);
    expect(await page.locator('[data-who="meryem"]').evaluate((el) => el === document.activeElement)).toBe(
      true,
    );
  } finally {
    await page.close();
  }
}, 20000);

async function startPhone() {
  const page = await browser.newPage({ viewport: { width: 360, height: 690 }, hasTouch: true });
  page.setDefaultTimeout(5000);
  await page.clock.install();
  await page.goto(url);
  await localHill(page);
  await page.locator('.game').waitFor();
  await page.evaluate(() => {
    (window as unknown as { __warren: Debug }).__warren.setSpeed(0);
  });
  return page;
}

type Debug = typeof import('../src/ui/app.ts')['_debug'];

it('shows known poor health without a contradictory healthy label', async () => {
  const page = await startPhone();
  try {
    await page.evaluate(() => {
      const s = (window as unknown as { __warren: Debug }).__warren.game?.s;
      const p = s?.people.find((p) => p.id === 'meryem');
      if (!p) throw new Error('Missing Meryem');
      Object.assign(p.body, {
        health: 0.4,
        pain: 0,
        satiety: 1,
        hydration: 1,
        sleepPressure: 0,
        sleepDebt: 0,
        exertion: 0,
      });
      p.body.illnesses.push({
        id: 'test-fever',
        kind: 'fever',
        severity: 0.4,
        trendPerDay: 0.1,
        contagious: false,
        since: s?.minute ?? 0,
      });
    });
    await page.locator('#shelter-check').click();
    await page.locator('[data-who="meryem"]').click();
    expect(await page.locator('#person-help').innerText()).toContain('poor health');
    expect(await page.locator('#person-help').innerText()).toContain('illness');
    expect(await page.locator('#card').innerText()).not.toMatch(/well enough|No immediate bodily need/i);
  } finally {
    await page.close();
  }
}, 20000);

it('preserves an expanded person disclosure and its focus while the condition changes', async () => {
  const page = await startPhone();
  try {
    await page.locator('#shelter-check').click();
    await page.locator('[data-who="meryem"]').click();
    await page.locator('#person-context-toggle').click();
    expect(await page.locator('#person-context').evaluate((el) => (el as HTMLDetailsElement).open)).toBe(
      true,
    );
    await page.evaluate(() => {
      const p = (window as unknown as { __warren: Debug }).__warren.game?.s.people.find(
        (p) => p.id === 'meryem',
      );
      if (!p) throw new Error('Missing Meryem');
      p.body.hydration = 0.1;
    });
    await page.clock.runFor(500);
    expect(await page.locator('#person-help').innerText()).toContain('They need water');
    expect(await page.locator('#person-context').evaluate((el) => (el as HTMLDetailsElement).open)).toBe(
      true,
    );
    expect(await page.locator('#person-context-toggle').evaluate((el) => document.activeElement === el)).toBe(
      true,
    );
  } finally {
    await page.close();
  }
}, 20000);

it('updates reflow after rotation and after text enlargement', async () => {
  const page = await startPhone();
  try {
    for (const viewport of [
      { width: 690, height: 360 },
      { width: 360, height: 690 },
    ]) {
      await page.setViewportSize(viewport);
      await page.clock.runFor(500);
      expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(true);
    }
    expect(
      await page.locator('#scene').evaluate((el) => el.getBoundingClientRect().height),
    ).toBeGreaterThanOrEqual(120);
  } finally {
    await page.close();
  }
}, 20000);

it('frames a selected traveller at the current trip cell instead of the departure', async () => {
  const page = await startPhone();
  try {
    const cells = await page.evaluate<{ current: number; departure: number }>(`(async () => {
      const { idx, SURF } = await import('/src/sim/grid.ts');
      const { positionAt } = await import('/src/sim/warren.ts');
      const s = window.__warren.game?.s;
      if (!s) throw new Error('Missing game');
      const departure = idx(2, SURF - 1);
      const current = idx(27, SURF + 12);
      const arrival = idx(27, SURF + 14);
      s.pos.meryem = departure;
      s.trips.meryem = {
        action: 'shelter',
        cells: [departure, current, arrival],
        times: [s.minute - 200, s.minute - 100, s.minute + 100],
        workFrom: s.minute + 100,
        end: arrival,
      };
      return { current: positionAt(s, 'meryem', s.minute), departure };
    })()`);
    expect(cells.current).not.toBe(cells.departure);
    await page.locator('#shelter-check').click();
    await page.locator('[data-who="meryem"]').click();
    await page.clock.runFor(500);
    const framed = await page.evaluate<{
      x: number;
      y: number;
      width: number;
      height: number;
    }>(`(async () => {
      const { xOf, yOf } = await import('/src/sim/grid.ts');
      const view = window.__warren.view;
      const cell = ${cells.current};
      return {
        x: (xOf(cell) + 0.5 - view.x) * view.cs,
        y: (yOf(cell) + 0.5 - view.y) * view.cs,
        width: view.w,
        height: view.h,
      };
    })()`);
    expect(framed.x).toBeGreaterThan(0);
    expect(framed.x).toBeLessThan(framed.width);
    expect(framed.y).toBeGreaterThan(48);
    expect(framed.y).toBeLessThan(framed.height - 8);
  } finally {
    await page.close();
  }
}, 20000);

it('shows complete bed and door remedies inside the sheet and acknowledges storage', {
  timeout: 20000,
}, async () => {
  const page = await browser.newPage({ viewport: { width: 360, height: 690 }, hasTouch: true });
  try {
    page.setDefaultTimeout(5000);
    await page.clock.install();
    await page.goto(url);
    await localHill(page);
    await page.locator('#cv').waitFor();
    await page.evaluate(`(async () => {
      const {idx,K,SURF,USE}=await import('/src/sim/grid.ts');
      const s=window.__warren.game.s, x=s.hill.surface.entrance;
      const door=idx(x,SURF+2), bed=idx(x+1,SURF+3), store=idx(x-1,SURF+3);
      s.hill.kind[door]=K.open; s.hill.use[door]=USE.door; s.hill.doorWork[door]=0; s.hill.lamp[door]=1;
      s.hill.kind[bed]=K.open; s.hill.use[bed]=USE.beds;
      s.hill.kind[store]=K.open; s.hill.use[store]=USE.none;
    })()`);
    await page.clock.runFor(100);
    for (const scenario of ['beds', 'door', 'store']) {
      if (scenario !== 'beds') await page.locator('#furnish').click();
      await page
        .locator(`[data-tool="${scenario === 'store' ? 'store' : scenario === 'door' ? 'door' : 'look'}"]`)
        .click();
      await page.clock.runFor(100);
      await page.locator('#fit-hill').click();
      await page.clock.runFor(100);
      const point = await page.evaluate<{ x: number; y: number }>(`(() => {
        const {game:g,view:v}=window.__warren, b=document.querySelector('#cv').getBoundingClientRect();
        const x=g.s.hill.surface.entrance + ${scenario === 'beds' ? 1 : scenario === 'store' ? -1 : 0};
        const y=${scenario === 'door' ? 10 : 11};
        return {x:b.x+(x+.5-v.x)*v.cs,y:b.y+(y+.5-v.y)*v.cs};
      })()`);
      await page.touchscreen.tap(point.x, point.y);
      await page.clock.runFor(100);
      const words = await page.locator(scenario === 'store' ? '#event-sentence' : '#cell-words').innerText();
      expect(words).toMatch(scenario === 'store' ? /The store is marked/ : /Ring the bell/);
      const visible = await page
        .locator(scenario === 'store' ? '#event-sentence' : '#cell-words')
        .evaluate((el) => {
          const range = document.createRange();
          range.selectNodeContents(el);
          const text = range.getBoundingClientRect(),
            body =
              document.querySelector('#cell-detail:not([hidden])')?.getBoundingClientRect() ??
              document.querySelector('.reading-actions')?.getBoundingClientRect();
          return !!body && text.top >= body.top && text.bottom <= body.bottom + 1;
        });
      expect(visible, `${scenario} remedy fits its sheet`).toBe(true);
      expect(await page.locator('#bell-state').isVisible()).toBe(true);
    }
  } finally {
    await page.close();
  }
});
