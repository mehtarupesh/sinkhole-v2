import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import CategoryField from './CategoryField';
import { TRASH_ID, sortGroupsByRecency } from '../utils/carouselGroups';

/**
 * Category selector — pill trigger that opens a bottom-sheet modal.
 *
 * Trigger row:  [Empire of Things ▾]
 * Modal:        header with [+] left · "Category" center · [Suggest ✦] right
 *               body with all chips (wrapping) + ghost chip
 */
export default function CategorySelector({
  groups,
  categoryId,
  onCategoryChange,
  suggest,
  onSuggest,
  canSuggest,
  disabled,
  accessOrder = [],
}) {
  const [isOpen, setIsOpen] = useState(false);
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

  const visibleGroups = sortGroupsByRecency(
    groups.filter((g) => g.id !== TRASH_ID),
    accessOrder,
  );
  const selectedGroup = visibleGroups.find((g) => g.id === categoryId);
  // Ghost from AI/manual add counts as a selection for display purposes
  const displayGroup = selectedGroup ?? newCategory;

  // Intercept Escape in capture phase so it closes THIS modal, not the parent.
  // Capture fires before bubble, so stopPropagation prevents AddUnitModal /
  // UnitDetail / CategoryView / UnitsOverlay from seeing the event at all.
  // When the ghost input is active we can't let the event reach it (capture
  // stops propagation to DOM children too), so we call commitGhostEdit directly.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      if (editingGhost) {
        commitGhostEdit(''); // mirrors ghost input's own Escape → dismiss
      } else {
        setIsOpen(false);
      }
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  }, [isOpen, editingGhost, commitGhostEdit]);

  const handleExistingChipChange = (id) => {
    onCategoryChange(id);
    clearGhost();
    setIsOpen(false);
  };

  const handleClose = () => setIsOpen(false);

  const showAddChip = !disabled && !newCategory && !editingGhost;
  const showGhostRow = !!newCategory || editingGhost;

  const modal = isOpen && createPortal(
    <div
      className="overlay overlay--sheet cat-picker-overlay"
      onClick={handleClose}
    >
      <div
        className="cat-picker-modal"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag handle (mobile) */}
        <div className="sheet__handle" />

        {/* Header: + | Category | Suggest */}
        <div className="cat-picker-modal__header">
          {showAddChip ? (
            <button
              type="button"
              className="cat-picker-modal__add-btn"
              onClick={startAddManual}
              aria-label="Add new category"
            >
              +
            </button>
          ) : (
            <div className="cat-picker-modal__add-btn-placeholder" />
          )}

          <span className="cat-picker-modal__title">Category</span>

          <div className="cat-picker-modal__header-right">
            {suggestState === 'loading' && (
              <span className="auto-suggest-status cat-picker__inline-status">Thinking…</span>
            )}
            {suggestState === 'done' && !newCategory && categoryId && (
              <span className="auto-suggest-status auto-suggest-status--done cat-picker__inline-status">✓</span>
            )}
            {suggestState === 'error' && (
              <span className="auto-suggest-status auto-suggest-status--error cat-picker__inline-status">Couldn't suggest</span>
            )}
            {suggestState === 'no-key' && (
              <span className="auto-suggest-status auto-suggest-status--error cat-picker__inline-status">Add Gemini key in Settings ⚙</span>
            )}
            {suggestState === 'needs-selection' && (
              <span className="auto-suggest-status auto-suggest-status--warn cat-picker__inline-status">Add a note first</span>
            )}
            {canSuggest && (
              <button
                type="button"
                className="auto-suggest-trigger cat-picker-modal__suggest-btn"
                onClick={onSuggest}
                disabled={suggestState === 'loading'}
              >
                Suggest ✦
              </button>
            )}
          </div>
        </div>

        {/* Chips body */}
        <div className="cat-picker-modal__body">
          <CategoryField
            groups={visibleGroups}
            value={categoryId}
            onChange={handleExistingChipChange}
            disabled={disabled || suggestState === 'loading'}
          />

          {/* Ghost chip */}
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
        </div>
      </div>
    </div>,
    document.body
  );

  return (
    <>
      <div className="cat-picker">
        <div className="cat-picker__row">
          <button
            type="button"
            className={`cat-picker__pill${displayGroup ? ' cat-picker__pill--active' : ''}`}
            onClick={() => { if (!disabled) setIsOpen(true); }}
            disabled={disabled}
            aria-label={displayGroup ? `Category: ${displayGroup.title}` : 'Select category'}
          >
            {displayGroup ? displayGroup.title : 'Category'}
            <span className="cat-picker__pill-caret">▾</span>
          </button>

          {suggestState === 'loading' && (
            <span className="auto-suggest-status cat-picker__inline-status">Thinking…</span>
          )}
        </div>
      </div>
      {modal}
    </>
  );
}
