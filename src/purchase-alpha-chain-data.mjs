#!/usr/bin/env node

import { pathToFileURL } from "node:url";

import { x402Client, x402HTTPClient } from "@x402/core/client";
import { registerExactEvmScheme } from "@x402/evm/exact/client";
import { Wallet } from "ethers";
import { privateKeyToAccount } from "viem/accounts";

import { ALPHA_NETWORK, EAVT_DATOM_JSONL_MEDIA_TYPE } from "./alpha-chain-service.mjs";
import { readFile, stat } from "node:fs/promises";

async function privateText(path, name) {
  const metadata = await stat(path);
  if (!metadata.isFile() || (metadata.mode & 0o077) !== 0) throw new TypeError(`${name} must be private`);
  return readFile(path, "utf8");
}

async function paidFetch({ client, url, init }) {
  const unpaid = await fetch(url, init);
  if (unpaid.status !== 402) throw new Error(`expected 402 challenge, received ${unpaid.status}`);
  const body = await unpaid.clone().json().catch(() => undefined);
  const requirement = client.getPaymentRequiredResponse((name) => unpaid.headers.get(name), body);
  const payload = await client.createPaymentPayload(requirement);
  const paymentHeaders = client.encodePaymentSignatureHeader(payload);
  const paid = await fetch(url, { ...init, headers: { ...(init?.headers ?? {}), ...paymentHeaders } });
  const result = await paid.json();
  const protocol = await client.processResponse(new Response(JSON.stringify(result), { status: paid.status, headers: paid.headers }));
  if (paid.status < 200 || paid.status >= 300 || protocol.paymentStatus !== "settled") {
    throw new Error(`paid request failed: ${paid.status} ${JSON.stringify({ protocol, result })}`);
  }
  return Object.freeze({ challenge: requirement, payload, protocol, result });
}

async function main() {
  const [keystore, password] = await Promise.all([
    privateText(process.env.PAYER_KEYSTORE_PATH, "PAYER_KEYSTORE_PATH"),
    privateText(process.env.PAYER_KEYSTORE_PASSWORD_PATH, "PAYER_KEYSTORE_PASSWORD_PATH"),
  ]);
  const wallet = await Wallet.fromEncryptedJson(keystore, password.trim());
  const signer = privateKeyToAccount(wallet.privateKey);
  const core = new x402Client();
  registerExactEvmScheme(core, { signer, networks: [ALPHA_NETWORK] });
  const client = new x402HTTPClient(core);
  const origin = (process.env.DATA_MARKET_ORIGIN ?? "https://bare-cedar-fog.561.group").replace(/\/$/u, "");
  const resource = process.env.DATA_RESOURCE ?? `integration/${Date.now()}`;
  const content = process.env.DATA_BODY ?? `${JSON.stringify({ e: "urn:ame:union-alpha-data-market", a: "urn:emsenn:paid-data:message", v: { kind: "literal", value: "Union alpha x402 paid write/read acceptance proof" }, tx: new Date().toISOString(), op: "assert" })}\n`;
  const write = await paidFetch({
    client,
    url: `${origin}/x402/data/write`,
    init: { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ resource, mediaType: EAVT_DATOM_JSONL_MEDIA_TYPE, body: content }) },
  });
  const read = await paidFetch({
    client,
    url: `${origin}/x402/data/read?resource=${encodeURIComponent(resource)}`,
    init: { method: "GET" },
  });
  process.stdout.write(`${JSON.stringify({
    type: "UnionAlphaX402PurchaseProof",
    payer: signer.address,
    resource,
    writeSettlement: write.protocol.header,
    writeResult: write.result,
    readSettlement: read.protocol.header,
    readResult: read.result,
  }, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exitCode = 1;
});
