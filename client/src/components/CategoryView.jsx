/**
 * CategoryView — full-screen view for a single category.
 *
 * Two binary views: 'grid' (browsable cards) and 'chat' (inline AI chat).
 * Animated spring slide between them. Chat persists via chat_cache.
 *
 * Props:
 *   category     { id, title, uids }
 *   allUnits     Unit[]
 *   storedGroups { id, title }[]
 *   accessOrder  []
 *   onClose      fn
 *   onUnitSaved  fn(updated?, newCategory?)
 */
import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { ChevronLeftIcon, ChevronRightIcon, TrashIcon, MoveFolderIcon, AiChatIcon } from './Icons';
import { CarouselCard } from './Carousel';
import { groupByTime } from '../utils/timeGroups';
import { updateUnit, getChatCache, setCategorization } from '../utils/db';
import { TRASH_ID, addCategoryIfNew } from '../utils/carouselGroups';
import CategoryChat from './CategoryChat';
import AddUnitModal from './AddUnitModal';
import UnitDetail from './UnitDetail';
import ConfirmDeleteModal from './ConfirmDeleteModal';
import MoveToCategoryModal from './MoveToCategoryModal';
import SelectionBar from './SelectionBar';
import { useSelection } from '../hooks/useSelection';
import './CategoryView.css';

// ── Stats ─────────────────────────────────────────────────────────────────────

function computeStats(units) {
  if (!units.length) return null;
  const now = Date.now();
  const latest  = Math.max(...units.map((u) => u.createdAt ?? 0));
  const diffDays = Math.floor((now - latest) / 86_400_000);
  const lastAdded = diffDays === 0 ? 'today' : diffDays === 1 ? 'yesterday' : `${diffDays}d ago`;
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
  const thisMonth = units.filter((u) => (u.createdAt ?? 0) >= monthStart).length;
  const monthStat = thisMonth > 0 ? `${thisMonth} item${thisMonth !== 1 ? 's' : ''} this month` : null;
  return { lastAdded, monthStat };
}

