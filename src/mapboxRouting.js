// Driving-routing helper. Returns real road-following geometry + durations
// for an ordered list of [lat, lng] waypoints.
//
// Provider order:
//   1. Mapbox Directions (driving-traffic) — used when VITE_MAPBOX_TOKEN is set.
//      Traffic-aware, Google-parity durations, 100k req/month free.
//   2. OSRM public demo (router.project-osrm.org) — used by default. No key,
//      free-flow (no live traffic), car profile, rate-limited to reasonable use.
//   3. Haversine estimate — last-resort fallback if the network call fails.
//
// Both Mapbox and OSRM return the same response shape
// (routes[0].duration seconds, routes[0].distance meters,
//  routes[0].geometry as GeoJSON LineString with [lng, lat] coords),
// so one code path handles both.

const MAPBOX_TOKEN = import.meta.env?.VITE_MAPBOX_TOKEN;
const MAPBOX_URL = 'https://api.mapbox.com/directions/v5/mapbox/driving-traffic';
const OSRM_URL = 'https://router.project-osrm.org/route/v1/driving';
const FALLBACK_MIN_PER_KM = 0.8; // ~75 km/h — used only when both providers fail

const R_KM = 6371;
const toRad = d => (d * Math.PI) / 180;

function haversineKm([lat1, lon1], [lat2, lon2]) {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLon / 2) ** 2 * Math.cos(toRad(lat1)) * Math.cos(toRad(lat2));
  return 2 * R_KM * Math.asin(Math.sqrt(h));
}

function totalKm(points) {
  let sum = 0;
  for (let i = 1; i < points.length; i++) sum += haversineKm(points[i - 1], points[i]);
  return sum;
}

function fallbackResult(waypoints) {
  const km = totalKm(waypoints);
  return {
    durationMin: Math.round(km * FALLBACK_MIN_PER_KM),
    distanceKm: Math.round(km),
    geometry: waypoints,
    source: 'fallback'
  };
}

// In-memory cache keyed on the rounded waypoint string so identical routes
// skip the network. 4-dp rounding keeps keys stable across FP drift.
const cache = new Map();
function cacheKey(waypoints) {
  return waypoints.map(([lat, lng]) => `${lat.toFixed(4)},${lng.toFixed(4)}`).join(';');
}

function buildUrl(coords) {
  if (MAPBOX_TOKEN) {
    return {
      url: `${MAPBOX_URL}/${coords}?access_token=${MAPBOX_TOKEN}&geometries=geojson&overview=full`,
      source: 'mapbox'
    };
  }
  return {
    url: `${OSRM_URL}/${coords}?geometries=geojson&overview=full`,
    source: 'osrm'
  };
}

// Per-attempt deadline. Browser default is ~30s which is a poor UX when the
// OSRM public demo hangs — 7s then one retry keeps the full worst-case under
// ~18s and means straight-line fallback appears promptly.
const REQUEST_TIMEOUT_MS = 7000;
const MAX_ATTEMPTS = 2;

async function fetchWithTimeout(url, ms) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function tryFetchRoute(url, source, waypoints) {
  const res = await fetchWithTimeout(url, REQUEST_TIMEOUT_MS);
  if (!res.ok) throw new Error(`${source} ${res.status}`);
  const data = await res.json();
  const route = data.routes?.[0];
  if (!route) throw new Error(`${source}: no route returned`);

  const geometry = (route.geometry?.coordinates || []).map(([lng, lat]) => [lat, lng]);
  return {
    durationMin: Math.round(route.duration / 60),
    distanceKm: Math.round(route.distance / 1000),
    geometry: geometry.length ? geometry : waypoints,
    source
  };
}

export async function fetchDrivingRoute(waypoints) {
  if (!waypoints || waypoints.length < 2) return fallbackResult(waypoints || []);

  const key = cacheKey(waypoints);
  if (cache.has(key)) return cache.get(key);

  const coords = waypoints.map(([lat, lng]) => `${lng},${lat}`).join(';');
  const { url, source } = buildUrl(coords);

  let lastErr;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const result = await tryFetchRoute(url, source, waypoints);
      cache.set(key, result);
      return result;
    } catch (err) {
      lastErr = err;
      if (attempt < MAX_ATTEMPTS) {
        console.warn(`[routing] ${source} attempt ${attempt} failed (${err.name === 'AbortError' ? 'timeout' : err.message}), retrying…`);
      }
    }
  }

  console.warn(`[routing] ${source} gave up after ${MAX_ATTEMPTS} attempts, using haversine fallback:`, lastErr?.message);
  const fb = fallbackResult(waypoints);
  cache.set(key, fb);
  return fb;
}

// Test seams.
export function __seedCacheForTest(waypoints, result) {
  cache.set(cacheKey(waypoints), result);
}
export function __clearCacheForTest() {
  cache.clear();
}
