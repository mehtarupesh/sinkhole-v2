import { useRef } from 'react';
import CategoryField from './CategoryField';

/**
 * Renders the full category-selection area:
 *   - Existing category chips (via CategoryField) + "+" button
 *   - Ghost chip for a new category (AI-suggested pre-accepted, or manually added)
 *   - Status line for suggest states
 *   - "✦ suggest category" trigger button
 *
 * Ghost chip lifecycle:
 *   AI returns suggestedTitle  → chip appears pre-accepted (active style)
 *   Tap chip                   → enters inline-edit mode (rename)
 *   "✕" button                 → dismisses chip entirely
 *   User taps "+"              → opens empty chip in edit mode
 *
 * Props:
 *   groups          {id, title}[]
 *   categoryId      string         — currently selected existing category id
 *   onCategoryChange (id) => void
 *   suggest         return value of useSuggest()
 *   onSuggest       () => void     — fires runSuggest with current context
 *   canSuggest      bool
 *   disabled        bool
 */
export default function CategorySelector({
  groups,
  categoryId,
  onCategoryChange,
  suggest,
  onSuggest,
  canSuggest,
  disabled,
}) {
  const ghostEditRef = useRef(null);

  const {
    suggestState,
    newCategory,
    editingGhost,
    ghostEditValue,
    setGhostEditValue,
    startAddManual,
    startEditGhost,
    commitGhostEdit,
    dismissGhost,
    clearGhost,
  } = suggest;

  const showAddChip = !disabled && !newCategory && !editingGhost;
  const showGhostRow = !!newCategory || editingGhost;

  // Tapping an existing chip also clears any ghost chip
  const handleExistingChipChange = (id) => {
    onCategoryChange(id);
    clearGhost();
  };

  return (
    <div className="auto-suggest-wrap">

      {/* Existing chips + "+" button */}
      <div className="auto-suggest-chips-row">
        <CategoryField
          groups={groups}
          value={categoryId}
          onChange={handleExistingChipChange}
          disabled={disabled || suggestState === 'loading'}
        />
        {showAddChip && (
          <button
            type="button"
            className="auto-suggest-add-chip"
            onClick={startAddManual}
            aria-label="Add new category"
          >
            +
          </button>
        )}
      </div>

      {/* Ghost chip — new category (AI-suggested or manually added) */}
      {showGhostRow && (
        <div className="auto-suggest-ghost-row">
          {editingGhost ? (
            <input
              ref={ghostEditRef}
              autoFocus
              className="auto-suggest-ghost-input"
              value={ghostEditValue}
              placeholder="Category name…"
              onChange={(e) => setGhostEditValue(e.target.value)}
              onBlur={(e) => commitGhostEdit(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); commitGhostEdit(ghostEditValue); }
                // Stop propagation so Escape dismisses edit (not the whole modal)
                if (e.key === 'Escape') { e.stopPropagation(); commitGhostEdit(''); }
              }}
              aria-label="New category name"
            />
          ) : (
            <button
              type="button"
              className="category-field__chip category-field__chip--active auto-suggest-ghost-chip"
              onClick={startEditGhost}
              title="Tap to rename"
              aria-label={`New category "${newCategory?.title}" — tap to rename`}
            >
              {newCategory?.title}
            </button>
          )}

          {!editingGhost && (
            <button
              type="button"
              className="auto-suggest-ghost-dismiss"
              onClick={dismissGhost}
              aria-label="Dismiss new category"
            >
              ✕
            </button>
          )}

          <span className="auto-suggest-hint">
            {editingGhost ? 'Enter to confirm · Esc to dismiss' : 'New · tap to rename'}
          </span>
        </div>
      )}

      {/* Status line */}
      {suggestState === 'needs-selection' && (
        <p className="auto-suggest-status auto-suggest-status--warn">
          Please speak or type a note first
        </p>
      )}
      {suggestState === 'loading' && (
        <p className="auto-suggest-status">Thinking…</p>
      )}
      {suggestState === 'done' && !newCategory && categoryId && (
        <p className="auto-suggest-status auto-suggest-status--done">Suggested ✓</p>
      )}
      {suggestState === 'error' && (
        <p className="auto-suggest-status auto-suggest-status--error">Couldn't suggest — try again</p>
      )}
      {suggestState === 'no-key' && (
        <p className="auto-suggest-status auto-suggest-status--error">Add a Gemini API key in Settings ⚙</p>
      )}

      {/* Suggest trigger */}
      {canSuggest && (
        <button type="button" className="auto-suggest-trigger" onClick={onSuggest}>
          ✦ suggest category
        </button>
      )}

    </div>
  );
}
