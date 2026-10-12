import { mkdir, open, readFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { sha256Hex } from "@red-cup-engineering/cryptographic-computer-data-engineering-services-section/integrity";

const SHA256 = /^[0-9a-f]{64}$/u;

function bytes(value) {
  if (!(value instanceof Uint8Array)) throw new TypeError("body must be a Uint8Array");
  return Buffer.from(value);
}


/**
 * A narrow disk fallback for unique large bytes. Filenames are SHA-256
 * identities; writes are create-only; reads re-verify bytes before delivery.
 * This is not an index, queue, mutable record store, or authority database.
 */
export function createContentAddressedDirectory({ root } = {}) {
  if (typeof root !== "string" || root.length === 0) throw new TypeError("root is required");
  const storageRoot = resolve(root);

  function pathFor(sha256) {
    if (!SHA256.test(sha256 ?? "")) throw new TypeError("sha256 must be 64 lowercase hex digits");
    const selected = resolve(storageRoot, sha256);
    if (!selected.startsWith(`${storageRoot}${sep}`)) throw new Error("content path escaped storage root");
    return selected;
  }

  async function write({ body, mediaType = "application/octet-stream" } = {}) {
    const content = bytes(body);
    const sha256 = sha256Hex(content);
    await mkdir(storageRoot, { recursive: true, mode: 0o700 });
    let handle;
    try {
      handle = await open(pathFor(sha256), "wx", 0o600);
      await handle.writeFile(content);
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      const existing = await readFile(pathFor(sha256));
      if (sha256Hex(existing) !== sha256) throw new Error("existing content-addressed object failed verification");
    } finally {
      await handle?.close();
    }
    return Object.freeze({ sha256, byteLength: content.byteLength, mediaType });
  }

  async function read({ sha256 } = {}) {
    const content = await readFile(pathFor(sha256));
    if (sha256Hex(content) !== sha256) throw new Error("content-addressed object failed read verification");
    return Object.freeze({ sha256, byteLength: content.byteLength, body: content });
  }

  return Object.freeze({ root: storageRoot, write, read });
}
