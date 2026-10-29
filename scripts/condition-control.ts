/** Public Begin, village reading and elapsed play on the real app; no state edits. */
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';

const server = await createServer({ server: { host: '127.0.0.1', port: 0, hmr: false, watch: null } });
const browser = await chromium.launch({ headless: true });
try {
  await server.listen();
  const url = server.resolvedUrls?.local[0];
  assert.ok(url);
  const page = await browser.newPage({ viewport: { width: 360, height: 690 }, serviceWorkers: 'block' });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.clock.install();
  await page.goto(url);
  await page.locator('#new').click();
  await page.locator('#shelter-check').waitFor();
  const minute = () =>
    page.evaluate(`(async () => (await import('/src/ui/app.ts'))._debug.game?.s.minute)()`);
  const start = (await minute()) as number | undefined;
  await page.locator('#shelter-check').click();
  await page.locator('[data-who="meryem"]').click();
  const reading = (await page.locator('#person-help').textContent()) ?? '';
  assert.match(reading, /This is an approximate reading of current condition\./);
  assert.doesNotMatch(reading, /unavailable|\d|I will/);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 360);
  await page.locator('#cardx').click();
  if (await page.locator('#bookx').isVisible()) await page.locator('#bookx').click();
  await page.locator('[data-tool="chalk"]').click();
  const point = (await page.evaluate(`(async () => {
    const { view } = (await import('/src/ui/app.ts'))._debug;
    const box = document.querySelector('#cv').getBoundingClientRect();
    return { x: box.x + (15.5 - view.x) * view.cs, y: box.y + (11.5 - view.y) * view.cs };
  })()`)) as { x: number; y: number };
  await page.mouse.click(point.x, point.y);
  const chalk = (await page.locator('#event-sentence').textContent()) ?? '';
  assert.match(chalk, /square marked/);
  for (let n = 0; n < 40; n++) await page.clock.runFor(1000);
  const end = (await minute()) as number | undefined;
  assert.ok(start !== undefined && end !== undefined && end > start);
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({ publicBegin: true, viewport: [360, 690], start, end, reading, chalk, errors }),
  );
} finally {
  await browser.close();
  await server.close();
}
