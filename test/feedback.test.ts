import { type Browser, chromium, type Page } from 'playwright-core';
import { createServer, type ViteDevServer } from 'vite';
import { afterAll, beforeAll, expect, it } from 'vitest';

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
    expect(await page.locator('.feedback-status').innerText()).toBe('Sent. Thank you.');
    expect(await page.evaluate('window.feedbackCalls')).toEqual([
      ['download'],
      ['feedback', 'Verdict: keep\n\nThe door was hard to place.', { name: 'Tester 7' }],
    ]);
    await page.evaluate('window.reopenFeedback()');
    expect(await page.locator('.feedback-name input').inputValue()).toBe('Tester 7');
    await page.locator('.feedback-disclosure summary').click();
    await expect.poll(() => page.locator('.feedback-disclosure').innerText()).toContain('HF 2.8.0');
  } finally {
    await page.close();
  }
});

it('refuses sending while recording is off, then enables sending through the inline switch', async () => {
  const page = await mount(false, true);
  try {
    expect(await page.locator('.feedback-primary').isDisabled()).toBe(true);
    expect(await page.locator('.feedback-recording').innerText()).toContain(
      'Recording is off, so nothing is sent.',
    );
    await page.getByRole('switch').check();
    expect(await page.locator('.feedback-primary').isEnabled()).toBe(true);
    await page.locator('.feedback-primary').click();
    expect(await page.evaluate('window.feedbackCalls')).toEqual([
      ['off', false],
      ['feedback', '', { name: '' }],
    ]);
  } finally {
    await page.close();
  }
});

it('requires privacy consent and preserves verdict, note and name in the fallback dialog', async () => {
  const page = await mount(true, false, true);
  try {
    expect(await page.locator('.feedback-primary').isDisabled()).toBe(true);
    await page.getByRole('button', { name: "I'd stop here", exact: true }).click();
    await page.locator('textarea').fill('The water was dry.');
    await page.locator('.feedback-name summary').click();
    await page.locator('.feedback-name input').fill('Tester');
    await page.getByRole('checkbox', { name: 'Send this run with my note' }).check();
    await page.locator('.feedback-primary').click();
    expect(await page.evaluate('window.feedbackCalls')).toEqual([
      [
        'run',
        { seed: 7, inputs: [], state: { minute: 10 }, fingerprint: 'exact' },
        { note: 'Verdict: quit\n\nThe water was dry.', name: 'Tester' },
      ],
      ['fallback', 'Tester', 'Verdict: quit\n\nThe water was dry.'],
    ]);
    expect(await page.locator('textarea').inputValue()).toBe('The water was dry.');
    await page.evaluate("window.fallbackOptions.onSent('queued')");
    expect(await page.locator('.feedback-status').innerText()).toBe('Sent. Thank you.');
    expect(await page.evaluate("localStorage.getItem('hf-lab-feedback-name')")).toBe('Tester');
  } finally {
    await page.close();
  }
});
