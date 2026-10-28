import { type Browser, chromium, type Page } from 'playwright-core';
import { createServer, type ViteDevServer } from 'vite';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { localHill } from './local-hill.ts';

type Debug = typeof import('../src/ui/app.ts')['_debug'];
let server: ViteDevServer;
let browser: Browser;
let url: string;
beforeAll(async () => {
  server = await createServer({ server: { host: '127.0.0.1', port: 0, hmr: false, watch: null } });
  await server.listen();
  url = server.resolvedUrls?.local[0] ?? '';
  browser = await chromium.launch();
}, 60000);
afterAll(async () => {
  await browser?.close();
  await server?.close();
}, 60000);
async function start(width = 360, height = 690) {
  const page = await browser.newPage({
    viewport: { width, height },
    hasTouch: true,
    isMobile: width === 360,
  });
  page.setDefaultTimeout(5000);
  await page.clock.install();
  await page.goto(url);
  await localHill(page);
  await page.locator('.game').waitFor();
  await page.evaluate(() => document.fonts.ready);
  await page.clock.runFor(500);
  return page;
}
async function point(page: Page, x: number, y: number) {
  return page.evaluate(
    ({ x, y }) => {
      const v = (window as unknown as { __warren: Debug }).__warren.view;
      const b = document.querySelector('#cv')?.getBoundingClientRect();
      if (!b) throw new Error('Missing canvas');
      return { x: b.x + (x + 0.5 - v.x) * v.cs, y: b.y + (y + 0.5 - v.y) * v.cs };
    },
    { x, y },
  );
}
async function camera(page: Page) {
  return page.evaluate(() => {
    const b = document.querySelector('#cv')?.getBoundingClientRect();
    if (!b) throw new Error('Missing canvas');
    return {
      view: { ...(window as unknown as { __warren: Debug }).__warren.view },
      x: b.x,
      y: b.y,
      width: b.width,
      height: b.height,
    };
  });
}
for (const [width, height] of [
  [360, 690],
  [1280, 800],
]) {
  it(`holds the working view through tools, press and result at ${width}`, async () => {
    const page = await start(width, height);
    try {
      const before = await camera(page);
      await page.locator('[data-tool="chalk"]').click();
      await page.clock.runFor(500);
      expect(await camera(page)).toEqual(before);
      const p = await point(page, 20, 11);
      const inputsBefore = await page.evaluate(
        () => (window as unknown as { __warren: Debug }).__warren.game?.inputs.length,
      );
      await page.evaluate(() => {
        const cv = document.querySelector<HTMLCanvasElement>('#cv');
        const ctx = cv?.getContext('2d');
        if (!cv || !ctx) throw new Error('Missing canvas');
        const stroke = ctx.strokeRect.bind(ctx);
        ctx.strokeRect = (x, y, w, h) => {
          cv.dataset.targetStroke = JSON.stringify([x, y, w, h]);
          stroke(x, y, w, h);
        };
      });
      await page.mouse.move(p.x, p.y);
      await page.mouse.down();
      await page.clock.runFor(100);
      expect(await camera(page)).toEqual(before);
      expect(
        await page.evaluate(() => (window as unknown as { __warren: Debug }).__warren.game?.inputs.length),
      ).toBe(inputsBefore);
      const target = await page.locator('#cv').getAttribute('data-target-stroke');
      expect(target).toBe(
        JSON.stringify([
          20 * before.view.cs + 1,
          11 * before.view.cs + 1,
          before.view.cs - 2,
          before.view.cs - 2,
        ]),
      );
      await page.mouse.up();
      await page.clock.runFor(500);
      expect(await camera(page)).toEqual(before);
      expect(await page.locator('#cell-detail').isVisible()).toBe(false);
      expect(
        await page.evaluate(
          () => (window as unknown as { __warren: Debug }).__warren.game?.inputs.at(-1)?.verb,
        ),
      ).toBe('chalk');
    } finally {
      await page.close();
    }
  }, 20000);
}
it('asks before planning a new surface entrance; cancel and confirm leave exact orders', async () => {
  const page = await start();
  try {
    await page.locator('[data-tool="chalk"]').click();
    await page.clock.runFor(100);
    const p = await point(page, 19, 8);
    const count = () =>
      page.evaluate(() => (window as unknown as { __warren: Debug }).__warren.game?.inputs.length ?? 0);
    const before = await count();
    await page.touchscreen.tap(p.x, p.y);
    await page.clock.runFor(100);
    expect(await count()).toBe(before);
    expect(await page.locator('#cell-words').innerText()).toContain('new entrance');
    await page.locator('#cancel-entrance').click();
    expect(await count()).toBe(before);
    await page.touchscreen.tap(p.x, p.y);
    await page.locator('#confirm-entrance').click();
    expect(await count()).toBe(before + 1);
    expect(await page.locator('#confirm-entrance').isVisible()).toBe(false);
  } finally {
    await page.close();
  }
}, 20000);
it('updates sleeping capacity on the same input as the reading', async () => {
  const page = await start();
  try {
    await page.locator('#furnish').click();
    await page.locator('[data-tool="beds"]').click();
    await page.clock.runFor(100);
    const p = await point(page, 19, 11);
    await page.evaluate(({ x, y }) => {
      const cv = document.querySelector('#cv');
      if (!cv) throw new Error('Missing canvas');
      cv.dispatchEvent(
        new PointerEvent('pointerdown', { bubbles: true, pointerId: 1, clientX: x, clientY: y, button: 0 }),
      );
      cv.dispatchEvent(
        new PointerEvent('pointerup', { bubbles: true, pointerId: 1, clientX: x, clientY: y, button: 0 }),
      );
    }, p);
    expect(await page.locator('#cell-words').innerText()).toContain('three');
    expect(await page.locator('#shelter-check').getAttribute('aria-label')).toBe('The village');
    expect(await page.locator('#goal').innerText()).not.toContain('No sleeping places');
  } finally {
    await page.close();
  }
}, 20000);
it('shows a complete work sentence and opens the complete newest safety entry', async () => {
  const page = await start();
  try {
    await page.evaluate(() => {
      const s = (window as unknown as { __warren: Debug }).__warren.game?.s;
      if (!s) throw new Error('Missing game');
      s.notes.push({
        at: s.minute,
        kind: 'dig',
        who: 'hasan',
        cell: 223,
        weight: 2,
        text: 'The rolling stone stood in its groove. Hasan rolled it once to see.',
      });
      s.notes.push({
        at: s.minute,
        kind: 'dig',
        who: 'elif',
        cell: 222,
        weight: 2,
        text: 'Elif came up under the open sky. Air will come down this shaft now, and so could riders. A door below would close it.',
      });
      s.notes.push({ at: s.minute, kind: 'story', weight: 2, text: 'The barley is ripe again.' });
    });
    await page.clock.runFor(500);
    expect(await page.locator('#event-sentence').innerText()).toMatch(/Hasan|Elif/);
    await page.locator('#ticker').click();
    await page.clock.runFor(300);
    expect(await page.locator('#newest-safety').innerText()).toContain('A door below would close it.');
    const fit = await page.locator('#newest-safety').evaluate((el) => {
      const r = el.getBoundingClientRect();
      const b = document.querySelector('#sheet-body')?.getBoundingClientRect();
      if (!b) throw new Error('Missing sheet');
      return r.bottom <= b.bottom + 1 && r.bottom > b.top;
    });
    expect(fit).toBe(true);
    await page.locator('#bookx').click();
    await page.locator('#book').click();
    await page.locator('#sheet-body').evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    await page.locator('#bookx').click();
    await page.locator('#ticker').click();
    expect(await page.locator('#sheet-body').evaluate((el) => el.scrollTop)).toBe(0);
  } finally {
    await page.close();
  }
}, 20000);

