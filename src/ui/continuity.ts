import { validatePortablePerson } from '@adam0white/human-framework';
/** The shelf transports validated HF projections. Loading a hill never refreshes its people. */
import {
  canonicalCast,
  castForGame,
  claimPortablePerson,
  closePersonaBranch,
  createPersona,
  type PersonaEnvelope,
  personaChannel,
  portableWriteBlockers,
  validatePersona,
  watchPersonaCheckpoint,
} from '@adam0white/lab-client';
import { adaWords } from '../sim/ada-care.ts';
import { authoringFor, portableOf, project } from '../sim/cast.ts';
import {
  act,
  fingerprint,
  type Game,
  load,
  type NextConfig,
  newGame,
  replay,
  type Saved,
  stateJson,
} from '../sim/game.ts';
import { archiveOf, FRAMEWORK_VERSION } from '../sim/hf4.ts';
import type { NativeReturnId } from '../sim/native-return.ts';
import { CAST_IDS } from '../sim/people.ts';
import { lab } from './lab.ts';
import { sourceBuild } from './source-build.ts';

const shelf = personaChannel();
let generation = 0;
let busy = false;
let current: () => Game | null = () => null;
let persistAccepted: (game: Game) => Promise<boolean> = async () => true;
export let continuityStatus =
  'People can continue across games when their shared records are ready. A loaded hill keeps its saved people and history.';
const stamps = () => ({
  game: 'warren',
  build: sourceBuild(),
  engine: FRAMEWORK_VERSION,
  rules: 'warren-hf4-1',
});
const activeClaim = (p: PersonaEnvelope) => p.transfer.portableClaim !== undefined;
function unchanged(token: number) {
  if (token !== generation) throw Error('Another action replaced this hill.');
}
export function attach(get: () => Game | null, persist: (game: Game) => Promise<boolean> = async () => true) {
  current = get;
  persistAccepted = persist;
  window.addEventListener('storage', (event) => {
    if (event.key === null) generation++;
  });
  watchPersonaCheckpoint(checkpoint);
}
function esc(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
}
export function careControls() {
  return current()?.s.adaVisit
    ? `<section><p>${esc(adaWords(current()!.s))}</p><button id="ada-care">Invite Kian to share grain, water and rest with Ada</button><button id="ada-end">End Kian’s optional refuge work</button><p data-cast-status role="status"></p></section>`
    : '';
}
export function handoffControls(_who: string) {
  return '';
}
export function controls() {
  return `<p data-cast-status role="status">${esc(continuityStatus)}</p>`;
}
async function readyShelf(token: number) {
  await shelf.ready;
  unchanged(token);
  if (!shelf.enabled) {
    shelf.setEnabled(true);
    await shelf.ready;
  }
  unchanged(token);
}

