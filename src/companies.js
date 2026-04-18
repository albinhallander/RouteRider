import rawData from './data/companies.json';

// E4-korridoren waypoints — speglar ROUTE i App.jsx
const E4 = [
  [57.7088, 11.9746],
  [57.7400, 12.6000],
  [57.7600, 13.1000],
  [57.7826, 14.1618],
  [57.9800, 14.5000],
  [58.1800, 14.9000],
  [58.4108, 15.6214],
  [58.7000, 16.4000],
  [59.0000, 17.0000],
  [59.1955, 17.6252],
  [59.2500, 17.8000],
  [59.3293, 18.0686],
];

function haversineKm([lat1, lon1], [lat2, lon2]) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) *
    Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function distFromE4(pos) {
  return Math.round(Math.min(...E4.map(wp => haversineKm(pos, wp))));
}

function calcTier(score, dist) {
  if (score >= 70 && dist <= 15) return 'prio';
  if (score >= 58 || dist <= 25) return 'possible';
  return 'skip';
}

const TYP_SCORE = {
  lager: 20,
  distributionscenter: 18,
  fabrik: 15,
  industri: 10,
  industrilokal: 8,
};

const SNI_SCORE = {
  '52': 18, // Lagring & transport
  '46': 15, // Partihandel
  '10': 12, // Livsmedel
  '29': 10, // Fordon
  '20': 10, // Kemi
  '25': 8,  // Metallvaror
  '28': 8,  // Maskiner
  '45': 5,  // Motorfordonshandel
  '47': 5,  // Detaljhandel
};

function calcScore(d) {
  const sni = (d.bransch || '').match(/\d+/)?.[0]?.slice(0, 2) ?? '';
  return Math.min(97, 55 + (TYP_SCORE[d.typ] ?? 5) + (SNI_SCORE[sni] ?? 0) + (d.org_nr ? 5 : 0));
}

function formatCargo(d) {
  if (d.bransch) {
    // Bransch från allabolag är t.ex. "52 – Lagring och transport" — ta bara texten
    const clean = d.bransch.replace(/^\d+\s*[–-]\s*/, '').trim();
    const label = d.typ ? `${d.typ.charAt(0).toUpperCase()}${d.typ.slice(1)}` : '';
    return [clean.split(' ').slice(0, 5).join(' '), label].filter(Boolean).join(' · ');
  }
  return d.typ ? `${d.typ.charAt(0).toUpperCase()}${d.typ.slice(1)}` : 'Industri';
}

function formatLocation(d) {
  const parts = [d.adress, d.city].filter(Boolean);
  return parts.join(', ') || d.city || '';
}

const _seen = new Set();

export const COMPANIES = rawData
  .filter(d => d.name && d.lat && d.lng)
  .map((d, i) => {
    const pos = [d.lat, d.lng];
    const id = d.org_nr ? `s-${d.org_nr.replace('-', '')}` : `s-${i}`;
    const score = calcScore(d);
    const dist = distFromE4(pos);
    return {
      id,
      company: d.name,
      location: formatLocation(d),
      position: pos,
      score,
      distanceFromE4: dist,
      tier: calcTier(score, dist),
      contact: d.allabolag_url || d.hemsida || '',
      cargo: formatCargo(d),
      orgnr: d.org_nr,
      bransch: d.bransch,
      typ: d.typ,
    };
  })
  .filter(c => {
    if (_seen.has(c.id)) return false;
    _seen.add(c.id);
    return true;
  });
