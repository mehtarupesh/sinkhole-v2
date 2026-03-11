import { useState, useRef } from 'react';
import { CloseIcon, MicIcon } from './Icons';
import { addUnit } from '../utils/db';

const UNIT_TYPES = ['snippet', 'password', 'image'];

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
  const [recording, setRecording] = useState(false);
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

  // Stub: simulates voice recording → transcript
  const handleVoiceToggle = () => {
    if (recording) {
      setRecording(false);
      setQuote((prev) => prev || '[Voice transcript placeholder]');
    } else {
      setRecording(true);
    }
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

  const isPrepopulated = !!initialContent;

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
              {/* Show file picker unless content is already populated from paste/drop */}
              {!isPrepopulated && (
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*,*"
                  className="add-unit__file-input"
                  onChange={handleFileChange}
                />
              )}
              {content && mimeType?.startsWith('image/') && (
                <img src={content} alt={fileName} className="add-unit__preview" />
              )}
              {content && !mimeType?.startsWith('image/') && (
                <p className="add-unit__file-name">{fileName}</p>
              )}
              {isPrepopulated && (
                <button
                  type="button"
                  className="add-unit__type-btn"
                  onClick={() => { fileRef.current?.click(); }}
                >
                  Choose different file
                </button>
              )}
              {/* Hidden file input for replacing pre-populated file */}
              {isPrepopulated && (
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*,*"
                  style={{ display: 'none' }}
                  onChange={handleFileChange}
                />
              )}
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