export async function fresh(
  seed: number,
  edition: '0.6.0' | '0.7.0' = '0.7.0',
  config?: NextConfig,
): Promise<Game> {
  const token = ++generation;
  await readyShelf(token);
  const ids = castForGame('warren').map((cast) => cast.castId);
  const heads = await Promise.all(
    ids.map(
      async (castId) =>
        [castId, await shelf.request<PersonaEnvelope | null>({ action: 'get', castId })] as const,
    ),
  );
  unchanged(token);
  const incoming: PersonaEnvelope[] = [];
  const skipped = new Set<string>();
  for (const [id, head] of heads) {
    if (portableWriteBlockers(id, 'warren').length) {
      skipped.add(id);
      continue;
    }
    if (!head) continue;
    await validatePersona(head);
    // HF3 sources are kept on the shelf. A fresh story cannot overwrite them.
    if (!head.transfer.portable || head.terminal || activeClaim(head)) {
      skipped.add(id);
      continue;
    }
    // Profile-only v1 cannot preserve the person's retained history.
    // Validate before classifying it so malformed records still refuse.
    if (validatePortablePerson(head.transfer.portable).version === 1) {
      skipped.add(id);
      continue;
    }
    portableOf(head);
    incoming.push(head);
  }
  const base = newGame(seed, edition, undefined, config);
  const start = archiveOf(base.s).initial.spec.start;
  const game = incoming.length
    ? newGame(seed, edition, undefined, config, authoringFor(incoming, start))
    : base;
  const claims: PersonaEnvelope[] = [];
  for (const [castId, head] of heads) {
    if (skipped.has(castId)) continue;
    const who = Object.keys(CAST_IDS).find((id) => CAST_IDS[id] === castId);
    if (!who) throw Error('This continuing person has no role in the hill.');
    const transfer = head
      ? claimPortablePerson(head, 'warren')
      : { castPassport: 'warren-hf4-active/1', portableClaim: { game: 'warren' } };
    claims.push(
      await createPersona({
        format: 'hf-persona/1',
        castId,
        castRevision: canonicalCast(castId).revision,
        branchId: head?.branchId ?? crypto.randomUUID(),
        parentRevision: head?.revision ?? null,
        source: head?.source ?? stamps(),
        transfer,
        limitations: [
          'This person belongs to this hill until a current HF projection can be saved between activities.',
        ],
      }),
    );
  }
  unchanged(token);
  if (claims.length) {
    await shelf.request({
      action: 'putBatch',
      envelopes: claims,
      expectedHeads: Object.fromEntries(claims.map((claim) => [claim.castId, claim.parentRevision])),
    });
    unchanged(token);
  }
  if (incoming.length)
    game.chapter = { version: 'warren-hf4-cast/1', inputs: incoming, claims, initial: stateJson(game.s) };
  game.ownedHeads = Object.fromEntries(claims.map((head) => [head.castId, head]));
  lab.setPersonaRecording(claims.length ? crypto.randomUUID() : null);
  continuityStatus = skipped.size
    ? `Some people start a new story here while their shared records stay unchanged: ${[...skipped].map((id) => canonicalCast(id).name).join(', ')}.`
    : 'Available people continued automatically. This hill keeps their records until it can save a current checkpoint.';
  return game;
}
export async function localLoad(saved: Saved): Promise<Game> {
  const token = ++generation;
  const game = load(saved);
  for (const [castId, head] of Object.entries(game.ownedHeads ?? {})) {
    await validatePersona(head);
    if (head.castId !== castId) throw Error('The local permission record is invalid.');
  }
  unchanged(token);
  await readyShelf(token);
  lab.setPersonaRecording(Object.keys(game.ownedHeads ?? {}).length ? crypto.randomUUID() : null);
  return game;
}
export async function fileLoad(file: File): Promise<Game> {
  const token = ++generation;
  if (file.size > 256 * 1024 * 1024) throw Error('The file is too large to import on this device.');
  const saved = JSON.parse(await file.text()) as Saved;
  const game = load(saved);
  const recreated = replay(
    saved.seed,
    saved.inputs,
    saved.minute,
    saved.game,
    saved.chapter,
    saved.config,
    saved.phase,
  );
  if (fingerprint(recreated.s) !== saved.fingerprint || fingerprint(game.s) !== saved.fingerprint)
    throw Error('This file does not replay exactly on this version. Keep it and start a fresh hill.');
  unchanged(token);
  delete game.ownedHeads;
  delete game.nativeReturnHeads;
  game.fileOrigin = true;
  lab.setPersonaRecording(crypto.randomUUID());
  return game;
}
export async function checkpoint(): Promise<void> {
  const game = current();
  if (busy || !game || game.fileOrigin || !shelf.enabled) return;
  const token = generation;
  busy = true;
  try {
    for (const person of game.s.people) {
      const castId = CAST_IDS[person.id];
      const parent = castId && game.ownedHeads?.[castId];
      if (!castId || !parent || parent.terminal) continue;
      if (portableWriteBlockers(castId, 'warren').length) {
        continuityStatus = `${person.name}: shared history is read-only until the other games are ready.`;
        continue;
      }
      try {
        const captured = person.body.alive ? await project(game.s, person.id) : undefined;
        const envelope = captured
          ? await createPersona({
              format: 'hf-persona/1',
              castId,
              castRevision: canonicalCast(castId).revision,
              branchId: parent.branchId,
              parentRevision: parent.revision,
              source: stamps(),
              transfer: captured.transfer,
              limitations: [
                'HF retains supported history and duties. The receiving game validates its own calendar and references.',
              ],
            })
          : await closePersonaBranch(parent, stamps(), game.s.minute * 60_000);
        unchanged(token);
        if (current() !== game) return;
        await shelf.request({
          action: 'putBatch',
          envelopes: [envelope],
          expectedHeads: { [castId]: parent.revision },
        });
        // Preserve a successful shelf receipt even if saving this device subsequently fails.
        game.ownedHeads![castId] = envelope;
        if (!(await persistAccepted(game)))
          throw Error(
            'The shared record was saved, but this device could not save its receipt. Export this hill now.',
          );
        unchanged(token);
        if (current() !== game) return;
        continuityStatus = `Saved ${person.name} between activities. The receiving game still checks their history and responsibilities.`;
      } catch (error) {
        continuityStatus = `${person.name}: ${String(error)}`;
      }
    }
  } finally {
    busy = false;
    const status = document.querySelector('[data-cast-status]');
    if (status) status.textContent = continuityStatus;
  }
}
export async function checkpointNative(_who: NativeReturnId, _alternative = false): Promise<void> {
  throw Error(
    'This HF4 hill cannot make an older Watch handoff. Keep the notebook. Supported people continue through the browser shelf.',
  );
}
export async function chooseContinuityRecording(_allow: boolean) {
  lab.allowPersonaRecording(true);
}
export function bind(host: HTMLElement) {
  for (const [id, verb] of [
    ['ada-care', 'care-ada'],
    ['ada-end', 'end-ada-visit'],
  ] as const)
    host.querySelector(`#${id}`)?.addEventListener('click', () => {
      const game = current();
      if (!game) return;
      continuityStatus = act(game, { verb })
        ? adaWords(game.s)
        : 'You cannot choose care or end the visit now.';
      const status = host.querySelector('[data-cast-status]');
      if (status) status.textContent = continuityStatus;
      void persistAccepted(game);
    });
}
