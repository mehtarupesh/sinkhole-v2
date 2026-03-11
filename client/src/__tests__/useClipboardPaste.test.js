import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useClipboardPaste } from '../hooks/useClipboardPaste';

function makePasteEvent(overrides = {}) {
  return new Event('paste', { bubbles: true, ...overrides });
}

function fireWithClipboard(items) {
  const event = makePasteEvent();
  event.clipboardData = {
    items: items.map(({ kind, type, value }) => ({
      kind,
      type,
      getAsFile: () => (kind === 'file' ? value : null),
      getAsString: (cb) => { if (kind === 'string') cb(value); },
    })),
  };
  event.preventDefault = vi.fn();
  document.dispatchEvent(event);
  return event;
}

describe('useClipboardPaste', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls onPaste with snippet type for plain text', () => {
    const onPaste = vi.fn();
    renderHook(() => useClipboardPaste(onPaste));
    fireWithClipboard([{ kind: 'string', type: 'text/plain', value: 'hello world' }]);
    expect(onPaste).toHaveBeenCalledWith({ type: 'snippet', content: 'hello world' });
  });

  it('does not call onPaste for empty/whitespace text', () => {
    const onPaste = vi.fn();
    renderHook(() => useClipboardPaste(onPaste));
    fireWithClipboard([{ kind: 'string', type: 'text/plain', value: '   ' }]);
    expect(onPaste).not.toHaveBeenCalled();
  });

  it('calls onPaste with image type for file items', () => {
    const onPaste = vi.fn();
    renderHook(() => useClipboardPaste(onPaste));

    const mockFile = new File(['data'], 'photo.png', { type: 'image/png' });
    const readAsDataURL = vi.fn().mockImplementation(function () {
      this.onload?.({ target: { result: 'data:image/png;base64,abc' } });
    });
    vi.spyOn(global, 'FileReader').mockImplementation(function () {
      this.readAsDataURL = readAsDataURL;
    });

    fireWithClipboard([{ kind: 'file', type: 'image/png', value: mockFile }]);

    expect(onPaste).toHaveBeenCalledWith({
      type: 'image',
      content: 'data:image/png;base64,abc',
      fileName: 'photo.png',
      mimeType: 'image/png',
    });
  });

  it('does not call onPaste when disabled', () => {
    const onPaste = vi.fn();
    renderHook(() => useClipboardPaste(onPaste, { disabled: true }));
    fireWithClipboard([{ kind: 'string', type: 'text/plain', value: 'hello' }]);
    expect(onPaste).not.toHaveBeenCalled();
  });

  it('does not intercept paste when an input has focus', () => {
    const onPaste = vi.fn();
    renderHook(() => useClipboardPaste(onPaste));

    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();

    fireWithClipboard([{ kind: 'string', type: 'text/plain', value: 'hello' }]);
    expect(onPaste).not.toHaveBeenCalled();

    document.body.removeChild(input);
  });

  it('removes the event listener on unmount', () => {
    const onPaste = vi.fn();
    const spy = vi.spyOn(document, 'removeEventListener');
    const { unmount } = renderHook(() => useClipboardPaste(onPaste));
    unmount();
    expect(spy).toHaveBeenCalledWith('paste', expect.any(Function));
  });
});
