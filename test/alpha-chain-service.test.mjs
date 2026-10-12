import assert from "node:assert/strict";
import test from "node:test";
import { privateKeyToAccount } from "viem/accounts";
import { createAlphaDataMarket, ALPHA_NETWORK } from "../src/alpha-chain-service.mjs";

const ACCOUNT = privateKeyToAccount(`0x${"11".repeat(32)}`);
const CONTRACT = "0x0000000000000000000000000000000000000001";
const TOKEN = "0x0000000000000000000000000000000000000002";
const PAY_TO = "0x0000000000000000000000000000000000000003";

function unusedClient(name) {
  return new Proxy({}, { get: () => () => { throw new Error(`${name} should not be called for this request`); } });
}

function market(overrides = {}) {
  return createAlphaDataMarket({
    account: ACCOUNT,
    publicClient: unusedClient("publicClient"),
    walletClient: unusedClient("walletClient"),
    resourceContract: CONTRACT,
    token: TOKEN,
    payTo: PAY_TO,
    ...overrides,
  });
}

test("GET /healthz reports the account and network without touching chain clients", async () => {
  const res = await market().fetch(new Request("https://alpha.test/healthz"));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.deepEqual(body, { ok: true, network: ALPHA_NETWORK, account: ACCOUNT.address });
});

test("GET /x402/data/offer describes both priced operations without requiring payment", async () => {
  const res = await market({ writeAmount: "500", readAmount: "50" }).fetch(new Request("https://alpha.test/x402/data/offer"));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.type, "UnionAlphaPaidDataOffer");
  assert.equal(body.operations.write.price.amount, "500");
  assert.equal(body.operations.read.price.amount, "50");
  assert.equal(body.storage.contract, CONTRACT);
});

test("GET /x402/facilitator/supported reports the registered exact-EVM scheme", async () => {
  const res = await market().fetch(new Request("https://alpha.test/x402/facilitator/supported"));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(body.kinds.some((kind) => kind.scheme === "exact" && kind.network === ALPHA_NETWORK));
});

test("POST /x402/facilitator/verify refuses a non-v2 envelope without touching chain clients", async () => {
  const res = await market().fetch(new Request("https://alpha.test/x402/facilitator/verify", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ x402Version: 1 }),
  }));
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /x402 v2/);
});

test("POST /x402/facilitator/settle refuses a malformed payload without touching chain clients", async () => {
  const res = await market().fetch(new Request("https://alpha.test/x402/facilitator/settle", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ x402Version: 2, paymentPayload: {}, paymentRequirements: {} }),
  }));
  assert.equal(res.status, 400);
});

test("GET /x402/data/read with no payment gets a 402 challenge naming the read price, and never reaches the chain client", async () => {
  const res = await market({ readAmount: "77" }).fetch(new Request("https://alpha.test/x402/data/read?resource=a/b"));
  assert.equal(res.status, 402);
  const challenge = JSON.parse(Buffer.from(res.headers.get("payment-required"), "base64").toString("utf8"));
  assert.equal(challenge.accepts[0].amount, "77");
});

test("POST /x402/data/write with no payment gets a 402 challenge naming the write price, and never reaches the chain client", async () => {
  const res = await market({ writeAmount: "999" }).fetch(new Request("https://alpha.test/x402/data/write", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ resource: "a", mediaType: "text/plain", body: "hi" }),
  }));
  assert.equal(res.status, 402);
  const challenge = JSON.parse(Buffer.from(res.headers.get("payment-required"), "base64").toString("utf8"));
  assert.equal(challenge.accepts[0].amount, "999");
});
