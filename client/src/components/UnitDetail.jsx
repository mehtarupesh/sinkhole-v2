import { useState, useRef } from 'react';
import { CloseIcon, MicIcon } from './Icons';
import { updateUnit } from '../utils/db';

const TYPE_LABELS = { snippet: 'snippet', password: 'password', image: 'image' };

export default function UnitDetail({ unit, onBack, onSaved, onDelete }) {
  const [content, setContent] = useState(unit.content);
  const [fileName, setFileName] = useState(unit.fileName || '');
  const [mimeType, setMimeType] = useState(unit.mimeType || '');
  const [quote, setQuote] = useState(unit.quote || '');
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState('');
  const [recording, setRecording] = useState(false);
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

  const handleVoiceToggle = () => {
    if (recording) {
      setRecording(false);
      setQuote((prev) => prev || '[Voice transcript placeholder]');
    } else {
      setRecording(true);
    }
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
    <div className="unit-detail-modal">
      <div className="modal__header">
        <span className="modal__title">Edit</span>
        <button type="button" className="btn-close" onClick={onBack} aria-label="Close">
          <CloseIcon />
        </button>
      </div>

      <div className="add-unit__type-row">
        <span className="add-unit__type-btn add-unit__type-btn--active">
          {TYPE_LABELS[unit.type] ?? unit.type}
        </span>
      </div>

      <div className="add-unit__body">
        {unit.type === 'snippet' && (
          <textarea
            className="add-unit__textarea"
            value={content}
            onChange={(e) => { setContent(e.target.value); setError(''); }}
            rows={4}
            autoFocus
          />
        )}

        {unit.type === 'password' && (
          <div className="add-unit__password-field">
            <input
              type={showPassword ? 'text' : 'password'}
              className="connect-input"
              value={content}
              onChange={(e) => { setContent(e.target.value); setError(''); }}
              autoFocus
            />
            <button
              type="button"
              className="add-unit__type-btn"
              onClick={() => setShowPassword((v) => !v)}
            >
              {showPassword ? 'hide' : 'show'}
            </button>
          </div>
        )}

        {unit.type === 'image' && (
          <div className="add-unit__file-area">
            {content && mimeType?.startsWith('image/') && (
              <img src={content} alt={fileName} className="add-unit__preview" />
            )}
            {content && !mimeType?.startsWith('image/') && (
              <p className="add-unit__file-name">{fileName}</p>
            )}
            <button
              type="button"
              className="add-unit__type-btn"
              onClick={() => fileRef.current?.click()}
            >
              Choose different file
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

      <div className="add-unit__voice">
        <button
          type="button"
          className={`add-unit__mic-btn${recording ? ' add-unit__mic-btn--active' : ''}`}
          onClick={handleVoiceToggle}
          aria-label={recording ? 'Stop recording' : 'Record voice note'}
          title={recording ? 'Stop recording' : 'Add voice note'}
        >
          <MicIcon active={recording} />
          {recording ? 'Recording…' : 'Voice note'}
        </button>
        {quote && (
          <p className="add-unit__quote">
            <span className="add-unit__quote-mark">"</span>
            {quote}
          </p>
        )}
      </div>

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
