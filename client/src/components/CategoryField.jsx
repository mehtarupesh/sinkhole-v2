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
  if (!groups?.length) return null;
  return (
    <div className="category-field">
      <div className="category-field__chips">
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
