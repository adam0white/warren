/** Protocol controls use an in-memory shelf. They are not browser journey evidence. */

import { readFileSync } from 'node:fs';
import { snapshot } from '@adam0white/human-framework';
import {
  acceptPersona,
  createPersona,
  type PersonaRequest,
  type PersonaShelfState,
  preparePersonaLife,
} from '@adam0white/lab-client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, newGame, save } from '../src/sim/game.ts';

const mock = vi.hoisted(() => ({
  enabled: false,
  ready: Promise.resolve(true),
  gate: null as string | null,
  allowed: false,
  requests: [] as unknown[],
  handle: null as null | ((request: unknown) => Promise<unknown>),
  defer: null as null | ((request: unknown) => Promise<void>),
}));
vi.mock('../src/ui/lab.ts', () => ({
  lab: {
    build: () => ({ c: 'control' }),
    setPersonaRecording: (key: string | null) => {
      mock.gate = key;
      mock.allowed = key === null;
    },
    allowPersonaRecording: (allow: boolean) => {
      mock.allowed = allow;
    },
  },
}));
vi.mock('@adam0white/lab-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@adam0white/lab-client')>();
  return {
    ...actual,
    personaChannel: () => ({
      get enabled() {
        return mock.enabled;
      },
      get ready() {
        return mock.ready;
      },
      setEnabled: (v: boolean) => {
        mock.enabled = v;
      },
      request: async (request: unknown) => {
        mock.requests.push(request);
        if (mock.defer) await mock.defer(request);
        return mock.handle ? mock.handle(request) : null;
      },
    }),
    watchPersonaCheckpoint: () => () => {},
  };
});

import {
  attach,
  bind,
  checkpoint,
  checkpointNative,
  fileLoad,
  fresh,
  localLoad,
} from '../src/ui/continuity.ts';

const CAST_ID = 'hf.cast.meryem.warren';
let current: ReturnType<typeof newGame> | null = null;
beforeEach(() => {
  mock.enabled = false;
  mock.ready = Promise.resolve(true);
  mock.allowed = false;
  mock.gate = null;
  mock.requests = [];
  mock.defer = null;
  mock.handle = null;
  vi.stubGlobal('location', { search: '?lab=1' });
  vi.stubGlobal('window', { addEventListener() {}, dispatchEvent: vi.fn() });
  vi.stubGlobal('document', { querySelector: () => null });
  current = null;
  attach(() => current);
});
const file = (saved: unknown) => ({ size: 100, text: async () => JSON.stringify(saved) }) as File;
describe('continuity privacy and source receipts', () => {
  it('refuses changed state despite valid replay and fingerprint', async () => {
    const saved = save(newGame(7));
    saved.state.people[0]!.name = 'Changed';
    await expect(fileLoad(file(saved))).rejects.toThrow(/state differs/);
    expect(mock.allowed).toBe(false);
  });
  it('does not return a deferred import after a fresh run supersedes its gate', async () => {
    let release!: (s: string) => void;
    const pending = fileLoad({
      size: 100,
      text: () =>
        new Promise<string>((r) => {
          release = r;
        }),
    } as File);
    await fresh(8);
    release(JSON.stringify(save(newGame(7))));
    await expect(pending).rejects.toThrow(/replaced/);
  });
  it('uses exact captured source snapshot when actor changes during publication', async () => {
    current = newGame(7);
    current.s.minute = 305; // declared boundary fixture, no real journey claim
    const p = current.s.people.find((p) => p.id === 'meryem')!;
    expect(act(current, { verb: 'release', who: p.id })).toBe(true);
    const before = snapshot(p);
    mock.enabled = true;
    mock.defer = async (request) => {
      if (
        (request as { envelope?: { transfer?: { sourceRole?: string } } }).envelope?.transfer?.sourceRole ===
        'meryem'
      )
        p.body.satiety = 0.01;
    };
    await checkpoint();
    const archives = Object.values(current.sourceArchives ?? {});
    expect(archives).toContainEqual(before);
  });
  it('keeps file origin through local reload and gates fresh-local shortcut immediately', async () => {
    current = await fileLoad(file(save(newGame(7))));
    const loaded = await localLoad(save(current));
    expect(loaded.fileOrigin).toBe(true);
    expect(loaded.ownedHeads).toBeUndefined();
    current = loaded;
    mock.allowed = true;
    let click: (() => void) | undefined;
    const host = {
      querySelector: (selector: string) =>
        selector === '#local-fresh'
          ? {
              addEventListener: (_name: string, fn: () => void) => {
                click = fn;
              },
            }
          : null,
    } as unknown as HTMLElement;
    bind(host, () => {});
    click!();
    expect(mock.allowed).toBe(false);
    expect(mock.gate).toMatch(/^[a-f0-9-]{36}$/);
  });
  it('restores exact local ownership, refuses a competing head, and closes an owned death', async () => {
    let state: PersonaShelfState = { heads: {}, revisions: [] };
    mock.handle = async (raw) => {
      const request = raw as PersonaRequest;
      if (request.action === 'put' && request.envelope) state = acceptPersona(state, request.envelope);
      return null;
    };
    current = newGame(7);
    current.s.minute = 305; // explicit protocol fixture
    expect(act(current, { verb: 'release', who: 'meryem' })).toBe(true);
    expect(act(current, { verb: 'release', who: 'yusuf' })).toBe(true);
    mock.enabled = true;
    await checkpoint();
    const first = current.ownedHeads![CAST_ID]!;
    current = await localLoad(save(current));
    await checkpoint();
    const second = current.ownedHeads![CAST_ID]!;
    expect(second.parentRevision).toBe(first.revision);
    const { revision, ...body } = second;
    const competing = await createPersona({
      ...body,
      parentRevision: revision,
      source: { ...body.source, build: 'competing' },
    });
    state = acceptPersona(state, competing);
    await checkpoint();
    expect(current.ownedHeads![CAST_ID]!.revision).toBe(second.revision);
    expect(state.heads[CAST_ID]).toBe(competing.revision);
    // A separate owned actor death closes its current branch, rather than exporting alive state.
    const yusufId = 'hf.cast.yusuf.warren';
    current.s.people.find((p) => p.id === 'yusuf')!.body.alive = false;
    await checkpoint();
    const terminal = current.ownedHeads![yusufId]!;
    expect(terminal.terminal?.kind).toBe('dead');
    expect(() => preparePersonaLife(terminal, Date.now())).toThrow(/closed/);
  });
});

