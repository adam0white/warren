import { type Browser, webkit } from 'playwright-core';
import { createServer, type ViteDevServer } from 'vite';
import { afterAll, beforeAll, expect, it } from 'vitest';

let server: ViteDevServer;
let browser: Browser;
let url: string;
beforeAll(async () => {
  server = await createServer({ server: { host: '127.0.0.1', port: 0, hmr: false, watch: null } });
  await server.listen();
  url = server.resolvedUrls!.local[0]!;
  browser = await webkit.launch();
});
afterAll(async () => {
  await browser?.close();
  await server?.close();
});
for (const [width, height] of [
  [360, 690],
  [1280, 800],
]) {
  it(`shows an opt-in return record and keeps it waiting until closed at ${width}x${height}`, async () => {
    const page = await browser.newPage({ viewport: { width: width!, height: height! } });
    try {
      await page.route('**/*', (route) =>
        route.request().url().startsWith(url) ? route.continue() : route.abort(),
      );
      await page.clock.install();
      await page.goto(`${url}?lab=1`);
      expect(await page.locator('#next-edition').isChecked()).toBe(false);
      await page.evaluate(`(async()=>{
        const {newGame,save,catchUp}=await import('/src/sim/game.ts');
        const {put}=await import('/src/ui/store.ts');
        const g = newGame(7,'0.7.0',undefined,'warren-next/1');
        catchUp(g,86400000,()=>false);
        await put('hill', {...save(g),savedAt:Date.now()-86400000});
      })()`);
      await page.reload();
      await page.locator('#cont').click();
      expect(await page.locator('#cell-title').textContent()).toBe('While you were away');
      expect(await page.locator('#cell-words').textContent()).toContain('remain unplayed');
      const minute = await page.evaluate<number>('window.__warren.game.s.minute');
      await page.clock.fastForward(15000);
      expect(await page.evaluate('window.__warren.game.s.minute')).toBe(minute);
      expect(await page.evaluate('window.__warren.game.s.next.attention.length')).toBeGreaterThan(0);
      await page.locator('#cellx').click();
      expect(await page.evaluate('window.__warren.game.s.next.attention')).toBeUndefined();
      expect(
        await page.evaluate(
          `(async()=>{const{save,replay,fingerprint}=await import('/src/sim/game.ts'); const s=save(window.__warren.game); return fingerprint(replay(s.seed,s.inputs,s.minute,s.game,s.chapter,s.config).s)===s.fingerprint})()`,
        ),
      ).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    } finally {
      await page.close();
    }
  });
}

it('keeps ordinary next-config journal reading slow through an actual new note', async () => {
  const page = await browser.newPage();
  try {
    await page.route('**/*', (route) =>
      route.request().url().startsWith(url) ? route.continue() : route.abort(),
    );
    await page.clock.install();
    await page.goto(`${url}?lab=1`);
    await page.evaluate(`(async()=>{
      const {newGame,save}=await import('/src/sim/game.ts');
      const {put}=await import('/src/ui/store.ts');
      await put('hill',save(newGame(7,'0.7.0',undefined,'warren-next/1')));
    })()`);
    await page.reload();
    await page.locator('#cont').click();
    await page.locator('#cellx').click();
    await page.locator('#ticker').click();
    await page.clock.runFor(7000);
    const before = await page.evaluate<number>('window.__warren.game.s.minute');
    const note = await page.evaluate(`(async()=>{
      const {displayWords}=await import('/src/ui/words.ts');
      return displayWords(window.__warren.game.s.notes.at(-1).text);
    })()`);
    expect(before).toBeGreaterThanOrEqual(420);
    expect(await page.evaluate('window.__warren.game.s.next.attention.length')).toBeGreaterThan(0);
    await page.clock.runFor(4000);
    expect(await page.locator('#journal-tail').textContent()).toContain(note);
    const after = await page.evaluate<number>('window.__warren.game.s.minute');
    expect(after).toBeGreaterThan(Number(before));
    expect(after - Number(before)).toBeLessThanOrEqual(90);
  } finally {
    await page.close();
  }
});
