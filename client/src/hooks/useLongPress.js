import { useRef, useCallback } from 'react';

const LONG_PRESS_MS = 500;

/**
 * Returns event handlers to spread onto any pressable element.
 * Long press (LONG_PRESS_MS) fires onLongPress and suppresses the following click.
 * Short tap passes through to onClick normally.
 * Both props are optional — omit onLongPress for a plain click passthrough.
 */
export function useLongPress({ onClick, onLongPress } = {}) {
  const timerRef = useRef(null);
  const firedRef = useRef(false);

  const handlePointerDown = useCallback(() => {
    if (!onLongPress) return;
    firedRef.current = false;
    timerRef.current = setTimeout(() => {
      firedRef.current = true;
      onLongPress();
    }, LONG_PRESS_MS);
  }, [onLongPress]);

  const cancel = useCallback(() => clearTimeout(timerRef.current), []);

  const handleClick = useCallback((e) => {
    if (firedRef.current) { firedRef.current = false; return; }
    onClick?.(e);
  }, [onClick]);

  return {
    onPointerDown: handlePointerDown,
    onPointerUp:    cancel,
    onPointerLeave: cancel,
    onPointerCancel: cancel,
    onClick: handleClick,
    // Suppress the native context menu that browsers fire on long press
    onContextMenu: useCallback((e) => { if (onLongPress) e.preventDefault(); }, [onLongPress]),
  };
}
