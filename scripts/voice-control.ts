/** Real public phone play, download and exact replay. No private state edits. */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
import { load, replay, save } from '../src/sim/game.ts';

const server = await createServer({ server: { host: '127.0.0.1', port: 0, hmr: false, watch: null } });
const browser = await chromium.launch({ headless: true });
try {
  await server.listen();
  const page = await browser.newPage({ viewport: { width: 360, height: 690 }, serviceWorkers: 'block' });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.clock.install();
  await page.goto(server.resolvedUrls!.local[0]!);
  await page.locator('#new').click();
  await page.locator('#bell').waitFor();
  await page.locator('#bell').click();
  for (let n = 0; n < 40; n++) await page.clock.runFor(1000);
  const reading = await page.locator('body').innerText();
  await page.locator('#book').click();
  const downloaded = page.waitForEvent('download');
  await page.locator('#download-run').click();
  const download = await downloaded;
  const file = await download.path();
  assert.ok(file);
  const exported = JSON.parse(await readFile(file, 'utf8'));
  const { exportedAt: _date, ...saved } = exported;
  assert.ok(saved.state.answers.length > 0);
  assert.equal(saved.framework, '4.10.0');
  assert.deepEqual(save(load(saved)), saved);
  const rebuilt = replay(
    saved.seed,
    saved.inputs,
    saved.minute,
    saved.game,
    saved.chapter,
    saved.config,
    saved.phase,
  );
  assert.deepEqual(save(rebuilt).state, saved.state);
  assert.equal(save(rebuilt).fingerprint, saved.fingerprint);
  assert.deepEqual(rebuilt.inputs, saved.inputs);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 360);
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify(
      {
        scope: 'synthetic browser play, no owner acceptance',
        viewport: [360, 690],
        minute: saved.minute,
        reading,
        answers: saved.state.answers,
        publicDownloadReplayExact: true,
        errors,
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
  await server.close();
}
