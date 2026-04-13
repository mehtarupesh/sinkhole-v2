import { useState, useRef, useCallback, useEffect } from 'react';
import { CloseIcon, TrashIcon, CheckIcon } from './Icons';
import Linkify from './Linkify';
import './CleanupModal.css';

const SWIPE_THRESHOLD = 80; // px

function relativeDate(ts) {
  const diffMs = Date.now() - ts;
  const days = Math.floor(diffMs / 86400000);
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  if (days < 365) return `${Math.floor(days / 30)} months ago`;
  return `${Math.floor(days / 365)}y ago`;
}

function CardContent({ unit }) {
  const isImage = unit.type === 'image' && unit.mimeType?.startsWith('image/');
  const isFile = unit.type === 'image' && !unit.mimeType?.startsWith('image/');
  const noteOnly = !unit.content && unit.quote;

  return (
    <div className="cleanup-card__content">
      {isImage && (
        <img src={unit.content} alt={unit.fileName ?? 'image'} className="cleanup-card__img" />
      )}
      {unit.encrypted ? (
        <p className="cleanup-card__text">{'•'.repeat(12)}</p>
      ) : unit.type === 'snippet' && !noteOnly ? (
        <p className="cleanup-card__text">
          <Linkify>{unit.content}</Linkify>
        </p>
      ) : null}
      {isFile && (
        <p className="cleanup-card__text">{unit.fileName}</p>
      )}
      {noteOnly ? (
        <p className="cleanup-card__text">{unit.quote}</p>
      ) : (
        unit.quote && <p className="cleanup-card__quote">"{unit.quote}"</p>
      )}
    </div>
  );
}

