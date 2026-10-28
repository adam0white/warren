/** Browser continuity owns no simulation clock. Loaded chapters never consult newer shelf heads. */
import { ENGINE_VERSION } from '@adam0white/human-framework';
import {
  anchorPersonaLife,
  canonicalCast,
  castForGame,
  claimCastChapterBatch,
  closePersonaBranch,
  createPersona,
  initialPersonaLife,
  type PersonaEnvelope,
  type PersonaLife,
  personaChannel,
  validatePersona,
  watchPersonaCheckpoint,
} from '@adam0white/lab-client';
import { adaWords } from '../sim/ada-care.ts';
import { admit, applyLife, project } from '../sim/cast.ts';
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
  TEXT_VERSION,
} from '../sim/game.ts';
import { type NativeReturnId, nativeReturnCurrent, projectNativeReturn } from '../sim/native-return.ts';
import { CAST_IDS } from '../sim/people.ts';
import { lab } from './lab.ts';
import { sourceBuild } from './source-build.ts';

const shelf = personaChannel();
let generation = 0;
let busy = false;
let current: () => Game | null = () => null;
let persistAccepted: (game: Game) => Promise<boolean> = async () => true;
export let continuityStatus =
  'People can continue between games separately from play recording. A loaded hill keeps the people and history saved in it.';
const ruleStamp = (edition: string, config?: NextConfig) =>
  `warren-${edition}${config === 'warren-rest/1' ? '-rest1' : config === 'warren-next/2' ? '-next2' : config ? '-next1' : ''}`;
