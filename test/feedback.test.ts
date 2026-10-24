import { type Browser, chromium, type Page } from 'playwright-core';
import { createServer, type ViteDevServer } from 'vite';
import { afterAll, beforeAll, expect, it } from 'vitest';

let server: ViteDevServer;
let browser: Browser;
let url: string;
beforeAll(async () => {
  server = await createServer({
    server: { host: '127.0.0.1', port: 0, hmr: false, watch: null },
  });
  await server.listen();
  url = server.resolvedUrls?.local[0] ?? '';
  browser = await chromium.launch();
}, 60000);
afterAll(async () => {
  await browser?.close();
  await server?.close();
});

async function mount(privacy = false, off = false, failRun = false): Promise<Page> {
  const page = await browser.newPage({ viewport: { width: 360, height: 690 } });
  await page.goto(url);
  await page.evaluate(`(async () => {
    const {openFeedback} = await import('/src/ui/feedback.ts');
    if (${off}) localStorage.setItem('hf-lab-recording-off', '1');
    else localStorage.removeItem('hf-lab-recording-off');
    window.feedbackCalls = [];
    const calls = window.feedbackCalls;
    const lab = {
      privacySignalOn: ${privacy}, privacyOverride: false,
      setTelemetryOff: off => { calls.push(['off',off]); if (off) localStorage.setItem('hf-lab-recording-off','1'); else localStorage.removeItem('hf-lab-recording-off'); },
      sendFeedback: async (...args) => {calls.push(['feedback',...args]);return 'queued';},
      sendRun: async (...args) => {calls.push(['run',...args]); if (${failRun}) throw Error('offline');return 'queued';},
      openSendDialog: options => {window.fallbackOptions=options;calls.push(['fallback',options.name,options.note]);},
      build: () => ({a:'0.4.0',hf:'2.8.0',c:'test-commit'}),
    };
    window.reopenFeedback = () => openFeedback(document.body, lab, () => ({seed:7,inputs:[],state:{minute:10},fingerprint:'exact'}), () => calls.push(['download']), () => calls.push(['back']));
    window.reopenFeedback();
  })()`);
  return page;
}

it('queues a linked verdict and trimmed name, remembers the name, and keeps downloading available', async () => {
  const page = await mount();
  try {
    await page.getByRole('button', { name: "I'd keep playing", exact: true }).click();
    await page.locator('textarea').fill('The door was hard to place.');
    await page.locator('.feedback-name summary').click();
    await page.locator('.feedback-name input').fill('  Tester 7  ');
    await page.getByRole('button', { name: 'Keep a copy of this run' }).click();
    await page.locator('.feedback-primary').click();
    expect(await page.locator('.feedback-status').innerText()).toContain('queued');
    expect(await page.evaluate('window.feedbackCalls')).toEqual([
      ['download'],
      [
        'feedback',
        'Verdict: keep\n\nThe door was hard to place.',
        {
          name: 'Tester 7',
          run: {
            seed: 7,
            inputs: [],
            state: { minute: 10 },
            fingerprint: 'exact',
          },
        },
      ],
    ]);
    await page.evaluate('window.reopenFeedback()');
    expect(await page.locator('.feedback-name input').inputValue()).toBe('Tester 7');
    await page.locator('.feedback-disclosure summary').click();
    await expect.poll(() => page.locator('.feedback-disclosure').innerText()).toContain('HF 2.8.0');
  } finally {
    await page.close();
  }
});

it('sends notes while recording is off or privacy is on, without a second dialog', async () => {
  for (const [privacy, off] of [
    [false, true],
    [true, false],
  ]) {
    const page = await mount(privacy, off);
    try {
      expect(await page.locator('.feedback-primary').isEnabled()).toBe(true);
      await page.locator('textarea').fill('QA feedback-fix');
      await page.locator('.feedback-primary').click();
      expect(await page.locator('.feedback-status').innerText()).toContain('Note queued');
      expect(await page.evaluate('window.feedbackCalls')).toEqual([
        [
          'feedback',
          'QA feedback-fix',
          {
            name: '',
            run: {
              seed: 7,
              inputs: [],
              state: { minute: 10 },
              fingerprint: 'exact',
            },
          },
        ],
      ]);
    } finally {
      await page.close();
    }
  }
});
