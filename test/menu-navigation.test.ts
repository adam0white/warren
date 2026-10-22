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
      expect(await page.locator('#book').getAttribute('aria-label')).toBe('Game menu');
      await page.locator('#book').click();
      expect(await page.locator('#drawer .who b').innerText()).toBe('Game menu');
      expect(await page.locator('[data-open="j"]').innerText()).toContain('Read the journal');
      expect(await page.locator('[data-open="d"]').innerText()).toContain('What the village has done');
      expect(await page.locator('#send').innerText()).toContain('Send word');
      expect(await page.locator('#savenow, #restart').count()).toBe(0);
      expect(await page.getByRole('link', { name: 'All games', exact: true }).isVisible()).toBe(true);
      await page.locator('#bookx').click();
      expect(await page.locator('#book').evaluate((el) => el === document.activeElement)).toBe(true);
      await page.locator('#ticker').click();
      expect(await page.locator('#drawer[data-kind="j"]').isVisible()).toBe(true);
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
      await page.locator('#shelter-check').click();
      const person = page.locator('[data-who]').first();
      await person.click();
      expect(await page.locator('#drawer').isVisible()).toBe(false);
      expect(await page.locator('#card').isVisible()).toBe(true);
      await page.getByRole('button', { name: 'Back to The village', exact: true }).click();
      expect(await page.locator('#card').isVisible()).toBe(false);
      expect(await page.locator('#drawer[data-kind="p"]').isVisible()).toBe(true);
      expect(await person.evaluate((el) => el === document.activeElement)).toBe(true);
      await person.click();
      await page.keyboard.press('Escape');
      expect(await page.locator('#drawer[data-kind="p"]').isVisible()).toBe(true);
      await page.keyboard.press('Escape');
      expect(await page.locator('#drawer').isVisible()).toBe(false);
      expect(await page.locator('#shelter-check').evaluate((el) => el === document.activeElement)).toBe(true);
    } finally {
      await page.close();
    }
  });

  it('closes a scene-selected person to the scene without reopening an earlier menu', async () => {
    const page = await begin();
    try {
      await page.locator('#shelter-check').click();
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

  it('returns from Send word to the menu without sending', async () => {
    const page = await begin();
    try {
      await page.evaluate(`(async () => {
        const { lab } = await import('/src/ui/lab.ts');
        lab.sendFeedback = async () => { throw new Error('Sending is forbidden in this test'); };
      })()`);
      await page.locator('#book').click();
      await page.locator('#send').click();
      expect(await page.locator('.feedback-screen').isVisible()).toBe(true);
      await page.getByRole('button', { name: 'Back to the game', exact: true }).click();
      expect(await page.locator('#drawer[data-kind="s"]').isVisible()).toBe(true);
      expect(await page.locator('.feedback-screen').count()).toBe(0);
      await page.keyboard.press('Escape');
      expect(await page.locator('#drawer').isVisible()).toBe(false);
    } finally {
      await page.close();
    }
  });

  it('closes a person on touch pointerdown before any live redraw or click', async () => {
    const page = await begin();
    try {
      await page.locator('#shelter-check').click();
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
      expect(await page.locator('#drawer[data-kind="p"]').isVisible()).toBe(true);
      // A synthesized click on the retained old close control must not steal restored focus.
      await page.locator('#cardx').dispatchEvent('click');
      expect(await person.evaluate((el) => el === document.activeElement)).toBe(true);
      await person.click();
      await page.locator('#cardx').focus();
      await page.keyboard.press('Enter');
      expect(await page.locator('#drawer[data-kind="p"]').isVisible()).toBe(true);
      expect(await person.evaluate((el) => el === document.activeElement)).toBe(true);
    } finally {
      await page.close();
    }
  });

  it('returns to the people list if the selected person dies while inspected', async () => {
    const page = await begin();
    try {
      await page.locator('#shelter-check').click();
      const person = page.locator('[data-who]').first();
      const id = await person.getAttribute('data-who');
      await person.click();
      await page.evaluate(
        `window.__warren.game.s.people.find((p) => p.id === ${JSON.stringify(id)}).body.alive = false`,
      );
      await page.clock.runFor(500);
      expect(await page.locator('#card').isVisible()).toBe(false);
      expect(await page.locator('#drawer[data-kind="p"]').isVisible()).toBe(true);
      expect(await person.evaluate((el) => el === document.activeElement)).toBe(true);
    } finally {
      await page.close();
    }
  });
});

it('pauses the Game menu and village person sheets without changing inputs or spending reading time', async () => {
  const page = await begin();
  const state = () =>
    page.evaluate<{ minute: number; inputs: string }>(
      `({minute: window.__warren.game.s.minute, inputs: JSON.stringify(window.__warren.game.inputs)})`,
    );
  try {
    await page.locator('#book').click();
    const before = await state();
    await page.clock.runFor(2000);
    expect(await state()).toEqual(before);
    expect(await page.locator('#clock-rate').innerText()).toBe('Time waits while you read');
    await page.locator('#bookx').click();
    await page.locator('#shelter-check').click();
    await page.locator('[data-who]').first().click();
    await page.clock.runFor(2000);
    expect(await state()).toEqual(before);
    await page.locator('#cardx').click();
    await page.keyboard.press('Escape');
    expect(await page.locator('[data-speed]').count()).toBe(3);
    await page.clock.runFor(8000);
    const resumed = await state();
    expect(resumed.minute).toBeGreaterThan(before.minute);
    expect(resumed.inputs).toBe(before.inputs);
  } finally {
    await page.close();
  }
});

it('presents a new important word after the retained note log fills', async () => {
  const page = await begin();
  try {
    await page.evaluate(
      `(() => { const s=window.__warren.game.s; const n=s.notes.at(-1); s.notes=Array.from({length:400},()=>({...n})); })()`,
    );
    await page.clock.runFor(300);
    await page.evaluate(
      `(() => { const s=window.__warren.game.s; s.notes.shift(); s.notes.push({at:s.minute,kind:'story',text:'A new important reply after four hundred notes.',weight:10}); })()`,
    );
    await page.clock.runFor(300);
    expect(await page.locator('#ticker').getAttribute('title')).toBe(
      'A new important reply after four hundred notes.',
    );
  } finally {
    await page.close();
  }
});

it('keeps the current hill and shows a warning when returning to the title cannot save', async () => {
  const page = await browser.newPage({ viewport: { width: 360, height: 690 } });
  try {
    await page.clock.install();
    await page.goto(url);
    await page.locator('#new').click();
    await page.locator('#cv').waitFor();
    const before = await page.evaluate('window.__warren.game.s.seed');
    await page.locator('#book').click();
    await page.evaluate(() => {
      indexedDB.open = () => {
        throw new Error('Storage unavailable');
      };
    });
    await page.locator('#to-title').click();
    await expect.poll(() => page.locator('#save-warning').innerText()).toContain('could not be saved');
    expect(await page.locator('#cv').isVisible()).toBe(true);
    expect(await page.locator('#drawer').isVisible()).toBe(true);
    expect(await page.evaluate('window.__warren.game.s.seed')).toBe(before);
    expect(await page.locator('#new').count()).toBe(0);
  } finally {
    await page.close();
  }
});

it('keeps keyboard focus in feedback when Send is disabled and retains the note', async () => {
  const page = await begin();
  try {
    await page.evaluate(() => localStorage.setItem('hf-lab-recording-off', '1'));
    await page.locator('#book').click();
    await page.locator('#send').click();
    await page.locator('textarea').fill('Keep this unsent note.');
    expect(await page.locator('.feedback-primary').isDisabled()).toBe(true);
    await page.getByRole('button', { name: 'Back to the game', exact: true }).focus();
    await page.keyboard.press('Tab');
    expect(await page.locator('.feedback-screen').evaluate((el) => el.contains(document.activeElement))).toBe(
      true,
    );
    await page.keyboard.press('Enter');
    expect(await page.locator('textarea').inputValue()).toBe('Keep this unsent note.');
    for (let i = 0; i < 18; i++) {
      await page.keyboard.press('Tab');
      expect(
        await page.locator('.feedback-screen').evaluate((el) => el.contains(document.activeElement)),
      ).toBe(true);
    }
    expect(await page.locator('#furnish').getAttribute('aria-expanded')).toBe('false');
  } finally {
    await page.close();
  }
});
