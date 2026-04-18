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
