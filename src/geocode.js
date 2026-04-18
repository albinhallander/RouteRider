// Geocoding with typo tolerance.
//
// Lookup order for any query:
//   1. Exact match on KNOWN (the 16 quick-reply variants) — microsecond.
//   2. Fuzzy match against the ~80 curated cities in cities.js using
//      normalised Levenshtein similarity. Catches typos like "Stokholm",
//      "Goteburg", "Malmoe".
//   3. Nominatim (OSM) — free, keyless, covers the whole world.
//   4. null — caller decides the fallback policy.

import { CITIES } from './cities.js';

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const FUZZY_THRESHOLD = 0.72; // min similarity to accept a local fuzzy hit

// Pre-seeded quick-reply buttons + common English exonyms. Kept separate
// from cities.js because we want these to always win against the fuzzy
// matcher with zero ambiguity.
const KNOWN = new Map([
  ['göteborg',    [57.7088, 11.9746]],
  ['gothenburg',  [57.7088, 11.9746]],
  ['malmö',       [55.6050, 13.0038]],
  ['malmo',       [55.6050, 13.0038]],
  ['stockholm',   [59.3293, 18.0686]],
  ['södertälje',  [59.1955, 17.6252]],
  ['sodertalje',  [59.1955, 17.6252]],
  ['linköping',   [58.4108, 15.6214]],
  ['linkoping',   [58.4108, 15.6214]],
  ['jönköping',   [57.7826, 14.1618]],
  ['jonkoping',   [57.7826, 14.1618]],
  ['gdansk',      [54.3520, 18.6466]],
  ['oslo',        [59.9139, 10.7522]],
  ['hamburg',     [53.5511, 9.9937]],
  ['köpenhamn',   [55.6761, 12.5683]],
  ['copenhagen',  [55.6761, 12.5683]]
]);

const cache = new Map();

// ─── Fuzzy matching ─────────────────────────────────────────────────────────

function normalise(s) {
  // Lowercase + strip diacritics + collapse any run of ≥3 identical chars
  // to a single char. The run-collapse turns key-mashing typos like
  // "linnnnnnnköping" into "linköping" before distance is computed, while
  // preserving legit double letters (e.g. "Aarhus", "Linnéa").
  return (s ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/(.)\1{2,}/g, '$1');
}

function editDistance(a, b) {
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = new Array(n + 1);
  let curr = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

function similarity(a, b) {
  const maxLen = Math.max(a.length, b.length);
  return maxLen === 0 ? 1 : 1 - editDistance(a, b) / maxLen;
}

// Build a flat list of (normalised-name, city) pairs including aliases so we
// only normalise once at module load.
const FUZZY_INDEX = CITIES.flatMap(c => {
  const keys = [c.name, ...(c.aliases || [])].map(normalise);
  return keys.map(key => ({ key, city: c }));
});

function fuzzyMatch(query) {
  const q = normalise(query);
  if (!q) return null;
  let best = null;
  let bestScore = 0;
  for (const { key, city } of FUZZY_INDEX) {
    const score = similarity(q, key);
    if (score > bestScore) {
      bestScore = score;
      best = city;
    }
  }
  if (best && bestScore >= FUZZY_THRESHOLD) {
    return { label: best.name, coords: [best.lat, best.lng], source: 'fuzzy', score: bestScore };
  }
  return null;
}

// ─── Nominatim ──────────────────────────────────────────────────────────────

async function nominatimLookup(query) {
  const url = `${NOMINATIM_URL}?q=${encodeURIComponent(query)}&format=json&limit=1`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Nominatim ${res.status}`);
  const data = await res.json();
  if (!Array.isArray(data) || data.length === 0) return null;
  const hit = data[0];
  return {
    label: query.trim(),
    coords: [parseFloat(hit.lat), parseFloat(hit.lon)],
    displayName: hit.display_name,
    source: 'nominatim'
  };
}

// ─── Public API ─────────────────────────────────────────────────────────────

export async function geocodeCity(query) {
  const key = normalise(query);
  if (!key) return null;

  if (KNOWN.has(key)) {
    return { label: query.trim(), coords: KNOWN.get(key), source: 'known' };
  }
  if (cache.has(key)) return cache.get(key);

  const local = fuzzyMatch(query);
  if (local) {
    cache.set(key, local);
    return local;
  }

  try {
    const hit = await nominatimLookup(query);
    cache.set(key, hit);
    return hit;
  } catch (err) {
    console.warn('[geocode] Nominatim lookup failed for', query, '—', err.message);
    cache.set(key, null);
    return null;
  }
}

// Test seams.
export function __seedGeocodeCacheForTest(query, result) {
  cache.set(normalise(query), result);
}
export function __clearGeocodeCacheForTest() {
  cache.clear();
}
