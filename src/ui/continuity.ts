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
import { act, fingerprint, type Game, load, newGame, replay, type Saved, stateJson } from '../sim/game.ts';
import { CAST_IDS } from '../sim/people.ts';
import { lab } from './lab.ts';

const shelf = personaChannel();
let generation = 0;
let busy = false;
let current: () => Game | null = () => null;
let persistAccepted: (game: Game) => Promise<boolean> = async () => true;
export let continuityStatus = 'Continuity is separate from recording. Loaded hills stay pinned.';
const stamps = () => ({
  game: 'warren',
  build: lab.build().c ?? 'local',
  engine: ENGINE_VERSION,
  rules: 'warren-0.6.0',
});
function gate() {
  generation++;
  if (current()?.chapter || current()?.fileOrigin || Object.keys(current()?.ownedHeads ?? {}).length)
    lab.setPersonaRecording(crypto.randomUUID());
}
export function attach(get: () => Game | null, persist: (game: Game) => Promise<boolean> = async () => true) {
  current = get;
  persistAccepted = persist;
  for (const event of ['hf-lab-preference', 'storage']) window.addEventListener(event, gate);
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
export function controls() {
  const provenance =
    current()
      ?.chapter?.inputs.map(
        (input) =>
          `<p>${esc(canonicalCast(input.parent.castId).name)} continues from ${esc(input.parent.source.game)}, build ${esc(input.parent.source.build)}. The admitted person and between-chapter outcomes stay pinned in this hill.</p>`,
      )
      .join('') ?? '';
  const care = current()?.s.adaVisit
    ? `<p>${esc(adaWords(current()!.s))}</p><button id="ada-care">Invite Kian to share grain, water and rest with Ada</button><button id="ada-end">End Kian’s optional refuge work</button>`
    : '';
  return `<details class="continuity"><summary>People between chapters</summary><label><input id="continuity" type="checkbox" ${shelf.enabled ? 'checked' : ''}> Continue people between games in this browser</label><p data-cast-status role="status">${esc(continuityStatus)}</p>${provenance}<p>Departure projects, injuries and duties can refuse a new chapter. Local play and export remain available. Kian requires the exact Watch assent, completed-care receipt and pending return duty. Onward Kian transfer is refused.</p>${care}<button id="local-fresh">Use fresh local play</button><label>Open current playtest file <input id="cast-file" type="file" accept="application/json"></label>${current() ? '<button id="checkpoint-cast">Save eligible people to the browser shelf</button><button id="record-history">Allow recording this continuing run</button>' : ''}<a href="https://human.adamwhite.work/lab/people/" target="_blank" rel="noopener">Inspect browser people</a></details>`;
}
export async function fresh(seed: number): Promise<Game> {
  const token = ++generation;
  await shelf.ready;
  const base = newGame(seed);
  if (!shelf.enabled) {
    lab.setPersonaRecording(null);
    return base;
  }
  lab.setPersonaRecording(crypto.randomUUID());
  const batch = await claimCastChapterBatch(
    shelf,
    castForGame('warren').map((c) => c.castId),
    stamps(),
    async (inputs) => {
      for (const input of inputs) {
        const index = base.s.people.findIndex((p) => CAST_IDS[p.id] === input.parent.castId);
        if (index < 0) throw new Error('No allocated role.');
        base.s.people[index] = admit(input, base.s.people[index]!);
        applyLife(base.s, input);
      }
      return stateJson(base.s);
    },
    { isCurrent: () => token === generation },
  );
  if (token !== generation) throw new Error('Run changed while preparing. Choose again.');
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
  const game = newGame(seed, '0.6.0', chapter);
  game.ownedHeads = Object.fromEntries(batch.claims.map((p) => [p.castId, p]));
  continuityStatus = `Pinned ${batch.inputs.length} continuing people; all six roles preflighted atomically. Recording remains local until explicitly allowed.`;
  return game;
}
export async function localLoad(saved: Saved): Promise<Game> {
  const token = ++generation;
  lab.setPersonaRecording(crypto.randomUUID());
  if (saved.ownedHeads)
    for (const [castId, p] of Object.entries(saved.ownedHeads)) {
      await validatePersona(p);
      if (p.castId !== castId) throw new Error('Invalid local ownership.');
    }
  const game = load(saved);
  if (token !== generation) throw new Error('Load replaced.');
  if (fingerprint(game.s) !== saved.fingerprint) throw new Error('Saved state fingerprint differs.');
  if (game.chapter || game.fileOrigin || Object.keys(game.ownedHeads ?? {}).length)
    lab.setPersonaRecording(crypto.randomUUID());
  else lab.setPersonaRecording(null);
  return game;
}
export async function fileLoad(file: File): Promise<Game> {
  const token = ++generation;
  lab.setPersonaRecording(crypto.randomUUID());
  if (file.size > 16 * 1024 * 1024) throw new Error('File exceeds local import limit.');
  const saved = JSON.parse(await file.text()) as Saved;
  if (saved.game !== '0.6.0') throw new Error('Older file. Start fresh.');
  if (saved.chapter) {
    const chapter = saved.chapter;
    if (
      chapter.inputs.length > 6 ||
      chapter.claims.length !== chapter.inputs.length ||
      new Set(chapter.inputs.map((input) => input.parent.castId)).size !== chapter.inputs.length
    )
      throw new Error('Invalid pinned cast collection.');
    const opening = newGame(saved.seed);
    for (const input of chapter.inputs) {
      await validatePersona(input.parent);
      const claim = chapter.claims.find((p) => p.castId === input.parent.castId);
      if (!claim || claim.parentRevision !== input.parent.revision) throw new Error('Invalid pinned claim.');
      await validatePersona(claim);
      if (
        claim.source.game !== 'warren' ||
        claim.source.rules !== 'warren-0.6.0' ||
        claim.source.engine !== ENGINE_VERSION
      )
        throw new Error('Unsupported pinned claim host.');
      const { revision: _revision, ...body } = input.parent;
      const expected = await createPersona({
        ...body,
        parentRevision: input.parent.revision,
        source: claim.source,
        transfer: { ...body.transfer, life: input.life },
      });
      if (expected.revision !== claim.revision)
        throw new Error('Pinned claim does not match its source branch and life.');
      const index = opening.s.people.findIndex((p) => CAST_IDS[p.id] === input.parent.castId);
      if (index < 0) throw new Error('Unallocated person.');
      opening.s.people[index] = admit(input, opening.s.people[index]!);
      applyLife(opening.s, input);
    }
    if (fingerprint(opening.s) !== fingerprint(chapter.initial))
      throw new Error('Pinned initial state differs from source admission.');
  }
  if (
    fingerprint(replay(saved.seed, saved.inputs, saved.minute, saved.game, saved.chapter).s) !==
    saved.fingerprint
  )
    throw new Error('File does not replay on this edition.');
  const game = load(saved);
  if (fingerprint(game.s) !== saved.fingerprint) throw new Error('File state differs from its replay.');
  if (token !== generation) throw new Error('File load replaced.');
  delete game.ownedHeads;
  game.fileOrigin = true;
  return game;
}
export async function checkpoint(): Promise<void> {
  const game = current();
  if (
    busy ||
    !game ||
    !shelf.enabled ||
    game.fileOrigin ||
    game.s.edition !== '0.6.0' ||
    game.s.minute <= 300
  )
    return;
  busy = true;
  const token = generation;
  try {
    for (const p of game.s.people) {
      const castId = CAST_IDS[p.id];
      if (!castId) continue;
      const parent = game.ownedHeads?.[castId];
      try {
        if (!p.body.alive) {
          if (parent && !parent.terminal) {
            const terminal = await closePersonaBranch(parent, stamps(), game.s.minute);
            if (token !== generation || current() !== game) return;
            await shelf.request({ action: 'put', envelope: terminal });
            if (token === generation && current() === game) {
              game.ownedHeads ??= {};
              game.ownedHeads[castId] = terminal;
              if (!(await persistAccepted(game)))
                throw new Error('Branch closed, but local ownership save failed. Export this hill now.');
            }
          }
          continue;
        }
        if (p.id === 'kian')
          throw new Error(
            'Onward Kian/Ada transfer is unsupported here. Keep the full care notebook and exact return duty.',
          );
        const captured = await project(p);
        if (new TextEncoder().encode(JSON.stringify(captured.raw)).length > 1024 * 1024)
          throw new Error('Source archive exceeds this host’s bound. Keep the full local export.');
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
          throw new Error('Shelf accepted, but local ownership save failed. Export this hill now.');
        continuityStatus = `Saved ${p.name} at a natural boundary. Other people may still be ineligible.`;
      } catch (error) {
        continuityStatus = `${p.name}: ${String(error)}`;
      }
    }
  } finally {
    busy = false;
    const status = document.querySelector('[data-cast-status]');
    if (status) status.textContent = continuityStatus;
  }
}
async function allowRecording() {
  const game = current();
  if (!game) return;
  const token = ++generation;
  const pinned = Object.values(game.ownedHeads ?? {});
  if (!pinned.length && game.chapter) pinned.push(...game.chapter.claims);
  lab.setPersonaRecording(crypto.randomUUID());
  if (game.fileOrigin) {
    if (current() === game && token === generation) lab.allowPersonaRecording(true);
    return;
  }
  if (!pinned.length) {
    lab.setPersonaRecording(null);
    return;
  }
  const revisions = pinned.map((p) => p.revision).join('/');
  const owns = () =>
    current() === game &&
    token === generation &&
    Object.values(game.ownedHeads ?? {})
      .map((p) => p.revision)
      .join('/') === revisions;
  const epoch = await shelf.request<{ recordingEpoch: string | null }>({
    action: 'recordingBatch',
    envelopes: pinned,
  });
  if (!owns()) return;
  await shelf.request({
    action: 'recordingBatch',
    envelopes: pinned,
    allowRecording: true,
    recordingEpoch: epoch.recordingEpoch ?? undefined,
  });
  if (owns()) lab.allowPersonaRecording(true);
}
export function bind(host: HTMLElement, onFile: (game: Game) => void) {
  host.querySelector('#continuity')?.addEventListener('change', (event) => {
    generation++;
    shelf.setEnabled((event.target as HTMLInputElement).checked);
    gate();
  });
  host.querySelector('#local-fresh')?.addEventListener('click', () => {
    generation++;
    lab.setPersonaRecording(crypto.randomUUID());
    shelf.setEnabled(false);
    continuityStatus = 'Continuity disabled. Begin starts a fresh local chapter.';
    const status = host.querySelector('.continuity p');
    if (status) status.textContent = continuityStatus;
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
        ? `${verb === 'care-ada' ? 'Invitation queued; the actual 30-minute care action must finish with grain/water and no threat. ' : ''}${adaWords(game.s)}`
        : 'This care/end choice is unavailable.';
      const status = host.querySelector('[data-cast-status]');
      if (status) status.textContent = continuityStatus;
      void persistAccepted(game);
    });
  host.querySelector('#checkpoint-cast')?.addEventListener('click', () => void checkpoint());
  host.querySelector('#record-history')?.addEventListener('click', () => {
    if (
      confirm(
        'Recording this continuing run can link it to earlier games. Allow recording all carried histories for this identity?',
      )
    )
      void allowRecording();
  });
  host.querySelector('#cast-file')?.addEventListener('change', (event) => {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file)
      void fileLoad(file)
        .then(onFile)
        .catch((error) => alert(String(error)));
  });
}
