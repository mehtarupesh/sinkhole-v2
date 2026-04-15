/**
 * ExploreModal (displayed as "Forage") — multi-turn chat about a category's units.
 *
 * Props:
 *   category   { id, title, uids }
 *   allUnits   Unit[]              units for this category (already filtered)
 *   synthesis  string              optional — shown as the first AI message
 *   onClose    fn
 *   onSaveUnit fn()                called after a response is saved as a unit
 */
import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { CloseIcon, CheckIcon, TrashIcon, RenameIcon, CopyIcon } from './Icons';
import { getSetting, addUnit } from '../utils/db';
import { chatWithUnits } from '../utils/forage';
import { CarouselCard } from './Carousel';
import NoteTray from './NoteTray';
import SimpleMarkdown from './SimpleMarkdown';
import './ExploreModal.css';

const SYNTHESIS_ID = '__synthesis__';

function buildInitialMessages(synthesis) {
  if (!synthesis?.trim()) return [];
  return [{ id: SYNTHESIS_ID, role: 'assistant', text: synthesis, saved: false }];
}

export default function ExploreModal({ category, allUnits, synthesis, onClose, onSaveUnit }) {
  const [selectedIds, setSelectedIds]       = useState(() => new Set(allUnits.map((u) => u.id)));
  const [shareContent, setShareContent]     = useState(true);
  const [messages, setMessages]             = useState(() => buildInitialMessages(synthesis));
  const [input, setInput]                   = useState('');
  const [loading, setLoading]               = useState(false);
  const [error, setError]                   = useState('');

  // Edit state
  const [editingId, setEditingId]           = useState(null);
  const [editText, setEditText]             = useState('');

  // Delete confirm state
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);

  // Copy state — tracks which message was just copied
  const [copiedId, setCopiedId] = useState(null);
  const copyTimerRef = useRef(null);

  // Close confirm state
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);

  const messagesEndRef  = useRef(null);
  const editTextareaRef = useRef(null);

  const contextUnits = useMemo(
    () => allUnits.filter((u) => selectedIds.has(u.id)),
    [allUnits, selectedIds]
  );

  // const hasShareableContent = useMemo(
  //   () => contextUnits.some((u) => u.type !== 'password' && u.content && !u.encrypted),
  //   [contextUnits]
  // );

  // Scroll to bottom only when a new message is added, not during streaming updates
  const messageCountRef = useRef(messages.length);
  useEffect(() => {
    const prev = messageCountRef.current;
    messageCountRef.current = messages.length;
    if (messages.length > prev) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  // Focus edit textarea when entering edit mode and auto-size to content
  useEffect(() => {
    if (editingId && editTextareaRef.current) {
      const el = editTextareaRef.current;
      el.style.height = 'auto';
      el.style.height = `${el.scrollHeight}px`;
      el.focus();
      el.select();
    }
  }, [editingId]);

  // Escape: cancel edit → cancel delete confirm → ask before close
  useEffect(() => {
    const handler = (e) => {
      if (e.key !== 'Escape') return;
      if (editingId)        { cancelEdit(); return; }
      if (deleteConfirmId)  { setDeleteConfirmId(null); return; }
      if (showCloseConfirm) { setShowCloseConfirm(false); return; }
      setShowCloseConfirm(true);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose, editingId, deleteConfirmId, showCloseConfirm]);

  // ── Unit selection ───────────────────────────────────────────────────────────

  const toggleUnit = useCallback((id) => {
    setSelectedIds((prev) => {
      if (prev.size === 1 && prev.has(id)) return prev;
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  // ── Send ─────────────────────────────────────────────────────────────────────

  const doSend = useCallback(async (text) => {
    if (!text || loading) return;
    if (contextUnits.length === 0) { setError('Select at least one item.'); return; }

    const userMsg     = { id: crypto.randomUUID(), role: 'user', text };
    const assistantId = crypto.randomUUID();
    const assistantMsg = { id: assistantId, role: 'assistant', text: '', saved: false };

    // Only pass real conversation (skip synthesis placeholder for context building)
    const historyForApi = [...messages, userMsg]
      .filter((m) => m.id !== SYNTHESIS_ID)
      .map((m) => ({ role: m.role, text: m.text }));

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setInput('');
    setLoading(true);
    setError('');

    try {
      const apiKey = await getSetting('gemini_key');
      const stream = await chatWithUnits({
        units: contextUnits,
        messages: historyForApi,
        shareContent,
        apiKey,
      });
      let accumulated = '';
      for await (const chunk of stream) {
        accumulated += chunk.text ?? '';
        const snap = accumulated;
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantId ? { ...m, text: snap } : m))
        );
      }
    } catch (e) {
      setMessages((prev) => prev.filter((m) => m.id !== assistantId));
      setError(e.message ?? 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }, [loading, messages, contextUnits, shareContent]);

  const handleSend = useCallback(() => {
    const text = input.trim();
    if (text) doSend(text);
  }, [doSend, input]);

  // ── Save ─────────────────────────────────────────────────────────────────────

  const handleSaveMessage = useCallback(async (msg) => {
    if (msg.saved || !msg.text) return;
    const msgIndex = messages.findIndex((m) => m.id === msg.id);
    const prevUser = messages.slice(0, msgIndex).reverse().find((m) => m.role === 'user');
    try {
      await addUnit({
        type: 'snippet',
        content: msg.text,
        quote: prevUser?.text ?? '',
        categoryId: category.id === 'misc' ? null : category.id,
      });
      setMessages((prev) => prev.map((m) => (m.id === msg.id ? { ...m, saved: true } : m)));
      onSaveUnit?.();
    } catch {
      setError('Save failed.');
    }
  }, [messages, category, onSaveUnit]);

  // ── Edit ─────────────────────────────────────────────────────────────────────

  const startEdit = useCallback((id, currentText) => {
    setEditingId(id);
    setEditText(currentText);
    setDeleteConfirmId(null);
  }, []);

  const commitEdit = useCallback(() => {
    if (!editingId) return;
    const text = editText.trim();
    if (text) {
      setMessages((prev) =>
        prev.map((m) => (m.id === editingId ? { ...m, text } : m))
      );
    }
    setEditingId(null);
    setEditText('');
  }, [editingId, editText]);

  const cancelEdit = useCallback(() => {
    setEditingId(null);
    setEditText('');
  }, []);

  // Auto-resize edit textarea
  const handleEditChange = (e) => {
    setEditText(e.target.value);
    const el = editTextareaRef.current;
    if (el) { el.style.height = 'auto'; el.style.height = `${el.scrollHeight}px`; }
  };

  // ── Copy ─────────────────────────────────────────────────────────────────────

  const handleCopyMessage = useCallback(async (id, text) => {
    try {
      await navigator.clipboard.writeText(text);
      clearTimeout(copyTimerRef.current);
      setCopiedId(id);
      copyTimerRef.current = setTimeout(() => setCopiedId(null), 1500);
    } catch { /* clipboard unavailable */ }
  }, []);

  // ── Delete ───────────────────────────────────────────────────────────────────

  const handleDeleteClick = useCallback((id) => {
    if (deleteConfirmId === id) {
      setMessages((prev) => prev.filter((m) => m.id !== id));
      setDeleteConfirmId(null);
    } else {
      setDeleteConfirmId(id);
      setEditingId(null);
    }
  }, [deleteConfirmId]);

  // ── Render ───────────────────────────────────────────────────────────────────

  const canSend = input.trim().length > 0 && !loading;

  return (
    <div className="overlay" onClick={() => setShowCloseConfirm(true)}>
      <div className="modal explore-modal" onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="modal__header">
          <div className="explore__title-wrap">
            <span className="modal__title">Forage</span>
            <span className="forage__category-pill">{category.title}</span>
          </div>
          <button className="btn-close" onClick={() => setShowCloseConfirm(true)} aria-label="Close">
            <CloseIcon />
          </button>
        </div>

        {/* Unit selection strip */}
        <div className="explore__strip-wrap">
          <div className="carousel__row explore__strip">
            {allUnits.map((u) => (
              <div
                key={u.id}
                className={`explore__unit-wrap${selectedIds.has(u.id) ? '' : ' explore__unit-wrap--dim'}`}
              >
                <CarouselCard unit={u} onClick={() => toggleUnit(u.id)} selected={false} />
                <div className={`explore__unit-dot${selectedIds.has(u.id) ? ' explore__unit-dot--on' : ''}`} aria-hidden="true" />
              </div>
            ))}
          </div>
          <p className="explore__context-meta">
            {contextUnits.length === allUnits.length
              ? `All ${allUnits.length} item${allUnits.length !== 1 ? 's' : ''} in context`
              : `${contextUnits.length} of ${allUnits.length} in context · tap to toggle`}
          </p>
        </div>

        {/* Messages */}
        <div className="explore__messages">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`explore__message explore__message--${msg.role}${msg.id === SYNTHESIS_ID ? ' explore__message--synthesis' : ''}${editingId === msg.id && msg.role === 'user' ? ' explore__message--user-editing' : ''}`}
            >
              {/* Message body: edit mode or view mode */}
              {editingId === msg.id ? (
                <textarea
                  ref={editTextareaRef}
                  className="explore__edit-textarea"
                  value={editText}
                  onChange={handleEditChange}
                  onBlur={commitEdit}
                  onKeyDown={(e) => { if (e.key === 'Escape') cancelEdit(); }}
                  rows={1}
                />
              ) : (
                msg.role === 'user' ? (
                  <p className="explore__message-user-text">{msg.text}</p>
                ) : msg.text ? (
                  <SimpleMarkdown text={msg.text} className="forage__markdown" />
                ) : (
                  <div className="forage__response-loading">
                    <span className="note-field__spinner" />
                    <span>Thinking…</span>
                  </div>
                )
              )}

              {/* Streaming cursor */}
              {loading && msg.role === 'assistant' && !editingId && msg.text && (
                <span className="forage__cursor" aria-hidden="true">▋</span>
              )}

              {/* Message actions (shown when not streaming this message) */}
              {!(loading && msg.role === 'assistant' && !msg.text) && msg.text && editingId !== msg.id && (
                <div className="explore__message-actions">
                  {/* Edit */}
                  <button
                    type="button"
                    className="explore__msg-action"
                    onClick={() => startEdit(msg.id, msg.text)}
                    aria-label="Edit"
                  >
                    <RenameIcon size={12} />
                  </button>

                  {/* Copy */}
                  <button
                    type="button"
                    className="explore__msg-action"
                    onClick={() => handleCopyMessage(msg.id, msg.text)}
                    aria-label="Copy"
                  >
                    {copiedId === msg.id ? <CheckIcon size={12} /> : <CopyIcon size={12} />}
                  </button>

                  {/* Delete / Confirm */}
                  <button
                    type="button"
                    className={`explore__msg-action${deleteConfirmId === msg.id ? ' explore__msg-action--confirm' : ''}`}
                    onClick={() => handleDeleteClick(msg.id)}
                    onBlur={() => setDeleteConfirmId(null)}
                    aria-label="Delete"
                  >
                    {deleteConfirmId === msg.id ? 'Confirm?' : <TrashIcon size={12} />}
                  </button>

                  {/* Save (AI messages only) */}
                  {msg.role === 'assistant' && (
                    <button
                      type="button"
                      className={`forage__save-btn explore__msg-save${msg.saved ? ' forage__save-btn--done' : ''}`}
                      onClick={() => handleSaveMessage(msg)}
                      disabled={msg.saved}
                    >
                      {msg.saved ? <><CheckIcon /> Saved</> : 'Save'}
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}

          {error && <p className="modal__error" style={{ margin: '4px 0 0' }}>{error}</p>}
          <div ref={messagesEndRef} />
        </div>

        {/* Share content toggle */}
        {/* {hasShareableContent && (
          <button
            className={`forage__content-row${shareContent ? ' forage__content-row--on' : ''}`}
            onClick={() => setShareContent((s) => !s)}
            type="button"
            disabled={loading}
          >
            <div className="forage__content-row-left">
              <span className="forage__content-row-title">✦ Also send content to AI</span>
              <span className="forage__content-row-desc">
                {shareContent
                  ? 'AI reads your full text and images.'
                  : 'By default AI only reads your notes. Enable to share full content.'}
              </span>
            </div>
            <span className="forage__content-row-badge">{shareContent ? 'On' : 'Off'}</span>
          </button>
        )} */}

        {/* Chat input row */}
        <div className="explore__input-row">
          <NoteTray
            className="explore__note-tray"
            value={input}
            onChange={setInput}
            onSubmit={handleSend}
            onTranscribed={(text) => doSend(text)}
            disabled={loading}
            placeholder="Ask something…"
          />
          <button
            className={`explore__send-btn${!canSend ? ' explore__send-btn--disabled' : ''}`}
            onClick={handleSend}
            disabled={!canSend}
            type="button"
            aria-label="Send"
          >
            {loading ? '…' : '✦'}
          </button>
        </div>

        {/* Close confirmation overlay */}
        {showCloseConfirm && (
          <div className="explore__close-confirm">
            <p className="explore__close-confirm-text">Close Forage? Chat will be lost.</p>
            <div className="explore__close-confirm-actions">
              <button
                type="button"
                className="explore__close-confirm-btn explore__close-confirm-btn--cancel"
                onClick={() => setShowCloseConfirm(false)}
              >
                Keep open
              </button>
              <button
                type="button"
                className="explore__close-confirm-btn explore__close-confirm-btn--confirm"
                onClick={onClose}
              >
                Close
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
