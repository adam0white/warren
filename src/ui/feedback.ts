import { type Build, PRIVACY_URL } from '@adam0white/lab-client';

import { feedbackPersonaControl } from '@adam0white/lab-kit';

const NAME_KEY = 'hf-lab-feedback-name';
const RECORDING_OFF_KEY = 'hf-lab-recording-off';

/** The feedback surface accepts a lab stub without starting a live lab client. */
export type FeedbackLab = {
  readonly personaRecordingRequired?: boolean;
  readonly personaRecordingAllowed?: boolean;
  allowPersonaRecording?(allow: boolean): void;
  readonly telemetryOn?: boolean;
  readonly privacySignalOn: boolean;
  readonly privacyOverride: boolean;
  setTelemetryOff(off: boolean): void;
  sendFeedback(note: string, extra?: { name?: string; run?: unknown }): Promise<string>;
  sendRun(run: unknown, extra?: { note?: string; name?: string }): Promise<string>;
  openSendDialog(options: {
    getRun: () => unknown;
    name?: string;
    note?: string;
    onSent?: (id: string) => void;
  }): void;
  build(): Build;
};

function feedbackRun(getRun: () => unknown): unknown {
  try {
    return getRun();
  } catch {
    return undefined;
  }
}
function stored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function rememberName(name: string): void {
  try {
    if (name) localStorage.setItem(NAME_KEY, name);
    else localStorage.removeItem(NAME_KEY);
  } catch {
    // The send still works when the browser refuses local storage.
  }
}

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  text = '',
  className = '',
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.textContent = text;
  node.className = className;
  return node;
}

