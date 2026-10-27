import { type Build, FEEDBACK_LABELS, PRIVACY_URL } from '@adam0white/lab-client';

import { feedbackPersonaControl, feedbackSharePlay } from '@adam0white/lab-kit';

const NAME_KEY = 'hf-lab-feedback-name';

/** The feedback surface accepts a lab stub without starting a live lab client. */
export type FeedbackLab = {
  readonly personaRecordingRequired?: boolean;
  readonly personaRecordingAllowed?: boolean;
  allowPersonaRecording?(allow: boolean): void;
  readonly telemetryOn?: boolean;
  readonly privacySignalOn: boolean;
  readonly privacyOverride: boolean;
  setTelemetryOff(off: boolean): void;
  sendFeedback(note: string, extra?: { name?: string; run?: unknown; sharePlay?: boolean }): Promise<string>;
  sendRun(run: unknown, extra?: { note?: string; name?: string }): Promise<string>;
  openSendDialog(options: {
    getRun: () => unknown;
    name?: string;
    note?: string;
    onSent?: (id: string) => void;
  }): void;
  build(): Build;
};

function feedbackRun(getRun: () => unknown, linked: boolean): unknown {
  try {
    const run = getRun();
    if (linked || !run || typeof run !== 'object') return run;
    const unlinked = { ...run } as Record<string, unknown>;
    delete unlinked.ownedHeads;
    delete unlinked.nativeReturnHeads;
    delete unlinked.sourceArchives;
    return unlinked;
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

/** Mount Feedback. The caller holds game time until onBack, and calls cleanup when replacing the host. */
export function openFeedback(
  host: HTMLElement,
  lab: FeedbackLab,
  getRun: () => unknown,
  download: () => void,
  onBack: () => void,
  _chooseRecording?: (allow: boolean) => Promise<void>,
): () => void {
  const screen = element('section', '', 'feedback-screen');
  screen.setAttribute('aria-label', 'Feedback');
  const body = element('div', '', 'feedback-body');
  body.append(element('h2', 'Feedback'), element('p', 'Send a note about this game.'));

  let verdict = '';
  let quietChoice = '';
  let pending = false;
  let sent = false;
  let active = true;

  const verdicts = element('div', '', 'feedback-verdicts');
  verdicts.setAttribute('role', 'group');
  verdicts.setAttribute('aria-label', 'How was this game? Answering is optional.');
  for (const [label, value] of [
    ['I would keep playing', 'keep'],
    ['I am not sure', 'mixed'],
    ['I would stop here', 'quit'],
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
  const quiet = element('div', '', 'feedback-verdicts');
  quiet.setAttribute('role', 'group');
  quiet.setAttribute('aria-label', 'You can say why you opened Feedback. Answering is optional.');
  for (const label of Object.values(FEEDBACK_LABELS)) {
    const chip = element('button', label, 'feedback-chip');
    chip.type = 'button';
    chip.setAttribute('aria-pressed', 'false');
    chip.addEventListener('click', () => {
      quietChoice = quietChoice === label ? '' : label;
      for (const other of quiet.querySelectorAll('button'))
        other.setAttribute('aria-pressed', String(other === chip && quietChoice === label));
      updatePreview();
    });
    quiet.append(chip);
  }

  const noteLabel = element('label', '', 'feedback-note');
  noteLabel.append(element('span', 'Your note (optional)'));
  const note = element('textarea');
  note.rows = 4;
  note.placeholder = 'What happened? What did you want to do? What got in the way?';
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
      'This name labels your linked play history on this device, including past and future play. Leave it empty to use an unnamed identity. This device remembers the name after you send.',
    ),
  );
  if (name.value) nameDetails.open = true;

  const recording = element('div', '', 'feedback-recording');
  recording.hidden = true;

  const disclosure = element('details', '', 'feedback-disclosure');
  disclosure.append(element('summary', 'What is sent'));
  disclosure.append(
    element(
      'p',
      'If Recording is on or you choose to share your play, we include an available run and link play across games on this device. Otherwise, we send only your answer, note and optional name.',
    ),
  );

  const versions = element('p');
  const preview = element('pre', '', 'feedback-preview');
  const privacy = element('a', 'Lab privacy');
  privacy.href = PRIVACY_URL;
  privacy.target = '_blank';
  privacy.rel = 'noopener noreferrer';
  const debug = element('details', '', 'game-debug');
  debug.append(element('summary', 'Debug'), versions, preview);
  const footer = element('div', '', 'menu-footer');
  footer.append(privacy, debug);
  disclosure.addEventListener('toggle', updatePreview);
  debug.addEventListener('toggle', updatePreview);
  name.addEventListener('input', updatePreview);
  note.addEventListener('input', updatePreview);

  const status = element('p', '', 'feedback-status');
  status.setAttribute('role', 'status');
  body.append(verdicts, quiet, noteLabel, nameDetails, recording, disclosure, status);
  const choice = feedbackPersonaControl({ telemetryOn: lab.telemetryOn !== false });
  if (choice) body.insertBefore(choice, disclosure);
  const actions = element('div', '', 'feedback-actions');
  const copy = element('button', 'Keep a copy of this run', 'feedback-secondary');
  copy.type = 'button';
  debug.append(copy);
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
  const send = element('button', 'Submit', 'feedback-primary');
  send.type = 'button';
  actions.append(back, send);
  screen.append(body, actions, footer);
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
    ].filter((e) => !e.closest('[hidden]') && e.checkVisibility());
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
    return [quietChoice, verdict ? `Verdict: ${verdict}` : '', note.value.trim()]
      .filter(Boolean)
      .join('\n\n');
  }

  function updatePreview(): void {
    if (!debug.open) return;
    const build = lab.build();
    versions.textContent = `The Warren ${build.a ?? 'unknown'} · HF ${build.hf ?? 'unknown'} · commit ${build.c ?? 'unknown'}`;
    const run = feedbackRun(getRun, lab.personaRecordingAllowed === true);
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
    send.textContent = sent ? 'Back to the game' : pending ? 'Sending…' : 'Submit';
  }

  function markSent(submittedName: string): void {
    rememberName(submittedName);
    if (!active) return;
    sent = true;
    pending = false;
    status.textContent = 'Sent. Your note is stored.';
    back.hidden = true;
    verdicts.hidden = true;
    quiet.hidden = true;
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
      const sharePlay = feedbackSharePlay(choice);
      await lab.sendFeedback(submittedNote, {
        name: submittedName,
        run: feedbackRun(getRun, true),
        sharePlay,
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
