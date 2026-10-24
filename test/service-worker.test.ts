import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { expect, it, vi } from 'vitest';

it('does not serve cached release metadata or intercept an explicit no-store read', () => {
  const handlers: Record<string, (event: unknown) => void> = {};
  const match = vi.fn(() => Promise.resolve({ oldBuild: '92b8604' }));
  vm.runInNewContext(readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8'), {
    self: {
      addEventListener: (name: string, handler: (event: unknown) => void) => {
        handlers[name] = handler;
      },
    },
    caches: { match },
    URL,
    fetch: vi.fn(),
  });
  for (const [url, cache] of [
    ['https://warren.adamwhite.work/release.json', 'default'],
    ['https://warren.adamwhite.work/other.json', 'no-store'],
  ]) {
    const respondWith = vi.fn();
    handlers.fetch!({ request: { method: 'GET', url, cache, mode: 'cors' }, respondWith });
    expect(respondWith).not.toHaveBeenCalled();
  }
  expect(match).not.toHaveBeenCalled();
});
