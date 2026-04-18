import ALL_STATIONS from '../data_collection/routerider_laddstationer.json';

const R_KM = 6371;
const toRad = d => (d * Math.PI) / 180;

function haversineKm(lat1, lon1, lat2, lon2) {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLon / 2) ** 2 * Math.cos(toRad(lat1)) * Math.cos(toRad(lat2));
  return 2 * R_KM * Math.asin(Math.sqrt(h));
}

// Interpolates intermediate points along a segment so no gap exceeds stepKm.
function densifySegment([lat1, lng1], [lat2, lng2], stepKm = 8) {
  const dist = haversineKm(lat1, lng1, lat2, lng2);
  if (dist <= stepKm) return [[lat2, lng2]];
  const steps = Math.ceil(dist / stepKm);
  const pts = [];
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    pts.push([lat1 + t * (lat2 - lat1), lng1 + t * (lng2 - lng1)]);
  }
  return pts;
}

export function getStationsNearRoute(routeCoords, { maxKm = 30, hgvOnly = true } = {}) {
  const candidates = hgvOnly
    ? ALL_STATIONS.filter(s => s.hgv_compatible)
    : ALL_STATIONS;

  return candidates.filter(station => {
    for (const [lat, lng] of routeCoords) {
      if (haversineKm(station.lat, station.lng, lat, lng) <= maxKm) return true;
    }
    return false;
  });
}

// Returns an ordered list of recommended HGV charging stops for a route.
// Walks the densified polyline and every rangeKm picks the nearest HGV station.
export function getRecommendedStops(routeCoords, { rangeKm = 200, searchRadiusKm = 40 } = {}) {
  if (!routeCoords || routeCoords.length < 2) return [];

  // Build dense polyline
  const dense = [routeCoords[0]];
  for (let i = 1; i < routeCoords.length; i++) {
    dense.push(...densifySegment(routeCoords[i - 1], routeCoords[i]));
  }

  const hgvStations = ALL_STATIONS.filter(s => s.hgv_compatible);
  const stops = [];
  const usedKeys = new Set();
  let distSinceCharge = 0;

  for (let i = 1; i < dense.length; i++) {
    const [plat, plng] = dense[i - 1];
    const [clat, clng] = dense[i];
    distSinceCharge += haversineKm(plat, plng, clat, clng);

    if (distSinceCharge >= rangeKm) {
      // Find the nearest unused HGV station within searchRadiusKm
      let best = null;
      let bestDist = Infinity;
      for (const s of hgvStations) {
        const key = s.osm_id ?? s.ocm_id ?? s.nobil_id ?? `${s.lat},${s.lng}`;
        if (usedKeys.has(key)) continue;
        const d = haversineKm(s.lat, s.lng, clat, clng);
        if (d < bestDist && d <= searchRadiusKm) {
          bestDist = d;
          best = s;
        }
      }
      if (best) {
        const key = best.osm_id ?? best.ocm_id ?? best.nobil_id ?? `${best.lat},${best.lng}`;
        usedKeys.add(key);
        stops.push({ ...best, stopIndex: stops.length + 1, kmAtStop: Math.round(distSinceCharge) });
        distSinceCharge = 0;
      }
    }
  }

  return stops;
}
