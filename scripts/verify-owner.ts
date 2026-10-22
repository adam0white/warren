/** Read a private export without copying it into the repo; replay it and photograph the real save/load path.
 * node scripts/verify-owner.ts <export.json> [base-url] [screenshots-directory]
 */
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import { fingerprint, load, replay, type Saved } from '../src/sim/game.ts';

const [file, url = 'http://127.0.0.1:5173', shots = 'scratch/owner-2026-10-20/replay'] =
  process.argv.slice(2);
if (!file) throw new Error('Pass the private replay path; it will not be copied or printed.');
const saved = JSON.parse(readFileSync(file, 'utf8')) as Saved;
assert.equal(fingerprint(load(saved).s), saved.fingerprint);
const replayed = replay(saved.seed, saved.inputs, saved.minute, saved.game);
assert.equal(fingerprint(replayed.s), saved.fingerprint);
console.log(`Replay matched ${saved.fingerprint} at minute ${saved.minute}.`);
mkdirSync(shots, { recursive: true });
const browser = await chromium.launch();
try {
  for (const [width, height] of [
    [360, 690],
    [1280, 800],
  ] as const) {
    const page = await browser.newPage({ viewport: { width, height }, serviceWorkers: 'block' });
    try {
      await page.clock.install();
      await page.goto(url);
      // Populate the normal save envelope, then let the game restore it through "Go back down".
      await page.evaluate(async (saved) => {
        const blob = await new Response(
          new Blob([JSON.stringify(saved)]).stream().pipeThrough(new CompressionStream('gzip')),
        ).blob();
        await new Promise<void>((resolve, reject) => {
          const request = indexedDB.open('warren', 1);
          request.onupgradeneeded = () => request.result.createObjectStore('pages');
          request.onerror = () => reject(request.error);
          request.onsuccess = () => {
            const db = request.result;
            const tx = db.transaction('pages', 'readwrite');
            tx.objectStore('pages').put({ blob, at: Date.now() }, 'hill');
            tx.oncomplete = () => {
              db.close();
              resolve();
            };
            tx.onerror = () => {
              db.close();
              reject(tx.error);
            };
          };
        });
      }, saved);
      await page.reload();
      await page.locator('#cont').click();
      await page.clock.runFor(500);
      for (const privacy of ['closed', 'open']) {
        if (privacy === 'open') {
          await page.locator('#book').click();
          await page.clock.runFor(300);
        }
        const size = await page.evaluate(() => ({
          height: document.documentElement.scrollHeight,
          width: document.documentElement.scrollWidth,
          innerWidth,
          innerHeight,
          canvas: document.querySelector('canvas')?.getBoundingClientRect().height ?? 0,
          guidance: document.getElementById('goal')?.textContent,
        }));
        assert.equal(size.height, height);
        assert.equal(size.width, width);
        assert.ok(size.canvas > 200);
        assert.ok(size.guidance);
        const book = await page.locator('#book').boundingBox();
        assert.ok(book && book.y + book.height <= height);
        await page.screenshot({ path: join(shots, `${width}x${height}-${privacy}.png`) });
        console.log(`${width}×${height}, privacy ${privacy}: fits; ${size.guidance}`);
      }
    } finally {
      await page.close();
    }
  }
} finally {
  await browser.close();
}
