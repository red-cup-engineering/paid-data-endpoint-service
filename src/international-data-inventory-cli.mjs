#!/usr/bin/env node
import { open } from 'node:fs/promises';
import { constants } from 'node:fs';
import { acquireWorldBankSeries, chirpsV3AfricaAsset, INTERNATIONAL_SOURCES } from './international-data-inventory.mjs';
import { admitInternationalSourceDeclarations } from './international-source-declarations.mjs';

const MAX_SOURCE_BYTES = 32 * 1024 * 1024;

function usage() {
  return `Use: node src/international-data-inventory-cli.mjs --source SOURCE_ID --from-year YYYY --through-year YYYY [--sources-file FILE]
  or: node src/international-data-inventory-cli.mjs --chirps3-day YYYY-MM-DD [--variant rnl|sat] [--sources-file FILE]
  or: node src/international-data-inventory-cli.mjs --sources [--sources-file FILE]
The operator selects the source declaration file. World Bank acquisition reads the publisher API; CHIRPS3 returns an asset candidate.
`;
}

export async function loadInternationalSourceDeclarationsFile(path) {
  if (typeof path !== 'string' || !path) throw new TypeError('source declaration file path is required');
  const file = await open(path, constants.O_RDONLY | constants.O_NONBLOCK);
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.size > MAX_SOURCE_BYTES) throw new TypeError('source declarations require a regular JSON file of at most 32 MiB');
    const chunks = [];
    let length = 0;
    for await (const chunk of file.createReadStream({ autoClose: false, start: 0, end: MAX_SOURCE_BYTES })) {
      length += chunk.byteLength;
      if (length > MAX_SOURCE_BYTES) throw new TypeError('source declaration file exceeds 32 MiB');
      chunks.push(chunk);
    }
    return admitInternationalSourceDeclarations(JSON.parse(Buffer.concat(chunks).toString('utf8')));
  } finally { await file.close(); }
}

async function main(args = process.argv.slice(2)) {
  if (args.length === 1 && args[0] === '--help') return process.stdout.write(usage());
  if (args.length === 0) throw new TypeError(usage());
  const recognized = new Set(['--source','--from-year','--through-year','--chirps3-day','--variant','--sources-file']);
  const opts = Object.create(null);
  for (let i = 0; i < args.length; i += 1) {
    const option = args[i];
    if (Object.hasOwn(opts, option)) throw new TypeError('Duplicate option\n' + usage());
    if (option === '--sources') { opts[option] = true; continue; }
    if (!recognized.has(option) || !args[i + 1] || args[i + 1].startsWith('--')) throw new TypeError('Unknown or incomplete option\n' + usage());
    opts[option] = args[++i];
  }
  if (opts['--sources'] && Object.keys(opts).some((key) => !['--sources', '--sources-file'].includes(key))) {
    throw new TypeError('Source listing accepts only --sources-file');
  }
  if (opts['--chirps3-day']) {
    if (opts['--source'] || opts['--from-year'] || opts['--through-year']) throw new TypeError('Do not mix raster discovery with World Bank acquisition');
  } else if (!opts['--sources'] && (!opts['--source'] || !opts['--from-year'] || !opts['--through-year'] || opts['--variant'])) {
    throw new TypeError(usage());
  }
  const sourceDeclarations = opts['--sources-file']
    ? await loadInternationalSourceDeclarationsFile(opts['--sources-file']) : INTERNATIONAL_SOURCES;
  if (opts['--sources']) return process.stdout.write(JSON.stringify(sourceDeclarations, null, 2) + '\n');
  if (opts['--chirps3-day']) {
    const manifest = chirpsV3AfricaAsset({ day: opts['--chirps3-day'], sourceDeclarations,
      ...(opts['--variant'] ? { variant: opts['--variant'] } : {}) });
    return process.stdout.write(JSON.stringify(manifest, null, 2) + '\n');
  }
  const lot = await acquireWorldBankSeries({ sourceId: opts['--source'], fromYear: opts['--from-year'],
    throughYear: opts['--through-year'], sourceDeclarations });
  process.stdout.write(JSON.stringify(lot, null, 2) + '\n');
}

if (import.meta.main) main().catch(e => { process.stderr.write(String(e?.message ?? e) + '\n'); process.exitCode = 1; });
