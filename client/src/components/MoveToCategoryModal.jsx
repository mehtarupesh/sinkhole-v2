import { useState } from 'react';
import { CloseIcon } from './Icons';
import CategoryField from './CategoryField';
import { MISC_ID, MISC_TITLE } from '../utils/carouselGroups';

const slugify = (str) =>
  str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

/**
 * Confirmation modal for bulk "Move to Category".
 *
 * Props:
 *   count   number          number of items being moved
 *   groups  {id,title}[]    available (persisted) categories
 *   onMove  (categoryId, newCategory?) => void
 *   onClose () => void
 */
export default function MoveToCategoryModal({ count, groups, onMove, onClose }) {
  const [targetId, setTargetId] = useState('');
  // null = no ghost; '' or string = ghost chip ('' means currently editing)
  const [newCatTitle, setNewCatTitle] = useState(null);
  const [editingNew, setEditingNew] = useState(false);

  // A committed new category (non-empty title, not currently being edited)
  const newCat = (newCatTitle && !editingNew)
    ? { id: slugify(newCatTitle), title: newCatTitle }
    : null;

  const canMove = !!targetId || newCat !== null;

  const handleExistingChange = (id) => {
    setTargetId(id);
    setNewCatTitle(null);
    setEditingNew(false);
  };

  const commitNew = (value) => {
    const trimmed = value.trim();
    if (!trimmed || trimmed.toLowerCase() === 'trash') {
      setNewCatTitle(null);
      setEditingNew(false);
    } else {
      setNewCatTitle(trimmed);
      setEditingNew(false);
      setTargetId(''); // deselect any existing chip
    }
  };

  const handleMove = () => {
    if (newCat) onMove(newCat.id, newCat);
    else onMove(targetId);
  };

  return (
    <div className="overlay overlay--sheet" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal__header">
          <span className="modal__title">
            Move to category
            <span className="modal__count">{count} item{count !== 1 ? 's' : ''}</span>
          </span>
          <button type="button" className="btn-close" onClick={onClose} aria-label="Close">
            <CloseIcon />
          </button>
        </div>

        <div className="auto-suggest-chips-row">
          <CategoryField
            groups={[...groups, { id: MISC_ID, title: MISC_TITLE }]}
            value={targetId}
            onChange={handleExistingChange}
          />
          {newCatTitle === null && (
            <button
              type="button"
              className="auto-suggest-add-chip"
              onClick={() => { setNewCatTitle(''); setEditingNew(true); }}
              aria-label="Add new category"
            >
              +
            </button>
          )}
        </div>

        {newCatTitle !== null && (
          <div className="auto-suggest-ghost-row">
            {editingNew ? (
              <input
                autoFocus
                className="auto-suggest-ghost-input"
                value={newCatTitle}
                placeholder="Category name…"
                onChange={(e) => setNewCatTitle(e.target.value)}
                onBlur={(e) => commitNew(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); commitNew(newCatTitle); }
                  if (e.key === 'Escape') { e.stopPropagation(); commitNew(''); }
                }}
                aria-label="New category name"
              />
            ) : (
              <button
                type="button"
                className="category-field__chip category-field__chip--active auto-suggest-ghost-chip"
                onClick={() => setEditingNew(true)}
                title="Tap to rename"
              >
                {newCatTitle}
              </button>
            )}
            {!editingNew && (
              <button
                type="button"
                className="auto-suggest-ghost-dismiss"
                onClick={() => { setNewCatTitle(null); setEditingNew(false); }}
                aria-label="Dismiss new category"
              >
                ✕
              </button>
            )}
            <span className="auto-suggest-hint">
              {editingNew ? 'Enter to confirm · Esc to dismiss' : 'New · tap to rename'}
            </span>
          </div>
        )}

        <div className="confirm-delete__footer">
          <button type="button" className="btn-primary" onClick={onClose}>Cancel</button>
          <button type="button" className="btn-primary" disabled={!canMove} onClick={handleMove}>
            Move
          </button>
        </div>
      </div>
    </div>
  );
}
