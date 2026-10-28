import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  parseUnixFortuneData, qualifyShortTextPack, verifyQualifiedShortTextPack,
  qualifiedTextDigest, admitShortTextSelection, selectQualifiedShortText,
  uniformRandomIndex, createQualifiedShortTextShelf,
} from "../src/qualified-short-text-inventory.mjs";
import {
  admitRandomFortuneQuery, drawRandomFortune, fortuneProductManifest,
} from "../src/fortune-product.mjs";

const original = {
  packId: "test-fortunes", edition: "first",
  sourceKind: "seller-original", source: { name: "Test original corpus" },
  rights: { basis: "seller-originated-text", sellerAuthorized: true,
    commercialDelivery: true, redistribution: true },
  entries: [
    { id: "first", text: "Clouds remember the wind.", tags: ["weather"] },
    { id: "second", text: "A clock can be wrong twice.", tags: ["time"] },
    { id: "third", text: "The wind tests the gate.", tags: ["weather"] },
  ],
};
const pack = qualifyShortTextPack(original);

test("traditional percent-separated fortune text parses but carries no inferred rights", () => {
  assert.deepEqual(parseUnixFortuneData("First line\nnext line\n%\nSecond line\n%\n"),
    ["First line\nnext line", "Second line"]);
  assert.deepEqual(parseUnixFortuneData("One\r\n%\r\nTwo\r\n"), ["One", "Two"]);
  for (const text of ["%", "%\nhello", "One\n%\n%\nTwo", "\u0000"]) {
    assert.throws(() => parseUnixFortuneData(text), /empty|bounded|no fortunes/);
  }
  assert.throws(() => parseUnixFortuneData("X".repeat(2049)), /2048/);
});

test("original corpus has content-addressed immutable edition, no sale inferred", () => {
  assert.match(pack.digest, /^sha256:[0-9a-f]{64}$/u);
  assert.equal(pack.entryCount, 3);
  assert.equal(verifyQualifiedShortTextPack(pack), true);
  assert.deepEqual(qualifyShortTextPack(original), pack);
  assert.ok(Object.isFrozen(pack.entries[0]));
  const mutated = structuredClone(pack);
  mutated.entries[0].text = "An injected new fortune";
  assert.throws(() => verifyQualifiedShortTextPack(mutated), /changed|identity/);
  mutated.digest = qualifiedTextDigest(mutated);
  assert.throws(() => verifyQualifiedShortTextPack(mutated), /changed|identity/);
});

test("outsider collections, including traditional UNIX archives, default to rights refusal", () => {
  const thirdParty = {
    ...original, sourceKind: "third-party",
    source: { name: "Unverified traditional fortune file", url: "https://example.org/fortunes" },
  };
  assert.throws(() => qualifyShortTextPack(thirdParty), /imported entry is missing rights evidence/);
  thirdParty.rights = {basis: "item-by-item-license-review", commercialDelivery:true,
    redistribution:true, reviewedBy:"test-reviewer", reviewedOn:"2026-10-22",
    sourceLicenseEvidence:"https://example.org/license"};
  assert.throws(() => qualifyShortTextPack(thirdParty), /imported entry is missing rights evidence/);
  thirdParty.entries = original.entries.map(item => ({
    ...item, attribution:"fixture author",
    rights:{commercialDelivery:true,redistribution:true,evidenceUrl:"https://example.org/entry-license"},
  }));
  assert.doesNotThrow(() => qualifyShortTextPack(thirdParty));
  thirdParty.entries[1].rights.redistribution = false;
  assert.throws(() => qualifyShortTextPack(thirdParty), /individual commercial-delivery rights evidence/);
});

test("no permissive code license can override missing dataset rights", () => {
  assert.throws(() => qualifyShortTextPack({
    ...original, rights: {...original.rights, commercialDelivery:false},
  }), /no affirmative commercial/);
  assert.throws(() => qualifyShortTextPack({
    ...original, rights: {...original.rights, expiresOn:"2000-01-01"},
  }), /expired/);
});

test("duplicate IDs/text, blank or unbounded entries are refused before paywall", () => {
  for (const entries of [
    [original.entries[0], original.entries[0]],
    [{...original.entries[0]}, {...original.entries[1], text:original.entries[0].text}],
    [{...original.entries[0], text:"" }, original.entries[1]],
    [{...original.entries[0], text:"a".repeat(2049)}, original.entries[1]],
  ]) assert.throws(() => qualifyShortTextPack({...original, entries}));
});

test("payment request cannot choose price, index, randomness or a private pack", () => {
  for (const query of [null, {index:1}, {seed:42}, {price:"0"}, {packId:"alien"}, {tag:"UNKNOWN"}]) {
    assert.throws(() => admitShortTextSelection(query, pack));
  }
  assert.equal(admitShortTextSelection({}, pack).eligible.length, 3);
  assert.equal(admitShortTextSelection({tag:"weather"}, pack).eligible.length, 2);
  assert.throws(() => admitShortTextSelection({tag:"finance"}, pack), /no qualified entries/);
});

