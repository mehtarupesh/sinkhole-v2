import { useState, useRef, useEffect, useCallback } from 'react';
import { chatWithUnits } from '../utils/forage';
import { getSetting, addUnit } from '../utils/db';
import { CheckIcon, TrashIcon, CopyIcon, RerunIcon, ChevronLeftIcon } from './Icons';
import NoteTray from './NoteTray';
import SimpleMarkdown from './SimpleMarkdown';
import './Chat.css';

export default function Chat({
  units,
  loadMessages,
  saveMessages,
  categoryId,
  onSaveUnit,
  onBack,
  backLabel = 'Back',
  subtitle,
  defaultInput = '',
  emptyText = 'Ask something…',
}) {
  const [messages, setMessages] = useState([]);
  const [input, setInput]       = useState(defaultInput);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');

  const [editingId, setEditingId]             = useState(null);
  const [editText, setEditText]               = useState('');
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  const [copiedId, setCopiedId]               = useState(null);

  const messagesEndRef  = useRef(null);
  const editTextareaRef = useRef(null);
  const copyTimerRef    = useRef(null);
  const messageCountRef = useRef(0);
  const loadMessagesRef = useRef(loadMessages);
  const saveMessagesRef = useRef(saveMessages);

  useEffect(() => { saveMessagesRef.current = saveMessages; }, [saveMessages]);

  // Load persisted messages once on mount
  useEffect(() => {
    let cancelled = false;
    loadMessagesRef.current().then((msgs) => {
      if (!cancelled && msgs?.length) setMessages(msgs);
    });
    return () => { cancelled = true; };
  }, []);

  // Scroll to bottom only when message count grows
  useEffect(() => {
    if (messages.length > messageCountRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
    messageCountRef.current = messages.length;
  }, [messages]);

  // Focus + auto-size edit textarea on entry
  useEffect(() => {
    if (editingId && editTextareaRef.current) {
      const el = editTextareaRef.current;
      el.style.height = 'auto';
      el.style.height = `${el.scrollHeight}px`;
      el.focus();
      el.setSelectionRange(0, 0);
    }
  }, [editingId]);

  const persist = useCallback(async (msgs) => {
    await saveMessagesRef.current(msgs);
  }, []);

  const doSend = useCallback(async (text, prevMessages) => {
    const history = prevMessages ?? messages;
    if (!text || loading) return;

    const userMsg      = { id: crypto.randomUUID(), role: 'user', text };
    const assistantId  = crypto.randomUUID();
    const assistantMsg = { id: assistantId, role: 'assistant', text: '', savedAsUnit: false };
    const optimistic   = [...history, userMsg, assistantMsg];

    setMessages(optimistic);
    setInput('');
    setLoading(true);
    setError('');

    const historyForApi = [...history, userMsg].map((m) => ({ role: m.role, text: m.text }));

    try {
      const apiKey = await getSetting('gemini_key');
      const stream = await chatWithUnits({ units, messages: historyForApi, shareContent: true, apiKey });
      let accumulated = '';
      for await (const chunk of stream) {
        accumulated += chunk.text ?? '';
        const snap = accumulated;
        setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, text: snap } : m)));
      }
      const final = optimistic.map((m) => (m.id === assistantId ? { ...m, text: accumulated } : m));
      await persist(final);
    } catch (e) {
      setMessages([...history, userMsg]);
      setError(e.message ?? 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }, [loading, messages, units, persist]);

  const handleSend = useCallback(() => {
    const text = input.trim();
    if (text) doSend(text);
  }, [doSend, input]);

  const handleRerun = useCallback((assistantMsgId) => {
    const idx = messages.findIndex((m) => m.id === assistantMsgId);
    if (idx < 1) return;
    const priorMessages = messages.slice(0, idx);
    const lastUser      = [...priorMessages].reverse().find((m) => m.role === 'user');
    if (!lastUser) return;
    const lastUserIdx   = priorMessages.map((m) => m.id).lastIndexOf(lastUser.id);
    doSend(lastUser.text, priorMessages.slice(0, lastUserIdx));
  }, [messages, doSend]);

  const handleSaveMessage = useCallback(async (msg) => {
    if (msg.savedAsUnit || !msg.text) return;
    const msgIdx   = messages.findIndex((m) => m.id === msg.id);
    const prevUser = messages.slice(0, msgIdx).reverse().find((m) => m.role === 'user');
    try {
      await addUnit({
        type: 'snippet',
        content: msg.text,
        quote: prevUser?.text ?? '',
        categoryId,
      });
      const updated = messages.map((m) => (m.id === msg.id ? { ...m, savedAsUnit: true } : m));
      setMessages(updated);
      await persist(updated);
      onSaveUnit?.();
    } catch {
      setError('Save failed.');
    }
  }, [messages, categoryId, persist, onSaveUnit]);

  const startEdit = useCallback((id, text) => {
    setEditingId(id);
    setEditText(text);
    setDeleteConfirmId(null);
  }, []);

  const commitEdit = useCallback(async () => {
    if (!editingId) return;
    const text = editText.trim();
    const updated = text
      ? messages.map((m) => (m.id === editingId ? { ...m, text } : m))
      : messages;
    setMessages(updated);
    setEditingId(null);
    setEditText('');
    if (text) await persist(updated);
  }, [editingId, editText, messages, persist]);

  const cancelEdit = useCallback(() => { setEditingId(null); setEditText(''); }, []);

  const handleEditChange = (e) => {
    setEditText(e.target.value);
    const el = editTextareaRef.current;
    if (el) { el.style.height = 'auto'; el.style.height = `${el.scrollHeight}px`; }
  };

  const handleCopy = useCallback(async (id, text) => {
    try {
      await navigator.clipboard.writeText(text);
      clearTimeout(copyTimerRef.current);
      setCopiedId(id);
      copyTimerRef.current = setTimeout(() => setCopiedId(null), 1500);
    } catch { /* unavailable */ }
  }, []);

  const handleDelete = useCallback(async (id) => {
    if (deleteConfirmId === id) {
      const updated = messages.filter((m) => m.id !== id);
      setMessages(updated);
      setDeleteConfirmId(null);
      await persist(updated);
    } else {
      setDeleteConfirmId(id);
      setEditingId(null);
    }
  }, [deleteConfirmId, messages, persist]);

  return (
    <div className="chat">
      <div className="chat__header">
        <button type="button" className="chat__back-btn" onClick={onBack} aria-label="Go back">
          <ChevronLeftIcon /> {backLabel}
        </button>
        {subtitle && <span className="chat__subtitle">{subtitle}</span>}
      </div>

      <div className="chat__messages">
        {messages.length === 0 && (
          <p className="chat__empty">{emptyText}</p>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`chat__msg chat__msg--${msg.role}${editingId === msg.id ? ' chat__msg--editing' : ''}`}
          >
            {editingId === msg.id ? (
              <textarea
                ref={editTextareaRef}
                className="chat__edit-textarea"
                value={editText}
                onChange={handleEditChange}
                onBlur={commitEdit}
                onKeyDown={(e) => { if (e.key === 'Escape') cancelEdit(); }}
                rows={1}
              />
            ) : msg.role === 'user' ? (
              <div
                className="snippet__tap-to-edit"
                onClick={() => startEdit(msg.id, msg.text)}
                role="button"
                tabIndex={0}
                aria-label="Tap to edit"
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') startEdit(msg.id, msg.text); }}
              >
                <p className="chat__msg-text">{msg.text}</p>
              </div>
            ) : msg.text ? (
              <div
                className="snippet__tap-to-edit"
                onClick={() => startEdit(msg.id, msg.text)}
                role="button"
                tabIndex={0}
                aria-label="Tap to edit"
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') startEdit(msg.id, msg.text); }}
              >
                <SimpleMarkdown text={msg.text} className="forage__markdown" />
              </div>
            ) : (
              <div className="forage__response-loading">
                <span className="note-field__spinner" />
                <span>Thinking…</span>
              </div>
            )}

            {loading && msg.role === 'assistant' && !editingId && msg.text && (
              <span className="forage__cursor" aria-hidden="true">▋</span>
            )}

            {!(loading && msg.role === 'assistant' && !msg.text) && msg.text && editingId !== msg.id && (
              <div className="chat__actions">
                <button
                  type="button"
                  className="chat__action-btn"
                  onClick={() => handleCopy(msg.id, msg.text)}
                  aria-label="Copy"
                >
                  {copiedId === msg.id ? <CheckIcon size={12} /> : <CopyIcon size={12} />}
                </button>

                <button
                  type="button"
                  className={`chat__action-btn${deleteConfirmId === msg.id ? ' chat__action-btn--confirm' : ''}`}
                  onClick={() => handleDelete(msg.id)}
                  onBlur={() => setDeleteConfirmId(null)}
                  aria-label="Delete"
                >
                  {deleteConfirmId === msg.id ? 'Confirm?' : <TrashIcon size={12} />}
                </button>

                {msg.role === 'assistant' && (
                  <>
                    <button
                      type="button"
                      className="chat__action-btn"
                      onClick={() => handleRerun(msg.id)}
                      disabled={loading}
                      aria-label="Regenerate"
                    >
                      <RerunIcon size={12} />
                    </button>

                    <button
                      type="button"
                      className={`forage__save-btn chat__save-btn${msg.savedAsUnit ? ' forage__save-btn--done' : ''}`}
                      onClick={() => handleSaveMessage(msg)}
                      disabled={msg.savedAsUnit}
                    >
                      {msg.savedAsUnit ? <><CheckIcon size={11} /> Saved</> : 'Save'}
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        ))}

        {error && <p className="chat__error">{error}</p>}
        <div ref={messagesEndRef} />
      </div>

      <div className="chat__input-row" onClick={(e) => e.stopPropagation()}>
        <NoteTray
          className="chat__note-tray"
          value={input}
          onChange={setInput}
          onSubmit={handleSend}
          onTranscribed={(text) => doSend(text)}
          disabled={loading}
          placeholder="Ask something…"
          defaultMode="text-hero"
          actionBtn={
            <button
              type="button"
              className="note-tray__action-btn"
              onClick={handleSend}
              disabled={!input.trim() || loading}
              aria-label="Send"
            >
              {loading ? '…' : '✦'}
            </button>
          }
        />
      </div>
    </div>
  );
}
