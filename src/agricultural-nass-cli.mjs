#!/usr/bin/env node
/**
 * One bounded real NASS acquisition: API key from environment, original store
 * and readback, then an observational candidate for the original Newsroom.
 * NEVER buys/publishes/sells anything.
 */
import { createContentAddressedDirectory } from "./content-addressed-directory.mjs";
import { acquireNassAgriculturalEdition } from "./agricultural-nass.mjs";

const usage = `Usage:
  NASS_API_KEY=<original provider key> node src/agricultural-nass-cli.mjs \\
    --year 2025 --state MN --commodity CORN --statistic YIELD \\
    --custody-root /trusted/source-object-store [--max-rows 250] [--as-of YYYY-MM-DD]

One observed and independently reread source edition. No commercial redistribution
authorization, Newsroom approval, public deploy or x402 sale is implied.
`;

async function main(args = process.argv.slice(2)) {
  if (args.length === 1 && args[0] === "--help") { process.stdout.write(usage); return; }
  if (args.length === 0 || args.length % 2 !== 0) throw new TypeError(usage);
  const options = {};
  const allowed = new Set(["--year","--state","--commodity","--statistic","--custody-root","--max-rows","--as-of"]);
  for (let i = 0; i < args.length; i += 2) {
    if (!allowed.has(args[i]) || Object.hasOwn(options,args[i]) || !args[i+1])
      throw new TypeError("invalid or repeated command option; " + usage);
    options[args[i]] = args[i+1];
  }
  for (const key of ["--year","--state","--commodity","--statistic","--custody-root"])
    if (!options[key]) throw new TypeError("required option missing: " + key + "\n" + usage);
  if (!process.env.NASS_API_KEY)
    throw new Error("NASS_API_KEY missing; acquire your own permitted key from USDA; do not commit credentials");
  const lot = await acquireNassAgriculturalEdition({
    apiKey:process.env.NASS_API_KEY,
    query:{year:options["--year"],stateAlpha:options["--state"],
      commodity:options["--commodity"],statistic:options["--statistic"]},
    fetchImpl:fetch,
    sourceStore:createContentAddressedDirectory({root:options["--custody-root"]}),
    ...(options["--max-rows"] ? {maxRows:Number(options["--max-rows"])} : {}),
    ...(options["--as-of"] ? {asOf:options["--as-of"]} : {})
  });
  process.stdout.write(JSON.stringify(lot,null,2) + "\n");
}
main().catch((error) => {
  process.stderr.write(String(error?.message ?? "acquisition failed") + "\n");
  process.exitCode = 1;
});
