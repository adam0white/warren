/** Browser controls with real local storage and HF, and a synthetic six-person shelf transport. */
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { canonicalCast, castForGame, createPersona } from '@adam0white/lab-client';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
import { expect, it } from 'vitest';
import { newGame, save } from '../src/sim/game.ts';

it('keeps an old hill downloadable, starts with shared records present, and opens or refuses files', async () => {
  const server = await createServer({ server: { host: '127.0.0.1', port: 0, hmr: false, watch: null } });
  const browser = await chromium.launch({ headless: true });
  const shelf = await Promise.all(
    castForGame('warren').map(async ({ castId }) =>
      createPersona({
        format: 'hf-persona/1',
        castId,
        castRevision: canonicalCast(castId).revision,
        branchId: `old-${castId}`,
        parentRevision: null,
        source: { game: 'warren', build: 'older-control', engine: '3.0.0', rules: 'cast-1' },
        transfer: {},
        limitations: [],
      }),
    ),
  );
  try {
    await server.listen();
    const local = server.resolvedUrls!.local[0]!;
    const page = await browser.newPage({ viewport: { width: 360, height: 690 }, serviceWorkers: 'block' });
    let sharedWrites = 0;
    await page.exposeFunction('unexpectedSharedWrite', () => {
      sharedWrites++;
    });
    await page.route('**/*', async (route) => {
      const url = new URL(route.request().url());
      if (url.origin === 'https://warren.adamwhite.work') {
        const response = await route.fetch({ url: new URL(url.pathname + url.search, local).href });
        return route.fulfill({ response });
      }
      if (url.href === 'https://human.adamwhite.work/lab/identity/')
        return route.fulfill({
          contentType: 'text/html',
          body: `<script>const heads=${JSON.stringify(shelf)};
          addEventListener('message', e => {
            const m=e.data, consent=m.type==='hf-persona-consent';
            if(m.action==='putBatch') parent.postMessage('unexpected-shared-write','*');
            const value=consent?true:m.action==='get'?heads.find(h=>h.castId===m.castId)??null:{};
            e.ports[0]?.postMessage({id:m.id,type:consent?'hf-persona-consent-reply':'hf-persona-reply',value});
          });</script>`,
        });
      return route.abort();
    });
    await page.addInitScript(() => {
      addEventListener('message', (event) => {
        if (event.data === 'unexpected-shared-write')
          void (window as unknown as { unexpectedSharedWrite(): Promise<void> }).unexpectedSharedWrite();
      });
    });
    await page.clock.install();
    await page.goto('https://warren.adamwhite.work/');
    await page.locator('#new').waitFor();
    // Genuine served rest/1 data must survive the native and file refusals.
    const old = JSON.parse(
      gunzipSync(
        readFileSync(new URL('./fixtures/f4-rest1/marked-native.json.gz', import.meta.url)),
      ).toString(),
    );
    const written = await page.evaluate(`(async () => {
      const store = await import('/src/ui/store.ts');
      return store.put('hill', ${JSON.stringify(old)});
    })()`);
    expect(written).toBe(true);
    await page.reload();
    await page.locator('#download-old-run').waitFor();
    expect(await page.locator('.page').innerText()).toContain('Your people across games are kept.');
    expect(await page.locator('#cont').count()).toBe(0);
    const downloading = page.waitForEvent('download');
    await page.locator('#download-old-run').click();
    const downloaded = await downloading;
    expect(JSON.parse(readFileSync((await downloaded.path())!, 'utf8'))).toEqual(old);
    await page.locator('#new').click();
    await page.locator('#new-no').click();
    expect(
      await page.evaluate(`(async () => (await (await import('/src/ui/store.ts')).get('hill'))?.value)()`),
    ).toEqual(old);
    await page.locator('#new').click();
    await page.locator('#new-yes').click();
    await page.locator('#cv').waitFor();
    await page.locator('#book').click();
    const status = await page.locator('[data-cast-status]').textContent();
    for (const person of castForGame('warren')) expect(status).toContain(person.name);
    expect(sharedWrites).toBe(0);
    const filePage = await browser.newPage({ viewport: { width: 360, height: 690 } });
    await filePage.goto(`${local}file/`);
    await filePage.locator('#hill-file').setInputFiles({
      name: 'old.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(old)),
    });
    await expect
      .poll(() => filePage.locator('#file-status').textContent())
      .toBe('This file cannot be opened in this version. Keep it and start fresh with a new game.');
    expect(await filePage.locator('#file-debug').getAttribute('open')).toBeNull();
    expect(await filePage.locator('#file-debug').getAttribute('hidden')).toBeNull();
    expect(await filePage.locator('#file-detail').textContent()).toContain('configuration');
    await filePage.locator('#hill-file').setInputFiles({
      name: 'hill.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(save(newGame(7)))),
    });
    await filePage.locator('#cv').waitFor();
    expect(await filePage.evaluate('window.__warren.game.fileOrigin')).toBe(true);
  } finally {
    await browser.close();
    await server.close();
  }
}, 60000);
