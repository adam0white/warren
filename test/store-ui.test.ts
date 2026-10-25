import { type Browser, webkit } from 'playwright-core';
import { createServer, type ViteDevServer } from 'vite';
import { afterAll, beforeAll, expect, it } from 'vitest';

let server: ViteDevServer;
let browser: Browser;
let url: string;
beforeAll(async () => {
  server = await createServer({ server: { host: '127.0.0.1', port: 0, hmr: false, watch: null } });
  await server.listen();
  url = server.resolvedUrls?.local[0] ?? '';
  browser = await webkit.launch();
}, 60000);
afterAll(async () => {
  await browser?.close();
  await server?.close();
});

it('writes exact values and receipts without document-owned Blob input and reads legacy Blob rows', async () => {
  const page = await browser.newPage();
  try {
    await page.goto(url);
    const result = (await page.evaluate(`(async () => {
      const { put, get } = await import('/src/ui/store.ts');
      const value = { value: { minute: 120, words: 'Yusuf Usta' }, receipts: [{ head: 'accepted' }] };
      const stream = Blob.prototype.stream;
      const arrayBuffer = Blob.prototype.arrayBuffer;
      Blob.prototype.stream = () => { throw new Error('Document-owned Blob input unavailable'); };
      Blob.prototype.arrayBuffer = () => { throw new Error('Document-owned Blob output unavailable'); };
      let written;
      try { written = await put('regression', value); }
      finally { Blob.prototype.stream = stream; Blob.prototype.arrayBuffer = arrayBuffer; }
      if (!written) return { written, value };
      const restored = await get('regression');
      const db = await new Promise((resolve) => {
        const request = indexedDB.open('warren', 1);
        request.onsuccess = () => resolve(request.result);
      });
      const row = await new Promise((resolve) => {
        const request = db.transaction('pages').objectStore('pages').get('regression');
        request.onsuccess = () => resolve(request.result);
      });
      db.close();
      // Supply a historical Blob row without writing a Blob to WebKit IndexedDB,
      // whose Blob-write abort is a separate known platform limitation.
      const originalGet = IDBObjectStore.prototype.get;
      IDBObjectStore.prototype.get = function (key) {
        if (key !== 'legacy') return originalGet.call(this, key);
        const request = { result: { ...row, blob: new Blob([row.blob]) } };
        setTimeout(() => request.onsuccess(), 0);
        return request;
      };
      let legacy;
      try { legacy = (await get('legacy'))?.value; }
      finally { IDBObjectStore.prototype.get = originalGet; }
      return { written, restored: restored?.value, legacy,
        arrayBuffer: row.blob instanceof ArrayBuffer, value };
    })()`)) as { written: boolean; arrayBuffer: boolean; restored: unknown; legacy: unknown; value: unknown };
    expect(result.written).toBe(true);
    expect(result.arrayBuffer).toBe(true);
    expect(result.restored).toEqual(result.value);
    expect(result.legacy).toEqual(result.value);
  } finally {
    await page.close();
  }
});

for (const recording of [true, false]) {
  it(`reloads an active controlled hill without errors with Recording ${recording ? 'on' : 'off'}`, async () => {
    const page = await browser.newPage();
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    try {
      await page.clock.install();
      await page.goto(url);
      await page.locator('#new').waitFor();
      await page.evaluate(`(async () => {
        const { newGame, save } = await import('/src/sim/game.ts');
        const { put } = await import('/src/ui/store.ts');
        await put('hill', save(newGame(7)));
      })()`);
      await page.reload();
      await page.locator('#cont').click();
      await page.locator('#cv').waitFor();
      await page.locator('#book').click();
      await page.locator('#record-play').setChecked(recording);
      await page.locator('#resume').click();
      const expected = await page.evaluate(`(async () => {
        const { save } = await import('/src/sim/game.ts');
        return JSON.parse(JSON.stringify(save(window.__warren.game)));
      })()`);
      await page.reload();
      await page.locator('#cont').waitFor();
      const stored = await page.evaluate(`(async () => {
        const { get } = await import('/src/ui/store.ts');
        const row = await get('hill');
        if (row) delete row.value.savedAt;
        return row?.value;
      })()`);
      expect(stored).toEqual(expected);
      expect(errors).toEqual([]);
    } finally {
      await page.close();
    }
  });
}
