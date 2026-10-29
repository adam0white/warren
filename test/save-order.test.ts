import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';
import { afterEach, expect, it, vi } from 'vitest';
import * as store from '../src/ui/store.ts';

// Execute the actual app save/replacement functions. Only DOM, compression timing and IDB
// transport are controlled; the storage queue, ownership checks and save helper stay real.
const appSource = readFileSync('src/ui/app.ts', 'utf8');
const names = ['writeSave', 'beginNewHill', 'replaceGame'];
const functions = names
  .map((name) => appSource.match(new RegExp(`(?:async )?function ${name}\\([^]*?\\n\\}`))?.[0] ?? '')
  .join('\n');
afterEach(() => vi.restoreAllMocks());

it('shows the shared-record refusal when a new hill cannot start', () => {
  const source = appSource.match(/function startError\([\s\S]*?\n\}/)?.[0] ?? '';
  const status = { textContent: '' };
  const context = vm.createContext({
    Error,
    console: { error() {} },
    document: { getElementById: () => status },
  });
  vm.runInContext(stripTypeScriptTypes(`${source}\nglobalThis.show = startError;`), context);
  (context.show as (error: Error, message: string) => void)(
    new Error(
      'People across games are temporarily unavailable. Your shared records and current hill are unchanged.',
    ),
    'A new hill could not be started.',
  );
  expect(status.textContent).toContain('People across games are temporarily unavailable');
});

for (const delay of ['compression', 'open']) {
  it(`cannot write or capture A after ${delay === 'compression' ? 'New game' : 'load'} installs B with A pending ${delay}`, async () => {
    let release!: () => void;
    let reached!: () => void;
    const gate = new Promise<void>((done) => {
      release = done;
    });
    const pending = new Promise<void>((done) => {
      reached = done;
    });
    let first = true;
    const rows = new Map<string, { blob: ArrayBuffer; at: number }>();
    const commits: ArrayBuffer[] = [];
    const original = Response.prototype.arrayBuffer;
    vi.spyOn(Response.prototype, 'arrayBuffer').mockImplementation(async function (this: Response) {
      if (delay === 'compression' && first) {
        first = false;
        reached();
        await gate;
      }
      return original.call(this);
    });
    const db = {
      close() {},
      transaction() {
        const tx = {
          oncomplete: () => {},
          onerror: () => {},
          error: null,
          objectStore: () => ({
            put(value: { blob: ArrayBuffer; at: number }, key: string) {
              rows.set(key, value);
              commits.push(value.blob);
              queueMicrotask(() => tx.oncomplete());
            },
            delete(key: string) {
              rows.delete(key);
              queueMicrotask(() => tx.oncomplete());
            },
          }),
        };
        return tx;
      },
    };
    vi.stubGlobal('indexedDB', {
      open() {
        const r = { result: db, onsuccess: () => {}, onerror: () => {} };
        queueMicrotask(async () => {
          if (delay === 'open' && first) {
            first = false;
            reached();
            await gate;
          }
          r.onsuccess();
        });
        return r;
      },
    });
    const captures: string[] = [];
    const context = vm.createContext({
      store,
      performance,
      Date,
      Math,
      console,
      continuity: { fresh: async () => ({ seed: 'B' }) },
      save: (g: unknown) => g,
      document: { querySelector: () => null },
      SAVE_KEY: 'hill',
      seenHint: new Set(),
      enter() {},
      startError(error: unknown) {
        throw error;
      },
      lab: { captureSave: (saved: { seed: string }) => captures.push(saved.seed) },
    });
    const js = stripTypeScriptTypes(`let g = {seed:'A'}; let generation=0; let gameGeneration=0;
      let lastSaved=0; let dirty=true; let speedIx=0; let hiddenAt=null;
      ${functions}
      globalThis.api={writeSave,beginNewHill,replaceGame,setDirty(){dirty=true}, state(){return {g,dirty}}};`);
    vm.runInContext(js, context);
    const api = context.api as {
      replaceGame(game: { seed: string }): boolean;
      writeSave(): Promise<boolean>;
      beginNewHill(): Promise<boolean>;
      setDirty(): void;
      state(): { g: { seed: string }; dirty: boolean };
    };
    try {
      const a = api.writeSave();
      await pending;
      const replacement =
        delay === 'compression' ? api.beginNewHill() : Promise.resolve(api.replaceGame({ seed: 'B' }));
      const b = replacement.then((ok) => {
        expect(ok).toBe(true);
        const saving = api.writeSave();
        api.setDirty(); // B changes while its save is pending; A must not clear this.
        return saving;
      });
      // B's save is requested before A drains on load. New game orders its drop first.
      await new Promise((done) => setImmediate(done));
      release();
      await Promise.all([a, b]);
      const row = rows.get('hill')!;
      const saved = JSON.parse(
        await new Response(new Blob([row.blob]).stream().pipeThrough(new DecompressionStream('gzip'))).text(),
      );
      expect(saved.seed).toBe('B');
      const written = await Promise.all(
        commits.map(
          async (blob) =>
            JSON.parse(
              await new Response(
                new Blob([blob]).stream().pipeThrough(new DecompressionStream('gzip')),
              ).text(),
            ).seed,
        ),
      );
      expect(written).toEqual(['B']);
      expect(captures).toEqual(['B']);
      expect(api.state()).toEqual({ g: { seed: 'B' }, dirty: true });
    } finally {
      release();
      vi.unstubAllGlobals();
    }
  });
}
