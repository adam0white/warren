/** Protocol controls use an in-memory shelf. They are not browser journey evidence. */

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

import { attach, bind, checkpoint, fileLoad, fresh, localLoad } from '../src/ui/continuity.ts';

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
  vi.stubGlobal('window', { addEventListener() {} });
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
