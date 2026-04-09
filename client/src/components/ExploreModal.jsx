/**
 * ExploreModal — multi-turn chat about a category's units.
 *
 * Props:
 *   category   { id, title, uids }
 *   allUnits   Unit[]              units for this category
 *   onClose    fn
 *   onSaveUnit fn()                called after a response is saved as a unit
 */
import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { CloseIcon, CheckIcon } from './Icons';
import { getSetting, addUnit } from '../utils/db';
import { chatWithUnits } from '../utils/forage';
import NoteTray from './NoteTray';
import { CarouselCard } from './Carousel';
import SimpleMarkdown from './SimpleMarkdown';
import './ExploreModal.css';

const QUICK_PROMPTS = ['Summarize', 'Key points', 'Action items', "What am I missing?"];

export default function ExploreModal({ category, allUnits, onClose, onSaveUnit }) {
  // All units selected by default — user can deselect to narrow context
  const [selectedIds, setSelectedIds] = useState(() => new Set(allUnits.map((u) => u.id)));
  const [shareContent, setShareContent] = useState(false);
  const [messages, setMessages] = useState([]); // [{id, role:'user'|'assistant', text, saved}]
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const messagesEndRef = useRef(null);

  const contextUnits = useMemo(
    () => allUnits.filter((u) => selectedIds.has(u.id)),
    [allUnits, selectedIds]
  );

  const hasShareableContent = useMemo(
    () => contextUnits.some((u) => u.type !== 'password' && u.content),
    [contextUnits]
  );

  // Scroll to bottom when messages update
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Escape key closes
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const toggleUnit = useCallback((id) => {
    setSelectedIds((prev) => {
      if (prev.size === 1 && prev.has(id)) return prev; // keep at least 1
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const doSend = useCallback(async (text) => {
    if (!text || loading) return;
    if (contextUnits.length === 0) { setError('Select at least one item.'); return; }

    const userMsg = { id: crypto.randomUUID(), role: 'user', text };
    const assistantId = crypto.randomUUID();
    const assistantMsg = { id: assistantId, role: 'assistant', text: '', saved: false };
    const allMessages = [...messages, userMsg];

    setMessages([...allMessages, assistantMsg]);
    setInput('');
    setLoading(true);
    setError('');

    try {
      const apiKey = await getSetting('gemini_key');
      const stream = await chatWithUnits({
        units: contextUnits,
        messages: allMessages.map((m) => ({ role: m.role, text: m.text })),
        shareContent,
        apiKey,
      });
      let accumulated = '';
      for await (const chunk of stream) {
        accumulated += chunk.text ?? '';
        const snap = accumulated;
        setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, text: snap } : m)));
      }
    } catch (e) {
      setMessages((prev) => prev.filter((m) => m.id !== assistantId));
      setError(e.message ?? 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }, [loading, messages, contextUnits, shareContent]);

  const handleSend = useCallback(() => doSend(input.trim()), [doSend, input]);

  const handleSaveMessage = useCallback(async (msg) => {
    if (msg.saved || !msg.text) return;
    // Find the user message that prompted this response
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

  const canSend = input.trim().length > 0 && !loading;

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal explore-modal" onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="modal__header">
          <div className="explore__title-wrap">
            <span className="modal__title">Explore</span>
            <span className="forage__category-pill">{category.title}</span>
          </div>
          <button className="btn-close" onClick={onClose} aria-label="Close">
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
              : `${contextUnits.length} of ${allUnits.length} items in context · tap to toggle`}
          </p>
        </div>

        {/* Messages area */}
        <div className="explore__messages">
          {messages.length === 0 ? (
            <div className="explore__empty">
              <p className="explore__empty-hint">Ask anything about these items</p>
              <div className="forage__quick-prompts forage__quick-prompts--idle">
                <span className="forage__quick-label">try</span>
                {QUICK_PROMPTS.map((p) => (
                  <button
                    key={p}
                    className="forage__quick-chip"
                    onClick={() => doSend(p)}
                    disabled={loading}
                    type="button"
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((msg, i) => (
              <div key={msg.id} className={`explore__message explore__message--${msg.role}`}>
                {msg.role === 'user' ? (
                  <p className="explore__message-user-text">{msg.text}</p>
                ) : (
                  <>
                    {msg.text ? (
                      <SimpleMarkdown text={msg.text} className="forage__markdown" />
                    ) : (
                      <div className="forage__response-loading">
                        <span className="note-field__spinner" />
                        <span>Thinking…</span>
                      </div>
                    )}
                    {loading && i === messages.length - 1 && msg.text && (
                      <span className="forage__cursor" aria-hidden="true">▋</span>
                    )}
                    {!loading && msg.text && (
                      <div className="explore__message-footer">
                        <button
                          className={`forage__save-btn${msg.saved ? ' forage__save-btn--done' : ''}`}
                          onClick={() => handleSaveMessage(msg)}
                          disabled={msg.saved}
                          type="button"
                        >
                          {msg.saved ? <><CheckIcon /> Saved</> : 'Save'}
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            ))
          )}

          {/* Inline quick prompts after conversation starts */}
          {messages.length > 0 && !loading && (
            <div className="forage__quick-prompts" style={{ padding: '4px 0' }}>
              <span className="forage__quick-label">or</span>
              {QUICK_PROMPTS.map((p) => (
                <button
                  key={p}
                  className="forage__quick-chip"
                  onClick={() => doSend(p)}
                  disabled={loading}
                  type="button"
                >
                  {p}
                </button>
              ))}
            </div>
          )}

          {error && <p className="modal__error" style={{ margin: '4px 0 0' }}>{error}</p>}
          <div ref={messagesEndRef} />
        </div>

        {/* Content toggle */}
        {hasShareableContent && (
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
        )}

        {/* Input */}
        <NoteTray
          value={input}
          onChange={setInput}
          disabled={loading}
          placeholder="Ask something…"
        />

        {/* Actions */}
        <div className="add-unit__actions">
          <button className="add-unit__cancel-btn" onClick={onClose} type="button">
            Close
          </button>
          <button
            className={`add-unit__cancel-btn add-unit__cancel-btn--primary forage__ask-btn${!canSend ? ' forage__ask-btn--disabled' : ''}`}
            onClick={handleSend}
            disabled={!canSend}
            type="button"
          >
            {loading ? 'Thinking…' : 'Send ✦'}
          </button>
        </div>

      </div>
    </div>
  );
}