test("random selection is unbiased by modulo and bounded on faulty entropy", () => {
  const values = [0xffffffff, 4];
  assert.equal(uniformRandomIndex(3, () => values.shift()), 1);
  assert.equal(uniformRandomIndex(1, () => 4294967295), 0);
  assert.throws(() => uniformRandomIndex(3, () => -1), /uint32/);
  assert.throws(() => uniformRandomIndex(3, () => 0xffffffff), /failed/);
});

test("chosen fortune preserves corpus identity, per-entry digest and selected topic", () => {
  const chosen = selectQualifiedShortText(pack, {tag:"weather"}, {drawWord:() => 1});
  assert.equal(chosen.entryId, "third");
  assert.equal(chosen.text, "The wind tests the gate.");
  assert.equal(chosen.packDigest, pack.digest);
  assert.equal(chosen.entryDigest, qualifiedTextDigest(pack.entries[2]));
  assert.equal(chosen.selectionMethod, "uniform-csprng-rejection-sampling");
  assert.equal(chosen.rightsBasis, "seller-originated-text");
});

test("live ready original corpus is selected through generic machinery with no payment fiction", async () => {
  const manifest = fortuneProductManifest();
  assert.equal(manifest.entryCount, 50);
  assert.ok(manifest.tags.includes("computing"));
  assert.equal(manifest.paymentEvidence, null);
  assert.equal(manifest.deploymentEvidence, null);
  assert.equal((await admitRandomFortuneQuery({tag:"sea"})).admitted, true);
  const result = await drawRandomFortune({tag:"sea"});
  assert.equal(result.kind, "561.qualified-short-text-sample.v1");
  assert.equal(result.packDigest, manifest.packDigest);
  assert.ok(result.tags.includes("sea"));
  assert.equal(result.paymentReceipt, null);
  assert.match(result.commercialScope, /not exclusive rights/);
});


test("one seller can add qualified editions without inventing new payment machinery", async () => {
  const next = qualifyShortTextPack({...original, packId:"second-corpus", edition:"october-2026"});
  const shelf = createQualifiedShortTextShelf({packs:[pack,next]});
  assert.equal(shelf.catalog().length, 2);
  const query = {packId:"second-corpus", edition:"october-2026", packDigest:next.digest, tag:"weather"};
  const admission = await shelf.admit(query);
  assert.equal(admission.eligibleCount, 2);
  const drawn = await shelf.draw(query, {drawWord:() => 1});
  assert.equal(drawn.packDigest, next.digest);
  assert.equal(drawn.entryId, "third");
  await assert.rejects(shelf.admit({...query, packDigest:pack.digest}), /currently admitted exact edition/);
  await assert.rejects(shelf.admit({...query, price:"0"}), /select one listed/);
  await assert.rejects(shelf.admit({...query, tag:"missing"}), /no qualified entries/);
  assert.throws(() => createQualifiedShortTextShelf({packs:[pack,pack]}), /duplicate corpus edition/);
});

test("third-party paid editions require current rights at both admission and execution", async () => {
  const source={name:"Fixture licensed collection",url:"https://example.org/fortunes"};
  const rights={basis:"item-by-item-license-review",reviewedBy:"test-reviewer",
    reviewedOn:"2026-10-22",sourceLicenseEvidence:"https://example.org/rights",
    commercialDelivery:true,redistribution:true};
  const items=original.entries.map(entry=>({...entry,attribution:"fixture author",
    rights:{commercialDelivery:true,redistribution:true,evidenceUrl:"https://example.org/rights/entry"}}));
  const external=qualifyShortTextPack({...original,packId:"licensed-source",sourceKind:"third-party",source,rights,entries:items});
  assert.throws(() => createQualifiedShortTextShelf({packs:[external]}), /reauthorization/);
  const phases=[];
  const shelf=createQualifiedShortTextShelf({packs:[external],authorizeUse: async ({stage})=>{
    phases.push(stage);
    return stage==="before-payment";
  }});
  const req={packId:external.packId,edition:external.edition,packDigest:external.digest};
  await shelf.admit(req);
  await assert.rejects(shelf.draw(req),/current source rights authority refused/);
  assert.deepEqual(phases,["before-payment","after-settlement"]);
});


test("shipped 50-entry Unix textfile and JSON corpus are byte-text identical", () => {
  const raw = readFileSync(new URL("../data/fortunes/561-original-october-2026.fortune", import.meta.url), "utf8");
  const corpus = JSON.parse(readFileSync(new URL("../data/fortunes/561-original-october-2026.json", import.meta.url), "utf8"));
  assert.deepEqual(parseUnixFortuneData(raw), corpus.entries.map(entry => entry.text));
});
