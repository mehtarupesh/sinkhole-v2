import { useState, useRef, useEffect, useCallback } from 'react';
import { chatWithUnits } from '../utils/forage';
import { getSetting } from '../utils/db';
import { CloseIcon } from './Icons';
import NoteTray from './NoteTray';
import SimpleMarkdown from './SimpleMarkdown';

export default function UnitChat({ unit, onClose }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput]       = useState('');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const messagesEndRef  = useRef(null);
  const messageCountRef = useRef(0);

  useEffect(() => {
    if (messages.length > messageCountRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
    messageCountRef.current = messages.length;
  }, [messages]);

  const doSend = useCallback(async (text) => {
    if (!text || loading) return;
    const userMsg      = { id: crypto.randomUUID(), role: 'user', text };
    const assistantId  = crypto.randomUUID();
    const assistantMsg = { id: assistantId, role: 'assistant', text: '' };
    const optimistic   = [...messages, userMsg, assistantMsg];
    setMessages(optimistic);
    setInput('');
    setLoading(true);
    setError('');
    try {
      const apiKey = await getSetting('gemini_key');
      const stream = await chatWithUnits({
        units: [unit],
        messages: [...messages, userMsg].map((m) => ({ role: m.role, text: m.text })),
        shareContent: true,
        apiKey,
      });
      let accumulated = '';
      for await (const chunk of stream) {
        accumulated += chunk.text ?? '';
        const snap = accumulated;
        setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, text: snap } : m)));
      }
    } catch (e) {
      setMessages([...messages, userMsg]);
      setError(e.message ?? 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }, [loading, messages, unit]);

  const handleSend = useCallback(() => {
    const text = input.trim();
    if (text) doSend(text);
  }, [doSend, input]);

  return (
    <div className="unit-chat">
      <div className="unit-chat__header">
        <span className="unit-chat__title">Chat</span>
        <button type="button" onClick={onClose} className="unit-chat__close" aria-label="Close chat">
          <CloseIcon />
        </button>
      </div>
      <div className="unit-chat__messages">
        {messages.length === 0 && (
          <p className="unit-chat__empty">Ask anything about this item.</p>
        )}
        {messages.map((msg) => (
          <div key={msg.id} className={`unit-chat__msg unit-chat__msg--${msg.role}`}>
            {msg.text ? (
              msg.role === 'user'
                ? <p className="unit-chat__msg-text">{msg.text}</p>
                : <SimpleMarkdown text={msg.text} className="forage__markdown" />
            ) : (
              <div className="forage__response-loading">
                <span className="note-field__spinner" />
                <span>Thinking…</span>
              </div>
            )}
            {loading && msg.role === 'assistant' && msg.text && (
              <span className="forage__cursor" aria-hidden="true">▋</span>
            )}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>
      {error && <p className="unit-chat__error">{error}</p>}
      <div className="unit-chat__input-row">
        <NoteTray
          className="unit-chat__note-tray"
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
