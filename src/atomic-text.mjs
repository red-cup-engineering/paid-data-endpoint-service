import { rename, unlink, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";

/**
 * Replace the file at `path` with `value` in one step: current state,
 * overwritten in place. Readers see the old bytes or the new bytes, never a
 * mixture. The sibling the bytes are staged in is scratch; it is removed
 * whether the write succeeds or not, so a failure leaves only the old file.
 */
export async function writeTextAtomically(path, value, { mode = 0o644 } = {}) {
  const pending = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(pending, value, { mode });
    await rename(pending, path);
  } finally {
    await unlink(pending).catch(error => {
      if (error?.code !== "ENOENT") throw error;
    });
  }
}
