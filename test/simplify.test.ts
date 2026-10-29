import { type Browser, chromium, webkit } from 'playwright-core';
import { createServer, type ViteDevServer } from 'vite';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { activityWords, displayWords, speechWords } from '../src/ui/words.ts';
import { localHill } from './local-hill.ts';

let server: ViteDevServer;
let url: string;
beforeAll(async () => {
  server = await createServer({ server: { host: '127.0.0.1', port: 0, hmr: false, watch: null } });
  await server.listen();
  url = server.resolvedUrls?.local[0] ?? '';
});
afterAll(async () => {
  await server?.close();
});

it('keeps HF sentences and composes current activity text without changing its input', () => {
  const original = 'There is smoke in the south again. Yusuf Usta: “That is a good idea. I will do it.”';
  expect(displayWords(original)).toBe(
    'There is smoke in the south again. Master Yusuf: “That is a good idea. I will do it.”',
  );
  expect(speechWords('After I pray, I will do it.')).toBe('After I pray, I will do it.');
  expect(original).toContain('Yusuf Usta');
  expect(activityWords('carry loose stone up to the pile above ground')).toBe(
    'This person’s current task is to carry loose stone up to the pile above ground.',
  );
});

it('starts a local hill when individual shared records cannot be read, without technical instructions', async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  try {
    await page.goto(url);
    await localHill(page);
    await page.locator('#book').click();
    await page.locator('#to-title').click();
    const before = await page.evaluate(`(async () => {
      const {get} = await import('/src/ui/store.ts'); const row = await get('hill'); if (row) delete row.value.savedAt; return JSON.stringify(row?.value);
    })()`);
    await page.locator('#menu-new-yes').click();
    await page.locator('#menu-new-confirm').waitFor({ state: 'detached' });
    await page.locator('#cv').waitFor();
    expect(await page.locator('#start-error').count()).toBe(0);
    expect(await page.evaluate('Object.keys(window.__warren.game.ownedHeads).length')).toBe(0);
    expect(
      await page.evaluate(`(async () => {
      const {get} = await import('/src/ui/store.ts'); const row = await get('hill'); if (row) delete row.value.savedAt; return JSON.stringify(row?.value);
    })()`),
    ).not.toBe(before);
  } finally {
    await browser.close();
  }
});

for (const engine of [chromium, webkit]) {
  for (const [width, height] of [
    [360, 690],
    [820, 1180],
    [1180, 820],
    [1280, 800],
  ]) {
    it(`${engine.name()} keeps controls, readings and Feedback reachable at ${width}x${height}`, async () => {
      let browser: Browser | undefined;
      try {
        browser = await engine.launch();
        const page = await browser.newPage({ viewport: { width: width!, height: height! } });
        await page.route('**/lab/**', (route) =>
          route.request().method() === 'POST' ? route.abort() : route.continue(),
        );
        await page.clock.install();
        const errors: string[] = [];
        page.on('pageerror', (error) => errors.push(error.message));
        await page.goto(url);
        await localHill(page);
        await page.evaluate(() => document.fonts.ready);
        await page.locator('#book').click();
        expect(await page.locator('.continuity, #continuity, #checkpoint-cast').count()).toBe(0);
        expect(await page.locator('#send').innerText()).toBe('Feedback');
        expect(await page.locator('#record-play').count()).toBe(1);
        await page.locator('#send').click();
        expect(await page.locator('.feedback-screen').count()).toBe(1);
        expect(await page.locator('.feedback-preview').isVisible()).toBe(false);
        await page.locator('textarea').fill('Unsent layout check.');
        await page.locator('.feedback-primary').scrollIntoViewIfNeeded();
        const submit = await page.locator('.feedback-primary').boundingBox();
        expect(submit!.y + submit!.height).toBeLessThanOrEqual(height!);
        await page.getByRole('button', { name: 'Back to the game', exact: true }).click();
        await page.locator('#bookx').click();
        await page.locator('#ticker').click();
        expect(await page.locator('#drawer[data-kind="j"]').isVisible()).toBe(true);
        await page.locator('#bookx').click();
        await page.locator('#shelter-check').click();
        await page.locator('[data-who]').first().click();
        const font = await page
          .locator('#person-help')
          .evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
        if (width! >= 768) expect(font).toBeGreaterThanOrEqual(18);
        const nameFits = await page.locator('#cardback').evaluate((el) => el.scrollWidth <= el.clientWidth);
        expect(nameFits).toBe(true);
        const speedFits = await page.locator('[data-speed="1"]').evaluate((el) => {
          const range = document.createRange();
          range.selectNodeContents(el);
          const text = range.getBoundingClientRect();
          const box = el.getBoundingClientRect();
          return (
            text.height <= parseFloat(getComputedStyle(el).fontSize) * 1.8 && text.bottom <= box.bottom + 1
          );
        });
        expect(speedFits).toBe(true);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        expect(errors).toEqual([]);
        await page.goto(`${url}?lab=true`);
        await page.locator('#book').click();
        expect(await page.locator('.continuity').count()).toBe(0);
        await page.goto(`${url}?lab=1`);
        await page.locator('#book').click();
        expect(await page.locator('.continuity').count()).toBe(0);
        expect(await page.locator('.game-debug').getAttribute('open')).toBeNull();
      } finally {
        await browser?.close();
      }
    }, 60000);
  }
}

