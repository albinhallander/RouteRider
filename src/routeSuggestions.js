// Deterministic mock route planner.
// Model: every trip is a round-trip. Outbound = origin → destination (no pickups,
// driver is delivering primary cargo). Backhaul = destination → shippers → origin,
// picking up return loads on the way home. Shippers are filtered to those that
// sit roughly on the destination→origin line and ordered along that return leg.

import { fetchDrivingRoute } from './mapboxRouting.js';
import { geocodeCity } from './geocode.js';

export const GOTHENBURG = [57.7088, 11.9746];

const PLACES = [
  { label: 'Göteborg',    coords: [57.7088, 11.9746] },
  { label: 'Malmö',       coords: [55.6050, 13.0038] },
  { label: 'Stockholm',   coords: [59.3293, 18.0686] },
  { label: 'Södertälje',  coords: [59.1955, 17.6252] },
  { label: 'Linköping',   coords: [58.4108, 15.6214] },
  { label: 'Jönköping',   coords: [57.7826, 14.1618] },
  { label: 'Gdansk',      coords: [54.3520, 18.6466] },
  { label: 'Oslo',        coords: [59.9139, 10.7522] },
  { label: 'Hamburg',     coords: [53.5511, 9.9937] },
  { label: 'Köpenhamn',   coords: [55.6761, 12.5683] }
];

export const QUICK_ORIGINS = [
  { label: 'Göteborg',    coords: [57.7088, 11.9746] },
  { label: 'Malmö',       coords: [55.6050, 13.0038] },
  { label: 'Jönköping',   coords: [57.7826, 14.1618] },
  { label: 'Stockholm',   coords: [59.3293, 18.0686] }
];

export const QUICK_DESTINATIONS = [
  { label: 'Stockholm',   coords: [59.3293, 18.0686] },
  { label: 'Gdansk',      coords: [54.3520, 18.6466] },
  { label: 'Oslo',        coords: [59.9139, 10.7522] },
  { label: 'Hamburg',     coords: [53.5511, 9.9937] }
];

// Resolve a user-typed city name to coordinates. Tries the local PLACES
// list first (fast, no network), then Nominatim. Falls back to the caller's
// `fallback` city only when geocoding returns nothing so the trip is still
// plannable rather than erroring out.
async function resolvePlace(input, fallback) {
  const q = (input ?? '').trim();
  if (!q) return { label: fallback.label, coords: fallback.coords };

  const local = PLACES.find(p => p.label.toLowerCase() === q.toLowerCase());
  if (local) return { label: local.label, coords: local.coords };

  const geo = await geocodeCity(q);
  if (geo) return { label: geo.label, coords: geo.coords };

  console.warn(`[routeSuggestions] Could not resolve "${q}" — using fallback ${fallback.label}.`);
  return { label: q, coords: fallback.coords };
}

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

function totalRouteKm(points) {
  let sum = 0;
  for (let i = 1; i < points.length; i++) sum += haversineKm(points[i - 1], points[i]);
  return sum;
}

// Human-readable duration. Returns "—" when the route hasn't been enriched
// yet (etaMin is null/undefined) so the UI never prints "undefined min".
export function formatEta(min) {
  if (min == null || Number.isNaN(min)) return '—';
  const m = Math.max(0, Math.round(min));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem === 0 ? `${h}h` : `${h}h ${rem}m`;
}

// Tuning knobs.
const BACKHAUL_DETOUR_TOLERANCE = 0.35; // shipper allowed if via-detour ≤ 35% of direct round-trip leg
const STOP_MIN = 40;                    // pickup dwell time (min per stop)
const MAX_ADDED_MIN = 360;              // hard cap on reroute overhead: 6 hours
const REVENUE_PER_STOP = 14000;         // SEK, scaled by shipper score

function backhaulCandidates(origin, dest, shippers) {
  const directKm = haversineKm(origin.coords, dest.coords);
  if (directKm < 1) return [];
  return shippers
    .map(s => {
      const distFromDest = haversineKm(dest.coords, s.position);
      const viaKm = distFromDest + haversineKm(s.position, origin.coords);
      return { shipper: s, distFromDest, detour: viaKm - directKm };
    })
    .filter(c => c.detour <= directKm * BACKHAUL_DETOUR_TOLERANCE);
}

// Order picked shippers along the return leg: closest-to-destination first,
// farthest-from-destination (i.e. nearest origin) last.
function orderForReturn(candidates) {
  return [...candidates]
    .sort((a, b) => a.distFromDest - b.distFromDest)
    .map(c => c.shipper);
}

