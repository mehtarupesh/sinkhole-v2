import { useState, useRef } from 'react';
import { CloseIcon, SnippetTypeIcon, LockTypeIcon, ImageTypeIcon } from './Icons';
import { addUnit } from '../utils/db';
import NoteField from './NoteField';
import ImageLightbox from './ImageLightbox';

const TYPE_CONFIG = [
  { type: 'snippet', Icon: SnippetTypeIcon },
  { type: 'password', Icon: LockTypeIcon },
  { type: 'image', Icon: ImageTypeIcon },
];

export default function AddUnitModal({
  onClose,
  onSaved,
  initialType = 'snippet',
  initialContent = '',
  initialFileName = '',
  initialMimeType = '',
}) {
  const [type, setType] = useState(initialType);
  const [content, setContent] = useState(initialContent);
  const [fileName, setFileName] = useState(initialFileName);
  const [mimeType, setMimeType] = useState(initialMimeType);
  const [quote, setQuote] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showLightbox, setShowLightbox] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef(null);

  const handleTypeChange = (t) => {
    setType(t);
    setContent('');
    setFileName('');
    setMimeType('');
    setError('');
  };

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
    const hasContent = type === 'image' ? !!content : !!content.trim();
    if (!hasContent) {
      setError(type === 'image' ? 'Please select a file' : 'Content is required');
      return;
    }
    setSaving(true);
    try {
      const unit = { type, content };
      if (fileName) unit.fileName = fileName;
      if (mimeType) unit.mimeType = mimeType;
      if (quote.trim()) unit.quote = quote.trim();
      await addUnit(unit);
      onSaved?.();
      onClose();
    } catch {
      setError('Failed to save. Please try again.');
      setSaving(false);
    }
  };

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
          {TYPE_CONFIG.map(({ type: t, Icon }) => (
            <button
              key={t}
              type="button"
              className={`add-unit__type-icon${type === t ? ' add-unit__type-icon--active' : ''}`}
              onClick={() => handleTypeChange(t)}
              aria-label={t}
              title={t}
            >
              <Icon />
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
              autoFocus
            />
          )}

          {type === 'password' && (
            <div className="add-unit__password-wrap">
              <input
                type={showPassword ? 'text' : 'password'}
                className="add-unit__password-input"
                placeholder="Enter password…"
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

          {type === 'image' && (
            <div className="add-unit__file-area">
              {!content && (
                <button
                  type="button"
                  className="add-unit__drop-zone"
                  onClick={() => fileRef.current?.click()}
                >
                  <ImageTypeIcon />
                  <span>Choose a file</span>
                </button>
              )}
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
              {content && (
                <button
                  type="button"
                  className="add-unit__change-file"
                  onClick={() => fileRef.current?.click()}
                >
                  Choose Different File
                </button>
              )}
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
