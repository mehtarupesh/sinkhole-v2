/**
 * ForageModal — ask AI a question about a category's units.
 *
 * Props:
 *   category    { id, title, uids }  the selected category
 *   allUnits    Unit[]               full unit list (filtered internally by uids)
 *   onClose     fn                   close handler
 *   onSaveUnit  fn(uid, categoryId)  called after response is saved as a new unit
 */
import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { CloseIcon, CheckIcon } from './Icons';
import { getSetting, addUnit } from '../utils/db';
import { forageUnits } from '../utils/forage';
import NoteTray from './NoteTray';
import { CarouselCard } from './Carousel';
import './ForageModal.css';

// ── Simple inline markdown renderer (no external deps) ───────────────────────

function parseBold(str) {
  const parts = str.split(/\*\*(.*?)\*\*/g);
  return parts.map((p, i) =>
    i % 2 === 1 ? <strong key={i}>{p}</strong> : p
  );
}

function SimpleMarkdown({ text }) {
  const elements = [];
  let listItems = [];

  const flushList = (key) => {
    if (listItems.length > 0) {
      elements.push(<ul key={`ul-${key}`}>{listItems}</ul>);
      listItems = [];
    }
  };

  text.split('\n').forEach((line, i) => {
    if (line.startsWith('## ')) {
      flushList(i);
      elements.push(<h3 key={i} className="forage__md-h3">{line.slice(3)}</h3>);
    } else if (line.startsWith('# ')) {
      flushList(i);
      elements.push(<h2 key={i} className="forage__md-h2">{line.slice(2)}</h2>);
    } else if (/^[-*] /.test(line)) {
      listItems.push(<li key={i}>{parseBold(line.slice(2))}</li>);
    } else if (line.trim() === '') {
      flushList(i);
      if (elements.length > 0) elements.push(<div key={i} className="forage__md-gap" />);
    } else {
      flushList(i);
      elements.push(<p key={i} className="forage__md-p">{parseBold(line)}</p>);
    }
  });
  flushList('end');

  return <div className="forage__markdown">{elements}</div>;
}

// ── Quick prompt suggestions ──────────────────────────────────────────────────

const QUICK_PROMPTS = [
  'Summarize',
  'Key points',
  'Action items',
];

// ── ForageModal ───────────────────────────────────────────────────────────────

