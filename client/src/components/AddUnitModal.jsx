import { useState, useRef, useEffect, useCallback } from 'react';
import { SnippetTypeIcon, LockTypeIcon, ImageTypeIcon, CopyIcon, CheckIcon } from './Icons';
import { addUnit, getSetting } from '../utils/db';
import NoteField from './NoteField';
import CategoryField from './CategoryField';
import ImageLightbox from './ImageLightbox';
import { suggestCategory } from '../utils/suggestCategory';

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
  // Auto-suggest
  const [suggestState, setSuggestState] = useState('idle'); // 'idle'|'needs-selection'|'loading'|'done'|'error'|'no-key'
  const [shareContent, setShareContent] = useState(false);
  // Note is always shared with AI — no user toggle
  const [suggestedTitle, setSuggestedTitle] = useState(null); // new category the LLM proposes
  const [ghostAccepted, setGhostAccepted] = useState(false); // user tapped the ghost chip
  const [editingGhost, setEditingGhost] = useState(false);   // long-press edit mode
  const [ghostEditValue, setGhostEditValue] = useState('');  // value while editing
  const ghostLongPressTimer = useRef(null);
  const ghostEditRef = useRef(null);
  const fileRef = useRef(null);
  const copyTimerRef = useRef(null);
  const textareaRef = useRef(null);
  const swipeStart = useRef(null);
  const autoSaveTimerRef = useRef(null);
  const fromTranscriptionRef = useRef(false);
  const [autoSaving, setAutoSaving] = useState(false);
  const saving = saveState !== '';
  const hasContent = type === 'image' ? !!content : !!content.trim();
  const hasNote = !!quote.trim();
  const canAutoSuggest = !saving && (hasContent || hasNote) && suggestState !== 'loading';
  const sparkleBlinking = suggestState === 'needs-selection';
  // + button: hide when a new category is already queued (ghostAccepted) or actively being edited
  const showAddChip = !saving && !ghostAccepted && !editingGhost;

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
      // Resolve category: ghost chip accepted → use its slug id
      const resolvedCategoryId = pendingNewCategory ? pendingNewCategory.id : (categoryId || null);
      onSaved?.(uid, resolvedCategoryId, pendingNewCategory);
      setTimeout(onClose, 500);
    } catch {
      setError('Failed to save. Please try again.');
      setSaveState('');
    }
  };

  const handleSave = () => {
    cancelAutoSave();
    performSave(quote);
  };

  const startAutoSave = (quoteText) => {
    setAutoSaving(true);
    autoSaveTimerRef.current = setTimeout(() => {
      setAutoSaving(false);
      performSave(quoteText);
    }, 3000);
  };

  const cancelAutoSave = () => {
    clearTimeout(autoSaveTimerRef.current);
    setAutoSaving(false);
  };

  const handleTranscriptionDone = (transcript) => {
    setQuote(transcript);
    fromTranscriptionRef.current = true;
    runSuggest(transcript);
  };

  // ── Auto-suggest ──────────────────────────────────────────────────────────

  const blinkTimerRef = useRef(null);

  // noteOverride: pass the transcript directly when auto-triggering after transcription
  // (state update from setQuote may not have settled yet)
  const runSuggest = async (noteOverride) => {
    const effectiveNote = noteOverride !== undefined ? noteOverride : quote;
    const willShareNote = !!effectiveNote?.trim();

    if (!shareContent && !willShareNote) {
      setSuggestState('needs-selection');
      clearTimeout(blinkTimerRef.current);
      blinkTimerRef.current = setTimeout(() => setSuggestState('idle'), 2500);
      return;
    }
    setSuggestState('loading');
    try {
      const apiKey = await getSetting('gemini_key');
      if (!apiKey) throw new Error('no-key');

      const sharedContent = shareContent && content ? content : null;

      const result = await suggestCategory({
        content: sharedContent,
        mimeType,
        quote: willShareNote ? effectiveNote : null,
        type,
        existingCategories: storedGroups ?? [],
      }, apiKey);

      if (result.categoryId) {
        setCategoryId(result.categoryId);
        setSuggestedTitle(null);
      } else if (result.suggestedTitle) {
        setSuggestedTitle(result.suggestedTitle);
        setGhostAccepted(false);
        setCategoryId(''); // clear any manual selection
      }
      setSuggestState('done');
      if (fromTranscriptionRef.current) {
        fromTranscriptionRef.current = false;
        startAutoSave(effectiveNote);
      }
    } catch (e) {
      fromTranscriptionRef.current = false;
      setSuggestState(e.message === 'no-key' ? 'no-key' : 'error');
    }
  };

  // Slugify a suggested title into a usable id
  const slugify = (str) => str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

  // When saving, derive the new category object (if user accepted ghost chip)
  const pendingNewCategory = ghostAccepted && suggestedTitle
    ? { id: slugify(suggestedTitle), title: suggestedTitle }
    : null;

  // ── Manual new category (+ button) ───────────────────────────────────────

  const handleAddNewCategory = () => {
    setSuggestedTitle(null); // clear any AI suggestion
    setGhostAccepted(false);
    setGhostEditValue('');
    setEditingGhost(true);
    setSuggestState('done'); // show the ghost row
  };

  // ── Ghost chip long-press to edit ─────────────────────────────────────────

  const handleGhostPointerDown = (e) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    ghostLongPressTimer.current = setTimeout(() => {
      ghostLongPressTimer.current = null;
      setGhostEditValue(suggestedTitle ?? '');
      setEditingGhost(true);
      // Focus happens via autoFocus / ref after render
    }, 500);
  };

  const handleGhostPointerUp = (e) => {
    if (ghostLongPressTimer.current) {
      // Short press — treat as toggle accept/deselect
      clearTimeout(ghostLongPressTimer.current);
      ghostLongPressTimer.current = null;
      setGhostAccepted((v) => !v);
      if (ghostAccepted) setCategoryId('');
    }
    // If timer already fired (long press), editingGhost was set — do nothing here
  };

  const handleGhostPointerCancel = () => {
    clearTimeout(ghostLongPressTimer.current);
    ghostLongPressTimer.current = null;
  };

  const commitGhostEdit = (value) => {
    const trimmed = value.trim();
    if (!trimmed) {
      // User deleted — dismiss ghost entirely, go back to idle
      setSuggestedTitle(null);
      setGhostAccepted(false);
      setEditingGhost(false);
      setSuggestState('idle');
    } else {
      setSuggestedTitle(trimmed);
      setGhostAccepted(true);
      setEditingGhost(false);
    }
  };

  const handleTouchStart = (e) => {
    swipeStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };

  const handleTouchEnd = (e) => {
    if (!swipeStart.current) return;
    const dx = e.changedTouches[0].clientX - swipeStart.current.x;
    const dy = Math.abs(e.changedTouches[0].clientY - swipeStart.current.y);
    swipeStart.current = null;
    if (dx > 80 && dx > dy * 1.5) onClose();
  };

  return (
    <div
      className="overlay"
      style={keyboardOffset > 0 ? { paddingBottom: keyboardOffset + 24 } : undefined}
      onClick={onClose}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
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
              {hasContent && (
                <button
                  type="button"
                  className={`share-sparkle share-sparkle--content${shareContent ? ' share-sparkle--on' : ''}${sparkleBlinking ? ' share-sparkle--blink' : ''}`}
                  onClick={() => setShareContent((v) => !v)}
                  aria-label="Include content in AI suggestion"
                  title={shareContent ? 'Content shared with AI' : 'Tap to share content with AI'}
                />
              )}
            </div>
          )}

          {type === 'password' && (
            <div className="share-sparkle-wrap">
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
              {hasContent && (
                <button
                  type="button"
                  className={`share-sparkle share-sparkle--content${shareContent ? ' share-sparkle--on' : ''}${sparkleBlinking ? ' share-sparkle--blink' : ''}`}
                  onClick={() => setShareContent((v) => !v)}
                  aria-label="Include content in AI suggestion"
                  title={shareContent ? 'Password shared with AI · sensitive' : 'Tap to share password with AI'}
                />
              )}
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
              {hasContent && (
                <button
                  type="button"
                  className={`share-sparkle share-sparkle--content${shareContent ? ' share-sparkle--on' : ''}${sparkleBlinking ? ' share-sparkle--blink' : ''}`}
                  onClick={() => setShareContent((v) => !v)}
                  aria-label="Include file in AI suggestion"
                  title={shareContent ? 'File shared with AI' : 'Tap to share file with AI'}
                />
              )}
            </div>
          )}
        </div>

        {error && <p className="modal__error">{error}</p>}

        {showLightbox && content && mimeType?.startsWith('image/') && (
          <ImageLightbox src={content} alt={fileName} onClose={() => setShowLightbox(false)} />
        )}

        <div className="share-sparkle-wrap">
          <NoteField value={quote} onChange={setQuote} disabled={saving} onTranscriptionDone={handleTranscriptionDone} />
          {hasNote && (
            <span
              className={`share-sparkle share-sparkle--note share-sparkle--on${sparkleBlinking ? ' share-sparkle--blink' : ''}`}
              aria-label="Note always shared with AI"
              title="Note is always shared with AI"
            />
          )}
        </div>

        {/* ── Category + Auto-suggest ── */}
        <div className="auto-suggest-wrap">
          <div className="auto-suggest-chips-row">
            <CategoryField
              groups={storedGroups}
              value={ghostAccepted && pendingNewCategory ? pendingNewCategory.id : categoryId}
              onChange={(id) => { setCategoryId(id); setSuggestedTitle(null); setGhostAccepted(false); setSuggestState('idle'); }}
              disabled={saving || suggestState === 'loading'}
            />
            {showAddChip && (
              <button type="button" className="auto-suggest-add-chip" onClick={handleAddNewCategory} aria-label="Add new category">
                +
              </button>
            )}
          </div>

          {/* Ghost chip / inline editor for new category */}
          {(editingGhost || (suggestState === 'done' && suggestedTitle)) && (
            <div className="auto-suggest-ghost-row">
              {editingGhost ? (
                <input
                  ref={ghostEditRef}
                  autoFocus
                  className="auto-suggest-ghost-input"
                  value={ghostEditValue}
                  onChange={(e) => setGhostEditValue(e.target.value)}
                  onBlur={(e) => commitGhostEdit(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); commitGhostEdit(ghostEditValue); }
                    if (e.key === 'Escape') { e.stopPropagation(); commitGhostEdit(''); }
                  }}
                  aria-label="Edit category name"
                />
              ) : (
                <button
                  type="button"
                  className={`category-field__chip auto-suggest-ghost-chip${ghostAccepted ? ' category-field__chip--active auto-suggest-ghost-chip--accepted' : ''}`}
                  onPointerDown={handleGhostPointerDown}
                  onPointerUp={handleGhostPointerUp}
                  onPointerCancel={handleGhostPointerCancel}
                  onPointerLeave={handleGhostPointerCancel}
                >
                  {suggestedTitle}
                </button>
              )}
              <span className={`auto-suggest-hint${ghostAccepted && !editingGhost ? ' auto-suggest-hint--done' : ''}`}>
                {editingGhost ? 'Edit · Enter to confirm · Esc to dismiss' : ghostAccepted ? 'New category ✓' : 'AI suggested · tap · hold to edit'}
              </span>
            </div>
          )}

          {/* Status line */}
          {suggestState === 'needs-selection' && (
            <p className="auto-suggest-status auto-suggest-status--warn">Tap ✦ on content or note to share with AI</p>
          )}
          {suggestState === 'loading' && (
            <p className="auto-suggest-status">Thinking…</p>
          )}
          {suggestState === 'done' && !suggestedTitle && categoryId && (
            <p className="auto-suggest-status auto-suggest-status--done">AI suggested ✓</p>
          )}
          {suggestState === 'error' && (
            <p className="auto-suggest-status auto-suggest-status--error">Couldn't suggest — try again</p>
          )}
          {suggestState === 'no-key' && (
            <p className="auto-suggest-status auto-suggest-status--error">Add a Gemini API key in Settings ⚙</p>
          )}

          {/* Trigger button */}
          {canAutoSuggest && (
            <button type="button" className="auto-suggest-trigger" onClick={() => runSuggest()}>
              ✦ suggest category
            </button>
          )}
        </div>

        <div className="add-unit__actions">
          <button type="button" className="add-unit__cancel-btn" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button
            type="button"
            className={`connect-btn add-unit__save-btn${saveState === 'done' ? ' add-unit__save-btn--done' : ''}${autoSaving ? ' add-unit__save-btn--filling' : ''}`}
            onClick={autoSaving ? cancelAutoSave : handleSave}
            disabled={saving}
          >
            {saveState === 'done' ? 'Saved ✓' : saving ? '…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
