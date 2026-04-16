import { useState, useRef, useEffect, useCallback } from 'react';
import { SnippetTypeIcon, LockTypeIcon, ImageTypeIcon, PasteIcon } from './Icons';
import { addUnit, touchUnit } from '../utils/db';
import { useSuggest } from '../hooks/useSuggest';
import { readClipboard, isIOS } from '../utils/readClipboard';
import ContentField from './ContentField';
import NoteTray from './NoteTray';
import CategorySelector from './CategorySelector';
import { transcribeAndSuggest } from '../utils/transcribeAndSuggest';
import { encryptContent } from '../utils/crypto';

const TYPE_CONFIG = [
  { type: 'image',   Icon: ImageTypeIcon },
  { type: 'snippet', Icon: SnippetTypeIcon },
];

export default function AddUnitModal({
  onClose,
  onSaved,
  storedGroups = [],
  accessOrder = [],
  initialType     = 'image',
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

  // ── Encryption ───────────────────────────────────────────────────────────
  const [encrypted, setEncrypted] = useState(false);

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
  const showPasteCta = isIOS() && !hasContent && !saving;

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

  const handleSuggest = async () => {
    const result = await suggest.runSuggest({
      content: !encrypted ? content : null,
      mimeType: !encrypted && type === 'image' ? mimeType : null,
      note: quote,
      type,
      existingCategories: storedGroups,
    });
    if (result?.type === 'existing') {
      setCategoryId(result.categoryId);
    } else if (result?.type === 'new' || result?.type === 'none') {
      setCategoryId('');
    }
  };

  const transcribeFn = useCallback(async (blob, apiKey) => {
    const result = await transcribeAndSuggest(blob, apiKey, {
      type,
      existingCategories: storedGroups,
      content: !encrypted ? content : null,
      mimeType:!encrypted && type === 'image' ? mimeType : null,
    });
    const applied = suggest.applyResult(result);
    if (applied.type === 'existing') setCategoryId(applied.categoryId);
    else setCategoryId('');
    return result.transcript;
  }, [type, storedGroups, suggest]);

  // ── Paste from clipboard (iOS) ────────────────────────────────────────────
  const handlePasteFromClipboard = useCallback(async () => {
    const clip = await readClipboard();
    if (!clip) return;
    if (clip.type === 'image') {
      setType('image');
      setContent(clip.content);
      setFileName(clip.fileName ?? '');
      setMimeType(clip.mimeType ?? '');
    } else {
      setType('snippet');
      setContent(clip.content);
    }
  }, []);

  // ── Save ─────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!hasContent && !quote.trim()) {
      setError('Add content or a note');
      return;
    }
    setSaveState('saving');
    try {
      const resolvedCategoryId = suggest.newCategory
        ? suggest.newCategory.id
        : (categoryId || null);
      let finalContent = content;
      if (encrypted && content) {
        finalContent = await encryptContent(content);
      }
      const unit = { type, content: finalContent, encrypted, categoryId: resolvedCategoryId };
      if (fileName)     unit.fileName = fileName;
      if (mimeType)     unit.mimeType = mimeType;
      if (quote.trim()) unit.quote    = quote.trim();

      const { uid } = await addUnit(unit);
      await touchUnit(uid);

      navigator.vibrate?.(40);
      setSaveState('done');

      onSaved?.(suggest.newCategory ?? null);
      setTimeout(onClose, 500);
    } catch {
      setError('Failed to save. Please try again.');
      setSaveState('');
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div
      className="overlay overlay--sheet"
      style={keyboardOffset > 0 ? { paddingBottom: keyboardOffset } : undefined}
      onClick={onClose}
    >
      <div
        className="add-unit-sheet"
        onClick={(e) => e.stopPropagation()}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {/* Drag handle (mobile only) */}
        <div className="sheet__handle" />

        {/* Type picker */}
        <div className="sheet__type-row">
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
          <button
            type="button"
            className={`add-unit__type-icon add-unit__encrypt-toggle${encrypted ? ' add-unit__type-icon--active add-unit__encrypt-toggle--on' : ''}`}
            onClick={() => setEncrypted((v) => !v)}
            aria-label="Toggle encryption"
            title="Encrypt"
          >
            <LockTypeIcon />
          </button>
        </div>

        {/* Type-switch confirmation banner */}
        {pendingType && (
          <div className="add-unit__type-confirm" style={{ margin: '8px 20px 0' }}>
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

        {/* iOS paste CTA — shown when sheet opens empty */}
        {showPasteCta && (
          <button
            type="button"
            className="sheet__paste-cta"
            onClick={handlePasteFromClipboard}
          >
            <PasteIcon size={18} />
            <span>Paste from clipboard</span>
          </button>
        )}

        {/* Content — scrollable */}
        <div className="sheet__content">
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

        {error && <p className="modal__error" style={{ margin: '6px 20px 0' }}>{error}</p>}

        {/* Note tray — mic hero on mobile, text-hero on desktop */}
        <NoteTray
          value={quote}
          onChange={setQuote}
          disabled={saving}
          transcribeFn={transcribeFn}
          shareContent={suggest.shareContent}
          onShareToggle={() => suggest.setShareContent((v) => !v)}
          hasContent={hasContent}
        />

        {/* Category chips — horizontal scroll */}
        {(content.trim() || quote.trim()) && <div className="sheet__categories">
          <CategorySelector
            groups={storedGroups}
            categoryId={categoryId}
            onCategoryChange={setCategoryId}
            suggest={suggest}
            onSuggest={handleSuggest}
            canSuggest={canAutoSuggest}
            disabled={saving}
            accessOrder={accessOrder}
          />
        </div>}

        {/* Actions */}
        <div className="sheet__actions">
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
