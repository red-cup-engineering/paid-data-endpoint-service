import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';

const WORLD_BANK = 'https://api.worldbank.org';
const CHIRPS = 'https://data.chc.ucsb.edu';
const DATE = /^\d{4}-\d{2}-\d{2}$/u;
const YEAR = /^\d{4}$/u;
const SHA = /^sha256:[0-9a-f]{64}$/u;
const MAX_JSON_BYTES = 1_000_000;

/** Dataset-level observed eligibility, NOT a license for an entire country. */
export const INTERNATIONAL_SOURCES = Object.freeze({
  'wdi-cn-gdp': Object.freeze({
    id: 'wdi-cn-gdp', family: 'world-bank-indicator', country: 'CN', indicator: 'NY.GDP.MKTP.CD',
    title: 'China GDP (current US$)', unit: 'current US dollars', sourceCredit: 'Country official statistics, national statistical organizations and/or central banks; OECD; World Bank staff estimates',
    rights: Object.freeze({ state: 'qualified-for-conditional-resale', license: 'CC-BY-4.0',
      checkedOn: '2026-10-21', reviewBy: '2027-01-21',
      termsUrl: 'https://data.worldbank.org/summary-terms-of-use',
      indicatorUrl: 'https://data.worldbank.org/indicator/NY.GDP.MKTP.CD?locations=CN',
      attribution: 'The World Bank: World Development Indicators: GDP (current US$), China; original sources as indicated',
      obligations: Object.freeze(['attribution', 'mark transformations', 'pass-through attribution', 'no endorsement', 'recheck third-party restrictions per indicator']),
    }),
  }),
  'wdi-cn-inflation': Object.freeze({
    id: 'wdi-cn-inflation', family: 'world-bank-indicator', country: 'CN', indicator: 'FP.CPI.TOTL.ZG',
    title: 'China consumer-price inflation (annual %)', unit: 'percent annual', sourceCredit: 'International Monetary Fund, International Financial Statistics',
    rights: Object.freeze({ state: 'qualified-for-conditional-resale', license: 'CC-BY-4.0',
      checkedOn: '2026-10-21', reviewBy: '2027-01-21',
      termsUrl: 'https://data.worldbank.org/summary-terms-of-use',
      indicatorUrl: 'https://data.worldbank.org/indicator/FP.CPI.TOTL.ZG?locations=CN',
      attribution: 'The World Bank: World Development Indicators: Inflation, consumer prices (annual %), China; IMF International Financial Statistics',
      obligations: Object.freeze(['attribution', 'mark transformations', 'pass-through attribution', 'no endorsement', 'recheck third-party restrictions per indicator']),
    }),
  }),
  'chirps3-africa-rainfall': Object.freeze({
    id: 'chirps3-africa-rainfall', family: 'climate-hazards-archive', coverage: 'Africa within CHIRPS v3 domain 60°S–60°N',
    title: 'CHIRPS v3 precipitation, Africa-targeted subsets', unit: 'millimetres daily precipitation',
    rights: Object.freeze({ state: 'qualified-source-unacquired-assets', license: 'CC-BY-4.0',
      checkedOn: '2026-10-21', reviewBy: '2027-01-21',
      termsUrl: 'https://www.chc.ucsb.edu/data/chirps3',
      indicatorUrl: 'https://www.chc.ucsb.edu/data/chirps3',
      attribution: 'Climate Hazards Center, UC Santa Barbara, CHIRPS3 Data Repository, doi:10.15780/G2JQ0P; accessed [date]',
      obligations: Object.freeze(['attribution', 'cite specific product and version', 'document preliminary or final processing and missing values', 'record raster bytes and actual geographic subset']),
    }),
  }),
  'china-nbs-website': Object.freeze({
    id: 'china-nbs-website', family: 'restricted-website', country: 'CN',
    title: 'National Bureau of Statistics of China website data',
    rights: Object.freeze({ state: 'commercial-resale-held', license: null,
      checkedOn: '2026-10-21', reviewBy: '2026-10-21',
      termsUrl: 'https://www.stats.gov.cn/english/nbs/201312/t20131213_480293.html',
      note: 'NBS published FAQ (2013) says use for free, not for commerce; review current terms or obtain written permission before commercial reuse.' }),
  }),
  'tahmo-stations': Object.freeze({
    id: 'tahmo-stations', family: 'controlled-station-network', coverage: 'Multiple African countries',
    title: 'TAHMO cleaned station rainfall',
    rights: Object.freeze({ state: 'commercial-resale-held', license: null,
      checkedOn: '2026-10-21', reviewBy: '2026-10-21',
      termsUrl: 'https://tahmo.org/climate-data/',
      note: 'Portal access and data policy; do not infer commercial redistribution rights from availability of sample data.' }),
  }),
});

