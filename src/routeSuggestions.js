// Deterministic mock route planner.
// Model: every trip is a round-trip. Outbound = origin → destination (no pickups,
// driver is delivering primary cargo). Backhaul = destination → shippers → origin,
// picking up return loads on the way home. Shippers are filtered to those that
// sit roughly on the destination→origin line and ordered along that return leg.

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

function resolvePlace(input, fallback) {
  const q = (input ?? '').trim().toLowerCase();
  const match = PLACES.find(p => p.label.toLowerCase() === q);
  return match ?? { label: (input ?? '').trim() || fallback.label, coords: fallback.coords };
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

// Tuning knobs for the mock.
const BACKHAUL_DETOUR_TOLERANCE = 0.35; // shipper allowed if via-detour ≤ 35% of direct round-trip leg
const MIN_PER_KM = 0.27;                // ~133 km/h doesn't exist; this tracks the old mock's ETA scale
const STOP_MIN = 8;                     // pickup dwell time
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
  const routeCoords = [
    origin.coords,
    dest.coords,
    ...shippers.map(s => s.position),
    origin.coords
  ];
  const totalKm = totalRouteKm(routeCoords);
  const directRoundKm = 2 * haversineKm(origin.coords, dest.coords);
  const detourKm = Math.max(0, Math.round(totalKm - directRoundKm));
  const etaMin = Math.round(totalKm * MIN_PER_KM + shippers.length * STOP_MIN);
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
    originCoords: origin.coords,
    destinationCoords: dest.coords,
    routeCoords,
    detourKm,
    etaMin,
    sustainScore,
    revenueSek,
    direction
  };
}

export function buildRouteSuggestions(destinationInput, shippers, originInput) {
  const dest = resolvePlace(destinationInput, {
    label: 'Stockholm',
    coords: [59.3293, 18.0686]
  });
  const origin = resolvePlace(originInput, {
    label: 'Göteborg',
    coords: GOTHENBURG
  });

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

  const fullPicks = orderForReturn(candidates);
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
