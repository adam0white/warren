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

async function gzip(text: string): Promise<Blob> {
  const cs = new CompressionStream('gzip');
  return new Response(new Blob([text]).stream().pipeThrough(cs)).blob();
}

async function gunzip(value: Blob | ArrayBuffer): Promise<string> {
  const b = value instanceof Blob ? value : new Blob([value]);
  const ds = new DecompressionStream('gzip');
  return new Response(b.stream().pipeThrough(ds)).text();
}

export async function put(key: string, value: unknown): Promise<boolean> {
  try {
    const blob = await gzip(JSON.stringify(value));
    const bytes = await blob.arrayBuffer();
    const db = await open();
    await new Promise<void>((res, rej) => {
      const tx = db.transaction(STORE, 'readwrite');
      // WebKit can abort Blob writes in IndexedDB. Keep the same gzip bytes as an ArrayBuffer.
      tx.objectStore(STORE).put({ blob: bytes, at: Date.now() }, key);
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
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

export async function drop(key: string): Promise<void> {
  try {
    const db = await open();
    await new Promise<void>((res) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(key);
      tx.oncomplete = () => res();
      tx.onerror = () => res();
    });
    db.close();
  } catch {}
}