function buildRoute({ id, color, label, tagline, origin, dest, shippers }) {
  // Backhaul leg only: destination → pickups → origin. The outbound leg
  // (origin → destination) is assumed sunk-cost — the truck is going there
  // regardless to deliver primary cargo — so all durations, distances, and
  // the rendered polyline cover the *return* trip only.
  const routeCoords = [
    dest.coords,
    ...shippers.map(s => s.position),
    origin.coords
  ];
  const revenueSek = shippers.reduce(
    (sum, s) => sum + Math.round(REVENUE_PER_STOP * (s.score / 90)),
    0
  );
  const sustainScore = Math.min(100, 60 + shippers.length * 8);
  const direction =
    shippers.length === 0
      ? `Return to ${origin.label} from ${dest.label}`
      : `${shippers.length} backhaul pickup${shippers.length === 1 ? '' : 's'} on return to ${origin.label} from ${dest.label}`;

  return {
    id,
    color,
    label,
    tagline,
    shipperIds: shippers.map(s => s.id),
    originLabel: origin.label,
    originCoords: origin.coords,
    destinationLabel: dest.label,
    destinationCoords: dest.coords,
    routeCoords,
    sustainScore,
    revenueSek,
    direction
    // etaMin, drivingMin, stopMin, addedMin, detourKm, routingSource: set in enrichSuggestionsWithMapbox
  };
}

export async function buildRouteSuggestions(destinationInput, shippers, originInput) {
  const [dest, origin] = await Promise.all([
    resolvePlace(destinationInput, { label: 'Stockholm', coords: [59.3293, 18.0686] }),
    resolvePlace(originInput,      { label: 'Göteborg',  coords: GOTHENBURG })
  ]);

  const candidates = backhaulCandidates(origin, dest, shippers);
  const byScore = [...candidates].sort((a, b) => b.shipper.score - a.shipper.score);

  const routeA = buildRoute({
    id: 'A',
    color: '#6b7280',
    label: 'Route A · Direct',
    tagline: `Direct return to ${origin.label} from ${dest.label} — no backhaul.`,
    origin,
    dest,
    shippers: []
  });

  const balancedPicks = orderForReturn(byScore.slice(0, 3));
  const routeB = buildRoute({
    id: 'B',
    color: '#3b82f6',
    label: 'Route B · Balanced backhaul',
    tagline:
      balancedPicks.length === 0
        ? `No plausible backhaul on return to ${origin.label} from ${dest.label}.`
        : `Top ${balancedPicks.length} shipper${balancedPicks.length === 1 ? '' : 's'} on return to ${origin.label} from ${dest.label}.`,
    origin,
    dest,
    shippers: balancedPicks
  });

  const maxStops = Math.floor(MAX_ADDED_MIN / STOP_MIN); // keep addedMin ≤ cap
  const fullPicks = orderForReturn(candidates).slice(0, maxStops);
  const routeC = buildRoute({
    id: 'C',
    color: '#10b981',
    label: 'Route C · Max revenue',
    tagline: `Every viable backhaul pickup on return to ${origin.label} from ${dest.label} (${fullPicks.length} total).`,
    origin,
    dest,
    shippers: fullPicks
  });

  if (candidates.length === 0) return [routeA];
  if (candidates.length < 4) return [routeA, routeB];
  return [routeA, routeB, routeC];
}

// Replace each suggestion's `etaMin` and `routeCoords` with real driving
// durations + road-following geometry from Mapbox (traffic-aware). Also
// filters out any suggestion whose detour + dwell exceeds MAX_ADDED_MIN
// (6 hours) above the direct origin→destination→origin round trip.
// Route A (no stops) is always kept — it defines the baseline and the UI
// must never be empty.
//
// Injection hook: tests pass { fetchFn } to bypass the real network call.
export async function enrichSuggestionsWithMapbox(
  suggestions,
  { fetchFn = fetchDrivingRoute } = {}
) {
  if (!suggestions || suggestions.length === 0) return [];

  const results = await Promise.all(
    suggestions.map(route => fetchFn(route.routeCoords))
  );

  const routeA = suggestions[0];
  const baselineDriving = results[0]?.durationMin ?? 0;

  const enriched = suggestions.map((route, i) => {
    const r = results[i] || { durationMin: route.etaMin, geometry: route.routeCoords, distanceKm: 0 };
    const drivingMin = r.durationMin;
    const stopMin = route.shipperIds.length * STOP_MIN;
    const etaMin = drivingMin + stopMin;
    const addedMin = Math.max(0, etaMin - baselineDriving);
    return {
      ...route,
      drivingMin,
      stopMin,
      etaMin,
      addedMin,
      detourKm: r.distanceKm || route.detourKm,
      routeCoords: r.geometry?.length ? r.geometry : route.routeCoords,
      routingSource: r.source || 'fallback'
    };
  });

  // Keep route A regardless; drop others that exceed the 6 h cap.
  const filtered = enriched.filter((r, i) => i === 0 || r.addedMin <= MAX_ADDED_MIN);
  return filtered.length > 0 ? filtered : [enriched[0]];
}
