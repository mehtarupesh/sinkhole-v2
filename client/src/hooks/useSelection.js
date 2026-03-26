import { useState, useCallback } from 'react';

/**
 * Generic multi-select state for any list of string/number IDs.
 * isSelecting is true whenever at least one item is selected.
 */
export function useSelection() {
  const [selected, setSelected] = useState(() => new Set());

  const toggle = useCallback((id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  // Enter selection mode with a single item pre-selected (long press entry point)
  const enterWith = useCallback((id) => setSelected(new Set([id])), []);

  const selectAll = useCallback((ids) => setSelected(new Set(ids)), []);
  const clear     = useCallback(()    => setSelected(new Set()),    []);

  return { selected, isSelecting: selected.size > 0, toggle, enterWith, selectAll, clear };
}
