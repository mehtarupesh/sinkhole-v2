import { TRASH_ID } from './carouselGroups';

const DEFAULT_MIN_AGE_MS = 24 * 60 * 60 * 1000; // 1 day

/**
 * Returns units that are candidates for cleanup:
 *   - Not in Trash
 *   - Older than minAgeMs
 *   - Sorted by least recently accessed (never-opened first, then oldest last-access)
 *
 * Each returned unit has an extra `lastAccessedAt` field (ms timestamp or null).
 */
export function getCleanupCandidates(units, accessOrder, { minAgeMs = DEFAULT_MIN_AGE_MS } = {}) {
  const cutoff = Date.now() - minAgeMs;

  // uid → most recent access timestamp
  const lastAccess = new Map();
  for (const { uid, t } of accessOrder) {
    if (!lastAccess.has(uid)) lastAccess.set(uid, t);
  }

  const candidates = units
    .filter((u) => u.categoryId !== TRASH_ID && u.createdAt < cutoff)
    .map((u) => ({ ...u, lastAccessedAt: lastAccess.get(u.uid) ?? null }));

  // Sort: never accessed first (lastAccessedAt=null → 0), then oldest access time first
  candidates.sort((a, b) => (a.lastAccessedAt ?? 0) - (b.lastAccessedAt ?? 0));

  return candidates;
}