it('keeps full mixed/open-door, bed and door readings accessible by scrolling above controls', async () => {
  const page = await start();
  try {
    await page.locator('[data-tool="chalk"]').click();
    await page.evaluate(`(async()=>{
      const {idx,K,SURF,USE}=await import('/src/sim/grid.ts');
      const s=window.__warren.game.s;
      s.hill.kind.fill(K.rock);s.hill.use.fill(USE.none);s.hill.chalk.fill(0);
      for(let y=SURF;y<=SURF+2;y++)s.hill.kind[idx(18,y)]=K.open;
      s.hill.use[idx(18,SURF+1)]=USE.door;s.hill.doorWork[idx(18,SURF+1)]=0;
      for(let y=SURF+4;y<=SURF+12;y++)s.hill.chalk[idx(18,y)]=1;
    })()`);
    const p = await point(page, 18, 11);
    await page.touchscreen.tap(p.x, p.y);
    await page.clock.runFor(200);
    expect(await page.locator('#cell-detail').isVisible()).toBe(false);
    await page.locator('#last-reading').click();
    expect(await page.locator('#cell-words').innerText()).toContain('Riders can reach');
    expect(await page.locator('#cell-words').innerText()).toContain('open stone door');
    const fits = () =>
      page.locator('#cell-words').evaluate((el) => {
        el.scrollIntoView({ block: 'end' });
        const range = document.createRange();
        range.selectNodeContents(el);
        const text = [...range.getClientRects()].at(-1)!;
        const body = document.querySelector('#inspection-body')?.getBoundingClientRect();
        return !!body && text.top >= body.top && text.bottom <= body.bottom + 1;
      });
    expect(await fits()).toBe(true);
    await page.evaluate(() => {
      const raid = (window as unknown as { __warren: Debug }).__warren.game?.s.raids[0];
      if (raid) raid.stage = 'smoke';
    });
    await page.clock.runFor(300);
    expect(await fits()).toBe(true);
    await page.locator('#watch-raid').click();
    await page.locator('[data-tool="look"]').click();
    await page.evaluate(`(async()=>{
      const {idx,K,SURF,USE}=await import('/src/sim/grid.ts');const s=window.__warren.game.s;
      s.hill.kind[idx(19,SURF+3)]=K.open;s.hill.use[idx(19,SURF+3)]=USE.beds;
      s.hill.kind[idx(18,SURF+3)]=K.open;s.hill.chalk.fill(0);
    })()`);
    const bed = await point(page, 19, 11);
    await page.touchscreen.tap(bed.x, bed.y);
    await page.clock.runFor(200);
    expect(await page.locator('#cell-title').innerText()).toBe('Sleeping room');
    expect(await fits()).toBe(true);
    await page.locator('#furnish').click();
    await page.locator('[data-tool="door"]').click();
    const door = await point(page, 18, 9);
    await page.touchscreen.tap(door.x, door.y);
    await page.clock.runFor(200);
    expect(await page.locator('#cell-title').innerText()).toBe('Stone door');
    expect(await fits()).toBe(true);
  } finally {
    await page.close();
  }
}, 20000);

