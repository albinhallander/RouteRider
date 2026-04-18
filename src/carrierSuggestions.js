// Kuraterad dataset över åkerier som typiskt kör vissa korridorer.
// För prototypen: hand-plockat från TED-tilldelningar, branchorganisationer
// och publika åkerilistor i Norden + DACH. Byt mot data från
// data_collection/routerider_ted_awards.json när full integration är klar.

const CARRIERS = [
  // Sverige
  {
    id: 'c-dsv-se',
    name: 'DSV Road AB',
    hq: 'Landskrona',
    country: 'SE',
    fleetTrucks: 900,
    corridors: ['Göteborg', 'Stockholm', 'Malmö', 'Jönköping', 'Hamburg', 'Köpenhamn'],
    specialty: 'General cargo · groupage',
    contact: 'road.se@dsv.com',
  },
  {
    id: 'c-schenker-se',
    name: 'DB Schenker Sverige',
    hq: 'Göteborg',
    country: 'SE',
    fleetTrucks: 1200,
    corridors: ['Göteborg', 'Stockholm', 'Malmö', 'Oslo', 'Hamburg', 'Köpenhamn', 'Jönköping'],
    specialty: 'Road freight · contract logistics',
    contact: 'transport.sverige@dbschenker.com',
  },
  {
    id: 'c-postnord-se',
    name: 'PostNord Sverige AB',
    hq: 'Solna',
    country: 'SE',
    fleetTrucks: 2500,
    corridors: ['Stockholm', 'Göteborg', 'Malmö', 'Köpenhamn', 'Jönköping', 'Södertälje'],
    specialty: 'Pallet + parcel · daily lines',
    contact: 'foretag@postnord.com',
  },
  {
    id: 'c-ntex',
    name: 'NTEX AB',
    hq: 'Göteborg',
    country: 'SE',
    fleetTrucks: 450,
    corridors: ['Göteborg', 'Stockholm', 'Oslo', 'Malmö', 'Hamburg'],
    specialty: 'International road freight',
    contact: 'info@ntex.se',
  },
  {
    id: 'c-alltransport',
    name: 'Alltransport i Östergötland AB',
    hq: 'Norrköping',
    country: 'SE',
    fleetTrucks: 220,
    corridors: ['Linköping', 'Stockholm', 'Göteborg', 'Jönköping'],
    specialty: 'Bulk + groupage · Östergötland',
    contact: 'info@alltransport.se',
  },
  {
    id: 'c-ahola',
    name: 'Ahola Transport AB',
    hq: 'Göteborg',
    country: 'SE',
    fleetTrucks: 380,
    corridors: ['Göteborg', 'Stockholm', 'Hamburg', 'Köpenhamn', 'Oslo'],
    specialty: 'Finland-Sweden scheduled lines',
    contact: 'sweden@aholatransport.com',
  },
  {
    id: 'c-tgm',
    name: 'TGM Åkeri AB',
    hq: 'Kungälv',
    country: 'SE',
    fleetTrucks: 140,
    corridors: ['Göteborg', 'Oslo', 'Malmö', 'Jönköping'],
    specialty: 'Temperature-controlled · west coast',
    contact: 'info@tgm.se',
  },
  // Norden
  {
    id: 'c-bring-no',
    name: 'Bring (Posten Norge)',
    hq: 'Oslo',
    country: 'NO',
    fleetTrucks: 1800,
    corridors: ['Oslo', 'Göteborg', 'Stockholm', 'Köpenhamn'],
    specialty: 'Nordic lines · pallet + parcel',
    contact: 'kundeservice.no@bring.com',
  },
  {
    id: 'c-dhl-dk',
    name: 'DHL Freight Danmark',
    hq: 'Brøndby',
    country: 'DK',
    fleetTrucks: 650,
    corridors: ['Köpenhamn', 'Malmö', 'Hamburg', 'Göteborg'],
    specialty: 'LTL/FTL Nordic ↔ DACH',
    contact: 'info.dk@dhl.com',
  },
  // DACH
  {
    id: 'c-dachser',
    name: 'Dachser SE',
    hq: 'Kempten',
    country: 'DE',
    fleetTrucks: 9000,
    corridors: ['Hamburg', 'Köpenhamn', 'Göteborg', 'Stockholm', 'Oslo', 'Gdansk'],
    specialty: 'European Logistics network',
    contact: 'info@dachser.com',
  },
  {
    id: 'c-rhenus',
    name: 'Rhenus Logistics',
    hq: 'Holzwickede',
    country: 'DE',
    fleetTrucks: 7500,
    corridors: ['Hamburg', 'Köpenhamn', 'Stockholm', 'Oslo', 'Gdansk'],
    specialty: 'Multimodal · Baltic flows',
    contact: 'info@rhenus.com',
  },
  {
    id: 'c-gw-at',
    name: 'Gebrüder Weiss',
    hq: 'Lauterach',
    country: 'AT',
    fleetTrucks: 3200,
    corridors: ['Wien', 'Hamburg', 'Köpenhamn', 'Stockholm', 'Gdansk'],
    specialty: 'CEE + Alpine · groupage',
    contact: 'info@gw-world.com',
  },
  {
    id: 'c-hellmann',
    name: 'Hellmann Worldwide Logistics',
    hq: 'Osnabrück',
    country: 'DE',
    fleetTrucks: 4200,
    corridors: ['Hamburg', 'Köpenhamn', 'Göteborg', 'Stockholm', 'Wien'],
    specialty: 'European road network',
    contact: 'road@hellmann.com',
  },
];

