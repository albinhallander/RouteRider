import rawData from './data/companies.json';
import { getLiveSignals, buildSignalList } from './liveSignals.js';

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

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

function clamp01(n) {
  return clamp(n, 0, 1);
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

function _sniPrefix(bransch) {
  const digits = (bransch || '').match(/\d{2,5}/)?.[0] ?? '';
  return digits.slice(0, 2);
}

function _cdpSustainabilityScore(sig) {
  const pressure = sig?.cdp_scope3?.pressure;
  if (pressure === 'high') return 1.0;
  if (pressure === 'medium') return 0.7;
  if (pressure === 'low') return 0.45;
  return 0.25;
}

function _hashId(str) {
  // Stable, non-crypto hash for deterministic IDs.
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h) ^ str.charCodeAt(i);
  return (h >>> 0).toString(16).padStart(8, '0');
}

function _normOrgnr(orgnr) {
  return String(orgnr || '').replace(/\D+/g, '');
}

function _normName(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^a-z0-9åäö\s&.-]/gi, '')
    .trim();
}

function _sizeProxyScore({ siteCountTotal, hasOrgNr }) {
  // Size proxy: more sites implies a larger org; orgnr implies a real entity.
  const siteBoost = clamp01(Math.log1p(Math.max(0, siteCountTotal - 1)) / Math.log1p(6)); // 1 site => 0, 7+ => ~1
  const orgBoost = hasOrgNr ? 1 : 0;
  return clamp01(0.7 * siteBoost + 0.3 * orgBoost);
}

function _businessTypeScore({ typ, bransch }) {
  const typPts = TYP_SCORE[typ] ?? 8;
  const typNorm = clamp01((typPts - 8) / (20 - 8));

  const sni = _sniPrefix(bransch);
  const sniPts = SNI_SCORE[sni] ?? 0;
  const sniNorm = clamp01(sniPts / 18);

  return clamp01(0.6 * typNorm + 0.4 * sniNorm);
}

function calcBusinessScore({ typ, bransch, org_nr, sites, sig }) {
  const size = _sizeProxyScore({ siteCountTotal: sites?.length || 1, hasOrgNr: !!org_nr });
  const type = _businessTypeScore({ typ, bransch });
  const sust = _cdpSustainabilityScore(sig);

  // Factor blend (0..1): size + type + public sustainability care.
  const score01 = clamp01(0.45 * size + 0.35 * type + 0.20 * sust);

  // Rescale to keep the existing tier thresholds meaningful.
  // (Old model was roughly 55–97 before live-signal bonuses.)
  return clamp(Math.round(55 + score01 * 45), 0, 100);
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

const rows = rawData.filter(d => d.name && d.lat && d.lng);

// Only group org-less rows by name when that name occurs multiple times.
const orglessNameCounts = new Map();
for (const d of rows) {
  if (d.org_nr) continue;
  const key = _normName(d.name);
  if (!key) continue;
  orglessNameCounts.set(key, (orglessNameCounts.get(key) || 0) + 1);
}

const groups = new Map();
for (let i = 0; i < rows.length; i++) {
  const d = rows[i];
  const org = _normOrgnr(d.org_nr);
  const nameKey = _normName(d.name);

  let key;
  if (org) key = `org:${org}`;
  else if (nameKey && (orglessNameCounts.get(nameKey) || 0) >= 2) key = `name:${nameKey}`;
  else key = `row:${i}`;

  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(d);
}

export const COMPANIES = [...groups.entries()]
  .map(([groupKey, members]) => {
    const sites = members.map(m => ({
      position: [m.lat, m.lng],
      location: formatLocation(m),
      typ: m.typ,
      bransch: m.bransch,
      org_nr: m.org_nr,
      contact: m.allabolag_url || m.hemsida || '',
    }));

    // Representative site: closest to the corridor heuristic (E4) for UI.
    let rep = sites[0];
    let repDist = distFromE4(rep.position);
    for (const s of sites) {
      const d = distFromE4(s.position);
      if (d < repDist) {
        rep = s;
        repDist = d;
      }
    }

    // Representative metadata: choose the strongest typ / first non-empty bransch.
    let typ = rep.typ;
    let bestTypScore = TYP_SCORE[typ] ?? 0;
    for (const s of sites) {
      const t = s.typ;
      const score = TYP_SCORE[t] ?? 0;
      if (score > bestTypScore) {
        bestTypScore = score;
        typ = t;
      }
    }
    const bransch = sites.find(s => String(s.bransch || '').trim())?.bransch || rep.bransch || '';
    const orgnr = sites.find(s => String(s.org_nr || '').trim())?.org_nr || '';
    const contact = sites.find(s => String(s.contact || '').trim())?.contact || '';

    const id = orgnr
      ? `s-${_normOrgnr(orgnr)}`
      : `s-${_hashId(groupKey)}`;

    const sig = getLiveSignals(orgnr);
    const signals = buildSignalList(sig);

    // New spec: score is the business-case score (0–100). No other live-signal
    // bonuses are mixed into the ranking (CDP still influences via sustainability).
    const score = calcBusinessScore({ typ, bransch, org_nr: orgnr, sites, sig });

    return {
      id,
      company: members[0].name,
      location: rep.location,
      position: rep.position,
      sites,
      score,
      baseScore: score,
      distanceFromE4: repDist,
      tier: calcTier(score, repDist),
      contact,
      cargo: formatCargo({ typ, bransch }),
      orgnr,
      bransch,
      typ,
      signals,
    };
  })
  .filter(c => {
    if (_seen.has(c.id)) return false;
    _seen.add(c.id);
    return true;
  });
