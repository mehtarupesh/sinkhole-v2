/**
 * CategoryCloud — renders stored category groups as a flowing bubble cloud.
 * Bubble size scales logarithmically with the number of items in each group.
 * Clicking a bubble opens UnitsOverlay pre-filtered to that category.
 */
export default function CategoryCloud({ storedGroups, onCategoryClick }) {
  if (!storedGroups || storedGroups.length === 0) return null;

  const counts = storedGroups.map((g) => g.uids.length);
  const minCount = Math.min(...counts);
  const maxCount = Math.max(...counts);
  const logMin = Math.log(minCount + 1);
  const logMax = Math.log(maxCount + 1);
  const range = logMax - logMin || 1;

  // Font size between 12px and 22px
  const MIN_SIZE = 12;
  const MAX_SIZE = 22;

  return (
    <div className="category-cloud-section">
      <div className="category-cloud-section__line category-cloud-section__line--left" />
      <div className="category-cloud">
      {storedGroups.map((g) => {
        const t = (Math.log(g.uids.length + 1) - logMin) / range;
        const fontSize = MIN_SIZE + t * (MAX_SIZE - MIN_SIZE);
        const opacity = 0.45 + t * 0.55; // 0.45 → 1.0

        return (
          <button
            key={g.id}
            type="button"
            className="category-cloud__pill"
            style={{ fontSize: `${fontSize.toFixed(1)}px`, opacity }}
            onClick={() => onCategoryClick(g.id)}
          >
            {g.title}
            <span className="category-cloud__count">{g.uids.length}</span>
          </button>
        );
      })}
      </div>
      <div className="category-cloud-section__line category-cloud-section__line--right" />
    </div>
  );
}
