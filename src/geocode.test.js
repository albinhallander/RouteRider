import { describe, it, expect, beforeEach } from 'vitest';
import { geocodeCity, __clearGeocodeCacheForTest } from './geocode.js';

describe('geocodeCity', () => {
  beforeEach(() => __clearGeocodeCacheForTest());

  it('resolves exact known names without touching the network', async () => {
    const sthlm = await geocodeCity('Stockholm');
    expect(sthlm.source).toBe('known');
    expect(sthlm.coords[0]).toBeCloseTo(59.3293, 3);
  });

  it('resolves English exonyms', async () => {
    const g = await geocodeCity('Gothenburg');
    expect(g.source).toBe('known');
    expect(g.coords[0]).toBeCloseTo(57.7088, 3);
  });

  it('fuzzy-matches common Swedish typos', async () => {
    const stok = await geocodeCity('Stokholm'); // missing 'c'
    expect(stok.source).toBe('fuzzy');
    expect(stok.label).toBe('Stockholm');

    const gote = await geocodeCity('Goteburg'); // missing 'b', dropped accent
    expect(gote.source).toBe('fuzzy');
    expect(gote.label).toBe('Göteborg');

    const nork = await geocodeCity('Norrkoping'); // no accent
    expect(nork.source).toBe('fuzzy');
    expect(nork.label).toBe('Norrköping');
  });

  it('handles key-mashing typos with repeated characters', async () => {
    // Run-collapse turns these into the canonical names before lookup, so
    // they short-circuit on the KNOWN map (fuzzy path would also catch them).
    const lin = await geocodeCity('linnnnnnnköping');
    expect(lin.coords[0]).toBeCloseTo(58.4108, 3);

    const sto = await geocodeCity('stooockholm');
    expect(sto.coords[0]).toBeCloseTo(59.3293, 3);

    // Milder typo that doesn't fully collapse to a known variant still
    // works via the fuzzy path.
    const goote = await geocodeCity('Gootteborg');
    expect(goote.label).toBe('Göteborg');
  });

  it('falls through gibberish to null (Nominatim path would run in browser)', async () => {
    // In jsdom, fetch to nominatim.openstreetmap.org typically fails. Either
    // way the caller should get null (not a wrong city) when nothing matches.
    const result = await geocodeCity('zxqwerasdf');
    expect(result == null || result.source === 'nominatim').toBe(true);
  });
});
