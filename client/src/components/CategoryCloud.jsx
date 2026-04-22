/**
 * CategoryCloud — renders stored category groups as a flowing bubble cloud.
 * Bubble size scales with recency of access: categories accessed most recently
 * appear larger and more opaque. Order follows the same ranking.
 * Clicking a bubble opens UnitsOverlay pre-filtered to that category.
 * Long-pressing a bubble enters category selection mode.
 */
import { useLongPress } from '../hooks/useLongPress';
import { MISC_ID, TRASH_ID, sortGroupsByRecency } from '../utils/carouselGroups';

// Deterministic pseudo-random in 0..1 from a string — stable across re-renders
function seededRandom(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return Math.abs(Math.sin(h));
}

// Extracted so useLongPress can be called at the top level of each pill component
function CategoryPill({ g, fontSize, opacity, selected, onClick, onLongPress }) {
  const pressHandlers = useLongPress({ onClick, onLongPress });
  return (
    <button
      type="button"
      className={[
        'category-cloud__pill',
        selected && 'category-cloud__pill--selected',
      ].filter(Boolean).join(' ')}
      style={{ fontSize: `${fontSize.toFixed(1)}px`, opacity: selected ? 1 : opacity }}
      {...pressHandlers}
    >
      {g.title}
      <span className="category-cloud__count">{g.uids.length}</span>
    </button>
  );
}

// selected: Set<id> — which category IDs are currently selected
// onCategoryLongPress: (id) => void — called when a pill is long-pressed
// accessOrder: string[] — UIDs ordered most-recently-accessed first (device-local)
export default function CategoryCloud({ storedGroups, onCategoryClick, selected, onCategoryLongPress, accessOrder = [] }) {
  if (!storedGroups || storedGroups.length === 0) return null;

  // Drop empty categories.
  const visibleGroups = storedGroups.filter((g) => g.uids.length > 0);

  if (visibleGroups.length === 0) return null;

  const sorted = sortGroupsByRecency(visibleGroups, accessOrder);

  // Build rankMap for size/opacity scaling (most-recently-accessed = largest)
  const uidToCat = new Map();
  for (const g of visibleGroups) {
    for (const uid of g.uids) uidToCat.set(uid, g.id);
  }
  const rankMap = new Map();
  for (let i = 0; i < accessOrder.length; i++) {
    const catId = uidToCat.get(accessOrder[i].uid);
    if (catId && !rankMap.has(catId)) rankMap.set(catId, i);
  }

  const PINNED_IDS = new Set([MISC_ID, TRASH_ID]);
  const maxRank = Math.max(...rankMap.values(), 1);

  const isMobile = window.innerWidth <= 640;
  const MIN_SIZE = isMobile ? 11 : 12;
  const MAX_SIZE = isMobile ? 16 : 22;

  // Unranked (never-accessed) categories get a random size rather than a flat
  // minimum. Cap their maximum at the size of the oldest accessed category so
  // they never visually outrank real access data. Fall back to MAX_SIZE when
  // nothing has been accessed yet (fresh install / all categories are new).
  let unrankedCap = MAX_SIZE;
  if (rankMap.size > 0) {
    const oldestRank = Math.max(...rankMap.values());
    const oldestT = 1 - oldestRank / maxRank;
    unrankedCap = MIN_SIZE + oldestT * (MAX_SIZE - MIN_SIZE);
  }

  return (
    <div className="category-cloud-section">
      <div className="category-cloud-section__line category-cloud-section__line--left" />
      <div className="category-cloud">
        {sorted
          .map((g) => {
            const pinned = PINNED_IDS.has(g.id);
            const rank = rankMap.get(g.id) ?? Infinity;
            const isUnranked = !pinned && rank === Infinity;

            let fontSize, opacity;
            if (isUnranked) {
              const r = seededRandom(g.id);
              fontSize = MIN_SIZE + r * (unrankedCap - MIN_SIZE);
              opacity = 0.45 + r * 0.35;
            } else {
              const t = pinned ? 0 : 1 - rank / maxRank;
              fontSize = MIN_SIZE + t * (MAX_SIZE - MIN_SIZE);
              opacity = pinned ? 0.45 : 0.45 + t * 0.55;
            }
            return { g, fontSize, opacity };
          })
          .sort((a, b) => b.fontSize - a.fontSize)
          .map(({ g, fontSize, opacity }) => (
            <CategoryPill
              key={g.id}
              g={g}
              fontSize={fontSize}
              opacity={opacity}
              selected={selected?.has(g.id) ?? false}
              onClick={() => onCategoryClick?.(g.id)}
              onLongPress={onCategoryLongPress ? () => onCategoryLongPress(g.id) : undefined}
            />
          ))}
      </div>
      <div className="category-cloud-section__line category-cloud-section__line--right" />
    </div>
  );
}
