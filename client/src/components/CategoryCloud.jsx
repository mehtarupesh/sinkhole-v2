/**
 * CategoryCloud — renders stored category groups as a flowing bubble cloud.
 * Bubble size scales logarithmically with the number of items in each group.
 * Clicking a bubble opens UnitsOverlay pre-filtered to that category.
 * Long-pressing a bubble enters category selection mode.
 */
import { useLongPress } from '../hooks/useLongPress';

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
export default function CategoryCloud({ storedGroups, onCategoryClick, selected, onCategoryLongPress }) {
  if (!storedGroups || storedGroups.length === 0) return null;

  const counts = storedGroups.map((g) => g.uids.length);
  const minCount = Math.min(...counts);
  const maxCount = Math.max(...counts);
  const logMin = Math.log(minCount + 1);
  const logMax = Math.log(maxCount + 1);
  const range = logMax - logMin || 1;

  const isMobile = window.innerWidth <= 640;
  const MIN_SIZE = isMobile ? 11 : 12;
  const MAX_SIZE = isMobile ? 16 : 22;

  return (
    <div className="category-cloud-section">
      <div className="category-cloud-section__line category-cloud-section__line--left" />
      <div className="category-cloud">
        {storedGroups.map((g) => {
          const t = (Math.log(g.uids.length + 1) - logMin) / range;
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
