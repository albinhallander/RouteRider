// Einride charging network — data mirrored from algorithm_data/chargingstations.py
const CHARGING_STATIONS = [
  // LIVE stations
  {
    name: "Rosersberg station",
    city: "Stockholm",
    region: "Uppland",
    address: "Järngatan 27, Rosersberg",
    lat: 59.4667,
    lng: 17.1167,
    charging_points: 9,
    amenities: ["Driver's Lounge"],
    status: "LIVE",
    hgv_compatible: true,
  },
  {
    name: "Norrköping station",
    city: "Norrköping",
    region: "Östergötland",
    address: "Blygatan 25, Norrköping",
    lat: 58.6167,
    lng: 16.1833,
    charging_points: 9,
    amenities: ["Driver's Lounge"],
    status: "LIVE",
    hgv_compatible: true,
  },
  {
    name: "Eskilstuna station",
    city: "Eskilstuna",
    region: "Södermanland",
    address: "Propellervägen 7, Eskilstuna",
    lat: 59.3667,
    lng: 16.5167,
    charging_points: 6,
    amenities: ["Driver's Lounge", "Smartcharger stations"],
    status: "LIVE",
    hgv_compatible: true,
  },
  {
    name: "Varberg station",
    city: "Varberg",
    region: "Halland",
    address: "Gunnestorpsvägen 3, Varberg",
    lat: 57.1,
    lng: 12.2333,
    charging_points: 10,
    amenities: ["Driver's Lounge"],
    status: "LIVE",
    hgv_compatible: true,
  },
  {
    name: "Borås station",
    city: "Borås",
    region: "Västra Götaland",
    address: "Ryssnäsgatan 14, Borås",
    lat: 57.7167,
    lng: 12.9333,
    charging_points: 12,
    amenities: ["Driver's Lounge"],
    status: "LIVE",
    hgv_compatible: true,
  },
  {
    name: "Ljungby station",
    city: "Ljungby",
    region: "Småland",
    address: "Nyponvägen, Ljungby",
    lat: 56.85,
    lng: 13.9333,
    charging_points: 4,
    amenities: [],
    status: "LIVE",
    hgv_compatible: true,
  },
  {
    name: "Markaryd station",
    city: "Markaryd",
    region: "Småland",
    address: "Ulvarydsvägen 7, Markaryd",
    lat: 56.3333,
    lng: 13.5667,
    charging_points: 2,
    amenities: [],
    status: "LIVE",
    hgv_compatible: true,
  },
  // PLANNED stations
  {
    name: "Helsingborg station",
    city: "Helsingborg",
    region: "Skåne",
    address: "Mineralgatan 11, Helsingborg",
    lat: 56.0461,
    lng: 12.6941,
    charging_points: 8,
    amenities: ["Driver's Lounge"],
    status: "PLANNED",
    eta: "2025 Q2",
    hgv_compatible: true,
  },
  {
    name: "Jönköping station",
    city: "Jönköping",
    region: "Jönköpings län",
    address: "Jönköping (address TBD)",
    lat: 57.7833,
    lng: 14.1833,
    charging_points: 8,
    amenities: ["Driver's Lounge"],
    status: "PLANNED",
    eta: "2025 Q3",
    hgv_compatible: true,
  },
  {
    name: "Laholm station",
    city: "Laholm",
    region: "Halland",
    address: "Laholm (address TBD)",
    lat: 56.55,
    lng: 12.7667,
    charging_points: 4,
    amenities: [],
    status: "PLANNED",
    eta: "2025 Q2",
    hgv_compatible: true,
  },
];

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

export function getStationsNearRoute(routeCoords, { maxKm = 30, hgvOnly = true, liveOnly = false } = {}) {
  let candidates = hgvOnly
    ? CHARGING_STATIONS.filter(s => s.hgv_compatible)
    : CHARGING_STATIONS;

  if (liveOnly) {
    candidates = candidates.filter(s => s.status === 'LIVE');
  }

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
