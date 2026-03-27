import { useState } from 'react';
import { CloseIcon } from './Icons';
import CategoryField from './CategoryField';

/**
 * Confirmation modal for bulk "Move to Category".
 *
 * Props:
 *   count   number          number of items being moved
 *   groups  {id,title}[]    available (persisted) categories
 *   onMove  (categoryId) => void
 *   onClose () => void
 */
export default function MoveToCategoryModal({ count, groups, onMove, onClose }) {
  const [targetId, setTargetId] = useState('');

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
        <CategoryField groups={groups} value={targetId} onChange={setTargetId} />
        <div className="confirm-delete__footer">
          <button type="button" className="btn-primary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={!targetId}
            onClick={() => onMove(targetId)}
          >
            Move
          </button>
        </div>
      </div>
    </div>
  );
}
