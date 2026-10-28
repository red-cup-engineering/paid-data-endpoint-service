import { mkdir, open, readFile, readdir, link, stat, unlink, utimes } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { resolve, sep } from "node:path";

// Native Node SHA-256 is the exact same standard digest used by the original
// public-data inventory producer. Source custody must work for an official
// no-key data fetch without bootstrapping private workspace dependencies.
const sha256Hex = value => createHash("sha256").update(value).digest("hex");

const SHA256 = /^[0-9a-f]{64}$/u;
const STAGE_PREFIX = ".stage-";

/**
 * The bounds of one directory, stated once. After every write the directory
 * holds at most `maxObjects` objects and `maxBytes` bytes, plus the object
 * just written if that single object alone exceeds `maxBytes`. The oldest
 * object (by last write) is removed first. An object whose bytes are written
 * again counts as newly written. Callers that need a different policy pass
 * their own numbers; the owner of the data sets them in deployment.
 */
export const DEFAULT_MAX_OBJECTS = 4096;
export const DEFAULT_MAX_BYTES = 512 * 1024 * 1024;

/** A staging file older than this belongs to a writer that died; it is removed. */
export const STAGE_LIFETIME_MS = 60 * 60 * 1000;

function bytes(value) {
  if (!(value instanceof Uint8Array)) throw new TypeError("body must be a Uint8Array");
  return Buffer.from(value);
}

function bound(name, value) {
  if (!Number.isSafeInteger(value) || value < 1) throw new TypeError(`${name} must be a positive integer`);
  return value;
}

const ignoreMissing = error => {
  if (error?.code !== "ENOENT") throw error;
};

/**
 * A narrow disk fallback for unique large bytes. Filenames are SHA-256
 * identities; writes are create-only; reads re-verify bytes before delivery.
 * The directory is bounded (see DEFAULT_MAX_OBJECTS): custody here is a
 * working retention window, not an archive. This is not an index, queue,
 * mutable record store, or authority database.
 */
export function createContentAddressedDirectory({
  root, maxObjects = DEFAULT_MAX_OBJECTS, maxBytes = DEFAULT_MAX_BYTES, now = Date.now,
} = {}) {
  if (typeof root !== "string" || root.length === 0) throw new TypeError("root is required");
  bound("maxObjects", maxObjects);
  bound("maxBytes", maxBytes);
  const storageRoot = resolve(root);

  function pathFor(sha256) {
    if (!SHA256.test(sha256 ?? "")) throw new TypeError("sha256 must be 64 lowercase hex digits");
    const selected = resolve(storageRoot, sha256);
    if (!selected.startsWith(`${storageRoot}${sep}`)) throw new Error("content path escaped storage root");
    return selected;
  }

  /** Remove dead staging files, then the oldest objects until both bounds hold. `keep` is never removed. */
  async function enforceBounds(keep) {
    const objects = [];
    for (const name of await readdir(storageRoot)) {
      const path = resolve(storageRoot, name);
      const info = await stat(path).catch(error => { ignoreMissing(error); return null; });
      if (info === null) continue;
      if (name.startsWith(STAGE_PREFIX)) {
        if (now() - info.mtimeMs > STAGE_LIFETIME_MS) await unlink(path).catch(ignoreMissing);
      } else if (SHA256.test(name)) {
        objects.push({ name, path, size: info.size, written: info.mtimeMs });
      }
    }
    objects.sort((a, b) => a.written - b.written || a.name.localeCompare(b.name));
    let count = objects.length;
    let total = objects.reduce((sum, object) => sum + object.size, 0);
    for (const object of objects) {
      if (count <= maxObjects && total <= maxBytes) break;
      if (object.name === keep) continue;
      await unlink(object.path).catch(ignoreMissing);
      count -= 1;
      total -= object.size;
    }
  }

  async function write({ body, mediaType = "application/octet-stream" } = {}) {
    const content = bytes(body);
    const sha256 = sha256Hex(content);
    await mkdir(storageRoot, { recursive: true, mode: 0o700 });
    // A crash in a direct open(wx)+writeFile can strand incomplete bytes at
    // the FINAL digest path; later arrivals can neither replace nor use it.
    // Stage privately under this directory, flush, then atomically hard-link
    // to the create-only final address. No reader sees partial final bytes.
    // The staging file is scratch: it is removed whether or not the write succeeds.
    const temporary = resolve(storageRoot, STAGE_PREFIX + randomUUID());
    let handle;
    try {
      handle = await open(temporary, "wx", 0o600);
      await handle.writeFile(content);
      await handle.sync();
      await handle.close();
      handle = undefined;
      try {
        await link(temporary, pathFor(sha256));
      } catch (error) {
        if (error?.code !== "EEXIST") throw error;
        const existing = await readFile(pathFor(sha256));
        if (sha256Hex(existing) !== sha256) throw new Error("existing content-addressed object failed verification");
        const at = new Date(now());
        await utimes(pathFor(sha256), at, at);
      }
    } finally {
      await handle?.close();
      await unlink(temporary).catch(ignoreMissing);
    }
    await enforceBounds(sha256);
    return Object.freeze({ sha256, byteLength: content.byteLength, mediaType });
  }

  async function read({ sha256 } = {}) {
    const content = await readFile(pathFor(sha256));
    if (sha256Hex(content) !== sha256) throw new Error("content-addressed object failed read verification");
    return Object.freeze({ sha256, byteLength: content.byteLength, body: content });
  }

  return Object.freeze({ root: storageRoot, maxObjects, maxBytes, write, read });
}
