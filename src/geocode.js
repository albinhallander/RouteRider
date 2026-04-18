// Free, keyless geocoding via OpenStreetMap's Nominatim service.
// Used to resolve any city name the user types in the chat — not just the
// 10 hardcoded ones we ship with as quick-reply buttons.
//
// Policy: rate-limited to ~1 req/sec for demo usage. A short in-memory
// cache keeps repeated lookups instant, and common Nordic cities are
// pre-seeded so the demo never hits the network for the quick-reply buttons.

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';

// Pre-seeded: the quick-reply buttons + common English/stripped-accent
// variants so "Gothenburg" and "Copenhagen" resolve instantly without a
// network round-trip.
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

export async function geocodeCity(query) {
  const key = (query ?? '').trim().toLowerCase();
  if (!key) return null;

  if (KNOWN.has(key)) {
    return { label: query.trim(), coords: KNOWN.get(key), source: 'known' };
  }
  if (cache.has(key)) return cache.get(key);

  const url = `${NOMINATIM_URL}?q=${encodeURIComponent(query)}&format=json&limit=1`;
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`Nominatim ${res.status}`);
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) {
      cache.set(key, null);
      return null;
    }
    const hit = data[0];
    const result = {
      label: query.trim(),
      coords: [parseFloat(hit.lat), parseFloat(hit.lon)],
      displayName: hit.display_name,
      source: 'nominatim'
    };
    cache.set(key, result);
    return result;
  } catch (err) {
    console.warn('[geocode] Nominatim lookup failed for', query, '—', err.message);
    cache.set(key, null);
    return null;
  }
}

// Test seams.
export function __seedGeocodeCacheForTest(query, result) {
  cache.set(query.trim().toLowerCase(), result);
}
export function __clearGeocodeCacheForTest() {
  cache.clear();
}
