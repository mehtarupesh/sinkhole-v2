import { useState, useRef } from 'react';
import { CloseIcon, SnippetTypeIcon, LockTypeIcon, ImageTypeIcon } from './Icons';
import { updateUnit } from '../utils/db';
import NoteField from './NoteField';
import ImageLightbox from './ImageLightbox';

const TYPE_ICONS = {
  snippet: SnippetTypeIcon,
  password: LockTypeIcon,
  image: ImageTypeIcon,
};

export default function UnitDetail({ unit, onBack, onSaved, onDelete }) {
  const [content, setContent] = useState(unit.content);
  const [fileName, setFileName] = useState(unit.fileName || '');
  const [mimeType, setMimeType] = useState(unit.mimeType || '');
  const [quote, setQuote] = useState(unit.quote || '');
  const [showPassword, setShowPassword] = useState(false);
  const [showLightbox, setShowLightbox] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef(null);

  const isDirty =
    content !== unit.content ||
    quote !== (unit.quote || '') ||
    fileName !== (unit.fileName || '');

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setMimeType(file.type);
    const reader = new FileReader();
    reader.onload = ({ target: { result } }) => setContent(result);
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const changes = { content, fileName, mimeType };
      if (quote.trim()) {
        changes.quote = quote.trim();
      } else {
        changes.quote = undefined;
      }
      const updated = await updateUnit(unit.id, changes);
      onSaved(updated);
    } catch {
      setError('Failed to save.');
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) { setConfirmDelete(true); return; }
    await onDelete(unit.id);
  };

  const TypeIcon = TYPE_ICONS[unit.type];

  return (
    <div className="unit-detail-modal">
      <div className="modal__header">
        <span className="modal__title">Edit</span>
        <button type="button" className="btn-close" onClick={onBack} aria-label="Close">
          <CloseIcon />
        </button>
      </div>

      <div className="add-unit__type-row">
        <span className="add-unit__type-icon add-unit__type-icon--active">
          {TypeIcon && <TypeIcon />}
        </span>
      </div>

      <div className="add-unit__body">
        {unit.type === 'snippet' && (
          <textarea
            className="add-unit__textarea"
            value={content}
            onChange={(e) => { setContent(e.target.value); setError(''); }}
            autoFocus
          />
        )}

        {unit.type === 'password' && (
          <div className="add-unit__password-wrap">
            <input
              type={showPassword ? 'text' : 'password'}
              className="add-unit__password-input"
              value={content}
              onChange={(e) => { setContent(e.target.value); setError(''); }}
              autoFocus
            />
            <button
              type="button"
              className="add-unit__password-toggle"
              onClick={() => setShowPassword((v) => !v)}
            >
              {showPassword ? 'Hide' : 'Show'}
            </button>
          </div>
        )}

        {unit.type === 'image' && (
          <div className="add-unit__file-area">
            {content && mimeType?.startsWith('image/') && (
              <button
                type="button"
                className="add-unit__preview-btn"
                onClick={() => setShowLightbox(true)}
                aria-label="View full image"
              >
                <img src={content} alt={fileName} className="add-unit__preview" />
              </button>
            )}
            {content && !mimeType?.startsWith('image/') && (
              <p className="add-unit__file-name">{fileName}</p>
            )}
            <button
              type="button"
              className="add-unit__change-file"
              onClick={() => fileRef.current?.click()}
            >
              Choose Different File
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*,*"
              style={{ display: 'none' }}
              onChange={handleFileChange}
            />
          </div>
        )}
      </div>

      {error && <p className="modal__error">{error}</p>}

      {showLightbox && content && mimeType?.startsWith('image/') && (
        <ImageLightbox src={content} alt={fileName} onClose={() => setShowLightbox(false)} />
      )}

      <NoteField value={quote} onChange={setQuote} disabled={saving} />

      <div className="unit-detail__actions">
        <button
          type="button"
          className={`unit-detail__delete${confirmDelete ? ' unit-detail__delete--confirm' : ''}`}
          onClick={handleDelete}
          onBlur={() => setConfirmDelete(false)}
          aria-label="Delete unit"
        >
          {confirmDelete ? 'Confirm delete' : 'Delete'}
        </button>

        <button
          type="button"
          className="connect-btn add-unit__save-btn"
          onClick={handleSave}
          disabled={saving || !isDirty}
        >
          {saving ? '…' : 'Save'}
        </button>
      </div>

      <p className="unit-detail__meta">
        Created {new Date(unit.createdAt).toLocaleString()}
        {unit.updatedAt && ` · Edited ${new Date(unit.updatedAt).toLocaleString()}`}
      </p>
    </div>
  );
}
