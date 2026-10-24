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

it('projects historical fragments and bell replies without changing stored text', () => {
  const original = 'Smoke again in the south. Yusuf: “Good idea. On it.”';
  expect(displayWords(original)).toBe(
    'Smoke rises in the south again. Yusuf: “That is a good idea. I will do it.”',
  );
  expect(speechWords('Not now. After I pray.')).toBe('I cannot come now. I will come after I pray.');
  expect(original).toContain('Smoke again');
  expect(activityWords('carry spoil up to the heap')).toBe(
    'Their current task is to carry loose rock up to the heap.',
  );
});

it('keeps an existing saved hill after real local-origin admission fails, without technical instructions', async () => {
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
    await expect.poll(() => page.locator('#start-error').innerText()).toContain('could not be started');
    expect(await page.locator('#start-error').innerText()).not.toMatch(/Continuity|Shelf|file|Error:/);
    expect(
      await page.evaluate(`(async () => {
      const {get} = await import('/src/ui/store.ts'); const row = await get('hill'); if (row) delete row.value.savedAt; return JSON.stringify(row?.value);
    })()`),
    ).toBe(before);
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
        expect(await page.locator('.continuity, #cast-file, #checkpoint-cast').count()).toBe(0);
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
        expect(await page.locator('.continuity').count()).toBe(1);
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
    await page.goto(`${url}?lab=1`);
    await page.locator('#new').waitFor();
    await page.evaluate(() => {
      const host = document.getElementById('notice-footer');
      (window as unknown as { noticeHost: Element | null }).noticeHost = host;
      host?.querySelector('.lk-telemetry-notice')?.remove();
    });
    await page.locator('#book').click();
    await page.locator('.continuity summary').click();
    await page.locator('#local-fresh').click();
    await page.locator('#to-title').click();
    await page.locator('#menu-new-yes').click();
    await page.locator('#cv').waitFor();
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