it('reads a legacy gzip Blob row as well as the new ArrayBuffer rows', async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  try {
    await page.goto(url);
    const restored = await page.evaluate(`(async () => {
      const {put,get} = await import('/src/ui/store.ts');
      if (!await put('legacy-check', {kept:'exact old content'})) throw Error('Fixture write failed');
      const db = await new Promise((resolve,reject)=>{const r=indexedDB.open('warren',1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});
      const tx=db.transaction('pages','readwrite');
      const store=tx.objectStore('pages');const r=store.get('legacy-check');
      r.onsuccess=()=>store.put({...r.result,blob:new Blob([r.result.blob])},'legacy-check');
      await new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)});db.close();
      return (await get('legacy-check'))?.value;
    })()`);
    expect(restored).toEqual({ kept: 'exact old content' });
  } finally {
    await browser.close();
  }
});

it('keeps the actual notice footer outside rerenders and never restores a removed notice', async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  try {
    await page.goto(url);
    await localHill(page);
    await page.evaluate(() => {
      const host = document.getElementById('notice-footer');
      (window as unknown as { noticeHost: Element | null }).noticeHost = host;
      host?.querySelector('.lk-telemetry-notice')?.remove();
    });
    await page.locator('#book').click();
    await page.locator('#send').click();
    await page.getByRole('button', { name: 'Back to the game', exact: true }).click();
    await page.locator('#resume').click();
    expect(
      await page
        .locator('#notice-footer')
        .evaluate((el) => el === (window as unknown as { noticeHost: Element }).noticeHost),
    ).toBe(true);
    expect(await page.locator('.lk-telemetry-notice').count()).toBe(0);
    expect(await page.locator('#notice-footer').evaluate((el) => el.parentElement === document.body)).toBe(
      true,
    );
  } finally {
    await browser.close();
  }
});
it('keeps an occupied native hill byte-exact through public Debug and pagehide, with no legacy importer', async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  try {
    await page.goto(url);
    const before = await page.evaluate<string>(
      `(async()=>{const {newGame,save}=await import('/src/sim/game.ts');const {put,get}=await import('/src/ui/store.ts');await put('hill',save(newGame(111)));return JSON.stringify((await get('hill')).value);})()`,
    );
    await page.reload();
    await page.locator('#book').click();
    expect(await page.locator('.game-debug').getAttribute('open')).toBeNull();
    expect(await page.locator('#download-run').isVisible()).toBe(true);
    expect(await page.locator('#download-run').isDisabled()).toBe(true);
    expect(await page.locator('.game-debug #download-run').count()).toBe(0);
    await page.locator('.game-debug summary').click();
    expect(await page.locator('input[type="file"], #cast-file').count()).toBe(0);
    await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
    const after = await page.evaluate<string>(
      `(async()=>{const {get}=await import('/src/ui/store.ts');return JSON.stringify((await get('hill')).value);})()`,
    );
    expect(after).toBe(before);
  } finally {
    await browser.close();
  }
});

for (const engine of [chromium, webkit]) {
  it(`${engine.name()} keeps the complete compact notice on one readable phone line and lets enlarged text wrap`, async () => {
    const browser = await engine.launch();
    const page = await browser.newPage({ viewport: { width: 360, height: 690 } });
    try {
      await page.goto(url);
      await page.locator('#new').waitFor();
      const notice = page.locator('#notice-footer .lk-telemetry-notice');
      await expect.poll(() => notice.evaluate((el) => getComputedStyle(el).visibility)).toBe('visible');
      await page.evaluate(() => document.fonts.ready);
      const read = () =>
        notice.evaluate((el) => {
          const host = el.parentElement!;
          const range = document.createRange();
          range.selectNodeContents(el);
          const box = el.getBoundingClientRect(),
            text = range.getBoundingClientRect();
          return {
            font: parseFloat(getComputedStyle(el).fontSize),
            fontFamily: getComputedStyle(el).fontFamily,
            paddingInline: getComputedStyle(el).paddingInline,
            textWidth: text.width,
            lineRects: Array.from(range.getClientRects()).map((r) => ({ width: r.width, height: r.height })),
            node: box.height,
            host: host.getBoundingClientRect().height,
            textHeight: text.height,
            full: text.bottom <= box.bottom + 1,
            overflow: el.scrollWidth > el.clientWidth,
          };
        });
      expect(await notice.innerText()).toBe('We record and link play across games on this device.');
      expect(await notice.locator('button').count()).toBe(0);
      const normal = await read();
      expect(normal.font).toBeGreaterThanOrEqual(14);
      expect(normal.node).toBeLessThanOrEqual(40);
      expect(normal.host).toBeLessThanOrEqual(40);
      expect(normal.textHeight).toBeLessThan(normal.font * 1.8);
      expect(normal.full && !normal.overflow).toBe(true);
      await page.evaluate(() => (document.documentElement.style.fontSize = '32px'));
      const enlarged = await read();
      expect(enlarged.node).toBeGreaterThan(normal.node);
      expect(enlarged.full && !enlarged.overflow).toBe(true);
      expect(enlarged.host).toBeCloseTo(enlarged.node, 0);
      console.log(JSON.stringify({ engine: engine.name(), normal, enlarged }));
    } finally {
      await browser.close();
    }
  });
}
