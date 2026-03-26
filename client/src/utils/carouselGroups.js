export const MAX        = 10; // max units shown per categorized carousel
export const RECENT_MAX = 15; // max units shown in the "Recent" carousel

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
 * "Recent" is always first, followed by carousels for each stored group.
 * Uncategorized units are surfaced via the "Misc" pill in CategoryCloud, not a carousel.
 *
 * When storedGroups is provided (LLM result saved in IndexedDB), those groups
 * are used for the middle carousels. Units not in the vault anymore are silently
 * excluded. Without storedGroups, only Recent is shown.
 *
 * @param {object[]} units
 * @param {{ id:string, title:string, uids:string[] }[] | null} storedGroups
 * @returns {{ id:string, title:string, units:object[] }[]}
 */
export function buildCarousels(units, storedGroups = null) {
  const recent = buildRecentCarousel(units);

  if (storedGroups) {
    const byUid = Object.fromEntries(units.map((u) => [u.uid, u]));
    const rawGroups = storedGroups.map((g) => ({
      id:    g.id,
      title: g.title,
      units: g.uids.map((uid) => byUid[uid]).filter(Boolean),
    }));
    const categorized = finalizeCarousels(rawGroups);
    return [...(recent ? [recent] : []), ...categorized];
  }

  return recent ? [recent] : [];
}
