export const RECENT_MAX = 15; // max units shown in the "Recent" carousel

// Virtual group for units not assigned to any stored category.
// Change these two values to rename the Misc pill everywhere.
export const MISC_ID    = 'misc';
export const MISC_TITLE = 'Unclassified';

export const TRASH_ID    = 'trash';
export const TRASH_TITLE = 'Trash';

/**
 * Removes stored categories that have no units assigned to them.
 * Trash is always preserved regardless of whether it is empty.
 *
 * @param {{ id:string, title:string }[]} storedGroups
 * @param {object[]} units
 * @returns {{ id:string, title:string }[]}
 */
export function pruneEmptyCategories(storedGroups, units) {
  const populated = new Set(units.map((u) => u.categoryId).filter(Boolean));
  return storedGroups.filter((g) => g.id === TRASH_ID || populated.has(g.id));
}

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

