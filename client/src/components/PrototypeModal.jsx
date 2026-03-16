/**
 * PrototypeModal — add a unit with optional voice/text note
 *
 * Props:
 *   onClose()   close the modal
 *   onSaved()   optional callback after save
 */
import { useState, useRef } from 'react';
import { CloseIcon } from './Icons';
import { addUnit } from '../utils/db';
import NoteField from './NoteField';

const UNIT_TYPES = ['snippet', 'password', 'image'];

export default function PrototypeModal({ onClose, onSaved }) {
  const [type, setType] = useState('snippet');
  const [content, setContent] = useState('');
  const [fileName, setFileName] = useState('');
  const [mimeType, setMimeType] = useState('');
  const [quote, setQuote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef(null);

  function handleTypeChange(t) {
    setType(t);
    setContent('');
    setFileName('');
    setMimeType('');
    setError('');
  }

  function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setMimeType(file.type);
    const reader = new FileReader();
    reader.onload = ({ target: { result } }) => setContent(result);
    reader.readAsDataURL(file);
  }

  async function handleSave() {
    const hasContent = type === 'image' ? !!content : !!content.trim();
    if (!hasContent) {
      setError(type === 'image' ? 'Please select a file.' : 'Content is required.');
      return;
    }
    setSaving(true);
    try {
      await addUnit({ type, content, fileName, mimeType, ...(quote.trim() ? { quote: quote.trim() } : {}) });
      onSaved?.();
      onClose();
    } catch {
      setError('Failed to save. Please try again.');
      setSaving(false);
    }
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal add-unit-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal__header">
          <span className="modal__title">Add</span>
          <button type="button" className="btn-close" onClick={onClose} aria-label="Close">
            <CloseIcon />
          </button>
        </div>

        <div className="add-unit__type-row">
          {UNIT_TYPES.map((t) => (
            <button
              key={t}
              type="button"
              className={`add-unit__type-btn${type === t ? ' add-unit__type-btn--active' : ''}`}
              onClick={() => handleTypeChange(t)}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="add-unit__body">
          {type === 'snippet' && (
            <textarea
              className="add-unit__textarea"
              placeholder="Enter text…"
              value={content}
              onChange={(e) => { setContent(e.target.value); setError(''); }}
              rows={4}
              autoFocus
            />
          )}
          {type === 'password' && (
            <input
              type="password"
              className="connect-input"
              placeholder="Enter password…"
              value={content}
              onChange={(e) => { setContent(e.target.value); setError(''); }}
              autoFocus
            />
          )}
          {type === 'image' && (
            <div className="add-unit__file-area">
              <input
                ref={fileRef}
                type="file"
                accept="image/*,*"
                className="add-unit__file-input"
                onChange={handleFileChange}
              />
              {content && mimeType?.startsWith('image/') && (
                <img src={content} alt={fileName} className="add-unit__preview" />
              )}
              {content && !mimeType?.startsWith('image/') && (
                <p className="add-unit__file-name">{fileName}</p>
              )}
            </div>
          )}
        </div>

        <NoteField value={quote} onChange={setQuote} disabled={saving} />

        {error && <p className="modal__error">{error}</p>}

        <button
          type="button"
          className="connect-btn add-unit__save-btn"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? '…' : 'Save'}
        </button>
      </div>
    </div>
  );
}