/** Mount Send word. The caller holds game time until onBack, and calls cleanup when replacing the host. */
export function openFeedback(
  host: HTMLElement,
  lab: FeedbackLab,
  getRun: () => unknown,
  download: () => void,
  onBack: () => void,
): () => void {
  const screen = element('section', '', 'feedback-screen');
  screen.setAttribute('aria-label', 'Send word');
  const body = element('div', '', 'feedback-body');
  body.append(
    element('h2', 'Send word'),
    element('p', "Your run, saves and log reach us on their own. Tell us what they can't show."),
  );

  let verdict = '';
  let pending = false;
  let sent = false;
  let active = true;
  const recordingOff = stored(RECORDING_OFF_KEY) === '1';
  const privacyConsentRequired = lab.privacySignalOn && !lab.privacyOverride;
  const verdicts = element('div', '', 'feedback-verdicts');
  verdicts.setAttribute('role', 'group');
  verdicts.setAttribute('aria-label', 'How was this run? Optional');
  for (const [label, value] of [
    ["I'd keep playing", 'keep'],
    ['Not sure', 'mixed'],
    ["I'd stop here", 'quit'],
  ] as const) {
    const chip = element('button', label, 'feedback-chip');
    chip.type = 'button';
    chip.setAttribute('aria-pressed', 'false');
    chip.addEventListener('click', () => {
      verdict = verdict === value ? '' : value;
      for (const other of verdicts.querySelectorAll('button')) {
        other.setAttribute('aria-pressed', String(other === chip && verdict === value));
      }
      updatePreview();
    });
    verdicts.append(chip);
  }
  const noteLabel = element('label', '', 'feedback-note');
  noteLabel.append(element('span', 'Your note (optional)'));
  const note = element('textarea');
  note.rows = 4;
  note.placeholder = 'What happened on the hill, what you wanted, what got in the way.';
  noteLabel.append(note);

  const nameDetails = element('details', '', 'feedback-name');
  nameDetails.append(element('summary', '+ Add a name or tester id'));
  const nameLabel = element('label');
  nameLabel.append(element('span', 'Your name or tester id'));
  const name = element('input');
  name.type = 'text';
  name.maxLength = 60;
  name.setAttribute('autocomplete', 'nickname');
  name.value = stored(NAME_KEY) ?? '';
  nameLabel.append(name);
  nameDetails.append(
    nameLabel,
    element(
      'p',
      'A name labels your linked play history on this device, past and future. Leave it empty to stay pseudonymous. It is remembered on this device after you send.',
    ),
  );
  if (name.value) nameDetails.open = true;

  const recording = element('div', '', 'feedback-recording');
  const recordingMessage = element(
    'p',
    'Recording is off. Your note and verdict can still be sent without a run or history linkage.',
  );
  recording.append(recordingMessage);
  recording.hidden = !recordingOff;

  if (privacyConsentRequired) {
    body.append(
      element(
        'p',
        'Your browser asks for privacy. Your note and verdict can still be sent without a run or history linkage.',
      ),
    );
  }

  const disclosure = element('details', '', 'feedback-disclosure');
  disclosure.append(element('summary', 'What is sent'));
  disclosure.append(
    element(
      'p',
      privacyConsentRequired
        ? 'Your verdict, note and optional name are sent without a run or linked player id.'
        : 'Your verdict, note and optional name are sent. Recording on includes this run and continuing character state. It is linked to recorded history only when you approve linkage.',
    ),
  );
  const versions = element('p');
  const preview = element('pre', '', 'feedback-preview');
  const privacy = element('a', 'Lab privacy');
  privacy.href = PRIVACY_URL;
  privacy.target = '_blank';
  privacy.rel = 'noopener noreferrer';
  disclosure.append(versions, preview, privacy);
  disclosure.addEventListener('toggle', updatePreview);
  name.addEventListener('input', updatePreview);
  note.addEventListener('input', updatePreview);

  const status = element('p', '', 'feedback-status');
  status.setAttribute('role', 'status');
  body.append(verdicts, noteLabel, nameDetails, recording, disclosure, status);
  if (lab.personaRecordingRequired && lab.allowPersonaRecording) {
    const choice = feedbackPersonaControl(lab as Parameters<typeof feedbackPersonaControl>[0]);
    if (choice) body.insertBefore(choice, disclosure);
  }
  const actions = element('div', '', 'feedback-actions');
  const copy = element('button', 'Keep a copy of this run', 'feedback-secondary');
  copy.type = 'button';
  copy.addEventListener('click', () => {
    try {
      download();
    } catch {
      status.textContent = 'The copy could not be downloaded. Your note is still here.';
    }
  });
  const back = element('button', 'Back to the game', 'feedback-secondary');
  back.type = 'button';
  back.addEventListener('click', onBack);
  const send = element('button', 'Send', 'feedback-primary');
  send.type = 'button';
  actions.append(copy, back, send);
  screen.append(body, actions);
  host.replaceChildren(screen);
  // A full-screen reading must not leave the covered hill in the keyboard path.
  const covered = new Map<HTMLElement, boolean>();
  let branch: HTMLElement = host;
  while (branch.parentElement && branch.parentElement !== document.body) {
    for (const sibling of branch.parentElement.children) {
      if (
        !(sibling instanceof HTMLElement) ||
        sibling === branch ||
        sibling.matches('.topbar, .info-popover')
      )
        continue;
      covered.set(sibling, sibling.inert);
      sibling.inert = true;
    }
    branch = branch.parentElement;
  }
  const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  note.focus();
  const keepFocus = (event: KeyboardEvent) => {
    if (event.key !== 'Tab' || document.querySelector('.hflab-veil')) return;
    const targets = [
      ...screen.querySelectorAll<HTMLElement>('button:not(:disabled), textarea, input, summary, a[href]'),
    ].filter((e) => !e.closest('[hidden]') && e.getClientRects().length > 0);
    const first = targets[0];
    const last = targets.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  };
  screen.addEventListener('keydown', keepFocus);

  function composedNote(): string {
    return [verdict ? `Verdict: ${verdict}` : '', note.value.trim()].filter(Boolean).join('\n\n');
  }

  function updatePreview(): void {
    if (!disclosure.open) return;
    const build = lab.build();
    versions.textContent = `The Warren ${build.a ?? 'unknown'} · HF ${build.hf ?? 'unknown'} · commit ${build.c ?? 'unknown'}`;
    const run = feedbackRun(getRun);
    const fields = run && typeof run === 'object' ? (run as Record<string, unknown>) : {};
    preview.textContent = JSON.stringify(
      {
        build,
        seed: fields.seed,
        fingerprint: fields.fingerprint,
        inputs: Array.isArray(fields.inputs) ? `${fields.inputs.length} recorded inputs` : undefined,
        note: composedNote(),
        name: name.value.trim() || undefined,
      },
      null,
      2,
    );
  }

  function updateSend(): void {
    send.disabled = !sent && pending;
    send.textContent = sent ? 'Back to the game' : pending ? 'Sending…' : 'Send';
  }

  function markSent(submittedName: string): void {
    rememberName(submittedName);
    if (!active) return;
    sent = true;
    pending = false;
    status.textContent =
      recordingOff || privacyConsentRequired
        ? 'Note queued without a run or history linkage. This is not a delivery receipt.'
        : 'Run and note queued. This is not a delivery receipt.';
    back.hidden = true;
    verdicts.hidden = true;
    noteLabel.hidden = true;
    nameDetails.hidden = true;
    recording.hidden = true;
    updateSend();
  }

  send.addEventListener('click', async () => {
    if (sent) {
      onBack();
      return;
    }
    if (send.disabled) return;
    pending = true;
    status.textContent = '';
    updateSend();
    const submittedName = name.value.trim();
    const submittedNote = composedNote();
    try {
      await lab.sendFeedback(submittedNote, {
        name: submittedName,
        run: feedbackRun(getRun),
      });
      markSent(submittedName);
    } catch {
      if (!active) return;
      status.textContent = 'The note could not be sent. Your note and name are still here. Try again.';
    } finally {
      if (active) {
        pending = false;
        updateSend();
      }
    }
  });
  updateSend();
  return () => {
    active = false;
    screen.removeEventListener('keydown', keepFocus);
    for (const [element, wasInert] of covered) element.inert = wasInert;
    screen.remove();
    if (previousFocus?.isConnected) previousFocus.focus();
  };
}
