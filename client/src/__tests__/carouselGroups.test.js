import { describe, it, expect } from 'vitest';
import { buildCarousels, CAROUSEL_DEFS } from '../utils/carouselGroups';

const makeUnit = (id, overrides = {}) => ({
  id,
  type: 'snippet',
  content: `content ${id}`,
  createdAt: Date.now(),
  ...overrides,
});

describe('buildCarousels', () => {
  it('returns an empty array when there are no units', () => {
    expect(buildCarousels([])).toEqual([]);
  });

  it('never exceeds 10 units per carousel', () => {
    const units = Array.from({ length: 60 }, (_, i) => makeUnit(i + 1));
    const carousels = buildCarousels(units);
    carousels.forEach((c) => expect(c.units.length).toBeLessThanOrEqual(10));
  });

  it('omits carousels with no units', () => {
    // Only 3 units — several carousels will be empty
    const units = [makeUnit(1), makeUnit(2), makeUnit(3)];
    const carousels = buildCarousels(units);
    carousels.forEach((c) => expect(c.units.length).toBeGreaterThan(0));
  });

  it('includes all expected carousel ids', () => {
    const expectedIds = CAROUSEL_DEFS.map((d) => d.id);
    const units = Array.from({ length: 50 }, (_, i) => makeUnit(i + 1));
    const carousels = buildCarousels(units);
    const ids = carousels.map((c) => c.id);
    expectedIds.forEach((id) => expect(ids).toContain(id));
  });

  // ── needs-context carousel ──────────────────────────────────────────────────

  it('needs-context carousel contains only units without a quote', () => {
    const units = [
      makeUnit(1, { quote: 'has a note' }),
      makeUnit(2),
      makeUnit(3, { quote: '' }),
      makeUnit(4),
    ];
    const carousels = buildCarousels(units);
    const ctx = carousels.find((c) => c.id === 'needs-context');
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

  it('needs-context carousel caps at 10 units', () => {
    const units = Array.from({ length: 20 }, (_, i) => makeUnit(i + 1)); // no quotes
    const carousels = buildCarousels(units);
    const ctx = carousels.find((c) => c.id === 'needs-context');
    expect(ctx.units.length).toBe(10);
  });

  it('needs-context carousel is always the last carousel', () => {
    const units = Array.from({ length: 50 }, (_, i) => makeUnit(i + 1));
    const carousels = buildCarousels(units);
    expect(carousels[carousels.length - 1].id).toBe('needs-context');
  });
});