function date(s, name) {
  if (typeof s !== 'string' || !DATE.test(s) || !Number.isFinite(Date.parse(s + 'T00:00:00Z')) ||
      new Date(s + 'T00:00:00Z').toISOString().slice(0, 10) !== s) throw new TypeError(`${name} must be an actual ISO date`);
  return s;
}
function observed(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d\d:\d\d)$/u.test(s) || !Number.isFinite(Date.parse(s))) {
    throw new TypeError('observedAt must have an explicit timezone');
  }
  return new Date(s).toISOString();
}
function year(s, name) {
  if (typeof s !== 'string' || !YEAR.test(s) || Number(s) < 1960 || Number(s) > 2200) throw new TypeError(`${name} must be a year from 1960 to 2200`);
  return s;
}
function canonical(v) {
  if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
  if (v !== null && typeof v === 'object') return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}';
  return JSON.stringify(v);
}
export function internationalLotDigest(value) { return 'sha256:' + createHash('sha256').update(canonical(value)).digest('hex'); }

export function qualifyInternationalSource(id, { asOf = new Date().toISOString().slice(0, 10), commercial = true } = {}) {
  const source = INTERNATIONAL_SOURCES[id];
  if (!source) throw new TypeError('unlisted data source requires source-specific rights review');
  const rights = source.rights;
  date(asOf, 'asOf');
  if (asOf < rights.checkedOn || asOf > rights.reviewBy) throw new Error('source rights review is missing, expired or from the future');
  if (commercial && !['qualified-for-conditional-resale', 'qualified-source-unacquired-assets'].includes(rights.state)) {
    throw new Error('commercial redistribution has not been qualified for this source');
  }
  return source;
}

export function worldBankIndicatorURL({ sourceId, fromYear, throughYear, perPage = 200, asOf = new Date().toISOString().slice(0, 10) } = {}) {
  const source = qualifyInternationalSource(sourceId, { asOf });
  if (source.family !== 'world-bank-indicator') throw new TypeError('World Bank indicator source required');
  year(fromYear, 'fromYear'); year(throughYear, 'throughYear');
  if (throughYear < fromYear) throw new RangeError('time window inverted');
  if (!Number.isInteger(perPage) || perPage < 1 || perPage > 500) throw new RangeError('perPage outside bounded API budget');
  const url = new URL(`/v2/country/${source.country}/indicator/${source.indicator}`, WORLD_BANK);
  url.searchParams.set('format', 'json');
  url.searchParams.set('date', `${fromYear}:${throughYear}`);
  url.searchParams.set('per_page', String(perPage));
  url.searchParams.set('page', '1');
  return url.toString();
}

