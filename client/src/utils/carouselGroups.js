export const MAX        = 10; // max units shown per categorized carousel
export const RECENT_MAX = 15; // max units shown in the "Recent" carousel

// Virtual group for units not assigned to any stored category.
// Change these two values to rename the Misc pill everywhere.
export const MISC_ID    = 'misc';
export const MISC_TITLE = 'Unclassified';

export const TRASH_ID    = 'trash';
export const TRASH_TITLE = 'Trash';

/**
 * Returns display groups — stored categories with computed uids, plus a virtual
 * Misc group for units with no categoryId or an unknown categoryId.
 * The Misc group is never persisted.
 *
 * @param {object[]} units
 * @param {{ id:string, title:string }[]} storedGroups
 * @returns {{ id:string, title:string, uids:string[] }[]}
 */
export function withMiscGroup(units, storedGroups) {
  const knownIds = new Set(storedGroups.map((g) => g.id));

  // Build uid lists per category in one pass
  const uidsByCategory = {};
  const miscUids = [];
  for (const u of units) {
    if (!u.uid) continue;
    if (u.categoryId && knownIds.has(u.categoryId)) {
      (uidsByCategory[u.categoryId] ??= []).push(u.uid);
    } else {
      miscUids.push(u.uid);
    }
  }

  const displayGroups = storedGroups.map((g) => ({
    ...g,
    uids: uidsByCategory[g.id] ?? [],
  }));

  if (miscUids.length > 0) {
    displayGroups.push({ id: MISC_ID, title: MISC_TITLE, uids: miscUids });
  }

  return displayGroups;
}

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
 * "Recent" is always first, followed by carousels for each stored category.
 * Units not in any category are surfaced via the "Misc" pill in CategoryCloud.
 *
 * @param {object[]} units
 * @param {{ id:string, title:string }[] | null} storedGroups
 * @returns {{ id:string, title:string, units:object[] }[]}
 */
export function buildCarousels(units, storedGroups = null) {
  const recent = buildRecentCarousel(units);

  if (storedGroups) {
    const knownIds = new Set(storedGroups.map((g) => g.id));

    // Bucket units by categoryId in one pass
    const unitsByCategory = {};
    for (const u of units) {
      if (u.categoryId && knownIds.has(u.categoryId)) {
        (unitsByCategory[u.categoryId] ??= []).push(u);
      }
    }

    const rawGroups = storedGroups.map((g) => ({
      id:    g.id,
      title: g.title,
      units: unitsByCategory[g.id] ?? [],
    }));

    const categorized = finalizeCarousels(rawGroups);
    return [...(recent ? [recent] : []), ...categorized];
  }

  return recent ? [recent] : [];
}
