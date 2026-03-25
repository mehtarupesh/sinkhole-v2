/**
 * CategoryField — optional category selector (controlled)
 *
 * Props:
 *   groups   {id, title}[]  available categories (from storedGroups)
 *   value    string         selected group id, or '' for none
 *   onChange fn             (groupId: string) => void
 *   disabled bool
 */
export default function CategoryField({ groups, value, onChange, disabled = false }) {
  if (!groups?.length) return null;
  return (
    <div className="category-field">
      <select
        className={`category-field__select${value ? ' category-field__select--has-value' : ''}`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        aria-label="Category"
      >
        <option value="">Add to category…</option>
        {groups.map((g) => (
          <option key={g.id} value={g.id}>{g.title}</option>
        ))}
      </select>
    </div>
  );
}