function worldBankSeriesRecords(body, source, fromYear, throughYear) {
  if (!Array.isArray(body) || body.length !== 2 || !Array.isArray(body[1]) || body[1].length > 500) {
    throw new TypeError('World Bank API returned no bounded two-part indicator array');
  }
  const meta = body[0];
  if (meta?.page !== 1 || meta?.pages !== 1 || !Number.isInteger(meta?.total) || meta.total < body[1].length) {
    throw new Error('World Bank response is incomplete or paginated; narrow request or collect verified pages');
  }
  const records = body[1].map(r => {
    if (r?.indicator?.id !== source.indicator || r?.country?.id !== source.country ||
        (r.countryiso3code !== undefined && r.countryiso3code !== 'CHN')) {
      throw new TypeError('indicator or country does not match qualified source');
    }
    const period = year(r.date, 'indicator year');
    if (period < fromYear || period > throughYear) throw new TypeError('indicator year lies outside requested range');
    if (r.value !== null && (typeof r.value !== 'number' || !Number.isFinite(r.value))) {
      throw new TypeError('indicator value must be finite or explicitly unavailable');
    }
    return { year: period, value: r.value };
  }).sort((a, b) => a.year.localeCompare(b.year));
  if (new Set(records.map(r => r.year)).size !== records.length) throw new TypeError('duplicate period in World Bank data');
  return records;
}

export function worldBankInventoryLot({ sourceId, fromYear, throughYear, response, observedAt, asOf = new Date().toISOString().slice(0, 10) } = {}) {
  const source = qualifyInternationalSource(sourceId, { asOf });
  if (source.family !== 'world-bank-indicator') throw new TypeError('World Bank series required');
  const url = worldBankIndicatorURL({ sourceId, fromYear, throughYear, asOf });
  const records = worldBankSeriesRecords(response, source, fromYear, throughYear);
  const digest = internationalLotDigest({ sourceId, fromYear, throughYear, records, rights: source.rights });
  return {
    schemaVersion: '561.international-inventory.v1', kind: 'world-bank-indicator',
    sourceId, digest, lotId: `urn:561:international-inventory:${digest.slice(7)}`, observedAt: observed(observedAt),
    rightsCheckedOn: asOf, metadata: { country: source.country, indicator: source.indicator, title: source.title,
      unit: source.unit, originalSourceCredit: source.sourceCredit, officialIndicatorUrl: source.rights.indicatorUrl,
      attribution: source.rights.attribution, rights: source.rights, sourceUrl: url,
      sourceObservation: 'one API response processed by the seller; not independently signed by the World Bank' },
    request: { fromYear, throughYear }, recordCount: records.length, records,
    sales: { state: 'no-sale-recorded', payment: null, endUserAcceptance: null },
  };
}

/** Check before a paid offer or deriving a new SKU. */
export function verifyWorldBankInventoryLot(lot, { asOf = new Date().toISOString().slice(0, 10) } = {}) {
  if (!lot || lot.kind !== 'world-bank-indicator' || lot.schemaVersion !== '561.international-inventory.v1') throw new TypeError('World Bank lot required');
  const source = qualifyInternationalSource(lot.sourceId, { asOf });
  if (source.family !== 'world-bank-indicator' || !isDeepStrictEqual(lot.metadata?.rights, source.rights) ||
      lot.rightsCheckedOn > asOf || lot.rightsCheckedOn < source.rights.checkedOn ||
      !isDeepStrictEqual(lot.metadata?.attribution, source.rights.attribution)) {
    throw new Error('source license, edition or attribution not verified');
  }
  const { fromYear, throughYear } = lot.request ?? {};
  const sourceUrl = worldBankIndicatorURL({ sourceId: lot.sourceId, fromYear, throughYear, asOf });
  if (lot.metadata.sourceUrl !== sourceUrl || lot.metadata.country !== source.country ||
      lot.metadata.indicator !== source.indicator || lot.metadata.unit !== source.unit ||
      lot.metadata.title !== source.title || lot.metadata.originalSourceCredit !== source.sourceCredit ||
      lot.metadata.officialIndicatorUrl !== source.rights.indicatorUrl ||
      lot.metadata.sourceObservation !== 'one API response processed by the seller; not independently signed by the World Bank') throw new Error('source definition does not match qualified dataset');
  observed(lot.observedAt);
  if (!Array.isArray(lot.records) || lot.records.length > 500) throw new TypeError('bounded records required');
  let previous = '';
  for (const r of lot.records) {
    if (!r || Object.keys(r).sort().join(',') !== 'value,year') throw new TypeError('noncanonical numeric record');
    year(r.year, 'year');
    if (r.year < fromYear || r.year > throughYear || r.year <= previous) throw new Error('series periods out of range, duplicated or unsorted');
    if (r.value !== null && (typeof r.value !== 'number' || !Number.isFinite(r.value))) throw new TypeError('nonfinite value');
    previous = r.year;
  }
  const digest = internationalLotDigest({ sourceId: lot.sourceId, fromYear, throughYear, records: lot.records, rights: source.rights });
  if (digest !== lot.digest || lot.lotId !== `urn:561:international-inventory:${digest.slice(7)}` ||
      lot.recordCount !== lot.records.length) throw new Error('World Bank lot digest or record count does not verify');
  if (lot.sales?.state !== 'no-sale-recorded' || lot.sales.payment !== null || lot.sales.endUserAcceptance !== null) {
    throw new TypeError('source inventory must not fabricate a paid sale or consumer acceptance');
  }
  return lot;
}