function normalize(s) {
  return (s ?? '').trim().toLowerCase();
}

// Poängsätt åkerier baserat på om deras korridorer matchar origin/dest.
// full match (båda städerna) > partial match (en stad) > ingen träff.
export function suggestCarriers(originLabel, destinationLabel, limit = 6) {
  const origin = normalize(originLabel);
  const dest = normalize(destinationLabel);
  if (!origin && !dest) return [];

  const scored = CARRIERS.map(c => {
    const corridor = c.corridors.map(normalize);
    const hasOrigin = corridor.some(x => x === origin);
    const hasDest = corridor.some(x => x === dest);
    let score = 0;
    if (hasOrigin && hasDest) score = 100;
    else if (hasOrigin || hasDest) score = 55;
    return { ...c, matchScore: score, matchType: hasOrigin && hasDest ? 'full' : (hasOrigin || hasDest) ? 'partial' : 'none' };
  });

  return scored
    .filter(c => c.matchScore > 0)
    .sort((a, b) => b.matchScore - a.matchScore || b.fleetTrucks - a.fleetTrucks)
    .slice(0, limit);
}

export { CARRIERS };

// Collaboration email to carriers: "we've got an empty truck running X → Y,
// you're on the lane — any freight you need help with or don't have capacity for?"
export function draftCarrierCollabEmail(carrier, originLabel, destinationLabel, activeRoute) {
  const today = new Date().toLocaleDateString('sv-SE');
  return `Subject: Collaboration on ${destinationLabel} → ${originLabel} · ${today}

Hi ${carrier.name},

We see you regularly run the ${originLabel} ⇄ ${destinationLabel} lane — and we have an empty truck (${activeRoute.truckId}, 40-ton electric) currently heading back from ${destinationLabel} to ${originLabel}.

Since ${carrier.hq} sits on our return route, we wanted to ask:

  • Any freight you'd like help moving on this lane?
  • Caught in a capacity gap right now?
  • Recurring flows we could plan around?

What we offer:

  Capacity:    up to 22 EUR pallets / 24 ton
  Emissions:   0 g CO₂ tailpipe — sustainability reporting included
  Flexibility: pickup within a time window you define

A partnership is a win for you (no extra truck to spin up), for us (no empty return leg), and for the climate.

Reply with a couple of lines on what's moving and we'll jump on a call — or lock it in directly by replying YES.

— RouteRider · Einride Backhaul
  ${carrier.contact}`;
}
