// Carriers typically running specific corridors. Hand-curated for the
// prototype from TED awards, industry associations, and public carrier lists
// across the Nordics + DACH. Swap for data_collection/routerider_ted_awards.json
// once full integration is wired up.

import carriersData from './data/carriers.json';

const CARRIERS = carriersData;

// Sustainability bonus applied on top of matchScore. Categories are written by
// data_collection/sustainability_enrich.py from a mix of website scrape, news
// mentions, and LLM classification. Unknown/missing data stays neutral.
const SUSTAIN_BONUS = { leader: 10, active: 5, mentioned: 2, silent: -3, unknown: 0 };

function sustainBonus(entity) {
  return SUSTAIN_BONUS[entity?.sustainability?.category] ?? 0;
}

function normalize(s) {
  return (s ?? '').trim().toLowerCase();
}

// Rank carriers by corridor match (full > partial) with a small sustainability
// nudge so that otherwise-equal carriers with stronger ESG signals rise.
export function suggestCarriers(originLabel, destinationLabel, limit = 6) {
  const origin = normalize(originLabel);
  const dest = normalize(destinationLabel);
  if (!origin && !dest) return [];

  const scored = CARRIERS.map(c => {
    const corridor = c.corridors.map(normalize);
    const hasOrigin = corridor.some(x => x === origin);
    const hasDest = corridor.some(x => x === dest);
    let base = 0;
    if (hasOrigin && hasDest) base = 100;
    else if (hasOrigin || hasDest) base = 55;
    return {
      ...c,
      matchScore: base + sustainBonus(c),
      matchType: hasOrigin && hasDest ? 'full' : (hasOrigin || hasDest) ? 'partial' : 'none',
    };
  });

  return scored
    .filter(c => c.matchType !== 'none')
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
