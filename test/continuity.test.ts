/** In-memory shelf protocol controls; these do not establish a browser journey. */
import {
  acceptPersona,
  acceptPersonaBatch,
  canonicalCast,
  createPersona,
  type PersonaRequest,
  type PersonaShelfState,
} from '@adam0white/lab-client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fingerprint, newGame, save } from '../src/sim/game.ts';
import { advanceFrame } from '../src/sim/warren.ts';

const mock = vi.hoisted(() => ({
  eligible: '',
  enabled: false,
  ready: Promise.resolve(true),
  requests: [] as PersonaRequest[],
  handle: null as null | ((r: PersonaRequest) => Promise<unknown>),
}));
vi.mock('../src/ui/lab.ts', () => ({
  lab: { setPersonaRecording: vi.fn(), allowPersonaRecording: vi.fn() },
}));
vi.mock('@adam0white/lab-client', async (original) => {
  const sdk = await original<typeof import('@adam0white/lab-client')>();
  return {
    ...sdk,
    portableWriteBlockers: (castId: string, game: string) =>
      castId === mock.eligible ? [] : sdk.portableWriteBlockers(castId, game),
    personaChannel: () => ({
      get enabled() {
        return mock.enabled;
      },
      get ready() {
        return mock.ready;
      },
      setEnabled(v: boolean) {
        mock.enabled = v;
      },
      async request(r: PersonaRequest) {
        mock.requests.push(r);
        return mock.handle?.(r);
      },
    }),
    watchPersonaCheckpoint: () => () => {},
  };
});

import {
  attach,
  checkpoint,
  checkpointNative,
  continuityStatus,
  fileLoad,
  fresh,
  localLoad,
} from '../src/ui/continuity.ts';

let state: PersonaShelfState;
let current: ReturnType<typeof newGame> | null;
beforeEach(() => {
  state = { heads: {}, revisions: [] };
  current = null;
  mock.eligible = '';
  mock.enabled = false;
  mock.ready = Promise.resolve(true);
  mock.requests = [];
  mock.handle = async (r) => {
    if (r.action === 'get')
      return state.revisions.find((p) => p.revision === state.heads[r.castId ?? '']) ?? null;
    if (r.action === 'putBatch') state = acceptPersonaBatch(state, r.envelopes ?? [], r.expectedHeads);
    return null;
  };
  vi.stubGlobal('window', { addEventListener() {} });
  vi.stubGlobal('document', { querySelector: () => null });
  attach(() => current);
});
const file = (value: unknown) => ({ size: 100, text: async () => JSON.stringify(value) }) as File;
describe('HF4 shelf ownership', () => {
  it('starts a local hill without making shared claims while shared writes are unavailable', async () => {
    current = await fresh(7, '0.7.0', 'warren-rest/1');
    expect(mock.requests.some((request) => request.action === 'putBatch')).toBe(false);
    expect(Object.keys(current.ownedHeads ?? {})).toHaveLength(0);
  });
  it('claims only an eligible person using the real shelf CAS while skipping blocked peers', async () => {
    mock.eligible = 'hf.cast.yusuf.warren';
    current = await fresh(7);
    const batch = mock.requests.find((request) => request.action === 'putBatch');
    expect(batch?.envelopes?.map((person) => person.castId)).toEqual([mock.eligible]);
    expect(state.heads[mock.eligible]).toBeTruthy();
    expect(Object.keys(current.ownedHeads ?? {})).toEqual([mock.eligible]);
    expect(continuityStatus).toContain('Meryem');
  });
  it('skips a blocked shared person and leaves their record intact', async () => {
    const castId = 'hf.cast.meryem.warren';
    const head = await createPersona({
      format: 'hf-persona/1',
      castId,
      castRevision: canonicalCast(castId).revision,
      branchId: 'existing',
      parentRevision: null,
      source: { game: 'warren', build: 'test', engine: '4.7.0', rules: 'test' },
      transfer: {},
      limitations: [],
    });
    state = acceptPersona(state, head);
    current = await fresh(7);
    expect(continuityStatus).toContain('Meryem');
    expect(current.ownedHeads?.[castId]).toBeUndefined();
    expect(state.heads[castId]).toBe(head.revision);
    expect(mock.requests.some((request) => request.action === 'putBatch')).toBe(false);
  });
  it('does not publish a retained owned head during a checkpoint', async () => {
    const castId = 'hf.cast.meryem.warren';
    const head = await createPersona({
      format: 'hf-persona/1',
      castId,
      castRevision: canonicalCast(castId).revision,
      branchId: 'existing',
      parentRevision: null,
      source: { game: 'warren', build: 'test', engine: '4.7.0', rules: 'test' },
      transfer: {},
      limitations: [],
    });
    state = acceptPersona(state, head);
    current = newGame(7);
    current.ownedHeads = { [castId]: head };
    mock.enabled = true;
    await checkpoint();
    expect(state.heads[castId]).toBe(head.revision);
    expect(mock.requests.some((request) => request.action === 'putBatch')).toBe(false);
    expect(continuityStatus).toContain('read-only');
    const person = current.s.people.find((entry) => entry.id === 'meryem');
    if (!person) throw Error('Missing Meryem');
    person.body.alive = false;
    await checkpoint();
    expect(state.heads[castId]).toBe(head.revision);
    expect(mock.requests.some((request) => request.action === 'putBatch')).toBe(false);
  });
  it('strips publication authority on file import and retains file origin through local reload', async () => {
    current = await fresh(7, '0.7.0', 'warren-rest/1');
    const imported = await fileLoad(file(save(current)));
    expect(imported.ownedHeads).toBeUndefined();
    expect(imported.fileOrigin).toBe(true);
    current = await localLoad(save(imported));
    const before = state;
    await checkpoint();
    expect(state).toBe(before);
    await expect(checkpointNative('kian')).rejects.toThrow(/older Watch/);
  });
  it('replays an exported partial frame and strips its publication authority', async () => {
    current = await fresh(7, '0.7.0', 'warren-rest/1');
    advanceFrame(current.s, 0);
    const saved = save(current);
    expect(saved.phase).toBeDefined();
    const imported = await fileLoad(file(saved));
    expect(fingerprint(imported.s)).toBe(saved.fingerprint);
    expect(imported.ownedHeads).toBeUndefined();
  });
  it('does not return a deferred import after a fresh hill supersedes it', async () => {
    const saved = save(newGame(7));
    let release: (s: string) => void = () => {};
    const pending = fileLoad({
      size: 100,
      text: () =>
        new Promise<string>((resolve) => {
          release = resolve;
        }),
    } as File);
    await fresh(8, '0.7.0', 'warren-rest/1');
    release(JSON.stringify(saved));
    await expect(pending).rejects.toThrow(/replaced/);
  });
});
