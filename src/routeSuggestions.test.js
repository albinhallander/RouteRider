import { describe, it, expect } from 'vitest';
import {
  buildRouteSuggestions,
  enrichSuggestionsWithMapbox,
  planRouteFromYes
} from './routeSuggestions.js';

const shippers = [
  { id: 's-1', position: [56.5512, 14.1418], score: 92 },
  { id: 's-2', position: [57.7906, 14.2750], score: 88 },
  { id: 's-3', position: [58.3266, 15.1268], score: 85 },
  { id: 's-4', position: [58.4108, 15.6214], score: 79 },
  { id: 's-5', position: [59.1620, 17.5920], score: 90 }
];

function mockFetch(durationMinByStops) {
  // routeCoords is now backhaul-only: [dest, ...stops, origin].
  return waypoints => {
    const stops = Math.max(0, waypoints.length - 2);
    const min = durationMinByStops[stops] ?? 300;
    return Promise.resolve({
      durationMin: min,
      distanceKm: min * 1.2,
      geometry: waypoints,
      source: 'mock'
    });
  };
}

describe('enrichSuggestionsWithMapbox', () => {
  it('applies 40 min dwell per stop and drops suggestions >6h over baseline', async () => {
    const base = await buildRouteSuggestions('Stockholm', shippers, 'Göteborg');
    expect(base.length).toBeGreaterThanOrEqual(2);

    // Baseline direct = 300 min. 3-stop route returns 800 min driving + 3×40 dwell = 920 min.
    // Added = 920 - 300 = 620 min = 10.3 h → must be filtered.
    // But 1-stop would be 300 + 40 = 340 → 40 min added → kept. We set all stopped routes to 800.
    const fetchFn = mockFetch({ 0: 300, 1: 800, 2: 800, 3: 800, 4: 800, 5: 800 });
    const enriched = await enrichSuggestionsWithMapbox(base, { fetchFn });

    // Route A always survives
    expect(enriched[0].id).toBe('A');
    expect(enriched[0].etaMin).toBe(300);
    expect(enriched[0].addedMin).toBe(0);

    // All other routes added > 360 → filtered out
    expect(enriched.length).toBe(1);
  });

  it('keeps suggestions within the 6h cap and computes etaMin = driving + 40×stops', async () => {
    const base = await buildRouteSuggestions('Stockholm', shippers, 'Göteborg');

    // Driving rises slightly per stop, well under the cap.
    const fetchFn = mockFetch({ 0: 300, 1: 340, 2: 370, 3: 400, 4: 430, 5: 460 });
    const enriched = await enrichSuggestionsWithMapbox(base, { fetchFn });

    expect(enriched.length).toBe(base.length);

    for (const r of enriched) {
      const stops = r.shipperIds.length;
      expect(r.stopMin).toBe(stops * 40);
      expect(r.etaMin).toBe(r.drivingMin + r.stopMin);
      expect(r.addedMin).toBeLessThanOrEqual(360);
    }
  });

  it('always returns at least one route even if all would be filtered', async () => {
    const base = await buildRouteSuggestions('Stockholm', shippers, 'Göteborg');
    // Pathological: even direct is huge, but we always keep route A.
    const fetchFn = mockFetch({ 0: 9999, 1: 9999, 2: 9999, 3: 9999, 4: 9999, 5: 9999 });
    const enriched = await enrichSuggestionsWithMapbox(base, { fetchFn });
    expect(enriched.length).toBeGreaterThanOrEqual(1);
    expect(enriched[0].id).toBe('A');
  });

  it('swaps routeCoords for Mapbox geometry when returned', async () => {
    const base = await buildRouteSuggestions('Stockholm', shippers, 'Göteborg');
    const roadGeom = [[57.7, 11.9], [58.0, 13.5], [59.3, 18.0]];
    const fetchFn = () => Promise.resolve({
      durationMin: 200, distanceKm: 460, geometry: roadGeom, source: 'mock'
    });
    const enriched = await enrichSuggestionsWithMapbox(base, { fetchFn });
    expect(enriched[0].routeCoords).toEqual(roadGeom);
    expect(enriched[0].routingSource).toBe('mock');
  });
});

describe('planRouteFromYes capacity caps', () => {
  const origin = { label: 'Göteborg',  coords: [57.7088, 11.9746] };
  const dest   = { label: 'Stockholm', coords: [59.3293, 18.0686] };
  const fetchFn = () => Promise.resolve({
    durationMin: 100, distanceKm: 150, geometry: [origin.coords, dest.coords], source: 'mock'
  });

  const yes = [
    { id: 'y-1', position: [58.4, 15.6], score: 95, pallets: 15, weightKg: 10000 },
    { id: 'y-2', position: [58.5, 15.5], score: 90, pallets: 15, weightKg: 8000  },
    { id: 'y-3', position: [58.6, 15.4], score: 85, pallets: 10, weightKg: 5000  }
  ];

  it('drops candidates that would push pallet count over capacity', async () => {
    const route = await planRouteFromYes(origin, dest, yes, 200, {
      palletCapacity: 30,
      maxWeightKg: 99999,
      fetchFn
    });
    expect(route.palletsUsed).toBeLessThanOrEqual(30);
    expect(route.shipperIds).toContain('y-1');
    expect(route.shipperIds).toContain('y-2'); // 15 + 15 = 30, exactly the cap
    expect(route.shipperIds).not.toContain('y-3'); // would push to 40
  });

  it('drops candidates that would push cargo weight over cap', async () => {
    const route = await planRouteFromYes(origin, dest, yes, 200, {
      palletCapacity: 99,
      maxWeightKg: 15000,
      fetchFn
    });
    expect(route.weightKgUsed).toBeLessThanOrEqual(15000);
    expect(route.shipperIds).toContain('y-1'); // 10000
    expect(route.shipperIds).toContain('y-3'); // 10000 + 5000 = 15000
    expect(route.shipperIds).not.toContain('y-2'); // 10000 + 8000 would overflow
  });
});
