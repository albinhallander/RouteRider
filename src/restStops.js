// EU 561/2006: mandatory 45-min break after 4.5h driving (~270 km at 60 km/h avg)
const REST_AREAS = [
  {
    name: 'Töllsjö rastplats',
    city: 'Borås',
    lat: 57.6500, lng: 12.5800,
    facilities: ['Parkering', 'Toalett'],
  },
  {
    name: 'Ulricehamn rastplats',
    city: 'Ulricehamn',
    lat: 57.7950, lng: 13.3800,
    facilities: ['Parkering', 'Toalett', 'Picknick'],
  },
  {
    name: 'Taberg rastplats',
    city: 'Jönköping',
    lat: 57.6800, lng: 14.0800,
    facilities: ['Parkering', 'Toalett'],
  },
  {
    name: 'Ödeshög rastplats',
    city: 'Ödeshög',
    lat: 58.1700, lng: 14.6500,
    facilities: ['Parkering', 'Toalett'],
  },
  {
    name: 'Mjölby rastplats',
    city: 'Mjölby',
    lat: 58.3200, lng: 15.1200,
    facilities: ['Parkering', 'Toalett', 'Café'],
  },
  {
    name: 'Kolmården rastplats',
    city: 'Norrköping',
    lat: 58.6800, lng: 16.3600,
    facilities: ['Parkering', 'Toalett', 'Picknick'],
  },
  {
    name: 'Katrineholm rastplats',
    city: 'Katrineholm',
    lat: 58.9900, lng: 16.2100,
    facilities: ['Parkering', 'Toalett'],
  },
  {
    name: 'Järna rastplats',
    city: 'Södertälje',
    lat: 59.0900, lng: 17.5600,
    facilities: ['Parkering', 'Toalett', 'Café'],
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

function densifySegment([lat1, lng1], [lat2, lng2], stepKm = 10) {
  const totalKm = haversineKm(lat1, lng1, lat2, lng2);
  if (totalKm <= stepKm) return [[lat2, lng2]];
  const steps = Math.ceil(totalKm / stepKm);
  const out = [];
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    out.push([lat1 + (lat2 - lat1) * t, lng1 + (lng2 - lng1) * t]);
  }
  return out;
}

// Ordered mandatory rest stops along a route — one every restIntervalKm.
export function getRecommendedRestStops(routeCoords, { restIntervalKm = 270, searchRadiusKm = 30 } = {}) {
  if (!routeCoords || routeCoords.length < 2) return [];

  const dense = [routeCoords[0]];
  for (let i = 1; i < routeCoords.length; i++) {
    dense.push(...densifySegment(routeCoords[i - 1], routeCoords[i]));
  }

  const stops = [];
  const usedNames = new Set();
  let distSinceRest = 0;

  for (let i = 1; i < dense.length; i++) {
    const [plat, plng] = dense[i - 1];
    const [clat, clng] = dense[i];
    distSinceRest += haversineKm(plat, plng, clat, clng);

    if (distSinceRest >= restIntervalKm) {
      let best = null;
      let bestDist = Infinity;
      for (const area of REST_AREAS) {
        if (usedNames.has(area.name)) continue;
        const d = haversineKm(area.lat, area.lng, clat, clng);
        if (d < bestDist && d <= searchRadiusKm) { bestDist = d; best = area; }
      }
      if (best) {
        usedNames.add(best.name);
        stops.push({ ...best, stopIndex: stops.length + 1, kmAtStop: Math.round(distSinceRest) });
        distSinceRest = 0;
      }
    }
  }

  return stops;
}
