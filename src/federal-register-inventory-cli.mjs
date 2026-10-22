#!/usr/bin/env node

import { acquireFederalRegisterInventory, deriveFederalRegisterInventory } from "./federal-register-inventory.mjs";

function usage() {
  return "Usage: node src/federal-register-inventory-cli.mjs --since YYYY-MM-DD [--until YYYY-MM-DD] [--term TEXT] [--agency SLUG] [--per-page 1..100] [--comment-close-by YYYY-MM-DD --comment-close-from YYYY-MM-DD --actor ID --service TEXT]\n";
}

async function main(argv = process.argv.slice(2)) {
  if (argv.includes("--help")) { process.stdout.write(usage()); return; }
  const allowed = new Set(["--since", "--until", "--term", "--agency", "--per-page", "--comment-close-by", "--comment-close-from", "--actor", "--service"]);
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
  };
  const lot = await acquireFederalRegisterInventory({ search });
  const derive = options["--comment-close-by"] !== undefined || options["--comment-close-from"] !== undefined || options["--actor"] !== undefined || options["--service"] !== undefined;
  if (derive && (!options["--comment-close-by"] || !options["--actor"] || !options["--service"])) {
    throw new TypeError("a reseller filter requires --comment-close-by, --actor and --service together");
  }
  const published = derive
    ? deriveFederalRegisterInventory(lot, { filters: { commentsCloseBy: options["--comment-close-by"], ...(options["--comment-close-from"] ? { commentsCloseOnOrAfter: options["--comment-close-from"] } : {}) }, actorId: options["--actor"], service: options["--service"] })
    : lot;
  process.stdout.write(`${JSON.stringify(published, null, 2)}\n`);
}

main().catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
