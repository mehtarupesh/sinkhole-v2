import { useState, useRef, useEffect, useCallback } from 'react';
import { SnippetTypeIcon, LockTypeIcon, ImageTypeIcon, CopyIcon, CheckIcon } from './Icons';
import { addUnit } from '../utils/db';
import NoteField from './NoteField';
import CategoryField from './CategoryField';
import ImageLightbox from './ImageLightbox';

const TYPE_CONFIG = [
  { type: 'snippet', Icon: SnippetTypeIcon },
  { type: 'password', Icon: LockTypeIcon },
  { type: 'image', Icon: ImageTypeIcon },
];

export default function AddUnitModal({
  onClose,
  onSaved,
  storedGroups = [],
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
  const [categoryId, setCategoryId] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showLightbox, setShowLightbox] = useState(false);
  const [saveState, setSaveState] = useState(''); // '' | 'saving' | 'done'
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [pendingType, setPendingType] = useState(null);
  const [keyboardOffset, setKeyboardOffset] = useState(0);
  const fileRef = useRef(null);
  const copyTimerRef = useRef(null);
  const textareaRef = useRef(null);
  const saving = saveState !== '';

  const resizeTextarea = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, []);

  useEffect(() => { resizeTextarea(); }, [content, resizeTextarea]);

  // Close on Escape (desktop)
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Push the modal above the virtual keyboard on iOS
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      setKeyboardOffset(Math.max(0, window.innerHeight - vv.height - vv.offsetTop));
    };
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, []);

  const handleTypeChange = (t) => {
    if (t === type) return;
    const hasContent = type === 'image' ? !!content : !!content.trim();
    if (hasContent) {
      setPendingType(t);
      return;
    }
    setType(t);
    setError('');
  };

  const confirmTypeSwitch = () => {
    setType(pendingType);
    setContent('');
    setFileName('');
    setMimeType('');
    setError('');
    setPendingType(null);
  };

  const cancelTypeSwitch = () => setPendingType(null);

  const handleCopy = async () => {
    if (!content) return;
    try {
      await navigator.clipboard.writeText(content);
      clearTimeout(copyTimerRef.current);
      setCopied(true);
      copyTimerRef.current = setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable
    }
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

  const performSave = async (quoteText) => {
    const hasContent = type === 'image' ? !!content : !!content.trim();
    if (!hasContent) {
      setError(type === 'image' ? 'Please select a file' : 'Content is required');
      return;
    }
    setSaveState('saving');
    try {
      const unit = { type, content };
      if (fileName) unit.fileName = fileName;
      if (mimeType) unit.mimeType = mimeType;
      if (quoteText?.trim()) unit.quote = quoteText.trim();
      const { uid } = await addUnit(unit);
      navigator.vibrate?.(40);
      setSaveState('done');
      onSaved?.(uid, categoryId || null);
      setTimeout(onClose, 500);
    } catch {
      setError('Failed to save. Please try again.');
      setSaveState('');
    }
  };

  const handleSave = () => performSave(quote);
  const handleTranscriptionDone = (transcript) => performSave(transcript);

  return (
    <div
      className="overlay"
      style={keyboardOffset > 0 ? { paddingBottom: keyboardOffset + 24 } : undefined}
      onClick={onClose}
    >
      <div className="modal add-unit-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal__header">
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
        </div>

        {pendingType && (
          <div className="add-unit__type-confirm">
            <span>Switch type? Content will be lost.</span>
            <div className="add-unit__type-confirm-actions">
              <button type="button" className="add-unit__type-confirm-yes" onClick={confirmTypeSwitch}>Switch</button>
              <button type="button" className="add-unit__type-confirm-no" onClick={cancelTypeSwitch}>Cancel</button>
            </div>
          </div>
        )}

        <div className="add-unit__body">
          {type === 'snippet' && (
            <div className="add-unit__content-wrap">
              <textarea
                ref={textareaRef}
                className="add-unit__textarea"
                placeholder="Enter text…"
                value={content}
                onChange={(e) => { setContent(e.target.value); setError(''); }}
                autoFocus
              />
              {content && (
                <button
                  type="button"
                  className={`add-unit__copy-btn${copied ? ' add-unit__copy-btn--copied' : ''}`}
                  onClick={handleCopy}
                  aria-label="Copy to clipboard"
                >
                  {copied ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
                </button>
              )}
            </div>
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
              <div className="add-unit__password-btns">
                {content && (
                  <button
                    type="button"
                    className={`add-unit__copy-btn${copied ? ' add-unit__copy-btn--copied' : ''}`}
                    onClick={handleCopy}
                    aria-label="Copy to clipboard"
                  >
                    {copied ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
                  </button>
                )}
                <button
                  type="button"
                  className="add-unit__password-toggle"
                  onClick={() => setShowPassword((v) => !v)}
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
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

        <NoteField value={quote} onChange={setQuote} disabled={saving} onTranscriptionDone={handleTranscriptionDone} />

        <CategoryField groups={storedGroups} value={categoryId} onChange={setCategoryId} disabled={saving} />

        <div className="add-unit__actions">
          <button type="button" className="add-unit__cancel-btn" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button
            type="button"
            className={`connect-btn add-unit__save-btn${saveState === 'done' ? ' add-unit__save-btn--done' : ''}`}
            onClick={handleSave}
            disabled={saving}
          >
            {saveState === 'done' ? 'Saved ✓' : saving ? '…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