it('cancels a pending entrance when a new scene gesture starts', async () => {
  const page = await start();
  try {
    await page.locator('[data-tool="chalk"]').click();
    await page.clock.runFor(100);
    const p = await point(page, 19, 8);
    await page.touchscreen.tap(p.x, p.y);
    expect(await page.locator('#confirm-entrance').isVisible()).toBe(true);
    const other = await point(page, 20, 7);
    await page.touchscreen.tap(other.x, other.y);
    expect(await page.locator('#confirm-entrance').isVisible()).toBe(false);
    expect(
      await page.evaluate(() => {
        const g = (window as unknown as { __warren: Debug }).__warren.game;
        return g?.s.hill.chalk[8 * 34 + 19];
      }),
    ).toBe(0);
  } finally {
    await page.close();
  }
}, 20000);

it('keeps mixed door conditions scrollable while marking and full route details on reopening', async () => {
  const page = await start();
  try {
    await page.evaluate(`(async()=>{
      const {idx,K,SURF,USE}=await import('/src/sim/grid.ts');
      const s=window.__warren.game.s,h=s.hill;
      h.kind.fill(K.rock);h.use.fill(USE.none);h.chalk.fill(0);h.shut.fill(0);h.doorWork.fill(0);
      for(const x of [18,22]) {
        for(let y=SURF;y<=SURF+1;y++)h.kind[idx(x,y)]=K.open;
        h.use[idx(x,SURF+1)]=USE.door;
        for(let y=SURF+2;y<=SURF+8;y++)h.chalk[idx(x,y)]=1;
      }
      h.shut[idx(22,SURF+1)]=1;h.chalk[idx(18,SURF+2)]=0;
      Object.assign(window.__warren.view,{cs:12,x:4,y:5});
    })()`);
    await page.locator('[data-tool="chalk"]').click();
    await page.clock.runFor(300);
    const a = await point(page, 18, 10),
      skyA = await point(page, 18, 7),
      skyB = await point(page, 22, 7),
      b = await point(page, 22, 10);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(skyA.x, skyA.y);
    await page.mouse.move(skyB.x, skyB.y);
    await page.mouse.move(b.x, b.y);
    await page.clock.runFor(100);
    expect(await page.locator('#cell-detail').isVisible()).toBe(false);
    expect(await page.locator('#event-sentence').innerText()).toContain(
      'Keep the doors that block riders shut.',
    );
    await page.mouse.up();
    await page.clock.runFor(100);
    await page.locator('#last-reading').click();
    expect(await page.locator('#reading-context summary').isVisible()).toBe(true);
    expect(await page.locator('#reading-context summary').getAttribute('aria-label')).toBe(
      'More about these routes',
    );
    expect(await page.locator('#cell-words').innerText()).toContain('Keep the doors that block riders shut.');
    const essentialFits = () =>
      page.locator('#cell-words').evaluate((el) => {
        el.scrollIntoView({ block: 'end' });
        const range = document.createRange();
        range.selectNodeContents(el);
        return (
          range.getBoundingClientRect().bottom <=
          (document.querySelector('#inspection-body')?.getBoundingClientRect().bottom ?? 0)
        );
      });
    expect(await essentialFits()).toBe(true);
    await page.locator('#cellx').click();
    await page.locator('#last-reading').click();
    await page.locator('#reading-context summary').click();
    expect(await page.locator('#door-context').innerText()).toContain(
      'Riders can come through the entrance.',
    );
    expect(await page.locator('#door-context').innerText()).toContain(
      'Keep the stone doors that block riders shut',
    );
  } finally {
    await page.close();
  }
}, 20000);

