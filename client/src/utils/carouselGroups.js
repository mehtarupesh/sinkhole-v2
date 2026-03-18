// Carousel definitions — replace the `filter` fn with real logic per id later
export const CAROUSEL_DEFS = [
  { id: 'today',         title: 'Added Today' },
  { id: 'passwords',     title: 'Passwords' },
  { id: 'mental-health', title: 'Mental Health' },
  { id: 'misc',          title: 'Everything Else' },
  { id: 'needs-context', title: 'Add Some Context?' },
];

const MAX = 10;

// Temporarily distributes units randomly across the first four carousels.
// The last carousel (needs-context) always uses real logic: units without a quote.
export function buildCarousels(units) {
  const needsContext = units.filter((u) => !u.quote).slice(0, MAX);

  const shuffled = [...units].sort(() => Math.random() - 0.5);
  const randomCarousels = CAROUSEL_DEFS.slice(0, 4)
    .map((def, i) => ({ ...def, units: shuffled.slice(i * MAX, (i + 1) * MAX) }));

  return [...randomCarousels, { ...CAROUSEL_DEFS[4], units: needsContext }]
    .filter((c) => c.units.length > 0);
}
