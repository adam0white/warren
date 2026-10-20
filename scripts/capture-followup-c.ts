/** Freeze replay hashes from the shipped 0.3.0 bundle, before the UI-only follow-up.
 * node scripts/capture-followup-c.ts [scratch-directory]
 * The sole instrumentation is an appended bridge to existing minified functions.
 * No simulation function or production response byte is replaced. Downloads use the live UI.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import { DAY } from '../src/sim/calendar.ts';
import { advance, fingerprint, type Input, load, replay, type Saved } from '../src/sim/game.ts';

const scratch = process.argv[2] ?? '/Users/abdul/code/.lab-scratch/design-round/warren-c';
const origin = 'https://warren.adamwhite.work';
const expectedSha256 = '3ca08574962b3a4cdf21f230fb9591e6d83147b2b70cc314814efb0ca9a0730e';
mkdirSync(scratch, { recursive: true });
const release = await (await fetch(`${origin}/release.json`, { cache: 'no-store' })).json();
assert.equal(release.commit, '96e84baf97952412987d11e7d9618238c6867e95');
assert.equal(release.dirty, false);
const html = await (await fetch(origin, { cache: 'no-store' })).text();
const asset = html.match(/src="(\/assets\/[^" ]+\.js)"/)?.[1];
assert.ok(asset);
const bundle = await (await fetch(`${origin}${asset}`, { cache: 'no-store' })).text();
const sha256 = createHash('sha256').update(bundle).digest('hex');
assert.equal(sha256, expectedSha256, 'Review the new production bundle before changing the bridge');
writeFileSync(join(scratch, 'live-original.js'), bundle);
// Names are pinned to the exact SHA above: newGame, apply, advance, save, load, enter and current game.
const bridge = `\nwindow.__baseline={run(seed,inputs,minute,edition){const g=tm(seed,edition);for(const i of inputs){im(g,i.at);rm(g.s,i);g.inputs.push(structuredClone(i));}im(g,minute);return um(g);},continue(saved,minute){const g=dm(saved);im(g,minute);return um(g);},show(saved){Z=dm(saved);wg();}};`;
writeFileSync(join(scratch, 'bridge.js'), bridge);
const legacy = JSON.parse(
  readFileSync(new URL('../test/fixtures/edition-legacy.json', import.meta.url), 'utf8'),
) as {
  runs: {
    seed: number;
    policy: string;
    minute: number;
    inputs: Input[];
    checkpoint: { minute: number; inputs: Input[] };
  }[];
};
type Bridge = {
  run(seed: number, inputs: Input[], minute: number, edition: string): Saved;
  continue(saved: Saved, minute: number): Saved;
  show(saved: Saved): void;
};
const browser = await chromium.launch();
const runs = [];
try {
  // Untouched UI renders: no route interception, no bridge, real live site.
  for (const [width, height] of [
    [360, 690],
    [1280, 800],
  ] as const) {
    const page = await browser.newPage({
      viewport: { width, height },
      hasTouch: true,
      serviceWorkers: 'block',
    });
    await page.clock.install();
    await page.goto(origin);
    await page.locator('#new').click();
    await page.clock.runFor(200);
    const shots = '/Users/abdul/code/.lab-scratch/design-round/warren-shots';
    mkdirSync(shots, { recursive: true });
    await page.screenshot({ path: join(shots, `before-${width}x${height}-c.png`) });
    await page.close();
  }
  const page = await browser.newPage({
    viewport: { width: 360, height: 690 },
    hasTouch: true,
    serviceWorkers: 'block',
    acceptDownloads: true,
  });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.clock.install();
  await page.clock.pauseAt(new Date(Date.now() + 1000));
  await page.route(`${origin}${asset}`, (route) =>
    route.fulfill({ contentType: 'text/javascript', body: bundle + bridge }),
  );
  await page.goto(origin);
  await page.waitForFunction(() => '__baseline' in window);
  for (const edition of ['0.2.0', '0.3.0']) {
    for (const run of legacy.runs) {
      const stages = [];
      let checkpoint: Saved | undefined;
      for (const kind of ['checkpoint', 'continuation', 'end'] as const) {
        const minute =
          kind === 'checkpoint'
            ? run.checkpoint.minute
            : kind === 'continuation'
              ? run.checkpoint.minute + 2 * DAY
              : run.minute;
        const inputs = kind === 'end' ? run.inputs : run.checkpoint.inputs;
        const live = await page.evaluate(
          ({ seed, inputs, minute, edition, checkpoint }) => {
            const api = (window as unknown as { __baseline: Bridge }).__baseline;
            const saved = checkpoint
              ? api.continue(checkpoint, minute)
              : api.run(seed, inputs, minute, edition);
            api.show(saved);
            return saved;
          },
          {
            seed: run.seed,
            inputs,
            minute,
            edition,
            checkpoint: kind === 'continuation' ? checkpoint : undefined,
          },
        );
        if (kind === 'checkpoint') checkpoint = live;
        await page.locator('#book').click();
        await page.locator('[data-tab="s"]').click();
        const pending = page.waitForEvent('download');
        await page.locator('#export').click();
        const download = await pending;
        const path = join(scratch, `${edition}-${run.seed}-${run.policy}-${kind}.json`);
        await download.saveAs(path);
        const exported = JSON.parse(readFileSync(path, 'utf8')) as Saved;
        assert.equal(exported.minute, minute);
        assert.equal(exported.fingerprint, live.fingerprint);
        assert.equal(exported.game, edition);
        assert.equal(fingerprint(load(exported).s), live.fingerprint);
        const local =
          kind === 'continuation' && checkpoint
            ? load(checkpoint)
            : replay(run.seed, inputs, minute, edition);
        if (kind === 'continuation') advance(local, minute);
        assert.equal(fingerprint(local.s), live.fingerprint, 'Local code must agree with the live bundle');
        stages.push({
          kind,
          minute,
          fingerprint: exported.fingerprint,
          inputs: exported.inputs,
          exportFile: path,
        });
      }
      runs.push({ edition, seed: run.seed, policy: run.policy, stages });
      console.log(
        edition,
        run.seed,
        run.policy,
        stages.map((stage) => `${stage.kind}:${stage.fingerprint}`).join(' '),
      );
    }
  }
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
}
const fixture = {
  capturedAt: new Date().toISOString(),
  release,
  asset,
  sha256,
  method:
    'Exact live bundle with append-only bridge; seeds 1/7/19 with fixed plain-bot/watch input logs from edition-legacy.json, reused on both editions. Real Download this run exports for day-20 checkpoint, live load+2-day continuation and day-65 end; local replay/load verified against every live export.',
  runs,
};
writeFileSync(
  new URL('../test/fixtures/edition-ui-before-c.json', import.meta.url),
  `${JSON.stringify(fixture, null, 2)}\n`,
);
writeFileSync(join(scratch, 'receipt.json'), `${JSON.stringify(fixture, null, 2)}\n`);
