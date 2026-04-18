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

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

function clamp01(n) {
  return clamp(n, 0, 1);
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

// Ranking model: 2-factor (business case + distance/time).
const BUSINESS_WEIGHT = 0.60;
const DISTANCE_TIME_WEIGHT = 0.40;
const MULTI_SITE_WEIGHT_IN_DISTANCE_TIME = 0.20;
const TIME_WEIGHT_IN_DISTANCE_TIME = 1 - MULTI_SITE_WEIGHT_IN_DISTANCE_TIME;

function normalizeSites(shipper) {
  if (Array.isArray(shipper?.sites) && shipper.sites.length > 0) return shipper.sites;
  if (Array.isArray(shipper?.position) && shipper.position.length === 2) return [{ position: shipper.position }];
  return [];
}

function densifyRoute(routeCoords) {
  if (!routeCoords || routeCoords.length < 2) return [];
  const dense = [routeCoords[0]];
  for (let i = 1; i < routeCoords.length; i++) {
    const [la1, lo1] = routeCoords[i - 1];
    const [la2, lo2] = routeCoords[i];
    const totalKm = haversineKm([la1, lo1], [la2, lo2]);
    const steps = Math.max(1, Math.ceil(totalKm / 20));
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      dense.push([la1 + (la2 - la1) * t, lo1 + (lo2 - lo1) * t]);
    }
  }
  return dense;
}

function countSitesNearRoute(routeCoords, sites, maxKm = 40) {
  const dense = densifyRoute(routeCoords);
  if (dense.length === 0) return 0;
  let count = 0;
  for (const site of sites || []) {
    const pos = site?.position;
    if (!pos) continue;
    for (const p of dense) {
      if (haversineKm(pos, p) <= maxKm) {
        count++;
        break;
      }
    }
  }
  return count;
}

function bestSiteForDetour(originCoords, destCoords, sites) {
  const directKm = haversineKm(destCoords, originCoords);
  if (!sites || sites.length === 0 || directKm < 1) return null;

  let best = null;
  let bestViaKm = Infinity;
  for (const site of sites) {
    const pos = site?.position;
    if (!pos) continue;
    const viaKm = haversineKm(destCoords, pos) + haversineKm(pos, originCoords);
    if (viaKm < bestViaKm) {
      bestViaKm = viaKm;
      best = site;
    }
  }
  return best;
}

function timeScoreFromAddedMin(addedMin, maxAddedMin) {
  // High added time should be penalized. Square makes penalties harsher near the cap.
  const linear = clamp01(1 - (Number(addedMin) || 0) / (maxAddedMin || MAX_ADDED_MIN));
  return linear ** 2;
}

function multiSiteScoreFromCount(sitesNearRoute) {
  // Reward only if there's more than 1 site near the corridor.
  const n = Number(sitesNearRoute) || 0;
  if (n <= 1) return 0;
  return clamp01((n - 1) / 3); // 2→0.33, 4→1.0
}

function distanceTimeScore({ addedMin, maxAddedMin, sitesNearRoute }) {
  const t = timeScoreFromAddedMin(addedMin, maxAddedMin);
  const m = multiSiteScoreFromCount(sitesNearRoute);
  const score01 = TIME_WEIGHT_IN_DISTANCE_TIME * t + MULTI_SITE_WEIGHT_IN_DISTANCE_TIME * m;
  return clamp(score01 * 100, 0, 100);
}

function rankScore({ businessScore, distanceTime }) {
  const b = clamp(Number(businessScore) || 0, 0, 100);
  const dt = clamp(Number(distanceTime) || 0, 0, 100);
  return BUSINESS_WEIGHT * b + DISTANCE_TIME_WEIGHT * dt;
}

