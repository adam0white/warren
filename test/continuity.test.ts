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
import { project } from '../src/sim/cast.ts';
import { act, advance, fingerprint, newGame, save } from '../src/sim/game.ts';
import { FRAMEWORK_VERSION } from '../src/sim/hf4.ts';
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
    if (r.action === 'putBatch') state = acceptPersonaBatch(state, r.envelopes ?? [], r.expectedHeads);
    return null;
  };
  vi.stubGlobal('window', { addEventListener() {} });
  vi.stubGlobal('document', { querySelector: () => null });
  attach(() => current);
});
const file = (value: unknown) => ({ size: 100, text: async () => JSON.stringify(value) }) as File;
describe('HF4 shelf ownership', () => {
  it('claims fresh public cast together with compare-and-swap and preserves exact local ownership', async () => {
    current = await fresh(7, '0.7.0', 'warren-rest/1');
    expect(mock.enabled).toBe(true);
    const batch = mock.requests.find((r) => r.action === 'putBatch');
    expect(batch?.envelopes).toHaveLength(6);
    expect(batch?.envelopes?.map((head) => head.source.engine)).toEqual(Array(6).fill(FRAMEWORK_VERSION));
    expect(Object.values(batch?.expectedHeads ?? {})).toEqual(Array(6).fill(null));
    const saved = save(current);
    const loaded = await localLoad(saved);
    expect(loaded.ownedHeads).toEqual(current.ownedHeads);
    expect(loaded.s.next?.config).toBe('warren-rest/1');
  });
  it('keeps an older shelf record and never claims or overwrites it for a fresh story', async () => {
    const castId = 'hf.cast.meryem.warren';
    const older = await createPersona({
      format: 'hf-persona/1',
      castId,
      castRevision: canonicalCast(castId).revision,
      branchId: 'older',
      parentRevision: null,
      source: { game: 'warren', build: 'test', engine: '2.23.0', rules: 'old' },
      transfer: {},
      limitations: [],
    });
    state = acceptPersona(state, older);
    current = await fresh(7, '0.7.0', 'warren-rest/1');
    expect(state.heads[castId]).toBe(older.revision);
    expect(current.ownedHeads?.[castId]).toBeUndefined();
    await checkpoint();
    expect(state.heads[castId]).toBe(older.revision);
  });
  it('keeps a valid profile-v1 shelf head and starts that person fresh locally', async () => {
    const castId = 'hf.cast.meryem.warren';
    const source = newGame(7, '0.7.0', undefined, 'warren-rest/1');
    expect(act(source, { verb: 'release', who: 'meryem' })).toBe(true);
    advance(source, 330);
    const captured = await project(source.s, 'meryem');
    const portable = captured.transfer.portable;
    if (portable.version !== 2) throw Error('Expected v2 projection');
    // Synthetic v1 schema fixture derived from a real projection; no older journey is claimed.
    const { retained: _retained, ...profile } = portable;
    const older = await createPersona({
      format: 'hf-persona/1',
      castId,
      castRevision: canonicalCast(castId).revision,
      branchId: 'profile-v1',
      parentRevision: null,
      source: { game: 'warren', build: 'test', engine: FRAMEWORK_VERSION, rules: 'warren-hf4-1' },
      transfer: { castPassport: 'hf-portable-person/1', portable: { ...profile, version: 1 } },
      limitations: [],
    });
    state = acceptPersona(state, older);
    current = await fresh(7, '0.7.0', 'warren-rest/1');
    expect(state.heads[castId]).toBe(older.revision);
    expect(current.ownedHeads?.[castId]).toBeUndefined();
    expect(current.chapter?.inputs.some((head) => head.castId === castId) ?? false).toBe(false);
    expect(
      mock.requests.find((r) => r.action === 'putBatch')?.envelopes?.some((head) => head.castId === castId),
    ).toBe(false);
    expect(continuityStatus).toContain('older or occupied records remain on the shelf');
    await checkpoint();
    expect(state.heads[castId]).toBe(older.revision);
  });
  it('does not skip a malformed portable head', async () => {
    const castId = 'hf.cast.meryem.warren';
    const malformed = await createPersona({
      format: 'hf-persona/1',
      castId,
      castRevision: canonicalCast(castId).revision,
      branchId: 'malformed',
      parentRevision: null,
      source: { game: 'warren', build: 'test', engine: FRAMEWORK_VERSION, rules: 'warren-hf4-1' },
      transfer: { castPassport: 'hf-portable-person/1', portable: { version: 1 } },
      limitations: [],
    });
    state = acceptPersona(state, malformed);
    await expect(fresh(7, '0.7.0', 'warren-rest/1')).rejects.toThrow();
    expect(state.heads[castId]).toBe(malformed.revision);
    expect(mock.requests.some((r) => r.action === 'putBatch')).toBe(false);
  });
  it('refuses a competing shelf head without partially claiming the group', async () => {
    const original = mock.handle;
    mock.handle = async (request) => {
      if (request.action === 'putBatch') {
        const first = request.envelopes?.[0];
        if (!first) throw Error('Missing claim fixture');
        const { revision: _revision, ...body } = first;
        const competing = await createPersona({ ...body, branchId: 'competing' });
        state = acceptPersona(state, competing);
      }
      return original?.(request);
    };
    await expect(fresh(7, '0.7.0', 'warren-rest/1')).rejects.toThrow();
    expect(Object.keys(state.heads)).toHaveLength(1);
    expect(state.revisions[0]?.branchId).toBe('competing');
    expect(current).toBeNull();
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
