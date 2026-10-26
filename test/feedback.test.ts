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
  await page.goto(`${url}?lab=1`);
  await page.evaluate(`(async () => {
    const {openFeedback} = await import('/src/ui/feedback.ts');
    if (${off}) localStorage.setItem('hf-lab-recording-off', '1');
    else localStorage.removeItem('hf-lab-recording-off');
    window.feedbackCalls = [];
    const calls = window.feedbackCalls;
    const lab = {
      privacySignalOn: ${privacy}, privacyOverride: false, telemetryOn: !${privacy} && !${off},
      setTelemetryOff: off => { calls.push(['off',off]); if (off) localStorage.setItem('hf-lab-recording-off','1'); else localStorage.removeItem('hf-lab-recording-off'); },
      sendFeedback: async (...args) => {calls.push(['feedback',...args]);return 'queued';},
      sendRun: async (...args) => {calls.push(['run',...args]); if (${failRun}) throw Error('offline');return 'queued';},
      openSendDialog: options => {window.fallbackOptions=options;calls.push(['fallback',options.name,options.note]);},
      build: () => ({a:'0.4.0',hf:'2.8.0',c:'test-commit'}),
    };
    window.testFeedbackLab = lab;
    window.reopenFeedback = () => openFeedback(document.body, lab, () => ({seed:7,inputs:[],state:{minute:10},fingerprint:'exact'}), () => calls.push(['download']), () => calls.push(['back']));
    window.reopenFeedback();
  })()`);
  return page;
}

it('sends a linked verdict and trimmed name, remembers the name, and keeps downloading available', async () => {
  const page = await mount();
  try {
    await page.getByRole('button', { name: 'I would keep playing', exact: true }).click();
    await page.locator('textarea').fill('The door was hard to place.');
    await page.locator('.feedback-name summary').click();
    await page.locator('.feedback-name input').fill('  Tester 7  ');
    await page.getByRole('button', { name: 'Keep a copy of this run' }).click();
    await page.locator('.feedback-primary').click();
    expect(await page.locator('.feedback-status').innerText()).toContain('Sent. Your note is stored.');
    expect(await page.evaluate('window.feedbackCalls')).toEqual([
      ['download'],
      [
        'feedback',
        'Verdict: keep\n\nThe door was hard to place.',
        {
          name: 'Tester 7',
          sharePlay: false,
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
      expect(await page.locator('.feedback-status').innerText()).toContain('Sent. Your note is stored.');
      expect(await page.evaluate('window.feedbackCalls')).toEqual([
        [
          'feedback',
          'QA feedback-fix',
          {
            name: '',
            sharePlay: false,
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

for (const checked of [false, true]) {
  it(`passes off-state share intent ${checked} at submit`, async () => {
    const page = await mount(true, true);
    try {
      const checkbox = page.getByRole('checkbox', {
        name: 'Share this run and my play with the lab',
        exact: true,
      });
      expect(await checkbox.isChecked()).toBe(false);
      if (checked) await checkbox.check();
      expect(await page.evaluate('window.feedbackCalls')).toEqual([]);
      await page.locator('.feedback-primary').click();
      expect(await page.evaluate('window.feedbackCalls[0][2].sharePlay')).toBe(checked);
    } finally {
      await page.close();
    }
  });
}

it.each([true, false])('reports stored only after acknowledgement (accepted=%s)', async (accepted) => {
  const page = await mount();
  try {
    await page.evaluate(`window.testFeedbackLab.sendFeedback = () => new Promise((resolve, reject) => {
      window.finishFeedback = () => ${accepted} ? resolve('stored') : reject(new Error('not stored'));
    });`);
    await page.locator('textarea').fill('Keep this note until it is stored.');
    await page.locator('.feedback-primary').click();
    expect(await page.locator('.feedback-status').innerText()).not.toContain('Sent.');
    expect(await page.locator('.feedback-primary').isDisabled()).toBe(true);
    expect(await page.locator('textarea').inputValue()).toBe('Keep this note until it is stored.');
    await page.evaluate('window.finishFeedback()');
    if (accepted) {
      await expect
        .poll(() => page.locator('.feedback-status').innerText())
        .toBe('Sent. Your note is stored.');
    } else {
      await expect.poll(() => page.locator('.feedback-status').innerText()).toContain('could not be sent');
      expect(await page.locator('.feedback-status').innerText()).not.toContain('Sent.');
      expect(await page.locator('textarea').inputValue()).toBe('Keep this note until it is stored.');
      expect(await page.locator('.feedback-primary').isEnabled()).toBe(true);
    }
  } finally {
    await page.close();
  }
});

it('keeps quiet choices local and sends the literal choice with the edited note only on Submit', async () => {
  const page = await mount(false, true);
  try {
    await page.locator('textarea').fill('I could not find the door.');
    await page.getByRole('button', { name: "I'm confused", exact: true }).click();
    expect(await page.evaluate('window.feedbackCalls')).toEqual([]);
    expect(await page.locator('textarea').inputValue()).toBe('I could not find the door.');
    await page.locator('.feedback-primary').click();
    const calls = (await page.evaluate('window.feedbackCalls')) as unknown[][];
    expect(calls).toHaveLength(1);
    expect(calls[0]?.[1]).toBe("I'm confused\n\nI could not find the door.");
    expect(calls[0]?.[2]).toMatchObject({ sharePlay: false });
  } finally {
    await page.close();
  }
});
