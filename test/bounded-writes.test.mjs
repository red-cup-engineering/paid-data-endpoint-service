import assert from "node:assert/strict";
import { mkdir, mkdtemp, readdir, rm, stat, utimes, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import test from "node:test";

import { writeTextAtomically } from "../src/atomic-text.mjs";
import { createContentAddressedDirectory } from "../src/content-addressed-directory.mjs";

// Scratch lives in the checkout's ignored .tmp, never in the system temp directory.
const SCRATCH = resolve(import.meta.dirname, "..", ".tmp");

async function scratch(t) {
  await mkdir(SCRATCH, { recursive: true });
  const root = await mkdtemp(join(SCRATCH, "bounded-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

async function usage(root) {
  const names = await readdir(root);
  let bytes = 0;
  for (const name of names) bytes += (await stat(join(root, name))).size;
  return { names, bytes };
}

const body = (index, size = 100) => Buffer.alloc(size, String(index % 10)).fill(`${index}:`, 0, 8);

test("content-addressed directory: N writes leave at most maxObjects files", async (t) => {
  const root = await scratch(t);
  const store = createContentAddressedDirectory({ root, maxObjects: 5 });
  let last;
  for (let index = 0; index < 24; index += 1) last = await store.write({ body: body(index) });
  const { names } = await usage(root);
  assert.equal(names.length, 5);
  assert.ok(names.includes(last.sha256), "the newest object is kept");
  assert.equal((await store.read({ sha256: last.sha256 })).byteLength, 100);
  assert.ok(names.every((name) => /^[0-9a-f]{64}$/u.test(name)), "no staging file is left behind");
});

test("content-addressed directory: N writes leave at most maxBytes bytes", async (t) => {
  const root = await scratch(t);
  const store = createContentAddressedDirectory({ root, maxBytes: 450 });
  for (let index = 0; index < 16; index += 1) await store.write({ body: body(index) });
  const { names, bytes } = await usage(root);
  assert.ok(bytes <= 450, `${bytes} bytes exceed the bound`);
  assert.equal(names.length, 4);
});

test("content-addressed directory: one object larger than maxBytes is kept alone", async (t) => {
  const root = await scratch(t);
  const store = createContentAddressedDirectory({ root, maxBytes: 150 });
  await store.write({ body: body(1) });
  const large = await store.write({ body: body(2, 400) });
  assert.deepEqual((await usage(root)).names, [large.sha256]);
});

test("content-addressed directory: writing the same bytes again renews them", async (t) => {
  const root = await scratch(t);
  const store = createContentAddressedDirectory({ root, maxObjects: 2 });
  const first = await store.write({ body: body(1) });
  await utimes(join(root, first.sha256), new Date(Date.now() - 10_000), new Date(Date.now() - 10_000));
  await store.write({ body: body(2) });
  await store.write({ body: body(1) });
  await store.write({ body: body(3) });
  assert.ok((await usage(root)).names.includes(first.sha256));
  assert.equal((await usage(root)).names.length, 2);
});

test("content-addressed directory: a failed write removes its staging file", async (t) => {
  const root = await scratch(t);
  const store = createContentAddressedDirectory({ root });
  const content = body(7);
  const { sha256 } = await store.write({ body: content });
  await rm(join(root, sha256));
  await mkdir(join(root, sha256)); // a directory squats on the object's address, so verification fails
  await assert.rejects(store.write({ body: content }));
  assert.deepEqual((await usage(root)).names, [sha256]);
});

test("content-addressed directory: a staging file of a dead writer is removed on the next write", async (t) => {
  const root = await scratch(t);
  const store = createContentAddressedDirectory({ root });
  const dead = join(root, ".stage-dead");
  await writeFile(dead, "partial");
  const old = new Date(Date.now() - 2 * 60 * 60 * 1000);
  await utimes(dead, old, old);
  const live = join(root, ".stage-live");
  await writeFile(live, "in flight");
  await store.write({ body: body(1) });
  const { names } = await usage(root);
  assert.ok(!names.includes(".stage-dead"));
  assert.ok(names.includes(".stage-live"), "a recent staging file may belong to a writer still running");
});

test("content-addressed directory: bounds must be positive integers", () => {
  assert.throws(() => createContentAddressedDirectory({ root: "x", maxObjects: 0 }), TypeError);
  assert.throws(() => createContentAddressedDirectory({ root: "x", maxBytes: 1.5 }), TypeError);
});

test("published editions: N overwrites leave one file", async (t) => {
  const root = await scratch(t);
  const path = join(root, "latest.json");
  for (let index = 0; index < 40; index += 1) await writeTextAtomically(path, `{"edition":${index}}\n`);
  const { names, bytes } = await usage(root);
  assert.deepEqual(names, ["latest.json"]);
  assert.equal(bytes, '{"edition":39}\n'.length);
});

test("published editions: a failed write leaves the old file and no scratch", async (t) => {
  const root = await scratch(t);
  const path = join(root, "latest.json");
  await writeTextAtomically(path, "old\n");
  const blocked = join(root, "blocked");
  await mkdir(blocked); // renaming a file over a directory fails after the bytes were staged
  await assert.rejects(writeTextAtomically(blocked, "new\n"));
  assert.deepEqual((await usage(root)).names.sort(), ["blocked", "latest.json"]);
  assert.deepEqual(await readdir(blocked), []);
});
