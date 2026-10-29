/** In-memory shelf protocol controls; these do not establish a browser journey. */
import {
  acceptPersona,
  canonicalCast,
  createPersona,
  type PersonaRequest,
  type PersonaShelfState,
} from '@adam0white/lab-client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fingerprint, newGame, save } from '../src/sim/game.ts';
import { advanceFrame } from '../src/sim/warren.ts';

const mock = vi.hoisted(() => ({
  enabled: false,
  ready: Promise.resolve(true),
  requests: [] as PersonaRequest[],
  handle: null as null | ((r: PersonaRequest) => Promise<unknown>),
}));
vi.mock('../src/ui/lab.ts', () => ({
  lab: { setPersonaRecording: vi.fn(), allowPersonaRecording: vi.fn() },
}));
vi.mock('@adam0white/lab-client', async (original) => ({
  ...(await original<typeof import('@adam0white/lab-client')>()),
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
}));

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
  mock.enabled = false;
  mock.ready = Promise.resolve(true);
  mock.requests = [];
  mock.handle = async (r) => {
    if (r.action === 'get')
      return state.revisions.find((p) => p.revision === state.heads[r.castId ?? '']) ?? null;
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
  it('refuses a new hill when a shared record exists and leaves that record intact', async () => {
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
    await expect(fresh(7)).rejects.toThrow(/shared records and current hill are unchanged/);
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
    await checkpoint();
    expect(state.heads[castId]).toBe(head.revision);
    expect(mock.requests.some((request) => request.action === 'putBatch')).toBe(false);
    expect(continuityStatus).toContain('temporarily unavailable');
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