export default function CategoryView({ category, allUnits, storedGroups, accessOrder = [], onClose, onUnitSaved }) {
  const units = useMemo(
    () => allUnits.filter((u) => category.uids.includes(u.uid)),
    [allUnits, category.uids]
  );

  // View state
  const [view, setView]           = useState('grid'); // 'grid' | 'chat'
  const [chatUnits, setChatUnits] = useState(null);   // null = all units, Unit[] = subset

  // New-items-since-last-chat hint
  const [chatCacheUnitCount, setChatCacheUnitCount] = useState(null);

  // Unit detail state
  const [selectedCtx, setSelectedCtx] = useState(null); // { units, index }

  // Selection / action bar
  const { selected, isSelecting, toggle, enterWith, selectAll, clear } = useSelection();
  const [pendingDelete, setPendingDelete] = useState(null);
  const [moveCtx, setMoveCtx]             = useState(null);
  const [showAddModal, setShowAddModal]   = useState(false);

  const swipeStartY   = useRef(null);
  const gridSwipeStart = useRef(null);

  // ── Load chat cache unitCount on mount ───────────────────────────────────────

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const cache = await getChatCache();
      const entry = cache[category.id];
      if (!cancelled && entry) setChatCacheUnitCount(entry.unitCount ?? null);
    }
    load();
    return () => { cancelled = true; };
  }, [category.id]);

  const newItemsSinceChat = chatCacheUnitCount !== null ? units.length - chatCacheUnitCount : 0;

  // ── Visually ordered units (for prev/next nav) ───────────────────────────────

  const visuallyOrdered = useMemo(
    () => groupByTime(units).flatMap(({ units: g }) => g),
    [units]
  );

  const currentUnit = selectedCtx ? selectedCtx.units[selectedCtx.index] : null;
  const hasPrev = selectedCtx && selectedCtx.index > 0;
  const hasNext = selectedCtx && selectedCtx.index < selectedCtx.units.length - 1;

  // ── Keyboard ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    const handler = (e) => {
      if (e.key !== 'Escape') return;
      if (isSelecting)  { clear(); return; }
      if (selectedCtx)  { setSelectedCtx(null); return; }
      onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose, selectedCtx, isSelecting, clear]);

  useEffect(() => {
    if (!selectedCtx) return;
    const handler = (e) => {
      const el = document.activeElement;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
      if (e.key === 'ArrowLeft')  setSelectedCtx((c) => c && c.index > 0 ? { ...c, index: c.index - 1 } : c);
      if (e.key === 'ArrowRight') setSelectedCtx((c) => c && c.index < c.units.length - 1 ? { ...c, index: c.index + 1 } : c);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [selectedCtx]);

  // ── Swipe right on grid pane to close ───────────────────────────────────────

  const handleGridTouchStart = (e) => {
    gridSwipeStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };

  const handleGridTouchEnd = (e) => {
    if (!gridSwipeStart.current) return;
    const dx = e.changedTouches[0].clientX - gridSwipeStart.current.x;
    const dy = Math.abs(e.changedTouches[0].clientY - gridSwipeStart.current.y);
    gridSwipeStart.current = null;
    if (dx > 80 && dx > dy * 1.5) { navigator.vibrate?.(10); onClose(); }
  };

  // ── Swipe right on chat pane to go back to grid ─────────────────────────────

  const chatSwipeStart = useRef(null);

  const handleChatTouchStart = (e) => {
    chatSwipeStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };

  const handleChatTouchEnd = (e) => {
    if (!chatSwipeStart.current) return;
    const dx = e.changedTouches[0].clientX - chatSwipeStart.current.x;
    const dy = Math.abs(e.changedTouches[0].clientY - chatSwipeStart.current.y);
    chatSwipeStart.current = null;
    if (dx > 80 && dx > dy * 1.5) { navigator.vibrate?.(10); setView('grid'); setChatUnits(null); }
  };

  // ── Bulk actions ─────────────────────────────────────────────────────────────

  const unitActions = [
    {
      icon: <TrashIcon />,
      label: 'Delete',
      onClick: () => {
        const toDelete = units.filter((u) => selected.has(u.id));
        const n = toDelete.length;
        setPendingDelete({
          title: `Delete ${n} item${n !== 1 ? 's' : ''}?`,
          units: toDelete,
          onConfirm: async () => {
            for (const u of toDelete) await updateUnit(u.id, { categoryId: TRASH_ID });
            onUnitSaved?.();
            clear();
            setPendingDelete(null);
          },
        });
      },
    },
    {
      icon: <MoveFolderIcon />,
      label: 'Move to Category',
      onClick: () => setMoveCtx({ units: units.filter((u) => selected.has(u.id)) }),
    },
    {
      icon: <AiChatIcon size={18} />,
      label: 'Chat',
      onClick: () => {
        const sel = units.filter((u) => selected.has(u.id));
        if (!sel.length) return;
        setChatUnits(sel);
        setView('chat');
        clear();
      },
    },
  ];

  // ── Render ───────────────────────────────────────────────────────────────────

  const stats     = useMemo(() => computeStats(units), [units]);
  const timeGroups = useMemo(() => groupByTime(units), [units]);
  const isChat    = view === 'chat';

  return (
    <>
      <div className="search-overlay category-view">

        {/* Header */}
        <div className="category-view__header">
          <div className="category-view__title-wrap">
            <div className="category-view__title-row">
              <span className="category-view__title">{category.title}</span>
              <span className="category-view__count">{units.length}</span>
            </div>
            {stats && (
              <div className="category-view__stats">
                <span className="category-view__stat">Last added {stats.lastAdded}</span>
                {stats.monthStat && (
                  <span className="category-view__stat">{stats.monthStat}</span>
                )}
              </div>
            )}
          </div>
          <button
            type="button"
            className="category-view__done-btn"
            onClick={onClose}
          >
            Done
          </button>
        </div>

        {/* Animated stage */}
        <div className="category-view__stage">

          {/* Grid pane */}
          <div
            className={`category-view__pane category-view__pane--grid${isChat ? ' is-chat' : ''}`}
            onTouchStart={handleGridTouchStart}
            onTouchEnd={handleGridTouchEnd}
          >
            <div className="search-grid-wrap">
              {units.length === 0 ? (
                <p className="search-empty">No items</p>
              ) : (
                timeGroups.map(({ label, units: groupUnits }) => (
                  <div key={label} className="search-time-group">
                    {label && <h3 className="search-time-label">{label}</h3>}
                    <div className="search-grid">
                      {groupUnits.map((unit) => {
                        const i = visuallyOrdered.indexOf(unit);
                        return (
                          <CarouselCard
                            key={unit.id}
                            unit={unit}
                            selected={selected.has(unit.id)}
                            onClick={() => {
                              if (isSelecting) { toggle(unit.id); return; }
                              setSelectedCtx({ units: visuallyOrdered, index: i >= 0 ? i : 0 });
                            }}
                            onLongPress={() => enterWith(unit.id)}
                          />
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Mode bar — add + chat */}
            <div className="category-view__mode-bar">
              {newItemsSinceChat > 0 && (
                <p className="category-view__new-hint">
                  ✦ {newItemsSinceChat} new item{newItemsSinceChat !== 1 ? 's' : ''} since last chat
                </p>
              )}
              <div className="category-view__mode-bar-row">
                <button
                  type="button"
                  className="category-view__add-btn"
                  onClick={() => setShowAddModal(true)}
                >
                  + Add
                </button>
                <button
                  type="button"
                  className="category-view__chat-btn"
                  onClick={() => setView('chat')}
                >
                  Chat ✦
                </button>
              </div>
            </div>
          </div>

          {/* Chat pane */}
          <div
            className={`category-view__pane category-view__pane--chat${isChat ? ' is-chat' : ''}`}
            onTouchStart={handleChatTouchStart}
            onTouchEnd={handleChatTouchEnd}
          >
            <div className="category-view__chat-back">
              <button
                type="button"
                className="category-view__chat-back-btn"
                onClick={() => { setView('grid'); setChatUnits(null); }}
              >
                <ChevronLeftIcon /> Grid
              </button>
              {chatUnits ? (
                <span className="category-view__chat-ctx">{chatUnits.length} selected</span>
              ) : (
                <span className="category-view__chat-ctx">{category.title}</span>
              )}
            </div>
            {isChat && (
              <CategoryChat
                category={category}
                units={chatUnits ?? units}
                onSaveUnit={onUnitSaved}
                onCacheSaved={(count) => setChatCacheUnitCount(count)}
              />
            )}
          </div>

        </div>

        {/* Selection bar */}
        {isSelecting && (
          <SelectionBar
            count={selected.size}
            total={units.length}
            onSelectAll={() => selectAll(units.map((u) => u.id))}
            onClear={clear}
            actions={unitActions}
          />
        )}

      </div>

      {/* Unit detail overlay */}
      {selectedCtx && currentUnit && (
        <div className="overlay units-overlay" onClick={() => setSelectedCtx(null)}>
          <div className="unit-detail-wrap" onClick={(e) => e.stopPropagation()}>
            <div className="units-panel">
              <UnitDetail
                key={currentUnit.id}
                unit={currentUnit}
                onBack={() => setSelectedCtx(null)}
                onSaved={(updated, newCategory) => {
                  onUnitSaved?.(updated, newCategory);
                  setSelectedCtx(null);
                }}
                onDelete={async (id) => {
                  await updateUnit(id, { categoryId: TRASH_ID });
                  onUnitSaved?.();
                  setSelectedCtx(null);
                }}
                storedGroups={storedGroups}
                accessOrder={accessOrder}
              />
            </div>
            <div className="unit-detail-nav" data-testid="unit-detail-nav">
              <button
                type="button"
                className="btn-icon"
                onClick={() => setSelectedCtx((c) => c && c.index > 0 ? { ...c, index: c.index - 1 } : c)}
                disabled={!hasPrev}
                aria-label="Previous"
              >
                <ChevronLeftIcon />
              </button>
              <span className="unit-detail-nav__count">
                {selectedCtx.index + 1} / {selectedCtx.units.length}
              </span>
              <button
                type="button"
                className="btn-icon"
                onClick={() => setSelectedCtx((c) => c && c.index < c.units.length - 1 ? { ...c, index: c.index + 1 } : c)}
                disabled={!hasNext}
                aria-label="Next"
              >
                <ChevronRightIcon />
              </button>
            </div>
          </div>
        </div>
      )}

      {showAddModal && (
        <AddUnitModal
          onClose={() => setShowAddModal(false)}
          onSaved={(newCategory) => {
            onUnitSaved?.(undefined, newCategory);
            setShowAddModal(false);
          }}
          storedGroups={storedGroups}
          accessOrder={accessOrder}
          initialCategoryId={category.id}
        />
      )}

      {pendingDelete && (
        <ConfirmDeleteModal
          title={pendingDelete.title}
          exportUnits={pendingDelete.units}
          onConfirm={pendingDelete.onConfirm}
          onCancel={() => setPendingDelete(null)}
        />
      )}

      {moveCtx && (
        <MoveToCategoryModal
          count={moveCtx.units.length}
          groups={storedGroups.filter((g) => g.id !== TRASH_ID)}
          onMove={async (categoryId, newCategory) => {
            const resolvedId = categoryId === 'misc' ? null : categoryId;
            for (const u of moveCtx.units) await updateUnit(u.id, { categoryId: resolvedId });
            if (newCategory) setCategorization(addCategoryIfNew(storedGroups, newCategory));
            onUnitSaved?.();
            clear();
            setMoveCtx(null);
          }}
          onClose={() => setMoveCtx(null)}
        />
      )}
    </>
  );
}