export default function ForageModal({ category, allUnits, onClose, onSaveUnit }) {
  const [question, setQuestion]       = useState('');
  const [shareContent, setShareContent] = useState(false);
  const [response, setResponse]       = useState('');
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState('');
  const [saveState, setSaveState]     = useState(''); // '' | 'saving' | 'done'
  const bodyRef = useRef(null);

  const categoryUnits = useMemo(
    () => allUnits.filter((u) => category.uids.includes(u.uid)),
    [allUnits, category.uids]
  );
  // Show content toggle when any non-password unit has content (images or text)
  const hasShareableContent = useMemo(
    () => categoryUnits.some((u) => u.type !== 'password' && u.content),
    [categoryUnits]
  );

  const runForage = useCallback(async (q) => {
    setLoading(true);
    setResponse('');
    setError('');
    setSaveState('');
    try {
      const apiKey = await getSetting('gemini_key');
      const stream = await forageUnits({ units: categoryUnits, question: q, shareContent, apiKey });
      let text = '';
      for await (const chunk of stream) {
        text += chunk.text ?? '';
        setResponse(text);
      }
    } catch (e) {
      setError(e.message ?? 'Forage failed.');
    } finally {
      setLoading(false);
    }
  }, [categoryUnits, shareContent]);

  const handleAsk = useCallback(() => {
    if (!question.trim() || loading) return;
    runForage(question);
  }, [question, loading, runForage]);

  const handleQuickPrompt = useCallback((prompt) => {
    if (loading) return;
    setQuestion(prompt);
  }, [loading]);

  const handleSaveAsUnit = useCallback(async () => {
    if (!response || saveState) return;
    setSaveState('saving');
    try {
      const { uid } = await addUnit({
        type: 'snippet',
        content: response,
        quote: question,
      });
      setSaveState('done');
      onSaveUnit?.(uid, category.id);
      setTimeout(onClose, 400);
    } catch {
      setSaveState('');
    }
  }, [response, question, category, saveState, onSaveUnit]);

  // Scroll body to bottom whenever content changes
  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [response, loading, error]);

  // Auto-dismiss response after save — mirrors AddUnitModal's post-save close delay
  useEffect(() => {
    if (saveState !== 'done') return;
    const id = setTimeout(() => { setResponse(''); setSaveState(''); }, 1500);
    return () => clearTimeout(id);
  }, [saveState]);

  const canAsk = question.trim().length > 0 && !loading;

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal add-unit-modal forage-modal" onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="modal__header">
          <div className="forage__title-wrap">
            <span className="modal__title">Forage</span>
            <span className="forage__category-pill">{category.title}</span>
            <span className="modal__count">{categoryUnits.length}</span>
          </div>
          <button className="btn-close" onClick={onClose} aria-label="Close">
            <CloseIcon />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="add-unit__body" ref={bodyRef}>

          {/* Unit strip — reuses CarouselCard for full visual consistency */}
          <div className="carousel__row forage__strip">
            {categoryUnits.map((u) => (
              <CarouselCard key={u.id} unit={u} onClick={() => {}} selected={false} />
            ))}
          </div>

          {/* Question input — primary: voice + text */}
          <NoteTray
            value={question}
            onChange={setQuestion}
            disabled={loading}
            placeholder="Ask something specific…"
          />

          {/* Quick prompt chips — secondary shortcuts */}
          <div className="forage__quick-prompts">
            <span className="forage__quick-label">or try</span>
            {QUICK_PROMPTS.map((prompt) => (
              <button
                key={prompt}
                className={`forage__quick-chip${question === prompt ? ' forage__quick-chip--active' : ''}`}
                onClick={() => handleQuickPrompt(prompt)}
                disabled={loading}
                type="button"
              >
                {prompt}
              </button>
            ))}
          </div>

          {/* Response — appears after the user has committed to a question */}
          {(response || (loading && !response)) && (
            <div className="forage__response">
              {loading && !response ? (
                <div className="forage__response-loading">
                  <span className="note-field__spinner" />
                  <span>Foraging…</span>
                </div>
              ) : (
                <>
                  <SimpleMarkdown text={response} />
                  {loading && <span className="forage__cursor" aria-hidden="true">▋</span>}
                </>
              )}
              {!loading && response && (
                <div className="forage__response-footer">
                  <button
                    className="forage__dismiss-btn"
                    onClick={() => { setResponse(''); setSaveState(''); }}
                    type="button"
                  >
                    Dismiss
                  </button>
                  <button
                    className={`forage__save-btn${saveState === 'done' ? ' forage__save-btn--done' : ''}`}
                    onClick={handleSaveAsUnit}
                    disabled={!!saveState}
                    type="button"
                  >
                    {saveState === 'done'
                      ? <><CheckIcon /> Saved</>
                      : saveState === 'saving'
                        ? 'Saving…'
                        : 'Save'}
                  </button>
                </div>
              )}
            </div>
          )}

          {error && <p className="modal__error">{error}</p>}
        </div>

        {/* AI scope toggle — sits above the Forage button to localize the decision */}
        {hasShareableContent && (
          <button
            className={`forage__content-row${shareContent ? ' forage__content-row--on' : ''}`}
            onClick={() => setShareContent((s) => !s)}
            type="button"
            disabled={loading}
          >
            <div className="forage__content-row-left">
              <span className="forage__content-row-title">
                ✦ Also send content to AI
              </span>
              <span className="forage__content-row-desc">
                {shareContent
                  ? 'AI will read your images and full text.'
                  : 'By default AI only reads your notes. Enable to also share images and text.'}
              </span>
            </div>
            <span className="forage__content-row-badge">
              {shareContent ? 'On' : 'Off'}
            </span>
          </button>
        )}

        {/* Actions */}
        <div className="add-unit__actions">
          <button
            className="add-unit__cancel-btn"
            onClick={onClose}
            type="button"
          >
            Close
          </button>
          <button
            className={`add-unit__cancel-btn add-unit__cancel-btn--primary forage__ask-btn${!canAsk ? ' forage__ask-btn--disabled' : ''}`}
            onClick={handleAsk}
            disabled={!canAsk}
            type="button"
          >
            {loading ? 'Foraging…' : 'Forage ✦'}
          </button>
        </div>

      </div>
    </div>
  );
}