export async function acquireWorldBankSeries({ sourceId, fromYear, throughYear, fetchImpl = fetch,
  observedAt = new Date().toISOString(), asOf = new Date().toISOString().slice(0, 10) } = {}) {
  const url = worldBankIndicatorURL({ sourceId, fromYear, throughYear, asOf });
  const reply = await fetchImpl(url, { method: 'GET', redirect: 'error', headers: { accept: 'application/json' } });
  if (!reply?.ok) throw new Error(`World Bank upstream HTTP ${reply?.status}; no inventory acquired`);
  if (!/application\/json/u.test(reply.headers?.get('content-type') ?? '')) throw new Error('World Bank did not supply JSON');
  const body = await reply.text();
  if (Buffer.byteLength(body, 'utf8') > MAX_JSON_BYTES) throw new Error('World Bank source exceeds admission byte limit');
  return worldBankInventoryLot({ sourceId, fromYear, throughYear, response: JSON.parse(body), observedAt, asOf });
}

/** A climate *candidate*, not fetched/hashed raster bytes or saleable inventory. */
export function chirpsV3AfricaAsset({ day, variant = 'rnl', asOf = new Date().toISOString().slice(0, 10) } = {}) {
  const source = qualifyInternationalSource('chirps3-africa-rainfall', { asOf });
  date(day, 'day');
  if (day > asOf) throw new RangeError('cannot claim future source file availability');
  if (!['rnl', 'sat'].includes(variant)) throw new TypeError('CHIRPS daily variant must be rnl or sat');
  const yearPart = day.slice(0, 4);
  const assetName = `chirps-v3.0.${variant}.${day.replaceAll('-', '.')}.tif`;
  const resource = new URL(`/products/CHIRPS/v3.0/daily/final/${variant}/${yearPart}/${assetName}`, CHIRPS);
  return {
    schemaVersion: '561.international-source-candidate.v1', kind: 'unacquired-rainfall-raster',
    sourceId: source.id, desiredCoverage: 'Africa (geographic subset not yet extracted)',
    sourceUrl: resource.toString(), day, variant, format: 'GeoTIFF', unit: 'mm/day',
    rights: source.rights, observedRasterHash: null, observedBytes: null,
    state: 'not-acquired-not-saleable',
    requirements: ['verify official file existence and release tier', 'measure downloaded bytes and egress',
      'extract actual bounded Africa-area raster with geospatial provenance', 'hash and independently validate resultant values',
      'record licensing and citation; qualify merchant and buyer before any offer'],
  };
}