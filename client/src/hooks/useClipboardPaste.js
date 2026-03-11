import { useEffect } from 'react';

/**
 * Listens for paste events (Cmd/Ctrl+V) on the document.
 * Skips when an input or textarea already has focus.
 * Calls onPaste with { type, content, fileName?, mimeType? }.
 */
export function useClipboardPaste(onPaste, { disabled = false } = {}) {
  useEffect(() => {
    if (disabled) return;

    const handler = (e) => {
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      const items = Array.from(e.clipboardData?.items || []);

      const fileItem = items.find((i) => i.kind === 'file');
      if (fileItem) {
        const file = fileItem.getAsFile();
        if (!file) return;
        e.preventDefault();
        const reader = new FileReader();
        reader.onload = ({ target: { result } }) =>
          onPaste({ type: 'image', content: result, fileName: file.name, mimeType: file.type });
        reader.readAsDataURL(file);
        return;
      }

      const textItem = items.find((i) => i.kind === 'string' && i.type === 'text/plain');
      if (textItem) {
        e.preventDefault();
        textItem.getAsString((text) => {
          if (text.trim()) onPaste({ type: 'snippet', content: text });
        });
      }
    };

    document.addEventListener('paste', handler);
    return () => document.removeEventListener('paste', handler);
  }, [onPaste, disabled]);
}
