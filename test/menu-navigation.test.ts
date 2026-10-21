import { type Browser, chromium, type Page } from 'playwright-core';
import { createServer, type ViteDevServer } from 'vite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newGame, save } from '../src/sim/game.ts';

let server: ViteDevServer;
let browser: Browser;
let url: string;
beforeAll(async () => {
  server = await createServer({ server: { host: '127.0.0.1', port: 0, hmr: false, watch: null } });
  await server.listen();
  url = server.resolvedUrls?.local[0] ?? '';
  browser = await chromium.launch();
}, 60000);
afterAll(async () => {
  await browser?.close();
  await server?.close();
}, 60000);
async function begin(): Promise<Page> {
  const page = await browser.newPage({ viewport: { width: 360, height: 690 }, hasTouch: true });
  await page.clock.install();
  await page.goto(url);
  await page.evaluate(`(async () => {
    const { put } = await import('/src/ui/store.ts');
    await put('hill', ${JSON.stringify(save(newGame(7)))});
  })()`);
  await page.reload();
  await page.locator('#cont').click();
  await page.locator('#cv').waitFor();
  await page.clock.runFor(100);
  return page;
}

describe('Game menu and person return paths', () => {
  it('opens run controls directly under the prescribed menu names', async () => {
    const page = await begin();
    try {
      expect(await page.locator('#book').innerText()).toBe('Game menu');
      await page.locator('#book').click();
      expect(await page.locator('#drawer .who b').innerText()).toBe('Game menu');
      expect(await page.getByRole('button', { name: 'Download this run', exact: true }).isVisible()).toBe(
        true,
      );
      expect(await page.locator('#savenow').isVisible()).toBe(true);
      expect(await page.locator('#restart').isVisible()).toBe(true);
      expect(await page.getByRole('link', { name: 'All games', exact: true }).isVisible()).toBe(true);
      await page.locator('#bookx').click();
      expect(await page.locator('#book').evaluate((el) => el === document.activeElement)).toBe(true);
      await page.locator('#ticker').click();
      expect(await page.locator('[data-pane="j"]').isVisible()).toBe(true);
      await page.keyboard.press('Escape');
      expect(await page.locator('#drawer').isVisible()).toBe(false);
      expect(await page.locator('#ticker').evaluate((el) => el === document.activeElement)).toBe(true);
    } finally {
      await page.close();
    }
  });

  it('returns a person to the people list, then returns the menu to its opener', async () => {
    const page = await begin();
    try {
      await page.locator('#book').click();
      await page.locator('[data-tab="p"]').click();
      const person = page.locator('[data-who]').first();
      await person.click();
      expect(await page.locator('#drawer').isVisible()).toBe(false);
      expect(await page.locator('#card').isVisible()).toBe(true);
      await page.locator('#cardx').click();
      expect(await page.locator('#card').isVisible()).toBe(false);
      expect(await page.locator('[data-pane="p"]').isVisible()).toBe(true);
      expect(await person.evaluate((el) => el === document.activeElement)).toBe(true);
      await person.click();
      await page.keyboard.press('Escape');
      expect(await page.locator('[data-pane="p"]').isVisible()).toBe(true);
      await page.keyboard.press('Escape');
      expect(await page.locator('#drawer').isVisible()).toBe(false);
      expect(await page.locator('#book').evaluate((el) => el === document.activeElement)).toBe(true);
    } finally {
      await page.close();
    }
  });

  it('closes a scene-selected person to the scene without reopening an earlier menu', async () => {
    const page = await begin();
    try {
      await page.locator('#book').click();
      await page.locator('[data-tab="p"]').click();
      await page.locator('[data-who]').first().click();
      await page.locator('#cardx').click();
      await page.locator('#bookx').click();
      const point = await page.evaluate<{ x: number; y: number }>(`(async () => {
        const { personAt } = await import('/src/ui/draw.ts');
        const { game, view } = window.__warren;
        for (let y = 4; y < view.h; y += 4) {
          for (let x = 4; x < view.w; x += 4) {
            if (personAt(game.s, view, x, y, game.s.minute)) return { x, y };
          }
        }
        throw new Error('No visible person');
      })()`);
      await page.locator('#cv').click({ position: point });
      expect(await page.locator('#card').isVisible()).toBe(true);
      await page.locator('#cardx').click();
      expect(await page.locator('#card').isVisible()).toBe(false);
      expect(await page.locator('#drawer').isVisible()).toBe(false);
      expect(await page.locator('#cv').evaluate((el) => el === document.activeElement)).toBe(true);
    } finally {
      await page.close();
    }
  });

  for (const dismiss of ['Not now', 'Escape']) {
    it(`returns from Send via ${dismiss} to Save and run with send focus`, async () => {
      const page = await begin();
      try {
        // Exercise the installed dialog with the quiet lab client; never send a run.
        await page.evaluate(`(async () => {
          const { lab } = await import('/src/ui/lab.ts');
          const { openSendDialog } = await import('/node_modules/@adam0white/lab-client/dist/dialog.js');
          lab.sendEnvelopeText = async () => { throw new Error('Sending is forbidden in this test'); };
          lab.openSendDialog = (options) => openSendDialog({ ...options, lab });
        })()`);
        await page.locator('#book').click();
        await page.locator('#send').click();
        expect(await page.locator('.hflab-veil').isVisible()).toBe(true);
        expect(await page.locator('#drawer').isVisible()).toBe(false);
        if (dismiss === 'Escape') await page.keyboard.press('Escape');
        else await page.getByRole('button', { name: 'Not now', exact: true }).click();
        await page.locator('[data-pane="s"]').waitFor({ state: 'visible' });
        expect(await page.locator('.hflab-veil').count()).toBe(0);
        expect(await page.locator('#send').evaluate((el) => el === document.activeElement)).toBe(true);
        await page.keyboard.press('Escape');
        expect(await page.locator('#drawer').isVisible()).toBe(false);
        expect(await page.locator('#book').evaluate((el) => el === document.activeElement)).toBe(true);
      } finally {
        await page.close();
      }
    });
  }

  it('closes a person on touch pointerdown before any live redraw or click', async () => {
    const page = await begin();
    try {
      await page.locator('#book').click();
      await page.locator('[data-tab="p"]').click();
      const person = page.locator('[data-who]').first();
      await person.click();
      await page.locator('#cardx').dispatchEvent('pointerdown', {
        pointerType: 'touch',
        pointerId: 1,
        bubbles: true,
        cancelable: true,
      });
      expect(await page.locator('#card').isVisible()).toBe(false);
      await page.clock.runFor(1000);
      expect(await page.locator('[data-pane="p"]').isVisible()).toBe(true);
      // A synthesized click on the retained old close control must not steal restored focus.
      await page.locator('#cardx').dispatchEvent('click');
      expect(await person.evaluate((el) => el === document.activeElement)).toBe(true);
      await person.click();
      await page.locator('#cardx').focus();
      await page.keyboard.press('Enter');
      expect(await page.locator('[data-pane="p"]').isVisible()).toBe(true);
      expect(await person.evaluate((el) => el === document.activeElement)).toBe(true);
    } finally {
      await page.close();
    }
  });

  it('returns to the people list if the selected person dies while inspected', async () => {
    const page = await begin();
    try {
      await page.locator('#book').click();
      await page.locator('[data-tab="p"]').click();
      const person = page.locator('[data-who]').first();
      const id = await person.getAttribute('data-who');
      await person.click();
      await page.evaluate(
        `window.__warren.game.s.people.find((p) => p.id === ${JSON.stringify(id)}).body.alive = false`,
      );
      await page.clock.runFor(500);
      expect(await page.locator('#card').isVisible()).toBe(false);
      expect(await page.locator('[data-pane="p"]').isVisible()).toBe(true);
      expect(await person.evaluate((el) => el === document.activeElement)).toBe(true);
    } finally {
      await page.close();
    }
  });
});

it('pauses the Game menu and its person pages without changing inputs or selected speed', async () => {
  const page = await begin();
  const state = () =>
    page.evaluate<{ minute: number; inputs: string }>(
      `({minute: window.__warren.game.s.minute, inputs: JSON.stringify(window.__warren.game.inputs)})`,
    );
  try {
    await page.locator('[data-speed="2"]').click();
    await page.locator('#book').click();
    const before = await state();
    await page.clock.runFor(2000);
    expect(await state()).toEqual(before);
    expect(await page.locator('#clock-rate').innerText()).toBe('Paused · Game menu');
    await page.locator('[data-tab="p"]').click();
    await page.locator('[data-who]').first().click();
    await page.clock.runFor(2000);
    expect(await state()).toEqual(before);
    await page.locator('#cardx').click();
    await page.keyboard.press('Escape');
    expect(await page.locator('[data-speed="2"]').getAttribute('class')).toContain('on');
    await page.clock.runFor(500);
    const resumed = await state();
    expect(resumed.minute).toBeGreaterThan(before.minute);
    expect(resumed.inputs).toBe(before.inputs);
  } finally {
    await page.close();
  }
});
