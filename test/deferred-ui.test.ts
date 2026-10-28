import { type Browser, webkit } from 'playwright-core';
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
  browser = await webkit.launch();
});
afterAll(async () => {
  await browser?.close();
  await server?.close();
});
it('keeps Tab and Shift+Tab within the Game menu and returns Escape to its opener', async () => {
  const page = await browser.newPage({ viewport: { width: 360, height: 690 } });
  try {
    await page.clock.install();
    await page.goto(url);
    await localHill(page);
    await page.locator('#book').click();
    for (const key of ['Shift+Tab', ...Array.from({ length: 14 }, () => 'Tab')]) {
      await page.keyboard.press(key);
      expect(await page.locator('#drawer').evaluate((el) => el.contains(document.activeElement))).toBe(true);
    }
    await page.keyboard.press('Escape');
    expect(await page.locator('#drawer').isVisible()).toBe(false);
    expect(await page.locator('#book').evaluate((el) => el === document.activeElement)).toBe(true);
  } finally {
    await page.close();
  }
});
for (const [width, height] of [
  [320, 568],
  [690, 360],
  [360, 690],
  [1280, 800],
]) {
  it(`keeps the working map separate from a complete safety reading at ${width}x${height}`, async () => {
    const page = await browser.newPage({ viewport: { width: width!, height: height! } });
    try {
      await page.clock.install();
      await page.goto(url);
      await localHill(page);
      await page.locator('#furnish').click();
      await page.locator('[data-tool="door"]').click();
      await page.locator('#last-reading').click();
      await page.clock.runFor(400);
      const map = await page.locator('#cv').boundingBox();
      const reading = await page.locator('#inspection-body').boundingBox();
      expect(map!.height).toBeGreaterThanOrEqual(120);
      expect(reading).not.toBeNull();
      expect(map!.x + map!.width <= reading!.x + 1 || map!.y + map!.height <= reading!.y + 1).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
      await page.locator('#cellx').scrollIntoViewIfNeeded();
      await page.locator('#cellx').click();
      await page.locator('#bell').scrollIntoViewIfNeeded();
      expect(await page.locator('#bell').isVisible()).toBe(true);
    } finally {
      await page.close();
    }
  }, 20000);
}
it('resumes an opted hill with slowed readings and a paused menu, without changing its edition', async () => {
  const page = await browser.newPage({ viewport: { width: 360, height: 690 } });
  try {
    await page.clock.install();
    await page.goto(url);
    await page.evaluate(
      `(async()=>{const {newGame,save}=await import('/src/sim/game.ts');const {put}=await import('/src/ui/store.ts');await put('hill',save(newGame(7,'0.7.0')));})()`,
    );
    await page.reload();
    await page.locator('#cont').click();
    await page.locator('#last-reading').click();
    const minute = () => page.evaluate<number>('window.__warren.game.s.minute');
    const before = await minute();
    await page.clock.runFor(4000);
    expect(await minute()).toBeGreaterThan(before);
    await page.locator('#cellx').click();
    await page.locator('#book').click();
    const held = await minute();
    await page.clock.runFor(4000);
    expect(await minute()).toBe(held);
    expect(await page.evaluate('window.__warren.game.s.edition')).toBe('0.7.0');
    await page.locator('#bookx').click();
    await page.locator('#furnish').click();
    await page.locator('[data-tool="store"]').click();
    // This is a controlled local fixture, entered through the supported save path.
    const point = await page.evaluate<{ x: number; y: number; cell: number }>(`(async()=>{
      const {K,USE,W,SURF}=await import('/src/sim/grid.ts');
      const {view,game}=window.__warren;
      for(let cell=0;cell<game.s.hill.kind.length;cell++) {
        const x=(cell%W-view.x+.5)*view.cs,y=(Math.floor(cell/W)-view.y+.5)*view.cs;
        if(game.s.hill.kind[cell]===K.open && game.s.hill.use[cell]===USE.none && Math.floor(cell/W)>=SURF && x>10 && x<view.w-50 && y>60 && y<view.h-10) return {x,y,cell};
      } throw Error('No visible open ground');
    })()`);
    await page.locator('#cv').click({ position: { x: point.x, y: point.y } });
    expect(await page.locator('#event-sentence').innerText()).toContain('store');
    expect(
      await page.evaluate(
        `window.__warren.game.inputs.some(i=>i.verb==='use' && i.use==='store' && i.cells.includes(${point.cell}))`,
      ),
    ).toBe(true);
  } finally {
    await page.close();
  }
}, 20000);
it('refuses failed new-hill admission without gameplay flags or a local cast opt-out', async () => {
  const page = await browser.newPage({ viewport: { width: 360, height: 690 } });
  try {
    await page.clock.install();
    await page.goto(url);
    await page.locator('#book').click();
    await page.keyboard.press('Escape');
    expect(await page.locator('#title-drawer').isVisible()).toBe(false);
    await page.locator('#book').click();
    await page.locator('#to-title').click();
    expect(await page.locator('#menu-new-confirm input, #menu-new-confirm select').count()).toBe(0);
    expect(await page.locator('#continuity, #local-fresh').count()).toBe(0);
    await page.locator('#menu-new-yes').click();
    await expect.poll(() => page.locator('#start-error').innerText()).toContain('could not be started');
    expect(await page.locator('#menu-new-yes').isVisible()).toBe(true);
  } finally {
    await page.close();
  }
}, 20000);
it('lets a short portrait title scroll to the new-hill confirmation', async () => {
  const page = await browser.newPage({ viewport: { width: 320, height: 568 } });
  try {
    await page.clock.install();
    await page.goto(url);
    await page.evaluate(
      `(async()=>{const {newGame,save}=await import('/src/sim/game.ts');const {put}=await import('/src/ui/store.ts');await put('hill',save(newGame(7)));})()`,
    );
    await page.reload();
    await page.locator('#new').click();
    await page.mouse.move(200, 450);
    await page.mouse.wheel(0, 700);
    await page.clock.runFor(300);
    const box = await page.locator('#new-yes').boundingBox();
    expect(box!.y + box!.height).toBeLessThanOrEqual(568);
  } finally {
    await page.close();
  }
}, 20000);
it('slows Journal, growth and village-opened person readings, while the Game menu pauses', async () => {
  const page = await browser.newPage({ viewport: { width: 360, height: 690 } });
  try {
    await page.clock.install();
    await page.goto(url);
    await page.evaluate(
      `(async()=>{const {newGame,save}=await import('/src/sim/game.ts');const {put}=await import('/src/ui/store.ts');await put('hill',save(newGame(7,'0.7.0')));})()`,
    );
    await page.reload();
    await page.locator('#cont').click();
    const minute = () => page.evaluate<number>('window.__warren.game.s.minute');
    await page.locator('#ticker').click();
    let before = await minute();
    await page.clock.runFor(3000);
    expect(await minute()).toBeGreaterThan(before);
    await page.locator('[data-open="d"]').click();
    before = await minute();
    await page.clock.runFor(3000);
    expect(await minute()).toBeGreaterThan(before);
    await page.locator('#bookx').click();
    await page.locator('#shelter-check').click();
    await page.locator('[data-who="meryem"]').click();
    before = await minute();
    await page.clock.runFor(3000);
    expect(await minute()).toBeGreaterThan(before);
    await page.locator('#cardx').click();
    await page.locator('#bookx').click();
    await page.locator('#book').click();
    before = await minute();
    await page.clock.runFor(3000);
    expect(await minute()).toBe(before);
  } finally {
    await page.close();
  }
}, 20000);
