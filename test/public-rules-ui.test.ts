/** Local synthetic App with an empty shelf protocol fixture. Real HF; no production requests. */
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
import { expect, it } from 'vitest';
import { act, advance, catchUp, load, newGame, replay, type Saved, save } from '../src/sim/game.ts';

it('Begin uses existing latest public rules at phone and wide sizes, with exact native continuation', async () => {
  const server = await createServer({ server: { host: '127.0.0.1', port: 0, hmr: false, watch: null } });
  const browser = await chromium.launch({ headless: true });
  try {
    await server.listen();
    const local = server.resolvedUrls!.local[0]!;
    for (const [width, height] of [
      [360, 690],
      [1280, 800],
    ]) {
      const page = await browser.newPage({ viewport: { width: width!, height: height! } });
      try {
        await page.route('**/*', async (r) => {
          const u = new URL(r.request().url());
          if (u.origin === 'https://warren.adamwhite.work') {
            const response = await r.fetch({ url: new URL(u.pathname + u.search, local).href });
            return r.fulfill({ response });
          }
          if (u.href === 'https://human.adamwhite.work/lab/identity/') {
            return r.fulfill({
              contentType: 'text/html',
              body: `<script>
              addEventListener('message', e => {
                const m=e.data; const consent=m.type==='hf-persona-consent';
                const value=consent?true:m.action==='prepareBatch'?{expectedHeads:Object.fromEntries(m.castIds.map(id=>[id,null])),inputs:[],blocked:[]}:{};
                e.ports[0].postMessage({id:m.id,type:consent?'hf-persona-consent-reply':'hf-persona-reply',value});
              });</script>`,
            });
          }
          return r.abort();
        });
        await page.clock.install();
        // Old query spellings cannot select gameplay rules.
        await page.goto(
          width === 360
            ? 'https://warren.adamwhite.work/?lab=0&runtime=legacy'
            : 'https://warren.adamwhite.work/',
        );
        expect(await page.locator('.title-actions input, .title-actions select').count()).toBe(0);
        await page.locator('#new').click();
        await page.waitForSelector('#cv');
        expect(await page.evaluate('window.__warren.game.s.edition')).toBe('0.7.0');
        expect(await page.evaluate('window.__warren.game.s.next.config')).toBe('warren-rest/1');
        expect(await page.evaluate('window.__warren.game.inputs')).toEqual([]);
        await page.locator('#shelter-check').click();
        await page.locator('[data-who="meryem"]').click();
        expect(await page.locator('#talk-rest').isVisible()).toBe(true);
        // A heard disagreement is a prerequisite, never manufactured by starting a hill.
        expect(await page.locator('#talk-disagreement').count()).toBe(0);
        await page.locator('#talk-rest').click();
        expect(await page.evaluate('window.__warren.game.inputs.at(-1).verb')).toBe('talk-rest');
        await page.locator('#cardx').click();
        await page.locator('#book').click();
        expect(await page.locator('.game-debug').getAttribute('open')).toBeNull();
        await page.locator('.game-debug > summary').click();
        const downloading = page.waitForEvent('download');
        await page.locator('#download-run').click();
        const full: Saved = JSON.parse(readFileSync((await (await downloading).path())!, 'utf8'));
        const nativeGuard = load(full);
        const beforeNative = JSON.stringify(save(nativeGuard));
        expect(act(nativeGuard, { verb: 'prepare-native-return', who: 'meryem' })).toBe(false);
        expect(JSON.stringify(save(nativeGuard))).toBe(beforeNative);
        const restored = load(full);
        const compact = replay(full.seed, full.inputs, full.minute, full.game, full.chapter, full.config);
        expect(JSON.stringify(save(restored))).toBe(JSON.stringify(save(compact)));
        for (const g of [restored, compact]) advance(g, full.minute + 1440);
        expect(JSON.stringify(save(restored))).toBe(JSON.stringify(save(compact)));
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
        await page.locator('#to-title').click();
        expect(await page.locator('#menu-new-confirm input, #menu-new-confirm select').count()).toBe(0);
      } finally {
        await page.close();
      }
    }
  } finally {
    await browser.close();
    await server.close();
  }
}, 60000);

it('retains old rules on Resume and preserves an unsupported saved hill through confirmation and failed admission', async () => {
  const server = await createServer({ server: { host: '127.0.0.1', port: 0, hmr: false, watch: null } });
  const browser = await chromium.launch({ headless: true });
  try {
    await server.listen();
    const url = server.resolvedUrls!.local[0]!;
    const page = await browser.newPage();
    await page.route('**/*', (r) => (r.request().url().startsWith(url) ? r.continue() : r.abort()));
    await page.clock.install();
    await page.goto(url);
    for (const config of [undefined, 'warren-next/1'] as const) {
      await page.goto(url);
      const original = newGame(7, config ? '0.7.0' : '0.6.0', undefined, config);
      const raw = JSON.stringify(save(original));
      catchUp(original, 0);
      const expected = JSON.stringify(save(original));
      await page.evaluate(
        `(async()=>{const {put}=await import('/src/ui/store.ts');await put('hill',{...${raw},savedAt:Date.now()+86400000});})()`,
      );
      await page.reload();
      await page.locator('#cont').click();
      const actual = await page.evaluate<string>(
        `(async()=>{const {save}=await import('/src/sim/game.ts');return JSON.stringify(save(window.__warren.game));})()`,
      );
      expect(actual).toBe(expected);
      expect(await page.locator('#talk-rest').count()).toBe(0);
    }
    await page.goto(url);
    const unsupported = { ...save(newGame(7)), framework: 'unsupported-test-version' };
    await page.evaluate(
      `(async()=>{const {put}=await import('/src/ui/store.ts');await put('hill',${JSON.stringify(unsupported)});})()`,
    );
    await page.reload();
    expect(await page.locator('.title-actions').count()).toBe(1);
    expect(await page.locator('.page').textContent()).toContain('cannot be loaded');
    expect(await page.locator('#cont').count()).toBe(0);
    await page.locator('#new').click();
    expect(await page.locator('#new-confirm').isVisible()).toBe(true);
    expect(await page.locator('#cv').count()).toBe(0);
    await page.locator('#new-no').click();
    await page.locator('#new').click();
    await page.locator('#new-yes').click();
    await expect.poll(() => page.locator('#start-error').innerText()).toContain('could not be started');
    expect(
      await page.evaluate(
        `(async()=>{const {get}=await import('/src/ui/store.ts');return (await get('hill')).value;})()`,
      ),
    ).toEqual(unsupported);
    await page.close();
  } finally {
    await browser.close();
    await server.close();
  }
}, 30000);