export default function CleanupModal({ candidates: initialCandidates, storedGroups, onTrash, onKeep, onClose }) {
  // Snapshot on mount — prevents parent re-renders (from reloadUnits) from
  // mutating the list mid-animation and causing cards to skip or flash.
  const candidates = useRef(initialCandidates).current;

  const [index, setIndex] = useState(0);
  const [dx, setDx] = useState(0);
  const [cardClass, setCardClass] = useState('cleanup-card--top');
  const [results, setResults] = useState([]); // 'trash' | 'keep'
  const dragRef = useRef(null);
  const isAnimating = useRef(false);

  const isDone = index >= candidates.length;
  const current = candidates[index];
  const next = candidates[index + 1];

  const categoryLabel = current
    ? (storedGroups?.find((g) => g.id === current.categoryId)?.title ?? null)
    : null;

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const advance = useCallback((direction, action) => {
    if (isAnimating.current) return;
    isAnimating.current = true;

    if (action === 'trash') onTrash(candidates[index]);
    else if (action === 'keep') onKeep(candidates[index]);
    setResults((r) => [...r, action]);

    // Fly the card off screen
    setDx(direction * 700);
    setCardClass('cleanup-card--top cleanup-card--flying');

    setTimeout(() => {
      setDx(0);
      setCardClass('cleanup-card--top');
      setIndex((i) => i + 1);
      isAnimating.current = false;
    }, 380);
  }, [candidates, index, onTrash]);

  const handleTrash = useCallback(() => advance(-1, 'trash'), [advance]);
  const handleKeep = useCallback(() => advance(1, 'keep'), [advance]);

  const onPointerDown = useCallback((e) => {
    if (isAnimating.current) return;
    dragRef.current = { startX: e.clientX };
    e.currentTarget.setPointerCapture(e.pointerId);
    setCardClass('cleanup-card--top'); // no transition while dragging
  }, []);

  const onPointerMove = useCallback((e) => {
    if (!dragRef.current) return;
    setDx(e.clientX - dragRef.current.startX);
  }, []);

  const onPointerUp = useCallback((e) => {
    if (!dragRef.current) return;
    const delta = e.clientX - dragRef.current.startX;
    dragRef.current = null;

    if (delta < -SWIPE_THRESHOLD) {
      handleTrash();
    } else if (delta > SWIPE_THRESHOLD) {
      handleKeep();
    } else {
      // Snap back
      setCardClass('cleanup-card--top cleanup-card--snapping');
      setDx(0);
      setTimeout(() => setCardClass('cleanup-card--top'), 300);
    }
  }, [handleTrash, handleKeep]);

  const onPointerCancel = useCallback(() => {
    dragRef.current = null;
    setCardClass('cleanup-card--top cleanup-card--snapping');
    setDx(0);
    setTimeout(() => setCardClass('cleanup-card--top'), 300);
  }, []);

  const trashedCount = results.filter((r) => r === 'trash').length;
  const keepHintOpacity = Math.min(1, Math.max(0, dx / SWIPE_THRESHOLD));
  const trashHintOpacity = Math.min(1, Math.max(0, -dx / SWIPE_THRESHOLD));
  const rotate = dx * 0.07;

  return (
    <div className="overlay" onClick={onClose}>
      <div className="cleanup-modal" onClick={(e) => e.stopPropagation()}>
        <div className="cleanup-modal__header">
          <span className="cleanup-modal__title">Stash or Trash?</span>
          <button type="button" className="btn-icon" onClick={onClose} aria-label="Close">
            <CloseIcon />
          </button>
        </div>

        {!isDone ? (
          <>
            <div className="cleanup-modal__progress">
              <div
                className="cleanup-modal__progress-bar"
                style={{ width: `${(index / candidates.length) * 100}%` }}
              />
            </div>
            <p className="cleanup-modal__count">{index + 1} of {candidates.length}</p>

            <div className="cleanup-modal__stack">
              {next && (
                <div className="cleanup-card cleanup-card--behind">
                  <CardContent unit={next} />
                </div>
              )}

              <div
                className={`cleanup-card ${cardClass}`}
                style={{ transform: `translateX(${dx}px) rotate(${rotate}deg)` }}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerCancel}
              >
                <div
                  className="cleanup-card__hint cleanup-card__hint--keep"
                  style={{ opacity: keepHintOpacity }}
                >
                  KEEP
                </div>
                <div
                  className="cleanup-card__hint cleanup-card__hint--trash"
                  style={{ opacity: trashHintOpacity }}
                >
                  TRASH
                </div>

                <CardContent unit={current} />

                <div className="cleanup-card__meta">
                  {categoryLabel && (
                    <span className="cleanup-card__cat">{categoryLabel}</span>
                  )}
                  <div className="cleanup-card__stats">
                    <div className="cleanup-card__stat">
                      <span className="cleanup-card__stat-label">Stashed</span>
                      <span className="cleanup-card__stat-value cleanup-card__stat-value--age">
                        {relativeDate(current.createdAt)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="cleanup-modal__actions">
              <button
                type="button"
                className="cleanup-btn cleanup-btn--trash"
                onClick={handleTrash}
                title="Move to Trash"
                aria-label="Trash"
              >
                <TrashIcon />
                <span>Trash</span>
              </button>
              <button
                type="button"
                className="cleanup-btn cleanup-btn--keep"
                onClick={handleKeep}
                title="Keep"
                aria-label="Keep"
              >
                <CheckIcon size={22} />
                <span>Keep</span>
              </button>
            </div>

            <p className="cleanup-modal__hint">← trash · keep →</p>
          </>
        ) : (
          <div className="cleanup-modal__done">
            <div className="cleanup-modal__done-icon">🧹</div>
            <h2 className="cleanup-modal__done-title">Burrow clean!</h2>
            <p className="cleanup-modal__done-sub">
              {trashedCount === 0
                ? 'You kept everything. The burrow stays cozy.'
                : `Moved ${trashedCount} item${trashedCount !== 1 ? 's' : ''} to Trash.`}
            </p>
            <button type="button" className="btn--primary" onClick={onClose}>
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
