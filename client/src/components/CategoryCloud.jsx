/**
 * CategoryCloud — renders stored category groups as a flowing bubble cloud.
 * Bubble size scales with recency of access: categories accessed most recently
 * appear larger and more opaque. Order follows the same ranking.
 * Clicking a bubble opens UnitsOverlay pre-filtered to that category.
 * Long-pressing a bubble enters category selection mode.
 */
import { useLongPress } from '../hooks/useLongPress';
import { MISC_ID, TRASH_ID } from '../utils/carouselGroups';

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

  // Drop empty real categories — keep Misc and Trash regardless (they're always navigable).
  const visibleGroups = storedGroups.filter((g) => g.id === MISC_ID || g.id === TRASH_ID || g.uids.length > 0);

  if (visibleGroups.length === 0) return null;

  // Build uid → categoryId map from groups (groups already carry their uid lists)
  const uidToCat = new Map();
  for (const g of visibleGroups) {
    for (const uid of g.uids) uidToCat.set(uid, g.id);
  }

  // Score each category: index of its first uid in accessOrder (lower = more recent)
  const rankMap = new Map();
  for (let i = 0; i < accessOrder.length; i++) {
    const catId = uidToCat.get(accessOrder[i].uid);
    if (catId && !rankMap.has(catId)) rankMap.set(catId, i);
  }

  // Sort: most recently accessed first; unranked categories at the end
  const sorted = [...visibleGroups].sort((a, b) => {
    return (rankMap.get(a.id) ?? Infinity) - (rankMap.get(b.id) ?? Infinity);
  });

  const maxRank = Math.max(...rankMap.values(), 1);

  const isMobile = window.innerWidth <= 640;
  const MIN_SIZE = isMobile ? 11 : 12;
  const MAX_SIZE = isMobile ? 16 : 22;

  return (
    <div className="category-cloud-section">
      <div className="category-cloud-section__line category-cloud-section__line--left" />
      <div className="category-cloud">
        {sorted.map((g) => {
          const rank = rankMap.get(g.id) ?? Infinity;
          const t = rank === Infinity ? 0 : 1 - rank / maxRank;
          const fontSize = MIN_SIZE + t * (MAX_SIZE - MIN_SIZE);
          const opacity = 0.45 + t * 0.55;
          return (
            <CategoryPill
              key={g.id}
              g={g}
              fontSize={fontSize}
              opacity={opacity}
              selected={selected?.has(g.id) ?? false}
              onClick={() => onCategoryClick?.(g.id)}
              onLongPress={onCategoryLongPress ? () => onCategoryLongPress(g.id) : undefined}
            />
          );
        })}
      </div>
      <div className="category-cloud-section__line category-cloud-section__line--right" />
    </div>
  );
}
