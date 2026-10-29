/** In-memory shelf protocol controls; these do not establish a browser journey. */
import {
  acceptPersona,
  acceptPersonaBatch,
  canonicalCast,
  castForGame,
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
      castId === mock.eligible || mock.eligible === '*' ? [] : sdk.portableWriteBlockers(castId, game),
    // Certification is a transport fixture here. Actual admission and shelf CAS
    // run below; this control does not certify any deployed peer.
    claimPortablePerson: (parent: import('@adam0white/lab-client').PersonaEnvelope, game: string) =>
      mock.eligible === '*'
        ? { ...parent.transfer, portableClaim: { game } }
        : sdk.claimPortablePerson(parent, game),
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
  it('admits a retained person while another eligible record is refused individually', async () => {
    const source = newGame(7);
    act(source, { verb: 'release', who: 'meryem' });
    advance(source, 330);
    const captured = await project(source.s, 'meryem');
    const castId = 'hf.cast.meryem.warren';
    const head = await createPersona({
      format: 'hf-persona/1',
      castId,
      castRevision: canonicalCast(castId).revision,
      branchId: 'mixed-arrival',
      parentRevision: null,
      source: { game: 'warren', build: 'test', engine: FRAMEWORK_VERSION, rules: 'warren-hf4-1' },
      transfer: captured.transfer,
      limitations: [],
    });
    state = acceptPersona(state, head);
    mock.eligible = '*';
    const handle = mock.handle;
    mock.handle = async (request) => {
      if (request.action === 'get' && request.castId === 'hf.cast.yusuf.warren') return { broken: true };
      return handle?.(request);
    };
    current = await fresh(8);
    expect(current.chapter?.inputs.map((person) => person.castId)).toEqual([castId]);
    expect(current.ownedHeads?.[castId]?.parentRevision).toBe(head.revision);
    expect(current.ownedHeads?.['hf.cast.yusuf.warren']).toBeUndefined();
    expect(Object.keys(current.ownedHeads ?? {})).toHaveLength(5);
  });
  for (const cast of castForGame('warren')) {
    it(`starts with ${cast.name} eligible and skips the other people individually`, async () => {
      mock.eligible = cast.castId;
      current = await fresh(7);
      expect(Object.keys(current.ownedHeads ?? {})).toEqual([cast.castId]);
      expect(Object.keys(state.heads)).toEqual([cast.castId]);
    });
  }
  it('skips an unreadable eligible record without refusing a new hill or writing that head', async () => {
    mock.eligible = 'hf.cast.meryem.warren';
    const handle = mock.handle;
    mock.handle = async (request) => {
      if (request.action === 'get' && request.castId === mock.eligible) return { broken: true };
      return handle?.(request);
    };
    current = await fresh(7);
    expect(current.s.people).toHaveLength(6);
    expect(Object.keys(current.ownedHeads ?? {})).toHaveLength(0);
    expect(continuityStatus).toContain('Meryem');
    expect(mock.requests.some((request) => request.action === 'putBatch')).toBe(false);
  });
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
  it('publishes a genuine current producer and retains its complete source receipt', async () => {
    mock.eligible = 'hf.cast.meryem.warren';
    current = await fresh(7);
    // The released local-only path had no chapter; keep its positive resume control.
    delete current.chapter;
    current = await localLoad(save(current));
    act(current, { verb: 'release', who: 'meryem' });
    advance(current, 330);
    mock.requests = [];
    await checkpoint();
    const head = current.ownedHeads!['hf.cast.meryem.warren']!;
    expect(mock.requests.filter((request) => request.action === 'putBatch')).toHaveLength(1);
    expect(current.sourceArchives?.[head.revision]).toBeDefined();
    const restored = await localLoad(save(current));
    expect(restored.ownedHeads).toEqual(current.ownedHeads);
    expect(restored.sourceArchives).toEqual(current.sourceArchives);
  });
  it('refuses forged full history before shared, archive or head writes', async () => {
    mock.eligible = 'hf.cast.meryem.warren';
    current = await fresh(7);
    const head = structuredClone(current.ownedHeads);
    current.s.notes[0]!.text += ' forged';
    mock.requests = [];
    await checkpoint();
    expect(mock.requests.some((request) => request.action === 'putBatch')).toBe(false);
    expect(current.ownedHeads).toEqual(head);
    expect(current.sourceArchives).toBeUndefined();
  });
  it('cancels an async checkpoint before any shared, archive or head write', async () => {
    mock.eligible = 'hf.cast.meryem.warren';
    current = await fresh(7);
    const original = current;
    const head = structuredClone(original.ownedHeads);
    mock.requests = [];
    const pending = checkpoint();
    mock.eligible = '';
    current = await fresh(8);
    await pending;
    expect(mock.requests.some((request) => request.action === 'putBatch')).toBe(false);
    expect(original.ownedHeads).toEqual(head);
    expect(original.sourceArchives).toBeUndefined();
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

it('reads an unowned current native snapshot without granting source permission', async () => {
  const snapshot = newGame(7);
  snapshot.s.notes[0]!.text += ' retained local snapshot';
  const full = save(snapshot);
  const readable = await localLoad(full);
  expect(save(readable)).toEqual(full);
  current = readable;
  mock.requests = [];
  await checkpoint();
  expect(mock.requests.filter((r) => r.action === 'putBatch')).toEqual([]);
  const { validateSource } = await import('../src/sim/source-history.ts');
  await expect(validateSource(readable, true)).rejects.toThrow(/complete creation/);
  expect(save(readable)).toEqual(full);
});
