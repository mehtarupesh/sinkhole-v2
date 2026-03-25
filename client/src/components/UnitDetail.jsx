import { useState, useRef, useEffect, useCallback } from 'react';
import { SnippetTypeIcon, LockTypeIcon, ImageTypeIcon, TrashIcon, CopyIcon, CheckIcon } from './Icons';
import { updateUnit } from '../utils/db';
import NoteField from './NoteField';
import CategoryField from './CategoryField';
import ImageLightbox from './ImageLightbox';

const TYPE_ICONS = {
  snippet: SnippetTypeIcon,
  password: LockTypeIcon,
  image: ImageTypeIcon,
};

export default function UnitDetail({ unit, onBack, onSaved, onDelete, storedGroups = [] }) {
  const [content, setContent] = useState(unit.content);
  const [fileName, setFileName] = useState(unit.fileName || '');
  const [mimeType, setMimeType] = useState(unit.mimeType || '');
  const [quote, setQuote] = useState(unit.quote || '');
  const [showPassword, setShowPassword] = useState(false);
  const [showLightbox, setShowLightbox] = useState(false);
  const [saveState, setSaveState] = useState(''); // '' | 'saving' | 'done'
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const textareaRef = useRef(null);
  const saving = saveState !== '';
  const initialCategoryId = useRef(
    storedGroups?.find((g) => g.uids?.includes(unit.uid))?.id ?? ''
  ).current;
  const [categoryId, setCategoryId] = useState(initialCategoryId);
  const copyTimerRef = useRef(null);

  // Close on Escape (desktop)
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onBack(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onBack]);

  const resizeTextarea = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, []);

  useEffect(() => { resizeTextarea(); }, [content, resizeTextarea]);

  const isDirty =
    content !== unit.content ||
    quote !== (unit.quote || '') ||
    fileName !== (unit.fileName || '') ||
    categoryId !== initialCategoryId;

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

  const performSave = async (quoteText) => {
    setSaveState('saving');
    try {
      const changes = { content, fileName, mimeType };
      if (quoteText?.trim()) {
        changes.quote = quoteText.trim();
      } else {
        changes.quote = undefined;
      }
      const updated = await updateUnit(unit.id, changes);
      navigator.vibrate?.(40);
      setSaveState('done');
      setTimeout(() => onSaved(updated, categoryId || null), 500);
    } catch {
      setError('Failed to save.');
      setSaveState('');
    }
  };

  const handleSave = () => performSave(quote);
  const handleTranscriptionDone = (transcript) => performSave(transcript);

  const handleDelete = async () => {
    if (!confirmDelete) { setConfirmDelete(true); return; }
    await onDelete(unit.id);
  };

  const TypeIcon = TYPE_ICONS[unit.type];

  return (
    <div className="unit-detail-modal">
      <div className="modal__header">
        <div className="add-unit__type-row">
          <span className="add-unit__type-icon add-unit__type-icon--active">
            {TypeIcon && <TypeIcon />}
          </span>
        </div>
        <div className="modal__header-actions">
          <button
            type="button"
            className={`unit-detail__delete${confirmDelete ? ' unit-detail__delete--confirm' : ''}`}
            onClick={handleDelete}
            onBlur={() => setConfirmDelete(false)}
            aria-label="Delete unit"
          >
            {confirmDelete ? 'Confirm?' : <TrashIcon />}
          </button>
          {unit.type === 'image' && content && (
            <a
              href={content}
              download={fileName || 'file'}
              className="unit-detail__download"
              aria-label="Download file"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
            </a>
          )}
        </div>
      </div>

      <div className="add-unit__body">
        {unit.type === 'snippet' && (
          <div className="add-unit__content-wrap">
            <textarea
              ref={textareaRef}
              className={`add-unit__textarea${content ? ' add-unit__textarea--has-value' : ''}`}
              value={content}
              onChange={(e) => { setContent(e.target.value); setError(''); }}
            />
            <button
              type="button"
              className={`add-unit__copy-btn${copied ? ' add-unit__copy-btn--copied' : ''}`}
              onClick={handleCopy}
              aria-label="Copy to clipboard"
            >
              {copied ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
            </button>
          </div>
        )}

        {unit.type === 'password' && (
          <div className="add-unit__password-wrap">
            <input
              type={showPassword ? 'text' : 'password'}
              className="add-unit__password-input"
              value={content}
              onChange={(e) => { setContent(e.target.value); setError(''); }}
            />
            <div className="add-unit__password-btns">
              <button
                type="button"
                className={`add-unit__copy-btn${copied ? ' add-unit__copy-btn--copied' : ''}`}
                onClick={handleCopy}
                aria-label="Copy to clipboard"
              >
                {copied ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
              </button>
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
        <button type="button" className="add-unit__cancel-btn" onClick={onBack} disabled={saving}>
          Cancel
        </button>
        <button
          type="button"
          className={`connect-btn add-unit__save-btn${saveState === 'done' ? ' add-unit__save-btn--done' : ''}`}
          onClick={handleSave}
          disabled={saving || !isDirty}
        >
          {saveState === 'done' ? 'Saved ✓' : saving ? '…' : 'Save'}
        </button>
      </div>

      <p className="unit-detail__meta">
        Created {new Date(unit.createdAt).toLocaleString()}
        {unit.updatedAt && ` · Edited ${new Date(unit.updatedAt).toLocaleString()}`}
      </p>
    </div>
  );
}
