/** Actual browser main-thread advanceFrame cost from a shared12-hour checkpoint.
 * No automatic player/panel or external services; this bounded technical control
 * measures physical90minutes at one public HF call per RAF and reports clock lag.
 */
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';

const server = await createServer({ server: { host: '127.0.0.1', port: 0, hmr: false, watch: null } });
server.middlewares.use('/__hf4_frame_control', (_req, res) => {
  res.setHeader('Content-Type', 'text/html');
  res.end('<!doctype html><title>Warren HF4 frame control</title>');
});
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
try {
  await server.listen();
  const url = server.resolvedUrls!.local[0]!;
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.route('**/*', (route) =>
    route.request().url().startsWith(url) ? route.continue() : route.abort(),
  );
  await page.goto(`${url}__hf4_frame_control`);
  const result = await page.evaluate(async () => {
    const gamePath = '/src/sim/game.ts';
    const { newGame, advance, save } = await import(gamePath);
    const worldPath = '/src/sim/warren.ts';
    const { advanceFrame } = await import(worldPath);
    const game = newGame(7, '0.7.0', undefined, 'warren-rest/1');
    advance(game, 1020);
    const frameCosts: number[] = [];
    let frames = 0;
    const start = performance.now();
    while (game.s.minute < 1110 || game.s.hfPhase) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const t = performance.now();
      advanceFrame(game.s);
      frameCosts.push(performance.now() - t);
      frames++;
      if (frames > 2000) throw Error('Frame protocol did not progress');
    }
    const elapsedMs = performance.now() - start,
      atExport = performance.now(),
      serialized = JSON.stringify(save(game));
    const sorted = frameCosts.slice(10).sort((a, b) => a - b);
    return {
      scope:
        'Chromium actual main-thread simulation, six people; same12-hour checkpoint next90minutes; one publicHFcall per RAF; excludes draw and export',
      frames,
      elapsedMs,
      simulationWallP95: sorted[Math.floor((sorted.length - 1) * 0.95)],
      simulationWallMax: Math.max(...sorted),
      framesOver10ms: sorted.filter((n) => n > 10).length,
      nominalSpeed1Ms: (90 / 1440) * 20000,
      nominalClockLagMinutes: (elapsedMs / 20000) * 1440 - 90,
      exportMs: performance.now() - atExport,
      exportBytes: new TextEncoder().encode(serialized).length,
    };
  });
  assert.ok(result.frames > 0);
  console.log(JSON.stringify(result, null, 2));
} finally {
  await browser?.close();
  await server.close();
}
