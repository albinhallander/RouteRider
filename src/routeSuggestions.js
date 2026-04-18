// Mock data for the chat-first route planner.
// No backend or LLM — just deterministic suggestions keyed off a destination string.

export const GOTHENBURG = [57.7088, 11.9746];

export const QUICK_DESTINATIONS = [
  { label: 'Stockholm',   coords: [59.3293, 18.0686] },
  { label: 'Södertälje',  coords: [59.1955, 17.6252] },
  { label: 'Linköping',   coords: [58.4108, 15.6214] },
  { label: 'Jönköping',   coords: [57.7826, 14.1618] }
];

function resolveDestination(input) {
  const match = QUICK_DESTINATIONS.find(
    d => d.label.toLowerCase() === input.trim().toLowerCase()
  );
  // Fallback: unknown text → treat as Stockholm (mock behavior).
  return match ?? { label: input.trim() || 'Stockholm', coords: [59.3293, 18.0686] };
}

export function buildRouteSuggestions(destinationInput, shippers) {
  const dest = resolveDestination(destinationInput);
  const byId = Object.fromEntries(shippers.map(s => [s.id, s]));

  const toCoords = ids => [
    GOTHENBURG,
    ...ids.map(id => byId[id]?.position).filter(Boolean),
    dest.coords
  ];

  return [
    {
      id: 'A',
      label: 'Route A · Direct',
      tagline: 'Fastest run on the E4 corridor — no detours.',
      shipperIds: [],
      routeCoords: [GOTHENBURG, [58.4108, 15.6214], dest.coords],
      detourKm: 0,
      etaMin: 128,
      sustainScore: 72,
      revenueSek: 0,
      direction: `Heading direct to ${dest.label}`
    },
    {
      id: 'B',
      label: 'Route B · Balanced backhaul',
      tagline: 'Three on-corridor pickups with minimal detour.',
      shipperIds: ['s-2', 's-3', 's-5'],
      routeCoords: toCoords(['s-2', 's-3', 's-5']),
      detourKm: 13,
      etaMin: 168,
      sustainScore: 88,
      revenueSek: 42000,
      direction: `Backhaul run to ${dest.label}`
    },
    {
      id: 'C',
      label: 'Route C · Max revenue',
      tagline: 'Full-capacity detour via Älmhult + Scania.',
      shipperIds: ['s-1', 's-2', 's-4', 's-6', 's-7'],
      routeCoords: toCoords(['s-1', 's-2', 's-4', 's-6', 's-7']),
      detourKm: 64,
      etaMin: 214,
      sustainScore: 94,
      revenueSek: 78500,
      direction: `Full-load backhaul to ${dest.label}`
    }
  ];
}
