import { useState, useRef, useEffect } from 'react';
import CategoryField from './CategoryField';
import { TRASH_ID } from '../utils/carouselGroups';

/**
 * Compact category selector — single-line trigger pill that expands
 * into a wrapping chip panel when tapped.
 *
 * Trigger row:  [Empire of Things ▾]  [✦ suggest category]
 * Expanded:     panel with all chips (wrapping) + ghost chip flow
 *
 * Props: same as before — no parent changes required.
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
  const [isOpen, setIsOpen] = useState(false);
  const panelRef = useRef(null);
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

  const visibleGroups = groups.filter((g) => g.id !== TRASH_ID);
  const selectedGroup = visibleGroups.find((g) => g.id === categoryId);

  // Open panel when AI suggests a new category so user can see it
  useEffect(() => {
    if (newCategory || editingGhost) setIsOpen(true);
  }, [newCategory, editingGhost]);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    const onPointerDown = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('pointerdown', onPointerDown, { capture: true });
    return () => document.removeEventListener('pointerdown', onPointerDown, { capture: true });
  }, [isOpen]);

  const handleExistingChipChange = (id) => {
    onCategoryChange(id);
    clearGhost();
    setIsOpen(false);
  };

  const handlePillClick = () => {
    if (!disabled) setIsOpen((v) => !v);
  };

  const showAddChip = !disabled && !newCategory && !editingGhost;
  const showGhostRow = !!newCategory || editingGhost;

  return (
    <div className="cat-picker" ref={panelRef}>

      {/* ── Trigger row ── */}
      <div className="cat-picker__row">
        <button
          type="button"
          className={`cat-picker__pill${selectedGroup ? ' cat-picker__pill--active' : ''}`}
          onClick={handlePillClick}
          disabled={disabled || suggestState === 'loading'}
          aria-expanded={isOpen}
          aria-label={selectedGroup ? `Category: ${selectedGroup.title}` : 'Select category'}
        >
          {selectedGroup ? selectedGroup.title : 'Category'}
          <span className="cat-picker__pill-caret">{isOpen ? '▴' : '▾'}</span>
        </button>

        {/* Status inline with row */}
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
          <span className="auto-suggest-status auto-suggest-status--warn cat-picker__inline-status">Speak or type a note first</span>
        )}

        {/* Suggest button — same row, no second line */}
        {canSuggest && (
          <button
            type="button"
            className="auto-suggest-trigger cat-picker__suggest-btn"
            onClick={onSuggest}
            disabled={suggestState === 'loading'}
          >
            ✦ suggest
          </button>
        )}
      </div>

      {/* ── Expanded panel ── */}
      {isOpen && (
        <div className="cat-picker__panel">
          <CategoryField
            groups={visibleGroups}
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
      )}

    </div>
  );
}
