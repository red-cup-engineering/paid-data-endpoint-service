import defaults from '../data/source-declarations/international.json' with { type: 'json' };
import { isDeepStrictEqual } from 'node:util';

// Reserved v1 identities. New declarations, including new default-file entries, use v2.
const legacyDefinitions = {
  "wdi-cn-gdp": {
    "id": "wdi-cn-gdp",
    "family": "world-bank-indicator",
    "country": "CN",
    "indicator": "NY.GDP.MKTP.CD",
    "title": "China GDP (current US$)",
    "unit": "current US dollars",
    "sourceCredit": "Country official statistics, national statistical organizations and/or central banks; OECD; World Bank staff estimates",
    "countryISO3": "CHN"
  },
  "wdi-cn-inflation": {
    "id": "wdi-cn-inflation",
    "family": "world-bank-indicator",
    "country": "CN",
    "indicator": "FP.CPI.TOTL.ZG",
    "title": "China consumer-price inflation (annual %)",
    "unit": "percent annual",
    "sourceCredit": "International Monetary Fund, International Financial Statistics",
    "countryISO3": "CHN"
  },
  "chirps3-africa-rainfall": {
    "id": "chirps3-africa-rainfall",
    "family": "climate-hazards-archive",
    "coverage": "Africa within CHIRPS v3 domain 60°S–60°N",
    "title": "CHIRPS v3 precipitation, Africa-targeted subsets",
    "unit": "millimetres daily precipitation"
  },
  "sse-market-data": {
    "id": "sse-market-data",
    "family": "licensed-exchange-data",
    "country": "CN",
    "title": "Shanghai Stock Exchange market data"
  },
  "szse-market-data": {
    "id": "szse-market-data",
    "family": "licensed-exchange-data",
    "country": "CN",
    "title": "Shenzhen Stock Exchange market data"
  },
  "china-nbs-website": {
    "id": "china-nbs-website",
    "family": "restricted-website",
    "country": "CN",
    "title": "National Bureau of Statistics of China website data"
  },
  "tahmo-stations": {
    "id": "tahmo-stations",
    "family": "controlled-station-network",
    "coverage": "Multiple African countries",
    "title": "TAHMO cleaned station rainfall"
  }
};
for (const definition of Object.values(legacyDefinitions)) Object.freeze(definition);
Object.freeze(legacyDefinitions);

export function internationalSourceDefinition(source) {
  const { rights: _rights, ...definition } = source;
  return definition;
}
export function internationalInventoryVersion(sourceId) {
  return Object.hasOwn(legacyDefinitions, sourceId)
    ? '561.international-inventory.v1' : '561.international-inventory.v2';
}


const admitted = new WeakSet();
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const sourceFields = new Set(['id', 'family', 'country', 'countryISO3', 'indicator', 'coverage', 'title', 'unit', 'sourceCredit', 'rights']);
const rightsFields = new Set(['state', 'license', 'checkedOn', 'reviewBy', 'termsUrl', 'indicatorUrl', 'attribution', 'obligations', 'note']);
const states = new Set(['qualified-for-conditional-resale', 'qualified-source-unacquired-assets', 'commercial-resale-held']);
const families = new Set(['world-bank-indicator', 'climate-hazards-archive', 'licensed-exchange-data', 'restricted-website', 'controlled-station-network']);
const nonempty = (value, name, maximum = 8192) => {
  if (typeof value !== 'string' || !value.trim() || value.trim() !== value || value.length > maximum) throw new TypeError(`${name} requires bounded nonempty text`);
};
const date = value => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(value)
      || !Number.isFinite(Date.parse(value + 'T00:00:00Z'))
      || new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) !== value) throw new TypeError('source review requires actual ISO dates');
};
const https = value => {
  let url; try { url = new URL(value); } catch {}
  if (typeof value !== 'string' || value.length > 4096 || url?.protocol !== 'https:' || url.username || url.password || url.hash) throw new TypeError('source evidence requires an HTTPS URL');
};

/** Capture deployment-owned data once. Buyer requests still select only their
 * original source ID or lot digest; they never supply source declarations. */
