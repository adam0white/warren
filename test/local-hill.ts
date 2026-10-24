import type { Page } from 'playwright-core';

/** Explicit local saved-state fixture. This does not test shared cast admission. */
export async function localHill(page: Page) {
  await page.evaluate(`(async () => {
    const { newGame, save } = await import('/src/sim/game.ts');
    const { put } = await import('/src/ui/store.ts');
    await put('hill', save(newGame(7)));
  })()`);
  await page.reload();
  await page.locator('#cont').click();
}
