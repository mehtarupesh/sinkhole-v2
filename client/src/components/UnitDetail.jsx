import { useState, useRef, useEffect, useCallback } from 'react';
import { SnippetTypeIcon, LockTypeIcon, ImageTypeIcon, TrashIcon, ChevronLeftIcon, ChevronRightIcon } from './Icons';
import { updateUnit, touchUnit } from '../utils/db';
import { useSuggest } from '../hooks/useSuggest';
import ContentField from './ContentField';
import NoteTray from './NoteTray';
import CategorySelector from './CategorySelector';
import SimpleMarkdown from './SimpleMarkdown';
import UnitChat from './UnitChat';
import ImageLightbox from './ImageLightbox';
import { transcribeAndSuggest } from '../utils/transcribeAndSuggest';
import { encryptContent, decryptContent, isEncryptedContent } from '../utils/crypto';

const TYPE_ICONS = {
  snippet: SnippetTypeIcon,
  image: ImageTypeIcon,
};

export default function UnitDetail({
  unit, onBack, onSaved, onDelete,
  storedGroups = [], accessOrder = [],
  hasPrev = false, hasNext = false, onPrev, onNext,
  navIndex = 0, navTotal = 1,
}) {
  const [content,  setContent]  = useState(unit.content);
  const [fileName, setFileName] = useState(unit.fileName || '');
  const [mimeType, setMimeType] = useState(unit.mimeType || '');
  const [quote,    setQuote]    = useState(unit.quote || '');
  const [saveState, setSaveState] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [showLightbox, setShowLightbox] = useState(false);
  const [lightboxKey, setLightboxKey] = useState(0);
  const swipeStart = useRef(null);
  const saving = saveState !== '';
  const initialCategoryId = useRef(unit.categoryId ?? '').current;
  const [categoryId, setCategoryId] = useState(initialCategoryId);

  // ── Encryption ───────────────────────────────────────────────────────────────
  const [revealed, setRevealed] = useState(!(unit.encrypted ?? false));
  const isLocked = !revealed;

  // ── AI suggest ───────────────────────────────────────────────────────────────
  const suggest = useSuggest();

  // ── Derived ──────────────────────────────────────────────────────────────────
  const hasContent = unit.type === 'image' ? !!content : !isLocked && !!content.trim();
  const hasNote    = !!quote.trim();
  const contentOrNoteChanged = content !== unit.content || quote !== (unit.quote || '');
  const canAutoSuggest =
    !saving && !isLocked && (hasContent || hasNote) && suggest.suggestState !== 'loading' && (contentOrNoteChanged || !categoryId);

  const categoryName = storedGroups.find((g) => g.id === categoryId)?.title ?? '';

  // Record access — fire and forget
  useEffect(() => { if (unit.uid) touchUnit(unit.uid); }, [unit.uid]);

  const isDirty =
    content !== unit.content ||
    quote !== (unit.quote || '') ||
    fileName !== (unit.fileName || '') ||
    categoryId !== initialCategoryId ||
    isLocked !== (unit.encrypted ?? false) ||
    !!suggest.newCategory;

  // ── Swipe right — context-aware ───────────────────────────────────────────────
  const handleTouchStart = (e) => {
    swipeStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };

  const handleTouchEnd = (e) => {
    if (!swipeStart.current) return;
    const dx = e.changedTouches[0].clientX - swipeStart.current.x;
    const dy = Math.abs(e.changedTouches[0].clientY - swipeStart.current.y);
    swipeStart.current = null;
    if (dx > 80 && dx > dy * 1.5) {
      navigator.vibrate?.(10);
      if (isEditing) { setIsEditing(false); return; }
      if (chatOpen)  { setChatOpen(false);  return; }
      onBack();
    }
  };

  // ── Lock toggle ───────────────────────────────────────────────────────────────
  const handleEncryptToggle = async () => {
    if (isLocked) {
      if (isEncryptedContent(content)) {
        try {
          const plain = await decryptContent(content);
          setContent(plain);
        } catch {
          setError('Decryption failed — key unavailable on this device');
          return;
        }
      }
      setRevealed(true);
    } else {
      setRevealed(false);
    }
  };

  // ── AI suggest helpers ────────────────────────────────────────────────────────
  const handleSuggest = async () => {
    const result = await suggest.runSuggest({
      content: !isLocked ? content : null,
      mimeType: !isLocked && unit.type === 'image' ? mimeType : null,
      note: quote,
      type: unit.type,
      existingCategories: storedGroups,
    });
    if (result?.type === 'existing') setCategoryId(result.categoryId);
    else if (result?.type === 'new' || result?.type === 'none') setCategoryId('');
  };

  const transcribeFn = useCallback(async (blob, apiKey) => {
    const result = await transcribeAndSuggest(blob, apiKey, {
      type: unit.type,
      existingCategories: storedGroups,
      content: suggest.shareContent && !isLocked ? content : null,
      mimeType: suggest.shareContent && unit.type === 'image' ? mimeType : null,
    });
    const applied = suggest.applyResult(result);
    if (applied.type === 'existing') setCategoryId(applied.categoryId);
    else setCategoryId('');
    return result.transcript;
  }, [unit.type, storedGroups, suggest, content, mimeType, isLocked]);

  // ── Save ──────────────────────────────────────────────────────────────────────
  const performSave = async (quoteText) => {
    setSaveState('saving');
    try {
      const resolvedCategoryId = suggest.newCategory
        ? suggest.newCategory.id
        : (categoryId || null);

      let finalContent = content;
      if (isLocked && !isEncryptedContent(content)) {
        finalContent = await encryptContent(content);
      }

      const changes = { content: finalContent, encrypted: isLocked, fileName, mimeType, categoryId: resolvedCategoryId };
      if (quoteText?.trim()) {
        changes.quote = quoteText.trim();
      } else {
        changes.quote = undefined;
      }
      const updated = await updateUnit(unit.id, changes);
      navigator.vibrate?.(40);
      setSaveState('done');
      setTimeout(() => onSaved(updated, suggest.newCategory ?? null), 500);
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

  const TypeIcon = TYPE_ICONS[unit.type] ?? SnippetTypeIcon;

  return (
    <div className="unit-detail-modal unit-detail-modal--view" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>

      {/* ── View mode ── */}
      {chatOpen ? (
        <UnitChat unit={unit} onClose={() => setChatOpen(false)} />
      ) : (
        <>
          {/* Header: category pill + counter */}
          <div className="unit-view__header">
            <span className="unit-view__cat-pill">
              <TypeIcon />
              {categoryName && <span className="unit-view__cat-name">{categoryName}</span>}
            </span>
            {navTotal > 1 && (
              <span className="unit-view__counter">{navIndex + 1} / {navTotal}</span>
            )}
          </div>

          {/* Scrollable body */}
          <div className="unit-view__scroll-body">
            {isLocked ? (
              <button
                type="button"
                className="unit-detail__locked-body"
                onClick={handleEncryptToggle}
                aria-label="Click to reveal content"
              >
                <LockTypeIcon />
                <span>Click lock to reveal</span>
              </button>
            ) : unit.type === 'image' ? (
              content && (
                <>
                  <img
                    src={content}
                    alt={fileName || 'image'}
                    className="unit-view__image"
                    onClick={() => { setLightboxKey((k) => k + 1); setShowLightbox(true); }}
                  />
                  {showLightbox && (
                    <ImageLightbox
                      src={content}
                      alt={fileName || 'image'}
                      caption={quote}
                      onClose={() => setShowLightbox(false)}
                      replayKey={lightboxKey}
                      closeAtBottom
                    />
                  )}
                </>
              )
            ) : (
              content.trim() && (
                <SimpleMarkdown text={content} className="snippet__markdown unit-view__text" />
              )
            )}
          </div>

          {/* Bottom: quote + footer — pinned together */}
          <div className="unit-view__bottom">
            {quote && <p className="unit-view__quote">{quote}</p>}
            <div className="unit-view__footer">
              <button type="button" className="unit-view__edit-btn" onClick={() => setIsEditing(true)}>
                Edit
              </button>
              {navTotal > 1 && (
                <button type="button" className="btn-icon" onClick={onPrev} disabled={!hasPrev} aria-label="Previous">
                  <ChevronLeftIcon />
                </button>
              )}
              {navTotal > 1 && (
                <button type="button" className="btn-icon" onClick={onNext} disabled={!hasNext} aria-label="Next">
                  <ChevronRightIcon />
                </button>
              )}
              <button type="button" className="unit-view__chat-btn" onClick={() => setChatOpen(true)}>
                ✦ Chat
              </button>
            </div>
          </div>
        </>
      )}

      {/* ── Edit sheet — slides up over the view ── */}
      {isEditing && (
        <div className="overlay overlay--sheet unit-edit-overlay" onClick={() => setIsEditing(false)}>
          <div
            className="add-unit-sheet"
            onClick={(e) => e.stopPropagation()}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
          >
            <div className="sheet__handle" />

            {/* Header */}
            <div className="modal__header">
              <div className="add-unit__type-row">
                <span className="add-unit__type-icon add-unit__type-icon--active">
                  {TypeIcon && <TypeIcon />}
                </span>
              </div>
              <div className="modal__header-actions">
                <button
                  type="button"
                  className={`add-unit__type-icon add-unit__encrypt-toggle${isLocked ? ' add-unit__type-icon--active add-unit__encrypt-toggle--on' : ''}`}
                  onClick={handleEncryptToggle}
                  aria-label={isLocked ? 'Click to reveal' : 'Click to hide'}
                  title={isLocked ? 'Click to reveal' : 'Click to hide'}
                  disabled={saving}
                >
                  <LockTypeIcon />
                </button>
                <button
                  type="button"
                  className={`unit-detail__delete${confirmDelete ? ' unit-detail__delete--confirm' : ''}`}
                  onClick={handleDelete}
                  onBlur={() => setConfirmDelete(false)}
                  aria-label="Delete unit"
                >
                  {confirmDelete ? 'Confirm?' : <TrashIcon />}
                </button>
                {unit.type === 'image' && content && !isLocked && (
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

            {/* Content */}
            <div className="add-unit__body">
              {isLocked ? (
                <button
                  type="button"
                  className="unit-detail__locked-body"
                  onClick={handleEncryptToggle}
                  aria-label="Click to reveal content"
                >
                  <LockTypeIcon />
                  <span>Click lock to reveal</span>
                </button>
              ) : (
                <ContentField
                  type={unit.type === 'password' ? 'snippet' : unit.type}
                  content={content}
                  fileName={fileName}
                  mimeType={mimeType}
                  onTextChange={(text) => { setContent(text); setError(''); }}
                  onFileSelected={({ content: c, fileName: fn, mimeType: mt }) => {
                    setContent(c); setFileName(fn); setMimeType(mt); setError('');
                  }}
                  disabled={saving}
                  caption={quote}
                />
              )}
            </div>

            {error && <p className="modal__error">{error}</p>}

            {/* Note tray */}
            <NoteTray
              value={quote}
              onChange={setQuote}
              disabled={saving}
              transcribeFn={transcribeFn}
              shareContent={suggest.shareContent}
              onShareToggle={() => suggest.setShareContent((v) => !v)}
              hasContent={hasContent}
              actionBtn={
                <button
                  type="button"
                  className="note-tray__action-btn"
                  onClick={handleSuggest}
                  disabled={!canAutoSuggest}
                  aria-label="Suggest category"
                >
                  {suggest.suggestState === 'loading' ? '…' : '✦'}
                </button>
              }
            />

            {/* Category selector */}
            <div className="sheet__categories">
              <CategorySelector
                groups={storedGroups}
                categoryId={categoryId}
                onCategoryChange={setCategoryId}
                suggest={suggest}
                disabled={saving || isLocked}
                accessOrder={accessOrder}
              />
            </div>

            <div className="add-unit__actions">
              <button
                type="button"
                className={`add-unit__cancel-btn${!isDirty ? ' add-unit__cancel-btn--primary' : ''}`}
                onClick={() => setIsEditing(false)}
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
          </div>
        </div>
      )}
    </div>
  );
}
