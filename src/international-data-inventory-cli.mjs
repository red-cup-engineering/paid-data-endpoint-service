#!/usr/bin/env node
import { acquireWorldBankSeries, chirpsV3AfricaAsset, INTERNATIONAL_SOURCES } from './international-data-inventory.mjs';

function usage() {
  return `Use: node src/international-data-inventory-cli.mjs --source wdi-cn-gdp|wdi-cn-inflation --from-year YYYY --through-year YYYY
  or: node src/international-data-inventory-cli.mjs --chirps3-day YYYY-MM-DD [--variant rnl|sat]
  or: node src/international-data-inventory-cli.mjs --sources
Requires real publisher network access for World Bank acquisition; CHIRPS3 produces an unacquired asset candidate only.
`;
}
async function main(args = process.argv.slice(2)) {
  if (args.length === 1 && args[0] === '--help') return process.stdout.write(usage());
  if (args.length === 1 && args[0] === '--sources') return process.stdout.write(JSON.stringify(INTERNATIONAL_SOURCES, null, 2) + '\n');
  if (args.length === 0 || args.length % 2 !== 0) throw new TypeError(usage());
  const recognized = new Set(['--source','--from-year','--through-year','--chirps3-day','--variant']);
  const opts = {};
  for (let i = 0; i < args.length; i += 2) {
    if (!recognized.has(args[i]) || opts[args[i]] || !args[i+1]) throw new TypeError('Unknown, duplicate or incomplete option\n' + usage());
    opts[args[i]] = args[i+1];
  }
  if (opts['--chirps3-day']) {
    if (opts['--source'] || opts['--from-year'] || opts['--through-year']) throw new TypeError('Do not mix raster discovery with World Bank acquisition');
    const manifest = chirpsV3AfricaAsset({ day: opts['--chirps3-day'], ...(opts['--variant'] ? { variant: opts['--variant'] } : {}) });
    return process.stdout.write(JSON.stringify(manifest, null, 2) + '\n');
  }
  if (!opts['--source'] || !opts['--from-year'] || !opts['--through-year'] || opts['--variant']) throw new TypeError(usage());
  const lot = await acquireWorldBankSeries({ sourceId: opts['--source'], fromYear: opts['--from-year'], throughYear: opts['--through-year'] });
  process.stdout.write(JSON.stringify(lot, null, 2) + '\n');
}

main().catch(e => { process.stderr.write(String(e?.message ?? e) + '\n'); process.exitCode = 1; });