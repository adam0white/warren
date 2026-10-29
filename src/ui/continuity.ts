/** The shelf transports validated HF projections. Loading a hill never refreshes its people. */
import {
  castForGame,
  type PersonaEnvelope,
  personaChannel,
  validatePersona,
  watchPersonaCheckpoint,
} from '@adam0white/lab-client';
import { adaWords } from '../sim/ada-care.ts';
import {
  act,
  fingerprint,
  type Game,
  load,
  type NextConfig,
  newGame,
  replay,
  type Saved,
} from '../sim/game.ts';
import type { NativeReturnId } from '../sim/native-return.ts';
import { lab } from './lab.ts';

const shelf = personaChannel();
let generation = 0;
let current: () => Game | null = () => null;
let persistAccepted: (game: Game) => Promise<boolean> = async () => true;
export let continuityStatus =
  'People across games are temporarily unavailable. A loaded hill keeps its saved people and history.';
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
  if (heads.some(([, head]) => head !== null)) {
    throw Error(
      'People across games are temporarily unavailable. Your shared records and current hill are unchanged.',
    );
  }
  const game = newGame(seed, edition, undefined, config);
  lab.setPersonaRecording(null);
  continuityStatus = 'People across games are temporarily unavailable. This hill stays on this device.';
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
  if (!current() || current()?.fileOrigin) return;
  continuityStatus = 'People across games are temporarily unavailable. Your shared records are unchanged.';
  const status = document.querySelector('[data-cast-status]');
  if (status) status.textContent = continuityStatus;
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
