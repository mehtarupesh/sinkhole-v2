import { useState, useRef, useEffect } from 'react';
import { CloseIcon } from './Icons';

/**
 * Confirmation modal for renaming a category.
 * currentTitle — existing category name (pre-fills the input)
 * onConfirm(newTitle) — called with the trimmed new name
 * onCancel — called when user cancels or clicks backdrop
 */
export default function RenameCategoryModal({ currentTitle, onConfirm, onCancel }) {
  const [value, setValue] = useState(currentTitle);
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.select();
  }, []);

  const trimmed = value.trim();
  const canSubmit = trimmed.length > 0 && trimmed !== currentTitle;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (canSubmit) onConfirm(trimmed);
  };

  return (
    <div className="overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal__header">
          <span className="modal__title">Rename category</span>
          <button type="button" className="btn-close" onClick={onCancel} aria-label="Cancel">
            <CloseIcon />
          </button>
        </div>

        <p className="modal__hint">Currently: "{currentTitle}"</p>

        <form onSubmit={handleSubmit} style={{ marginTop: 14 }}>
          <input
            ref={inputRef}
            type="text"
            className="connect-input"
            style={{ width: '100%', boxSizing: 'border-box' }}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="New name…"
            autoComplete="off"
          />

          <div className="confirm-delete__footer">
            <button type="button" className="btn-primary" onClick={onCancel}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={!canSubmit}>
              Rename
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
