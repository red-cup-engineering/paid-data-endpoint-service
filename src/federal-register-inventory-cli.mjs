#!/usr/bin/env node

import { acquireFederalRegisterInventory, deriveFederalRegisterInventory } from "./federal-register-inventory.mjs";
import { acquireWitnessedFederalRegisterInventory, verifyWitnessedFederalRegisterInventory } from "./federal-register-source-witness.mjs";
import { prepareFederalRegisterNewswireCandidates, acquireFederalRegisterNewswireWindow } from "./federal-register-newswire-supply.mjs";

function usage() {
  return "Usage: node src/federal-register-inventory-cli.mjs --since YYYY-MM-DD [--until YYYY-MM-DD] [--term TEXT] [--agency SLUG] [--per-page 1..100] [--comment-close-by YYYY-MM-DD --comment-close-from YYYY-MM-DD --actor ID --service TEXT] [--custody-root DIRECTORY] [--output inventory|wire-candidates] [--max-pages 1..20] [--profile regulatory-decision]\n";
}

async function main(argv = process.argv.slice(2)) {
  if (argv.includes("--help")) { process.stdout.write(usage()); return; }
  const allowed = new Set(["--since", "--until", "--term", "--agency", "--per-page", "--comment-close-by", "--comment-close-from", "--actor", "--service", "--custody-root", "--output", "--max-pages", "--profile"]);
  const options = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    if (!allowed.has(key) || !argv[index + 1] || options[key] !== undefined) {
      throw new TypeError(`invalid option ${key ?? "<missing>"}; ${usage()}`);
    }
    options[key] = argv[index + 1];
  }
  const search = {
    since: options["--since"],
    ...(options["--until"] ? { until: options["--until"] } : {}),
    ...(options["--term"] ? { term: options["--term"] } : {}),
    ...(options["--agency"] ? { agency: options["--agency"] } : {}),
    ...(options["--per-page"] ? { perPage: Number(options["--per-page"]) } : {}),
    ...(options["--profile"] ? { profile: options["--profile"] } : {}),
  };
  // The ordinary acquisition remains for non-commercial exploratory use.
  // --custody-root performs the real provider HTTP-byte retention and makes
  // this run independently replayable before any downstream paid offer.
  const root = options["--custody-root"];
  const output = options["--output"] ?? "inventory";
  if (!["inventory","wire-candidates"].includes(output)) throw new TypeError("unsupported original data output: " + output);
  if (output === "wire-candidates" && !root) throw new TypeError("Newswire candidates require original --custody-root HTTP-byte evidence");
  const maxPages = Number(options["--max-pages"] ?? 1);
  if (!Number.isSafeInteger(maxPages) || maxPages < 1 || maxPages > 20) throw new RangeError("--max-pages must be 1..20");
  if (maxPages > 1) {
    if (output !== "wire-candidates" || !root ||
        options["--comment-close-by"] || options["--comment-close-from"] || options["--actor"] || options["--service"]) {
      throw new TypeError("multiple source pages require --custody-root and --output wire-candidates without reseller filters");
    }
    const received = await acquireFederalRegisterNewswireWindow({
      search, root, maxPages, perPage:options["--per-page"] ? Number(options["--per-page"]) : 100,
    });
    process.stdout.write(`${JSON.stringify(received, null, 2)}\n`);
    return;
  }
  const lot = root
    ? await acquireWitnessedFederalRegisterInventory({search,root})
    : await acquireFederalRegisterInventory({search});
  const derive = options["--comment-close-by"] !== undefined || options["--comment-close-from"] !== undefined || options["--actor"] !== undefined || options["--service"] !== undefined;
  if (derive && (!options["--comment-close-by"] || !options["--actor"] || !options["--service"])) {
    throw new TypeError("a reseller filter requires --comment-close-by, --actor and --service together");
  }
  if (derive && !root) throw new TypeError("qualified reselling requires --custody-root and independently verifiable provider bytes");
  const published = derive
    ? deriveFederalRegisterInventory(lot, { filters: { commentsCloseBy: options["--comment-close-by"], ...(options["--comment-close-from"] ? { commentsCloseOnOrAfter: options["--comment-close-from"] } : {}) }, actorId: options["--actor"], service: options["--service"] })
    : lot;
  if (root) await verifyWitnessedFederalRegisterInventory({lot:published,root});
  const result = output === "wire-candidates"
    ? await prepareFederalRegisterNewswireCandidates({lot:published,root})
    : published;
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

main().catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
