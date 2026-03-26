import { CloseIcon } from './Icons';

/**
 * Generic action bar shown during selection mode.
 * Styled like .landing__actions — frosted pill, fixed bottom center.
 *
 * actions: [{ icon, label, onClick }]
 * Actions define their own constraints (e.g. onlyOne checks) inside onClick.
 */
export default function SelectionBar({ count, total, onSelectAll, onClear, actions }) {
  const allSelected = count > 0 && count === total;

  return (
    <div className="selection-bar-wrap">
      <div className="selection-bar">
        <span className="selection-bar__count">{count}</span>
        <div className="selection-bar__sep" />
        {actions.map(({ icon, label, onClick }) => (
          <button
            key={label}
            type="button"
            className="btn-icon"
            title={label}
            aria-label={label}
            onClick={onClick}
          >
            {icon}
          </button>
        ))}
        <div className="selection-bar__sep" />
        <button
          type="button"
          className="btn-icon"
          title={allSelected ? 'Deselect all' : 'Select all'}
          aria-label={allSelected ? 'Deselect all' : 'Select all'}
          onClick={allSelected ? onClear : onSelectAll}
        >
          {allSelected ? 'None' : 'All'}
        </button>
        <button
          type="button"
          className="btn-icon"
          title="Cancel selection"
          aria-label="Cancel selection"
          onClick={onClear}
        >
          <CloseIcon />
        </button>
      </div>
    </div>
  );
}