function backhaulCandidates(origin, dest, shippers) {
  const directKm = haversineKm(origin.coords, dest.coords);
  if (directKm < 1) return [];
  return shippers
    .map(s => {
      const sites = normalizeSites(s);
      const best = bestSiteForDetour(origin.coords, dest.coords, sites) || { position: s.position };
      const pos = best.position;
      const distFromDest = haversineKm(dest.coords, pos);
      const viaKm = distFromDest + haversineKm(pos, origin.coords);
      const detourKm = viaKm - directKm;

      // Estimate the 6h-cap overhead in minutes for ranking. Used only to
      // order candidates before the real routing enrichment kicks in.
      const estAddedMin = Math.max(0, detourKm) * 0.8 + STOP_MIN;
      const sitesNear = countSitesNearRoute([dest.coords, origin.coords], sites, 40);
      const dt = distanceTimeScore({ addedMin: estAddedMin, maxAddedMin: MAX_ADDED_MIN, sitesNearRoute: sitesNear });
      const r = rankScore({ businessScore: s.score, distanceTime: dt });

      return { shipper: s, distFromDest, detour: detourKm, rankScore: r };
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

function buildRoute({ id, color, label, tagline, origin, dest, shippers, candidateIds = [] }) {
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
    candidateIds,
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

// All shippers within maxKm of any point on the route polyline.
// Densifies the polyline first so sparse routes (e.g. Route A with just 2 pts)
// still produce a proper corridor.
export function getShippersNearRoute(routeCoords, shippers, maxKm = 40) {
  if (!routeCoords || routeCoords.length < 2) return [];

  const dense = [routeCoords[0]];
  for (let i = 1; i < routeCoords.length; i++) {
    const [la1, lo1] = routeCoords[i - 1];
    const [la2, lo2] = routeCoords[i];
    const totalKm = haversineKm([la1, lo1], [la2, lo2]);
    const steps = Math.max(1, Math.ceil(totalKm / 20));
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      dense.push([la1 + (la2 - la1) * t, lo1 + (lo2 - lo1) * t]);
    }
  }

  return shippers.filter(s => {
    for (const [lat, lng] of dense) {
      if (haversineKm(s.position, [lat, lng]) <= maxKm) return true;
    }
    return false;
  });
}

export async function buildRouteSuggestions(destinationInput, shippers, originInput) {
  const [dest, origin] = await Promise.all([
    resolvePlace(destinationInput, { label: 'Stockholm', coords: [59.3293, 18.0686] }),
    resolvePlace(originInput,      { label: 'Göteborg',  coords: GOTHENBURG })
  ]);

  const candidates = backhaulCandidates(origin, dest, shippers);
  const byRank = [...candidates].sort((a, b) => b.rankScore - a.rankScore);
  const allCandidateIds = byRank.map(c => c.shipper.id);

  const routeA = buildRoute({
    id: 'A',
    color: '#6b7280',
    label: 'Route A · Direct',
    tagline: `Direct return to ${origin.label} from ${dest.label} — no backhaul.`,
    origin,
    dest,
    shippers: [],
    candidateIds: []
  });

  const balancedPicks = orderForReturn(byRank.slice(0, 3));
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
    shippers: balancedPicks,
    candidateIds: allCandidateIds
  });

  const maxStops = Math.floor(MAX_ADDED_MIN / STOP_MIN);
    const fullPicks = orderForReturn(byRank.slice(0, maxStops));
  const routeC = buildRoute({
    id: 'C',
    color: '#10b981',
    label: 'Route C · Max revenue',
    tagline: `Every viable backhaul pickup on return to ${origin.label} from ${dest.label} (${fullPicks.length} total).`,
    origin,
    dest,
    shippers: fullPicks,
    candidateIds: allCandidateIds
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

// ─── New flow: feasibility + greedy planner ─────────────────────────────────

// Returns the subset of `shippers` whose individual detour (adding THIS
// shipper alone to the direct dest → origin backhaul + 40 min dwell) stays
// within the 6-hour cap. Feasible shippers come back score-sorted (highest
// first) with `addedMin` attached so the UI can surface the delay cost.
//
// Also returns the resolved origin/dest (so the caller doesn't have to
// re-geocode) and the baseline driving minutes (needed by planRouteFromYes).
export async function filterFeasibleShippers(
  destinationInput,
  originInput,
  shippers,
  { maxAddedMin = MAX_ADDED_MIN, fetchFn = fetchDrivingRoute } = {}
) {
  const [dest, origin] = await Promise.all([
    resolvePlace(destinationInput, { label: 'Stockholm', coords: [59.3293, 18.0686] }),
    resolvePlace(originInput,      { label: 'Göteborg',  coords: GOTHENBURG })
  ]);

  const baseline = await fetchFn([dest.coords, origin.coords]);
  const baselineDriving = baseline.durationMin;
  const baselineRouteCoords = baseline.geometry?.length ? baseline.geometry : [dest.coords, origin.coords];

  // Cheap haversine pre-filter. Haversine always *underestimates* real
  // road distance, so if the straight-line detour already blows the cap
  // the real trip definitely does too — we can safely drop the shipper
  // without asking OSRM. For 236 companies on a GBG → STO return this
  // typically leaves ~30–80 candidates, keeping the OSRM fan-out under
  // the public demo's rate limits.
  const directHaversineKm = haversineKm(dest.coords, origin.coords);
  const preFiltered = shippers
    .map(s => {
      const sites = normalizeSites(s);
      const best = bestSiteForDetour(origin.coords, dest.coords, sites);
      const pos = best?.position || s.position;
      if (!pos) return null;

      const viaKm = haversineKm(dest.coords, pos) + haversineKm(pos, origin.coords);
      const detourKm = Math.max(0, viaKm - directHaversineKm);
      // 0.8 min/km ≈ 75 km/h free-flow pace; plus the 40 min stop dwell.
      const estAddedMin = detourKm * 0.8 + STOP_MIN;
      return { shipper: s, bestPos: pos, estAddedMin };
    })
    .filter(Boolean)
    .filter(x => x.estAddedMin <= maxAddedMin);

  const perShipper = await Promise.all(
    preFiltered.map(x => fetchFn([dest.coords, x.bestPos, origin.coords]))
  );

  const evaluated = preFiltered.map((x, i) => {
    const s = x.shipper;
    const drivingMin = perShipper[i].durationMin;
    const addedMin = Math.max(0, (drivingMin + STOP_MIN) - baselineDriving);
    const sites = normalizeSites(s);
    const sitesNearRoute = countSitesNearRoute(baselineRouteCoords, sites, 40);
    const dt = distanceTimeScore({ addedMin, maxAddedMin, sitesNearRoute });
    const r = rankScore({ businessScore: s.score, distanceTime: dt });
    return {
      ...s,
      addedMin,
      drivingMin,
      feasible: addedMin <= maxAddedMin,
      distanceTimeScore: Math.round(dt),
      rankScore: Math.round(r),
      sitesNearRoute
    };
  });

  return {
    origin,
    dest,
    baselineDriving,
    feasible: evaluated.filter(s => s.feasible).sort((a, b) => b.rankScore - a.rankScore),
    infeasible: evaluated.filter(s => !s.feasible),
    evaluatedCount: preFiltered.length,
    totalCount: shippers.length
  };
}

// Greedy route planner. Walks `yesShippers` top-to-bottom (caller's order —
// typically score-desc) and accepts each one only if, with this candidate
// added, all three caps still hold:
//   • total backhaul detour (driving + dwell) ≤ maxAddedMin   (time)
//   • cumulative pallets ≤ palletCapacity                     (volume)
//   • cumulative cargo weight ≤ maxWeightKg                    (mass)
// Capacity caps are optional — omit them and only the time cap applies.
// Within the accepted set the stop sequence is ordered closest-to-destination
// first so the truck doesn't zig-zag. Returns a fully-shaped route object
// compatible with the existing map rendering (routeCoords, etaMin, etc.).
export async function planRouteFromYes(
  origin,
  dest,
  yesShippers,
  baselineDriving,
  {
    maxAddedMin = MAX_ADDED_MIN,
    palletCapacity = Infinity,
    maxWeightKg = Infinity,
    fetchFn = fetchDrivingRoute
  } = {}
) {
  const accepted = [];
  let cumulativePallets = 0;
  let cumulativeWeightKg = 0;
  let lastOk = null;

  for (const candidate of yesShippers) {
    const cPallets = Number(candidate.pallets) || 0;
    const cWeight  = Number(candidate.weightKg) || 0;

    // Cheap checks first — skip the OSRM call if cargo alone blows either cap.
    if (cumulativePallets + cPallets > palletCapacity) continue;
    if (cumulativeWeightKg + cWeight > maxWeightKg)   continue;

    const trial = [...accepted, candidate]
      .map(s => ({ ...s, _distFromDest: haversineKm(dest.coords, s.position) }))
      .sort((a, b) => a._distFromDest - b._distFromDest);

    const coords = [dest.coords, ...trial.map(s => s.position), origin.coords];
    const r = await fetchFn(coords);
    const stopMin = trial.length * STOP_MIN;
    const etaMin = r.durationMin + stopMin;
    const addedMin = Math.max(0, etaMin - baselineDriving);

    if (addedMin > maxAddedMin) continue;

    accepted.push(candidate);
    cumulativePallets += cPallets;
    cumulativeWeightKg += cWeight;
    lastOk = {
      trial,
      driving: r,
      etaMin,
      addedMin,
      stopMin,
      palletsUsed: cumulativePallets,
      weightKgUsed: cumulativeWeightKg
    };
  }

  // If nothing fit, hand back the direct baseline so the map still has a
  // route to draw.
  if (!lastOk) {
    const r = await fetchFn([dest.coords, origin.coords]);
    return {
      id: 'PLAN',
      color: '#2563eb',
      label: 'Planned route · direct',
      tagline: `Direct return — no shippers fit within the ${Math.round(maxAddedMin / 60)} h cap.`,
      shipperIds: [],
      skippedIds: yesShippers.map(s => s.id),
      originLabel: origin.label,
      originCoords: origin.coords,
      destinationLabel: dest.label,
      destinationCoords: dest.coords,
      routeCoords: r.geometry?.length ? r.geometry : [dest.coords, origin.coords],
      drivingMin: r.durationMin,
      stopMin: 0,
      etaMin: r.durationMin,
      addedMin: 0,
      detourKm: r.distanceKm,
      routingSource: r.source,
      direction: `Return to ${origin.label} from ${dest.label}`,
      sustainScore: 60,
      revenueSek: 0
    };
  }

  const acceptedIds = new Set(accepted.map(s => s.id));
  const skipped = yesShippers.filter(s => !acceptedIds.has(s.id));
  const revenueSek = accepted.reduce(
    (sum, s) => sum + Math.round(REVENUE_PER_STOP * (s.score / 90)),
    0
  );

  return {
    id: 'PLAN',
    color: '#2563eb',
    label: `Planned route · ${accepted.length} pickup${accepted.length === 1 ? '' : 's'}`,
    tagline:
      skipped.length === 0
        ? `All yes-shippers fit within the ${Math.round(maxAddedMin / 60)} h cap.`
        : `${accepted.length} fit, ${skipped.length} skipped to stay under ${Math.round(maxAddedMin / 60)} h.`,
    shipperIds: lastOk.trial.map(s => s.id),
    skippedIds: skipped.map(s => s.id),
    originLabel: origin.label,
    originCoords: origin.coords,
    destinationLabel: dest.label,
    destinationCoords: dest.coords,
    routeCoords: lastOk.driving.geometry?.length
      ? lastOk.driving.geometry
      : [dest.coords, ...lastOk.trial.map(s => s.position), origin.coords],
    drivingMin: lastOk.driving.durationMin,
    stopMin: lastOk.stopMin,
    etaMin: lastOk.etaMin,
    addedMin: lastOk.addedMin,
    detourKm: lastOk.driving.distanceKm,
    routingSource: lastOk.driving.source,
    palletsUsed: lastOk.palletsUsed,
    weightKgUsed: lastOk.weightKgUsed,
    palletCapacity: Number.isFinite(palletCapacity) ? palletCapacity : null,
    maxWeightKg:    Number.isFinite(maxWeightKg)    ? maxWeightKg    : null,
    direction: `${accepted.length} backhaul pickup${accepted.length === 1 ? '' : 's'} on return to ${origin.label} from ${dest.label}`,
    sustainScore: Math.min(100, 60 + accepted.length * 8),
    revenueSek
  };
}