it('does not cancel a pending hill when recording identity acknowledges', async () => {
  vi.stubGlobal('location', { search: '?lab=1' });
  vi.stubGlobal('window', new EventTarget());
  attach(() => current);
  mock.enabled = true;
  const { castForGame } = await import('@adam0white/lab-client');
  mock.handle = async (raw) => {
    const request = raw as PersonaRequest;
    return request.action === 'prepareBatch'
      ? {
          expectedHeads: Object.fromEntries(castForGame('warren').map((c) => [c.castId, null])),
          inputs: [],
          blocked: [],
        }
      : {};
  };
  let release!: (value: boolean) => void;
  mock.ready = new Promise<boolean>((resolve) => {
    release = resolve;
  });
  const pending = fresh(42);
  window.dispatchEvent(new Event('hf-lab-preference'));
  const storage = new Event('storage');
  Object.defineProperty(storage, 'key', { value: 'hf-lab-player' });
  window.dispatchEvent(storage);
  release(true);
  await expect(pending).resolves.toHaveProperty('s');
});

describe('selected native Watch publication from genuine care run', () => {
  const retained = () =>
    JSON.parse(readFileSync(new URL('./fixtures/genuine-care-ended.json', import.meta.url), 'utf8'));
  function shelfOf(saved: ReturnType<typeof retained>) {
    let state: PersonaShelfState = {
      revisions: Object.values(saved.ownedHeads),
      heads: Object.fromEntries(
        Object.entries(saved.ownedHeads).map(([id, p]) => [id, (p as { revision: string }).revision]),
      ),
    };
    mock.handle = async (raw) => {
      const q = raw as PersonaRequest;
      if (q.action === 'get')
        return state.revisions.find((p) => p.revision === state.heads[q.castId!]) ?? null;
      if (q.action === 'put') {
        state = acceptPersona(state, q.envelope!, q.fork);
        return q.envelope;
      }
      throw Error('Unexpected protocol call');
    };
    return () => state;
  }
  it('uses exact local parent and archives actual body/current care without publishing other people', async () => {
    const saved = retained(),
      get = shelfOf(saved);
    mock.enabled = true;
    current = await localLoad(saved);
    act(current, { verb: 'prepare-native-return', who: 'kian' });
    const other = get().heads[CAST_ID];
    await checkpointNative('kian');
    const e = current.nativeReturnHeads!['hf.cast.kian.watch']!;
    expect(e.parentRevision).toBe(saved.ownedHeads['hf.cast.kian.watch'].revision);
    expect(e.source.build).toMatch(/^[a-f0-9]{40}$/); // A stale SDK release lookup cannot stamp the loaded source.
    expect(e.transfer.warrenCare).toMatchObject({
      version: 'warren-watch-ada/1',
      capturedMinute: 600,
      visit: { careCount: 1, endedAt: 570 },
    });
    expect(current.sourceArchives![e.revision]).toHaveProperty('person');
    expect(get().heads[CAST_ID]).toBe(other);
    expect(mock.requests.filter((q) => (q as PersonaRequest).action === 'put')).toHaveLength(1);
  });
  it('keeps file nonownership; an explicit selected alternative grants only its own new branch receipt', async () => {
    const saved = retained(),
      get = shelfOf(saved);
    mock.enabled = true;
    current = await fileLoad(file(saved));
    act(current, { verb: 'prepare-native-return', who: 'kian' });
    await expect(checkpointNative('kian')).rejects.toThrow(/no local ownership/);
    const other = get().heads[CAST_ID];
    await checkpointNative('kian', true);
    expect(current.fileOrigin).toBe(true);
    expect(current.ownedHeads).toBeUndefined();
    const e = current.nativeReturnHeads!['hf.cast.kian.watch']!;
    expect(e.parentRevision).toBeNull();
    expect(e.branchId).not.toBe(saved.ownedHeads['hf.cast.kian.watch'].branchId);
    expect(get().heads[CAST_ID]).toBe(other);
    expect(Object.keys(current.nativeReturnHeads!)).toEqual(['hf.cast.kian.watch']);
    const loaded = await localLoad(save(current));
    expect(loaded.nativeReturnHeads).toEqual(current.nativeReturnHeads);
    const imported = await fileLoad(file(save(current)));
    expect(imported.nativeReturnHeads).toBeUndefined();
    expect(imported.ownedHeads).toBeUndefined();
    current.s.people.find((p) => p.id === 'kian')!.body.alive = false; // Explicit synthetic terminal control.
    await checkpoint();
    const terminal = current.nativeReturnHeads!['hf.cast.kian.watch']!;
    expect(terminal.terminal?.kind).toBe('dead');
    expect(terminal.parentRevision).toBe(e.revision);
    expect(current.ownedHeads).toBeUndefined();
    expect(get().heads[CAST_ID]).toBe(other);
  });
  it('refuses a competing head and a changed run before publication', async () => {
    const saved = retained();
    shelfOf(saved);
    mock.enabled = true;
    current = await localLoad(saved);
    act(current, { verb: 'prepare-native-return', who: 'kian' });
    mock.handle = async () => null;
    await expect(checkpointNative('kian')).rejects.toThrow(/head changed/);
    expect(mock.requests.some((q) => (q as PersonaRequest).action === 'put')).toBe(false);
    mock.handle = async () => {
      current = null;
      return null;
    };
    await expect(checkpointNative('kian', true)).rejects.toThrow(/Run or prepared/);
  });
});

it('reports a real failed checkpoint without replacing prior ownership receipts', async () => {
  current = newGame(7);
  current.s.minute = 305;
  expect(act(current, { verb: 'release', who: 'meryem' })).toBe(true);
  mock.enabled = true;
  mock.handle = async () => {
    throw new Error('Shelf unavailable. Use a local file.');
  };
  const prior = JSON.stringify(current.ownedHeads ?? {});
  await checkpoint();
  expect(JSON.stringify(current.ownedHeads ?? {})).toBe(prior);
  expect(window.dispatchEvent).toHaveBeenCalled();
});

it('keeps routine Kian ineligibility separate from failed publication', async () => {
  current = newGame(7);
  current.s.minute = 305;
  current.s.people = current.s.people.filter((p) => p.id === 'kian');
  mock.enabled = true;
  await checkpoint();
  expect(mock.requests).toEqual([]);
  expect(window.dispatchEvent).not.toHaveBeenCalled();
});
