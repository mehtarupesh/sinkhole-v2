import { useState, useRef } from 'react';
import { updateUnit } from '../utils/db';

const TYPE_LABELS = { snippet: 'text', password: 'pw', image: 'img' };

export default function UnitDetail({ unit, onBack, onSaved, onDelete }) {
  const [content, setContent] = useState(unit.content);
  const [fileName, setFileName] = useState(unit.fileName || '');
  const [mimeType, setMimeType] = useState(unit.mimeType || '');
  const [quote, setQuote] = useState(unit.quote || '');
  const [showPassword, setShowPassword] = useState(false);
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

  return (
    <div className="unit-detail">
      <div className="unit-detail__nav">
        <button type="button" className="unit-detail__back" onClick={onBack} aria-label="Back">
          ← Back
        </button>
        <span className="unit-card__type">{TYPE_LABELS[unit.type] ?? unit.type}</span>
      </div>

      <div className="unit-detail__fields">
        {unit.type === 'snippet' && (
          <div className="unit-detail__field">
            <label className="unit-detail__label">Content</label>
            <textarea
              className="add-unit__textarea"
              value={content}
              onChange={(e) => { setContent(e.target.value); setError(''); }}
              rows={6}
              autoFocus
            />
          </div>
        )}

        {unit.type === 'password' && (
          <div className="unit-detail__field">
            <label className="unit-detail__label">
              Password
              <button
                type="button"
                className="unit-detail__toggle"
                onClick={() => setShowPassword((v) => !v)}
              >
                {showPassword ? 'hide' : 'show'}
              </button>
            </label>
            <input
              type={showPassword ? 'text' : 'password'}
              className="connect-input"
              value={content}
              onChange={(e) => { setContent(e.target.value); setError(''); }}
              autoFocus
            />
          </div>
        )}

        {unit.type === 'image' && (
          <div className="unit-detail__field">
            <label className="unit-detail__label">
              File
              <button type="button" className="unit-detail__toggle" onClick={() => fileRef.current?.click()}>
                replace
              </button>
            </label>
            <input ref={fileRef} type="file" accept="image/*,*" style={{ display: 'none' }} onChange={handleFileChange} />
            {content && mimeType?.startsWith('image/') && (
              <img src={content} alt={fileName} className="add-unit__preview" />
            )}
            {content && !mimeType?.startsWith('image/') && (
              <p className="unit-detail__filename">{fileName}</p>
            )}
          </div>
        )}

        <div className="unit-detail__field">
          <label className="unit-detail__label">Voice note</label>
          <textarea
            className="add-unit__textarea unit-detail__quote-input"
            placeholder="No voice note"
            value={quote}
            onChange={(e) => { setQuote(e.target.value); setError(''); }}
            rows={2}
          />
        </div>
      </div>

      {error && <p className="modal__error">{error}</p>}

      <div className="unit-detail__footer">
        <button
          type="button"
          className={`unit-detail__delete${confirmDelete ? ' unit-detail__delete--confirm' : ''}`}
          onClick={handleDelete}
          onBlur={() => setConfirmDelete(false)}
          aria-label="Delete unit"
        >
          {confirmDelete ? 'Confirm delete' : 'Delete'}
        </button>

        {isDirty && (
          <button
            type="button"
            className="connect-btn"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? '…' : 'Save'}
          </button>
        )}
      </div>

      <p className="unit-detail__meta">
        Created {new Date(unit.createdAt).toLocaleString()}
        {unit.updatedAt && ` · Edited ${new Date(unit.updatedAt).toLocaleString()}`}
      </p>
    </div>
  );
}
