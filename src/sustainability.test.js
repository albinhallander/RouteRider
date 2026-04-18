import { describe, it, expect } from 'vitest';
import { COMPANIES } from './companies.js';
import { suggestCarriers } from './carrierSuggestions.js';

describe('sustainability — shippers', () => {
  it('exposes sustainability field on ranked companies', () => {
    const withSust = COMPANIES.filter(c => c.sustainability);
    expect(withSust.length).toBeGreaterThan(0);
    const sample = withSust[0].sustainability;
    expect(sample).toHaveProperty('category');
    expect(['leader', 'active', 'mentioned', 'silent', 'unknown']).toContain(sample.category);
  });

  it('applies a sustainability bonus only when CDP data is absent', () => {
    // CDP (when present) is the primary signal and is already factored into baseScore.
    // Our web-sourced bonus only kicks in as a fallback for companies CDP doesn't cover.
    const bonus = { leader: 10, active: 5, mentioned: 2, silent: -3, unknown: 0 };
    const samples = COMPANIES.filter(c => c.sustainability && typeof c.baseScore === 'number');
    if (samples.length === 0) return;
    for (const c of samples.slice(0, 20)) {
      const applied = c.hasCdp ? 0 : (bonus[c.sustainability.category] ?? 0);
      const expected = Math.max(0, Math.min(100, c.baseScore + applied));
      expect(c.score).toBe(expected);
    }
  });
});

describe('sustainability — carriers', () => {
  it('runs without error and preserves full-before-partial ordering', () => {
    const ranked = suggestCarriers('Göteborg', 'Stockholm', 6);
    expect(Array.isArray(ranked)).toBe(true);
    expect(ranked.length).toBeGreaterThan(0);
    const fulls = ranked.filter(c => c.matchType === 'full');
    const partials = ranked.filter(c => c.matchType === 'partial');
    if (fulls.length && partials.length) {
      expect(ranked.indexOf(fulls[0])).toBeLessThan(ranked.indexOf(partials[0]));
    }
  });
});
