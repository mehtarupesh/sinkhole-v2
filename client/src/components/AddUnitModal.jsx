import { useState, useRef, useEffect, useCallback } from 'react';
import { SnippetTypeIcon, LockTypeIcon, ImageTypeIcon } from './Icons';
import { addUnit } from '../utils/db';
import { useSuggest } from '../hooks/useSuggest';
import ContentField from './ContentField';
import NoteField from './NoteField';
import CategorySelector from './CategorySelector';
import { transcribeAndSuggest } from '../utils/transcribeAndSuggest';

const TYPE_CONFIG = [
  { type: 'snippet',  Icon: SnippetTypeIcon },
  { type: 'password', Icon: LockTypeIcon },
  { type: 'image',    Icon: ImageTypeIcon },
];

export default function AddUnitModal({
  onClose,
  onSaved,
  storedGroups = [],
  initialType     = 'snippet',
  initialContent  = '',
  initialFileName = '',
  initialMimeType = '',
}) {
  // ── Content ──────────────────────────────────────────────────────────────
  const [type,     setType]     = useState(initialType);
  const [content,  setContent]  = useState(initialContent);
  const [fileName, setFileName] = useState(initialFileName);
  const [mimeType, setMimeType] = useState(initialMimeType);

  // ── Note ─────────────────────────────────────────────────────────────────
  const [quote, setQuote] = useState('');

  // ── Category ─────────────────────────────────────────────────────────────
  const [categoryId, setCategoryId] = useState('');

  // ── Save ─────────────────────────────────────────────────────────────────
  const [saveState, setSaveState] = useState(''); // '' | 'saving' | 'done'
  const [error,     setError]     = useState('');

  // ── Type-switch confirmation ──────────────────────────────────────────────
  const [pendingType, setPendingType] = useState(null);

  // ── iOS keyboard push-up ─────────────────────────────────────────────────
  const [keyboardOffset, setKeyboardOffset] = useState(0);

  // ── AI suggest ───────────────────────────────────────────────────────────
  const suggest = useSuggest();

  // ── Derived ──────────────────────────────────────────────────────────────
  const saving      = saveState !== '';
  const hasContent  = type === 'image' ? !!content : !!content.trim();
  const hasNote     = !!quote.trim();
  const canAutoSuggest =
    !saving && (hasContent || hasNote) && suggest.suggestState !== 'loading';

  // ── Effects ──────────────────────────────────────────────────────────────

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () =>
      setKeyboardOffset(Math.max(0, window.innerHeight - vv.height - vv.offsetTop));
    vv.addEventListener('resize',  update);
    vv.addEventListener('scroll',  update);
    return () => {
      vv.removeEventListener('resize',  update);
      vv.removeEventListener('scroll',  update);
    };
  }, []);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // ── Swipe-right to close ─────────────────────────────────────────────────
  const swipeStart = useRef(null);
  const handleTouchStart = (e) => {
    swipeStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };
  const handleTouchEnd = (e) => {
    if (!swipeStart.current) return;
    const dx =  e.changedTouches[0].clientX - swipeStart.current.x;
    const dy = Math.abs(e.changedTouches[0].clientY - swipeStart.current.y);
    swipeStart.current = null;
    if (dx > 80 && dx > dy * 1.5) onClose();
  };

  // ── Type switch ───────────────────────────────────────────────────────────
  const handleTypeChange = (t) => {
    if (t === type) return;
    if (hasContent) { setPendingType(t); return; }
    setType(t);
    setError('');
    suggest.reset();
  };

  const confirmTypeSwitch = () => {
    setType(pendingType);
    setContent('');
    setFileName('');
    setMimeType('');
    setError('');
    setPendingType(null);
    suggest.reset();
  };

  // ── AI suggest helpers ────────────────────────────────────────────────────

  // Called when user taps "✦ suggest category"
  const handleSuggest = async () => {
    const result = await suggest.runSuggest({
      content, mimeType, note: quote, type, existingCategories: storedGroups,
    });
    if (result?.type === 'existing') {
      setCategoryId(result.categoryId);
    } else if (result?.type === 'new' || result?.type === 'none') {
      setCategoryId('');
    }
    // null (error) — preserve current selection
  };

  // Replaces the two-step transcribe→runSuggest with a single LLM call.
  // NoteField calls this instead of the default transcribeAudio.
  const transcribeFn = useCallback(async (blob, apiKey) => {
    const result = await transcribeAndSuggest(blob, apiKey, {
      type,
      existingCategories: storedGroups,
      content: suggest.shareContent && type !== 'password' ? content : null,
      mimeType: suggest.shareContent && type === 'image' ? mimeType : null,
    });
    const applied = suggest.applyResult(result);
    if (applied.type === 'existing') setCategoryId(applied.categoryId);
    else setCategoryId('');
    return result.transcript;
  }, [type, storedGroups, suggest]);

  // ── Save ─────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!hasContent && !quote.trim()) {
      setError('Add content or a note');
      return;
    }
    setSaveState('saving');
    try {
      const unit = { type, content };
      if (fileName)    unit.fileName = fileName;
      if (mimeType)    unit.mimeType = mimeType;
      if (quote.trim()) unit.quote   = quote.trim();

      const { uid } = await addUnit(unit);
      navigator.vibrate?.(40);
      setSaveState('done');

      const resolvedCategoryId = suggest.newCategory
        ? suggest.newCategory.id
        : (categoryId || null);
      onSaved?.(uid, resolvedCategoryId, suggest.newCategory);
      setTimeout(onClose, 500);
    } catch {
      setError('Failed to save. Please try again.');
      setSaveState('');
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div
      className="overlay"
      style={keyboardOffset > 0 ? { paddingBottom: keyboardOffset + 24 } : undefined}
      onClick={onClose}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <div className="modal add-unit-modal" onClick={(e) => e.stopPropagation()}>

        {/* Type picker */}
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

        {/* Type-switch confirmation banner */}
        {pendingType && (
          <div className="add-unit__type-confirm">
            <span>Switch type? Content will be lost.</span>
            <div className="add-unit__type-confirm-actions">
              <button type="button" className="add-unit__type-confirm-yes" onClick={confirmTypeSwitch}>
                Switch
              </button>
              <button type="button" className="add-unit__type-confirm-no" onClick={() => setPendingType(null)}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Content input */}
        <div className="add-unit__body">
          <ContentField
            type={type}
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

        {/* Share toggle — outside the scrollable body so it's always visible */}
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
              {type === 'password' && suggest.shareContent
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

        {/* Actions */}
        <div className="add-unit__actions">
          <button
            type="button"
            className="add-unit__cancel-btn"
            onClick={onClose}
            disabled={saving}
          >
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