it('keeps the actual connection cell through repeated Look and compact receipt reopening without lending it to help', async () => {
  const page = await start();
  try {
    await page.locator('[data-tool="chalk"]').click();
    const p = await point(page, 20, 11);
    await page.touchscreen.tap(p.x, p.y);
    expect(await page.locator('#cell-detail').isVisible()).toBe(false);
    expect(await page.locator('#event-sentence').innerText()).toContain('square marked');
    const expected = await page.evaluate(`(async()=>{
      const {selectedPlan}=await import('/src/ui/selected-plan.ts');
      return selectedPlan(window.__warren.game.s, 11 * 34 + 20).words;
    })()`);
    const assertReopen = async () => {
      for (let n = 0; n < 3; n++) {
        await page.locator('#last-reading').click();
        expect(await page.locator('#connections').isVisible()).toBe(true);
        expect(await page.locator('#connections').getAttribute('aria-pressed')).toBe('false');
        await page.locator('#connections').click();
        expect(await page.locator('#connections').getAttribute('aria-pressed')).toBe('true');
        expect(await page.locator('#connection-words').isVisible()).toBe(true);
        expect(await page.locator('#connection-words').innerText()).toBe(expected);
        await page.locator('#cellx').click();
      }
    };
    await assertReopen();
    await page.locator('[data-tool="look"]').click();
    await page.touchscreen.tap(p.x, p.y);
    expect(await page.locator('#cell-title').innerText()).toBe('Unbuilt plan');
    await page.locator('#cellx').click();
    await assertReopen();
    // Open unrelated help while the connection reading is still selected.
    await page.locator('#last-reading').click();
    await page.locator('#goal').click();
    expect(await page.locator('#connections').isVisible()).toBe(false);
    await page.locator('#cellx').click();
    await page.locator('#last-reading').click();
    expect(await page.locator('#connections').isVisible()).toBe(false);
  } finally {
    await page.close();
  }
}, 20000);
