import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
import { newGame, save } from '../src/sim/game.ts';

const server = await createServer({ server: { host: '127.0.0.1', port: 0, hmr: false, watch: null } });
await server.listen();
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 360, height: 690 } });
  await page.addInitScript(() => {
    const original = indexedDB.open.bind(indexedDB);
    Object.assign(window, { nativeOpens: 0 });
    indexedDB.open = (...args: Parameters<IDBFactory['open']>) => {
      if (args[0] === 'warren')
        Object.assign(window, {
          nativeOpens: (window as unknown as { nativeOpens: number }).nativeOpens + 1,
        });
      return original(...args);
    };
  });
  await page.clock.install();
  await page.goto(`${server.resolvedUrls!.local[0]}file/`);
  await page.locator('#hill-file').setInputFiles({
    name: 'hill.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(save(newGame(7)))),
  });
  await page.locator('#cv').waitFor();
  await page.locator('#book').click();
  assert.equal(await page.getByRole('link', { name: 'People across games', exact: true }).count(), 1);
  assert.equal(await page.locator('#to-title').count(), 0);
  assert.match((await page.locator('.game-debug').textContent()) ?? '', /HF 4.7.0/);
  assert.equal(await page.evaluate(() => (window as unknown as { nativeOpens: number }).nativeOpens), 0);
  console.log(
    JSON.stringify({
      openedFile: true,
      nativeOpens: 0,
      sharedOwnership: false,
      versions: true,
      peopleLabel: true,
      width: 360,
    }),
  );
} finally {
  await browser.close();
  await server.close();
}