export function admitInternationalSourceDeclarations(input) {
  if (record(input) && admitted.has(input)) return input;
  if (!record(input) || Object.keys(input).length === 0 || Object.keys(input).length > 20000) {
    throw new TypeError('source declarations require one through 20000 named sources');
  }
  // JSON data is the declaration boundary. Capture it before validation so a
  // caller cannot change the source or rights selected by a running merchant.
  const sources = structuredClone(input);
  for (const [id, source] of Object.entries(sources)) {
    if (!/^[a-z0-9][a-z0-9._-]{0,127}$/u.test(id) || !record(source) || source.id !== id
        || Object.keys(source).some(key => !sourceFields.has(key)) || !families.has(source.family)) {
      throw new TypeError('source declarations require matching IDs and a supported adapter family');
    }
    nonempty(source.title, 'source title');
    for (const name of ['unit', 'coverage', 'sourceCredit']) if (Object.hasOwn(source, name)) nonempty(source[name], name);
    if (Object.hasOwn(source, 'country') && (typeof source.country !== 'string' || !/^[A-Z]{2}$/u.test(source.country))) throw new TypeError('source country must be a two-letter code');
    if (Object.hasOwn(source, 'countryISO3') && (typeof source.countryISO3 !== 'string' || !/^[A-Z]{3}$/u.test(source.countryISO3))) throw new TypeError('source countryISO3 must be a three-letter code');
    if (Object.hasOwn(source, 'indicator') && (typeof source.indicator !== 'string' || !/^[A-Z0-9][A-Z0-9._-]{0,127}$/u.test(source.indicator))) throw new TypeError('source indicator must be a bounded indicator code');
    if (Object.hasOwn(legacyDefinitions, id) && !isDeepStrictEqual(internationalSourceDefinition(source), legacyDefinitions[id])) {
      throw new TypeError('reserved source ID must retain its original dataset definition');
    }
    const rights = source.rights;
    if (!record(rights) || Object.keys(rights).some(key => !rightsFields.has(key)) || !states.has(rights.state)) {
      throw new TypeError('source declarations require their original rights review');
    }
    date(rights.checkedOn); date(rights.reviewBy);
    if (rights.reviewBy < rights.checkedOn) throw new TypeError('source review window is inverted');
    https(rights.termsUrl);
    if (Object.hasOwn(rights, 'indicatorUrl')) https(rights.indicatorUrl);
    if (rights.license !== null) nonempty(rights.license, 'source license', 256);
    for (const name of ['attribution', 'note']) if (Object.hasOwn(rights, name)) nonempty(rights[name], name);
    if (Object.hasOwn(rights, 'obligations')) {
      if (!Array.isArray(rights.obligations) || rights.obligations.length > 64) throw new TypeError('source obligations must be a bounded array');
      for (const obligation of rights.obligations) nonempty(obligation, 'source obligation');
      Object.freeze(rights.obligations);
    }
    if (rights.state !== 'commercial-resale-held'
        && (rights.license === null || !rights.attribution || !rights.obligations?.length)) {
      throw new TypeError('a qualified source requires its license, attribution and obligations');
    }
    if (source.family === 'world-bank-indicator') {
      if (typeof source.country !== 'string' || !/^[A-Z]{2}$/u.test(source.country)
          || typeof source.countryISO3 !== 'string' || !/^[A-Z]{3}$/u.test(source.countryISO3)
          || typeof source.indicator !== 'string' || !/^[A-Z0-9][A-Z0-9._-]{0,127}$/u.test(source.indicator)) {
        throw new TypeError('World Bank sources require country, countryISO3 and indicator codes');
      }
      nonempty(source.unit, 'indicator unit'); nonempty(source.sourceCredit, 'original source credit');
      https(rights.indicatorUrl);
    }
    Object.freeze(rights); Object.freeze(source);
  }
  Object.freeze(sources); admitted.add(sources);
  return sources;
}

export const INTERNATIONAL_SOURCES = admitInternationalSourceDeclarations(defaults);
