import { describe, it, expect } from 'vitest';
import {
  buildCarousels,
  buildRecentCarousel,
  finalizeCarousels,
  CAROUSEL_DEFS,
  MAX,
  RECENT_MAX,
} from '../utils/carouselGroups';

// ── Factories ─────────────────────────────────────────────────────────────────

const makeUnit = (id, overrides = {}) => ({
  id,
  uid: `uid-${id}`,
  type: 'snippet',
  content: `content ${id}`,
  createdAt: id * 1000, // deterministic, earlier id = older
  ...overrides,
});

// ── finalizeCarousels ─────────────────────────────────────────────────────────

describe('finalizeCarousels', () => {
  it('drops carousels with no units', () => {
    const input = [
      { id: 'a', title: 'A', units: [makeUnit(1)] },
      { id: 'b', title: 'B', units: [] },
    ];
    const result = finalizeCarousels(input);
    expect(result.map((c) => c.id)).toEqual(['a']);
  });

  it('sorts units newest-first within each carousel', () => {
    const input = [
      {
        id: 'a',
        title: 'A',
        units: [makeUnit(1), makeUnit(3), makeUnit(2)],
      },
    ];
    const [carousel] = finalizeCarousels(input);
    expect(carousel.units.map((u) => u.id)).toEqual([3, 2, 1]);
  });

  it('caps each carousel at MAX units', () => {
    const units = Array.from({ length: MAX + 5 }, (_, i) => makeUnit(i + 1));
    const result = finalizeCarousels([{ id: 'a', title: 'A', units }]);
    expect(result[0].units).toHaveLength(MAX);
  });

  it('keeps the MAX newest units when capping', () => {
    const units = Array.from({ length: MAX + 3 }, (_, i) => makeUnit(i + 1));
    const [carousel] = finalizeCarousels([{ id: 'a', title: 'A', units }]);
    // All surviving units should have ids > 3 (the 3 oldest are dropped)
    carousel.units.forEach((u) => expect(u.id).toBeGreaterThan(3));
  });

  it('does not mutate the original units array', () => {
    const original = [makeUnit(2), makeUnit(1)];
    finalizeCarousels([{ id: 'a', title: 'A', units: original }]);
    expect(original[0].id).toBe(2); // order unchanged in original
  });
});

// ── buildRecentCarousel ───────────────────────────────────────────────────────

describe('buildRecentCarousel', () => {
  it('returns null for an empty units array', () => {
    expect(buildRecentCarousel([])).toBeNull();
  });

  it('returns id "recent" and title "Recent"', () => {
    const result = buildRecentCarousel([makeUnit(1)]);
    expect(result.id).toBe('recent');
    expect(result.title).toBe('Recent');
  });

  it('orders units newest-first', () => {
    const units = [makeUnit(1), makeUnit(3), makeUnit(2)];
    const { units: out } = buildRecentCarousel(units);
    expect(out.map((u) => u.id)).toEqual([3, 2, 1]);
  });

  it('caps at RECENT_MAX units', () => {
    const units = Array.from({ length: RECENT_MAX + 5 }, (_, i) => makeUnit(i + 1));
    const { units: out } = buildRecentCarousel(units);
    expect(out).toHaveLength(RECENT_MAX);
  });

  it('keeps the RECENT_MAX newest units when capping', () => {
    const units = Array.from({ length: RECENT_MAX + 2 }, (_, i) => makeUnit(i + 1));
    const { units: out } = buildRecentCarousel(units);
    // The 2 oldest (id 1 and 2) should not appear
    const ids = out.map((u) => u.id);
    expect(ids).not.toContain(1);
    expect(ids).not.toContain(2);
  });
});

// ── buildCarousels ────────────────────────────────────────────────────────────

describe('buildCarousels', () => {
  it('returns an empty array when there are no units', () => {
    expect(buildCarousels([])).toEqual([]);
  });

  it('"recent" carousel is always the first carousel', () => {
    const units = [makeUnit(1), makeUnit(2), makeUnit(3)];
    const carousels = buildCarousels(units);
    expect(carousels[0].id).toBe('recent');
  });

  it('"recent" carousel is absent when there are no units', () => {
    const carousels = buildCarousels([]);
    expect(carousels.find((c) => c.id === 'recent')).toBeUndefined();
  });

  it('"recent" carousel units are sorted newest-first', () => {
    const units = [makeUnit(1), makeUnit(3), makeUnit(2)];
    const recent = buildCarousels(units).find((c) => c.id === 'recent');
    expect(recent.units[0].id).toBe(3);
    expect(recent.units[1].id).toBe(2);
    expect(recent.units[2].id).toBe(1);
  });

  it('never exceeds MAX units per categorized carousel', () => {
    const units = Array.from({ length: 60 }, (_, i) => makeUnit(i + 1));
    const carousels = buildCarousels(units);
    carousels
      .filter((c) => c.id !== 'recent')
      .forEach((c) => expect(c.units.length).toBeLessThanOrEqual(MAX));
  });

  it('"recent" carousel never exceeds RECENT_MAX units', () => {
    const units = Array.from({ length: RECENT_MAX + 10 }, (_, i) => makeUnit(i + 1));
    const recent = buildCarousels(units).find((c) => c.id === 'recent');
    expect(recent.units.length).toBeLessThanOrEqual(RECENT_MAX);
  });

  it('omits carousels with no units', () => {
    const units = [makeUnit(1), makeUnit(2), makeUnit(3)];
    const carousels = buildCarousels(units);
    carousels.forEach((c) => expect(c.units.length).toBeGreaterThan(0));
  });

  it('includes all CAROUSEL_DEF ids when there are enough units', () => {
    const expectedIds = CAROUSEL_DEFS.map((d) => d.id);
    const units = Array.from({ length: 50 }, (_, i) => makeUnit(i + 1));
    const carousels = buildCarousels(units);
    const ids = carousels.map((c) => c.id);
    expectedIds.forEach((id) => expect(ids).toContain(id));
  });

  // ── needs-context carousel ────────────────────────────────────────────────

  it('needs-context carousel contains only units without a quote', () => {
    const units = [
      makeUnit(1, { quote: 'has a note' }),
      makeUnit(2),
      makeUnit(3, { quote: '' }),
      makeUnit(4),
    ];
    const ctx = buildCarousels(units).find((c) => c.id === 'needs-context');
    expect(ctx).toBeDefined();
    ctx.units.forEach((u) => expect(u.quote).toBeFalsy());
  });

  it('needs-context carousel is absent when all units have quotes', () => {
    const units = [
      makeUnit(1, { quote: 'note a' }),
      makeUnit(2, { quote: 'note b' }),
    ];
    const carousels = buildCarousels(units);
    expect(carousels.find((c) => c.id === 'needs-context')).toBeUndefined();
  });

  it('needs-context carousel caps at MAX units', () => {
    const units = Array.from({ length: MAX + 5 }, (_, i) => makeUnit(i + 1)); // no quotes
    const ctx = buildCarousels(units).find((c) => c.id === 'needs-context');
    expect(ctx.units.length).toBeLessThanOrEqual(MAX);
  });

  it('needs-context carousel is the last carousel', () => {
    const units = Array.from({ length: 50 }, (_, i) => makeUnit(i + 1));
    const carousels = buildCarousels(units);
    expect(carousels[carousels.length - 1].id).toBe('needs-context');
  });

  it('needs-context units are sorted newest-first', () => {
    const units = [makeUnit(1), makeUnit(3), makeUnit(2)]; // no quotes
    const ctx = buildCarousels(units).find((c) => c.id === 'needs-context');
    expect(ctx.units[0].id).toBe(3);
  });
});