const stamps = (edition?: string, config?: NextConfig) => ({
  game: 'warren',
  build: sourceBuild(),
  engine: ENGINE_VERSION,
  rules: ruleStamp(
    edition ?? current()?.s.edition ?? '0.6.0',
    edition === undefined ? current()?.s.next?.config : config,
  ),
});
function gate() {
  generation++;
  if (current()?.chapter || current()?.fileOrigin || Object.keys(current()?.ownedHeads ?? {}).length)
    lab.setPersonaRecording(crypto.randomUUID());
}
export function attach(get: () => Game | null, persist: (game: Game) => Promise<boolean> = async () => true) {
  current = get;
  persistAccepted = persist;
  window.addEventListener('storage', (event) => {
    if (
      event.key === null ||
      (!event.key.startsWith('hf-lab-') && !event.key.startsWith('hf-persona-recording:'))
    )
      gate();
  });
  watchPersonaCheckpoint(async () => {
    await checkpoint();
  });
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
/** A Watch departure is a game action; shelf experiments remain central. */
export function handoffControls(who: string) {
  if (!['kian', 'meryem'].includes(who)) return '';
  return `<details data-native-person="${who}"><summary>Return to Watch</summary><p>Preparing ends only this person’s optional refuge work and runs ordinary play for up to ten game hours to find a quiet time to save. Duties and care still apply. Saving can refuse an unfinished or unsupported source. An imported file gains no permission to update shared history.</p><button id="native-prepare">Prepare this person’s Watch handoff</button><button id="native-save">Save this owned Watch checkpoint</button><p data-cast-status role="status">${esc(continuityStatus)}</p></details>`;
}
/** Diagnostics never change cast ownership. Cast experiments live on the central shelf. */
export function controls() {
  return `<p data-cast-status role="status">${esc(continuityStatus)}</p>`;
}
async function readyShelf(token: number) {
  await shelf.ready;
  if (token !== generation) throw new Error('Another action replaced this hill.');
  if (!shelf.enabled) {
    shelf.setEnabled(true);
    await shelf.ready;
  }
  if (token !== generation) throw new Error('Another action replaced this hill.');
}
export async function fresh(
  seed: number,
  edition: '0.6.0' | '0.7.0' = '0.6.0',
  config?: NextConfig,
): Promise<Game> {
  const token = ++generation;
  await readyShelf(token);
  const base = newGame(seed, edition, undefined, config);
  lab.setPersonaRecording(crypto.randomUUID());
  const batch = await claimCastChapterBatch(
    shelf,
    castForGame('warren').map((c) => c.castId),
    stamps(edition, config),
    async (inputs) => {
      for (const input of inputs) {
        const index = base.s.people.findIndex((p) => CAST_IDS[p.id] === input.parent.castId);
        if (index < 0) throw new Error('There is no available role for this person.');
        base.s.people[index] = admit(input, base.s.people[index]!);
        applyLife(base.s, input);
      }
      return stateJson(base.s);
    },
    { isCurrent: () => token === generation },
  );
  if (token !== generation) throw new Error('The game changed during preparation. Choose again.');
  if (!batch) {
    lab.setPersonaRecording(null);
    return base;
  }
  const chapter = {
    version: 'warren-cast/2' as const,
    inputs: batch.inputs,
    claims: batch.claims,
    initial: batch.initial,
  };
  const game = newGame(seed, edition, chapter, config);
  game.ownedHeads = Object.fromEntries(batch.claims.map((p) => [p.castId, p]));
  continuityStatus = `This hill now keeps the saved records for ${batch.inputs.length} continuing ${batch.inputs.length === 1 ? 'person' : 'people'}. All six roles were checked together. Recording stays on this device until you allow sharing.`;
  return game;
}
export async function localLoad(saved: Saved): Promise<Game> {
  const token = ++generation;
  lab.setPersonaRecording(crypto.randomUUID());
  await readyShelf(token);
  if (saved.ownedHeads)
    for (const [castId, p] of Object.entries(saved.ownedHeads)) {
      await validatePersona(p);
      if (p.castId !== castId) throw new Error('The local permission record is invalid.');
    }
  for (const [castId, p] of Object.entries(saved.nativeReturnHeads ?? {})) {
    await validatePersona(p);
    if (p.castId !== castId || ![CAST_IDS.kian, CAST_IDS.meryem].includes(castId))
      throw Error('The permission record for the selected Watch handoff is invalid.');
  }
  const game = load(saved);
  if (token !== generation) throw new Error('Another action replaced this load.');
  if (fingerprint(game.s) !== saved.fingerprint)
    throw new Error('The saved state does not match its verification code.');
  if (game.chapter || game.fileOrigin || Object.keys(game.ownedHeads ?? {}).length)
    lab.setPersonaRecording(crypto.randomUUID());
  else lab.setPersonaRecording(null);
  return game;
}
export async function fileLoad(file: File): Promise<Game> {
  const token = ++generation;
  lab.setPersonaRecording(crypto.randomUUID());
  if (file.size > 16 * 1024 * 1024) throw new Error('The file is too large to import on this device.');
  const saved = JSON.parse(await file.text()) as Saved;
  if (saved.textVersion !== TEXT_VERSION)
    throw new Error('This file uses a different version. Start a new game.');
  if (saved.game !== '0.6.0' && saved.game !== '0.7.0')
    throw new Error('This file uses an older version. Start a new game.');
  if (saved.chapter) {
    const chapter = saved.chapter;
    if (
      chapter.inputs.length > 6 ||
      chapter.claims.length !== chapter.inputs.length ||
      new Set(chapter.inputs.map((input) => input.parent.castId)).size !== chapter.inputs.length
    )
      throw new Error('The saved group of continuing people is invalid.');
    const opening = newGame(saved.seed, saved.game, undefined, saved.config);
    for (const input of chapter.inputs) {
      await validatePersona(input.parent);
      const claim = chapter.claims.find((p) => p.castId === input.parent.castId);
      if (!claim || claim.parentRevision !== input.parent.revision)
        throw new Error('The saved permission record is invalid.');
      await validatePersona(claim);
      if (
        claim.source.game !== 'warren' ||
        claim.source.rules !== ruleStamp(saved.game, saved.config) ||
        (claim.source.engine !== ENGINE_VERSION &&
          claim.source.engine !== '2.17.0' &&
          claim.source.engine !== '2.21.0')
      )
        throw new Error('This saved permission record comes from an unsupported game, ruleset or engine.');
      const { revision: _revision, ...body } = input.parent;
      const expected = await createPersona({
        ...body,
        parentRevision: input.parent.revision,
        source: claim.source,
        transfer: { ...body.transfer, life: input.life },
      });
      if (expected.revision !== claim.revision)
        throw new Error('The saved permission record does not match the person’s source history and life.');
      const index = opening.s.people.findIndex((p) => CAST_IDS[p.id] === input.parent.castId);
      if (index < 0) throw new Error('There is no available role for this person.');
      opening.s.people[index] = admit(input, opening.s.people[index]!);
      applyLife(opening.s, input);
    }
    if (fingerprint(opening.s) !== fingerprint(chapter.initial))
      throw new Error('The saved starting state does not match the people who were admitted.');
  }
  if (
    fingerprint(replay(saved.seed, saved.inputs, saved.minute, saved.game, saved.chapter, saved.config).s) !==
    saved.fingerprint
  )
    throw new Error(
      'This file does not replay the same way in this version. It may come from an older version. Start a new game.',
    );
  const game = load(saved);
  if (fingerprint(game.s) !== saved.fingerprint)
    throw new Error('The file’s state does not match the state reproduced from its recorded actions.');
  if (token !== generation) throw new Error('Another action replaced this file load.');
  delete game.ownedHeads;
  delete game.nativeReturnHeads;
  game.fileOrigin = true;
  return game;
}
export async function checkpoint(): Promise<void> {
  const game = current();
  if (
    busy ||
    !game ||
    !shelf.enabled ||
    (game.s.edition !== '0.6.0' && game.s.edition !== '0.7.0') ||
    game.s.minute <= 300
  )
    return;
  busy = true;
  const token = generation;
  try {
    for (const p of game.s.people) {
      const castId = CAST_IDS[p.id];
      if (!castId) continue;
      const parent = game.fileOrigin ? game.nativeReturnHeads?.[castId] : game.ownedHeads?.[castId];
      if (game.fileOrigin && !parent) continue;
      let publishing = false;
      try {
        if (!p.body.alive) {
          if (parent && !parent.terminal) {
            const terminal = await closePersonaBranch(parent, stamps(), game.s.minute);
            if (token !== generation || current() !== game) return;
            publishing = true;
            await shelf.request({ action: 'put', envelope: terminal });
            if (token === generation && current() === game) {
              if (!game.fileOrigin) {
                game.ownedHeads ??= {};
                game.ownedHeads[castId] = terminal;
              }
              if (game.nativeReturnHeads?.[castId]) game.nativeReturnHeads[castId] = terminal;
              if (!(await persistAccepted(game)))
                throw new Error(
                  'This history has ended, but its permission record could not be saved on this device. Export this hill now.',
                );
            }
          }
          continue;
        }
        if (game.fileOrigin) continue; // Only explicit selected native receipts can close; imports cannot publish life.
        if (p.id === 'kian')
          throw new Error(
            'Use the selected Watch handoff for Kian and Ada. Other transfers are not supported. Keep the full care notebook and the exact duty to return.',
          );
        const captured = await project(p);
        if (new TextEncoder().encode(JSON.stringify(captured.raw)).length > 1024 * 1024)
          throw new Error(
            'The source archive is too large for this game to store. Keep the full local export.',
          );
        if (token !== generation || current() !== game) return;
        const branchId = parent?.branchId ?? crypto.randomUUID();
        const life = parent?.transfer.life
          ? anchorPersonaLife(parent.transfer.life as PersonaLife, castId, Date.now())
          : initialPersonaLife(castId, branchId, Date.now());
        const envelope = await createPersona({
          format: 'hf-persona/1',
          castId,
          castRevision: canonicalCast(castId).revision,
          branchId,
          parentRevision: parent?.revision ?? null,
          source: stamps(),
          transfer: { ...captured.transfer, life },
          limitations: captured.transfer.person.person.limitations,
        });
        if (token !== generation || current() !== game) return;
        // No authored association is inferred from a save, imported chapter, or a fresh branch.
        publishing = true;
        await shelf.request({ action: 'put', envelope });
        if (token !== generation || current() !== game) return;
        game.ownedHeads ??= {};
        game.ownedHeads[castId] = envelope;
        game.sourceArchives ??= {};
        game.sourceArchives[envelope.revision] = captured.raw;
        while (JSON.stringify(game.sourceArchives).length > 1024 * 1024) {
          const first = Object.keys(game.sourceArchives)[0];
          if (!first) break;
          delete game.sourceArchives[first];
        }
        if (!(await persistAccepted(game)))
          throw new Error(
            'The browser’s shared history accepted the record, but its permission record could not be saved locally. Export this hill now.',
          );
        continuityStatus = `Saved ${p.name} at a pause between activities. Other people may still be unable to continue in another game.`;
      } catch (error) {
        continuityStatus = `${p.name}: ${String(error)}`;
        if (publishing) {
          console.error('Warren shared history could not be confirmed', error);
          if (typeof CustomEvent === 'function')
            window.dispatchEvent?.(new CustomEvent('warren-history-error', { detail: game }));
        }
      }
    }
  } finally {
    busy = false;
    const status = document.querySelector('[data-cast-status]');
    if (status) status.textContent = continuityStatus;
  }
}
/** Selected native publication only. A file never inherits its embedded ownership receipts. */
export async function checkpointNative(who: NativeReturnId, alternative = false): Promise<void> {
  const game = current(),
    castId = CAST_IDS[who];
  if (busy || !game || !castId || !['kian', 'meryem'].includes(who) || !shelf.enabled)
    throw Error('The browser shelf is unavailable or another action is saving. Try again when it is ready.');
  const parent =
    game.nativeReturnHeads?.[castId] ?? (!game.fileOrigin ? game.ownedHeads?.[castId] : undefined);
  if (!alternative && !parent)
    throw Error(
      'This game has no local permission to update this person’s shared history. Inspect their history on the central browser shelf.',
    );
  const token = generation,
    departure = game.s.nativeDepartures?.[who];
  const stillCurrent = () =>
    token === generation &&
    current() === game &&
    game.s.nativeDepartures?.[who] === departure &&
    nativeReturnCurrent(game.s, who);
  busy = true;
  try {
    const prior = await shelf.request<PersonaEnvelope | null>({ action: 'get', castId });
    if (!stillCurrent()) throw Error('The game or the prepared person’s state has changed.');
    if (!alternative && prior?.revision !== parent?.revision)
      throw Error(
        'The latest shared record has changed. Keep this source or start a new history for the selected person.',
      );
    const captured = await projectNativeReturn(game.s, who);
    const branchId = alternative ? crypto.randomUUID() : parent!.branchId;
    const life =
      !alternative && parent?.transfer.life
        ? anchorPersonaLife(parent.transfer.life as PersonaLife, castId, Date.now())
        : initialPersonaLife(castId, branchId, Date.now());
    const envelope = await createPersona({
      format: 'hf-persona/1',
      castId,
      castRevision: canonicalCast(castId).revision,
      branchId,
      parentRevision: alternative ? null : parent!.revision,
      source: stamps(),
      transfer: { ...captured.transfer, life },
      limitations: captured.transfer.person.person.limitations,
    });
    const latest = await shelf.request<PersonaEnvelope | null>({ action: 'get', castId });
    if (!stillCurrent()) throw Error('The game or the prepared person’s state has changed.');
    if (latest?.revision !== prior?.revision)
      throw Error('The latest shared record changed during preparation. The game did not try again.');
    // Explicit fork API has no expected-prior-head condition. Cooperating shared-browser lease is required.
    await shelf.request({ action: 'put', envelope, ...(alternative ? { fork: true } : {}) });
    if (!stillCurrent())
      throw Error(
        'The browser’s shared history may have accepted the record, but the game has changed. Inspect the latest shared record before trying to recover.',
      );
    game.nativeReturnHeads ??= {};
    game.nativeReturnHeads[castId] = envelope;
    if (!game.fileOrigin) {
      game.ownedHeads ??= {};
      game.ownedHeads[castId] = envelope;
    }
    game.sourceArchives ??= {};
    game.sourceArchives[envelope.revision] = {
      person: captured.raw,
      ...(captured.transfer.warrenCare ? { warrenCare: captured.transfer.warrenCare } : {}),
    };
    if (!(await persistAccepted(game)))
      throw Error(
        'The browser’s shared history accepted the record, but the local receipt could not be saved. Export now.',
      );
    continuityStatus = `Saved the Watch handoff for ${who} at the recorded game minute ${captured.raw.now}${alternative ? ' as a new history. Earlier history is kept' : ''}. No travel or return is marked complete.`;
  } finally {
    busy = false;
  }
}
export async function chooseContinuityRecording(_allow: boolean) {
  lab.allowPersonaRecording(true);
}
export function bind(host: HTMLElement) {
  const selected = () =>
    host.querySelector<HTMLElement>('[data-native-person]')?.dataset.nativePerson as NativeReturnId;
  const status = () => {
    const el = host.querySelector('[data-cast-status]');
    if (el) el.textContent = continuityStatus;
  };
  host.querySelector('#native-prepare')?.addEventListener('click', () => {
    const game = current(),
      who = selected();
    if (!game || !['kian', 'meryem'].includes(who)) return;
    continuityStatus = act(game, { verb: 'prepare-native-return', who })
      ? game.s.nativeDepartures?.[who]
        ? `Prepared ${who} through ordinary play. Saving checks the person’s current body, projects and duties. It still refuses an unfinished or unsupported source.`
        : 'No quiet time to save was found during the allowed ordinary play. Continue playing or keep this notebook. No activity was removed.'
      : 'This person cannot prepare the supported Watch handoff now.';
    void persistAccepted(game);
    status();
  });
  host.querySelector('#native-save')?.addEventListener('click', async () => {
    try {
      await checkpointNative(selected());
    } catch (error) {
      continuityStatus = String(error);
    }
    status();
  });
  for (const [id, verb] of [
    ['ada-care', 'care-ada'],
    ['ada-end', 'end-ada-visit'],
  ] as const)
    host.querySelector(`#${id}`)?.addEventListener('click', () => {
      const game = current();
      if (!game) return;
      const ok = act(game, { verb });
      continuityStatus = ok
        ? `${verb === 'care-ada' ? 'The invitation is waiting. The 30-minute care action must finish with grain and water available and no threat. ' : ''}${adaWords(game.s)}`
        : 'You cannot choose care or end the visit now.';
      const status = host.querySelector('[data-cast-status]');
      if (status) status.textContent = continuityStatus;
      void persistAccepted(game);
    });
}
