import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useDrop } from '../hooks/useDrop';

function fireDragEvent(type, overrides = {}) {
  const event = new Event(type, { bubbles: true });
  event.preventDefault = vi.fn();
  event.dataTransfer = { files: [], getData: () => '', ...overrides.dataTransfer };
  Object.assign(event, overrides);
  document.dispatchEvent(event);
  return event;
}

describe('useDrop', () => {
  beforeEach(() => vi.clearAllMocks());

  it('isDragging is false initially', () => {
    const { result } = renderHook(() => useDrop(vi.fn()));
    expect(result.current).toBe(false);
  });

  it('isDragging becomes true on dragenter', () => {
    const { result } = renderHook(() => useDrop(vi.fn()));
    act(() => { fireDragEvent('dragenter'); });
    expect(result.current).toBe(true);
  });

  it('isDragging returns to false when all drag enters have left', () => {
    const { result } = renderHook(() => useDrop(vi.fn()));
    act(() => { fireDragEvent('dragenter'); });
    act(() => { fireDragEvent('dragenter'); });
    act(() => { fireDragEvent('dragleave'); });
    expect(result.current).toBe(true);
    act(() => { fireDragEvent('dragleave'); });
    expect(result.current).toBe(false);
  });

  it('calls onDrop with snippet type for text drops', () => {
    const onDrop = vi.fn();
    renderHook(() => useDrop(onDrop));
    act(() => {
      fireDragEvent('drop', {
        dataTransfer: { files: [], getData: (type) => (type === 'text/plain' ? 'dropped text' : '') },
      });
    });
    expect(onDrop).toHaveBeenCalledWith({ type: 'snippet', content: 'dropped text' });
  });

  it('calls onDrop with image type for file drops', () => {
    const onDrop = vi.fn();
    renderHook(() => useDrop(onDrop));

    const mockFile = new File(['data'], 'file.png', { type: 'image/png' });
    vi.spyOn(global, 'FileReader').mockImplementation(function () {
      this.readAsDataURL = vi.fn().mockImplementation(function () {
        this.onload?.({ target: { result: 'data:image/png;base64,xyz' } });
      });
    });

    act(() => {
      fireDragEvent('drop', {
        dataTransfer: { files: [mockFile], getData: () => '' },
      });
    });

    expect(onDrop).toHaveBeenCalledWith({
      type: 'image',
      content: 'data:image/png;base64,xyz',
      fileName: 'file.png',
      mimeType: 'image/png',
    });
  });

  it('resets isDragging to false on drop', () => {
    const { result } = renderHook(() => useDrop(vi.fn()));
    act(() => { fireDragEvent('dragenter'); });
    expect(result.current).toBe(true);
    act(() => {
      fireDragEvent('drop', {
        dataTransfer: { files: [], getData: () => '' },
      });
    });
    expect(result.current).toBe(false);
  });

  it('does nothing when disabled', () => {
    const onDrop = vi.fn();
    const { result } = renderHook(() => useDrop(onDrop, { disabled: true }));
    act(() => { fireDragEvent('dragenter'); });
    expect(result.current).toBe(false);
    act(() => {
      fireDragEvent('drop', {
        dataTransfer: { files: [], getData: () => 'text' },
      });
    });
    expect(onDrop).not.toHaveBeenCalled();
  });

  it('removes event listeners on unmount', () => {
    const spy = vi.spyOn(document, 'removeEventListener');
    const { unmount } = renderHook(() => useDrop(vi.fn()));
    unmount();
    expect(spy).toHaveBeenCalledWith('dragenter', expect.any(Function));
    expect(spy).toHaveBeenCalledWith('drop', expect.any(Function));
  });
});
