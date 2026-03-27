import { useRef, useEffect } from 'react';

/**
 * CategoryField — horizontal chip row for category selection (controlled)
 *
 * Props:
 *   groups   {id, title}[]  available categories
 *   value    string         selected group id, or '' for none
 *   onChange fn             (groupId: string) => void
 *   disabled bool
 */
export default function CategoryField({ groups, value, onChange, disabled = false }) {
  const scrollRef = useRef(null);

  useEffect(() => {
    if (!value || !scrollRef.current) return;
    const container = scrollRef.current;
    const chip = container.querySelector('.category-field__chip--active');
    if (!chip) return;
    const containerRect = container.getBoundingClientRect();
    const chipRect = chip.getBoundingClientRect();
    const chipScrollLeft = container.scrollLeft + chipRect.left - containerRect.left;
    const chipCenter = chipScrollLeft + chipRect.width / 2;
    const containerCenter = containerRect.width / 2;
    container.scrollTo({ left: chipCenter - containerCenter, behavior: 'smooth' });
  }, [value]);

  if (!groups?.length) return null;
  return (
    <div className="category-field">
      <div className="category-field__chips" ref={scrollRef}>
        {groups.map((g) => (
          <button
            key={g.id}
            type="button"
            className={`category-field__chip${value === g.id ? ' category-field__chip--active' : ''}`}
            onClick={() => onChange(value === g.id ? '' : g.id)}
            disabled={disabled}
          >
            {g.title}
          </button>
        ))}
      </div>
    </div>
  );
}
