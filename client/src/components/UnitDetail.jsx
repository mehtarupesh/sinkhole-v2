import { useState, useRef, useEffect, useCallback } from 'react';
import { SnippetTypeIcon, LockTypeIcon, ImageTypeIcon, TrashIcon } from './Icons';
import { updateUnit } from '../utils/db';
import { useSuggest } from '../hooks/useSuggest';
import ContentField from './ContentField';
import NoteField from './NoteField';
import CategorySelector from './CategorySelector';
import { transcribeAndSuggest } from '../utils/transcribeAndSuggest';

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
  const [saveState, setSaveState] = useState(''); // '' | 'saving' | 'done'
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState('');
  const swipeStart = useRef(null);
  const saving = saveState !== '';
  const initialCategoryId = useRef(
    storedGroups?.find((g) => g.uids?.includes(unit.uid))?.id ?? ''
  ).current;
  const [categoryId, setCategoryId] = useState(initialCategoryId);

  // ── AI suggest ───────────────────────────────────────────────────────────────
  const suggest = useSuggest();

  // ── Derived ──────────────────────────────────────────────────────────────────
  const hasContent = unit.type === 'image' ? !!content : !!content.trim();
  const hasNote = !!quote.trim();
  const canAutoSuggest =
    !saving && (hasContent || hasNote) && suggest.suggestState !== 'loading';

  // Close on Escape (desktop)
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onBack(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onBack]);

  const isDirty =
    content !== unit.content ||
    quote !== (unit.quote || '') ||
    fileName !== (unit.fileName || '') ||
    categoryId !== initialCategoryId ||
    !!suggest.newCategory;

  // ── AI suggest helpers ────────────────────────────────────────────────────────

  const handleSuggest = async () => {
    const result = await suggest.runSuggest({
      content, mimeType, note: quote, type: unit.type, existingCategories: storedGroups,
    });
    if (result?.type === 'existing') setCategoryId(result.categoryId);
    else if (result?.type === 'new' || result?.type === 'none') setCategoryId('');
  };

  const transcribeFn = useCallback(async (blob, apiKey) => {
    const result = await transcribeAndSuggest(blob, apiKey, {
      type: unit.type,
      existingCategories: storedGroups,
      content: suggest.shareContent && unit.type !== 'password' ? content : null,
      mimeType: suggest.shareContent && unit.type === 'image' ? mimeType : null,
    });
    const applied = suggest.applyResult(result);
    if (applied.type === 'existing') setCategoryId(applied.categoryId);
    else setCategoryId('');
    return result.transcript;
  }, [unit.type, storedGroups, suggest, content, mimeType]);

  // ── Save ──────────────────────────────────────────────────────────────────────
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
      const resolvedCategoryId = suggest.newCategory
        ? suggest.newCategory.id
        : (categoryId || null);
      setTimeout(() => onSaved(updated, resolvedCategoryId, suggest.newCategory), 500);
    } catch {
      setError('Failed to save.');
      setSaveState('');
    }
  };

  const handleSave = () => performSave(quote);

  const handleDelete = async () => {
    if (!confirmDelete) { setConfirmDelete(true); return; }
    await onDelete(unit.id);
  };

  const TypeIcon = TYPE_ICONS[unit.type];

  const handleTouchStart = (e) => {
    swipeStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };

  const handleTouchEnd = (e) => {
    if (!swipeStart.current) return;
    const dx = e.changedTouches[0].clientX - swipeStart.current.x;
    const dy = Math.abs(e.changedTouches[0].clientY - swipeStart.current.y);
    swipeStart.current = null;
    if (dx > 80 && dx > dy * 1.5) onBack();
  };

  return (
    <div className="unit-detail-modal" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
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

      {/* Content input */}
      <div className="add-unit__body">
        <ContentField
          type={unit.type}
          content={content}
          fileName={fileName}
          mimeType={mimeType}
          onTextChange={(text) => { setContent(text); setError(''); }}
          onFileSelected={({ content: c, fileName: fn, mimeType: mt }) => {
            setContent(c); setFileName(fn); setMimeType(mt); setError('');
          }}
          disabled={saving}
        />
      </div>

      {/* Share toggle */}
      {hasContent && (
        <button
          type="button"
          className={[
            'content-field__share-row',
            suggest.shareContent && 'content-field__share-row--on',
            suggest.suggestState === 'needs-selection' && 'content-field__share-row--blink',
          ].filter(Boolean).join(' ')}
          onClick={() => suggest.setShareContent((v) => !v)}
          disabled={saving}
        >
          <span className="content-field__share-sparkle">✦</span>
          <span className="content-field__share-label">
            {unit.type === 'password' && suggest.shareContent
              ? 'Sharing password with AI · sensitive'
              : suggest.shareContent ? 'Sharing with AI' : 'Share with AI'}
          </span>
        </button>
      )}

      {error && <p className="modal__error">{error}</p>}

      {/* Voice note + always-on AI indicator */}
      <div className="share-sparkle-wrap">
        <NoteField
          value={quote}
          onChange={setQuote}
          disabled={saving}
          transcribeFn={transcribeFn}
        />
        {hasNote && (
          <span
            className="share-sparkle share-sparkle--note share-sparkle--on"
            aria-label="Note always shared with AI"
            title="Note is always shared with AI"
          />
        )}
      </div>

      {/* Category chips + ghost chip + suggest trigger */}
      <CategorySelector
        groups={storedGroups}
        categoryId={categoryId}
        onCategoryChange={setCategoryId}
        suggest={suggest}
        onSuggest={handleSuggest}
        canSuggest={canAutoSuggest}
        disabled={saving}
      />

      <div className="add-unit__actions">
        <button
          type="button"
          className={`add-unit__cancel-btn${!isDirty ? ' add-unit__cancel-btn--primary' : ''}`}
          onClick={onBack}
          disabled={saving}
        >
          Cancel
        </button>
        <button
          type="button"
          className={`connect-btn add-unit__save-btn${!isDirty ? ' add-unit__save-btn--secondary' : ''}${saveState === 'done' ? ' add-unit__save-btn--done' : ''}`}
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
