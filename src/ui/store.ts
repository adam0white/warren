/**
 * Saves live in IndexedDB as gzip (a year's state is megabytes of JSON; localStorage would not hold it).
 * Every access is wrapped: a private window or blocked storage gives "no save", never a broken page.
 */
const DB = 'warren';
const STORE = 'pages';

function open(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

async function gzip(text: string): Promise<ArrayBuffer> {
  const cs = new CompressionStream('gzip');
  // WebKit can reject document-owned Blob streams during navigation.
  const input = new Response(text).body;
  if (!input) throw new Error('Save compression input is unavailable.');
  return new Response(input.pipeThrough(cs)).arrayBuffer();
}

async function gunzip(value: Blob | ArrayBuffer): Promise<string> {
  const b = value instanceof Blob ? value : new Blob([value]);
  const ds = new DecompressionStream('gzip');
  return new Response(b.stream().pipeThrough(ds)).text();
}

// Serialize writes and drops for each slot, including compression and database opening.
// The owner predicate is checked after those awaits, immediately before the transaction.
const writes = new Map<string, Promise<unknown>>();
function ordered<T>(key: string, operation: () => Promise<T>): Promise<T> {
  const pending = (writes.get(key) ?? Promise.resolve()).then(operation);
  writes.set(
    key,
    pending.catch(() => {}),
  );
  return pending;
}

export function put(key: string, value: unknown, current = () => true): Promise<boolean> {
  // Snapshot before queueing: callers may mutate their state while another write drains.
  try {
    const text = JSON.stringify(value);
    return ordered(key, () => write(key, text, current));
  } catch {
    return Promise.resolve(false);
  }
}
async function write(key: string, text: string, current: () => boolean): Promise<boolean> {
  try {
    if (!current()) return false;
    const bytes = await gzip(text);
    const db = await open();
    if (!current()) {
      db.close();
      return false;
    }
    await new Promise<void>((res, rej) => {
      const tx = db.transaction(STORE, 'readwrite');
      // WebKit can abort Blob writes in IndexedDB. Keep the same gzip bytes as an ArrayBuffer.
      tx.objectStore(STORE).put({ blob: bytes, at: Date.now() }, key);
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
      tx.onabort = () => rej(tx.error);
    });
    db.close();
    return true;
  } catch {
    return false;
  }
}

export async function get<T>(key: string): Promise<{ value: T; at: number } | null> {
  try {
    const db = await open();
    const row = await new Promise<{ blob: Blob | ArrayBuffer; at: number } | undefined>((res, rej) => {
      const r = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
      r.onsuccess = () => res(r.result as { blob: Blob | ArrayBuffer; at: number } | undefined);
      r.onerror = () => rej(r.error);
    });
    db.close();
    if (!row) return null;
    return { value: JSON.parse(await gunzip(row.blob)) as T, at: row.at };
  } catch {
    return null;
  }
}

export function drop(key: string): Promise<void> {
  return ordered(key, () => remove(key));
}
async function remove(key: string): Promise<void> {
  try {
    const db = await open();
    await new Promise<void>((res) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(key);
      tx.oncomplete = () => res();
      tx.onerror = () => res();
      tx.onabort = () => res();
    });
    db.close();
  } catch {}
}
