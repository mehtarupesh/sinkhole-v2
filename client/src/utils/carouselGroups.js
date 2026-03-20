export const MAX        = 10; // max units shown per categorized carousel
export const RECENT_MAX = 15; // max units shown in the "Recent" carousel

// Placeholder category definitions (first 3 are random buckets; needs-context is rule-based)
export const CAROUSEL_DEFS = [
  { id: 'passwords',     title: 'Passwords' },
  { id: 'mental-health', title: 'Mental Health' },
  { id: 'misc',          title: 'Everything Else' },
  { id: 'needs-context', title: 'Add Some Context?' },
];

/**
 * Shared finalizer applied to every categorized carousel group.
 * - Sorts each group newest-first (by createdAt desc)
 * - Caps each group at MAX items
 * - Drops groups with no items
 *
 * Does NOT apply to the "Recent" carousel, which has its own cap (RECENT_MAX).
 *
 * @param {{ id:string, title:string, units:object[] }[]} carousels
 * @returns {{ id:string, title:string, units:object[] }[]}
 */
export function finalizeCarousels(carousels) {
  return carousels
    .map((c) => ({
      ...c,
      units: [...c.units]
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, MAX),
    }))
    .filter((c) => c.units.length > 0);
}

/**
 * Builds the "Recent" carousel: the RECENT_MAX most recently added units,
 * newest-first. Returns null when there are no units.
 *
 * @param {object[]} units
 * @returns {{ id:string, title:string, units:object[] } | null}
 */
export function buildRecentCarousel(units) {
  const sorted = [...units]
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, RECENT_MAX);
  return sorted.length > 0 ? { id: 'recent', title: 'Recent', units: sorted } : null;
}

/**
 * Builds the full carousel list shown on the landing page.
 * "Recent" is always first; "Add Some Context?" is always last.
 * The middle carousels are randomly distributed placeholders until real
 * LLM categorization is wired up.
 *
 * @param {object[]} units
 * @returns {{ id:string, title:string, units:object[] }[]}
 */
export function buildCarousels(units) {
  const recent      = buildRecentCarousel(units);
  const needsCtx    = units.filter((u) => !u.quote);
  const shuffled    = [...units].sort(() => Math.random() - 0.5);

  // Randomly distribute across the first 3 placeholder buckets
  const randomGroups = CAROUSEL_DEFS.slice(0, 3).map((def, i) => ({
    ...def,
    units: shuffled.slice(i * MAX, (i + 1) * MAX),
  }));

  const categorized = finalizeCarousels([
    ...randomGroups,
    { ...CAROUSEL_DEFS[3], units: needsCtx }, // needs-context
  ]);

  return [
    ...(recent ? [recent] : []),
    ...categorized,
  ];
}
