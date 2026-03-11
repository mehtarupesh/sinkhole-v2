import { useState, useEffect, useRef } from 'react';

/**
 * Listens for file/text drops anywhere on the document.
 * Returns isDragging so the page can show a drop indicator.
 * Calls onDrop with { type, content, fileName?, mimeType? }.
 */
export function useDrop(onDrop, { disabled = false } = {}) {
  const [isDragging, setIsDragging] = useState(false);
  const counter = useRef(0);

  useEffect(() => {
    if (disabled) return;

    const handleDragEnter = (e) => {
      e.preventDefault();
      counter.current += 1;
      setIsDragging(true);
    };

    const handleDragOver = (e) => {
      e.preventDefault();
    };

    const handleDragLeave = () => {
      counter.current -= 1;
      if (counter.current === 0) setIsDragging(false);
    };

    const handleDrop = (e) => {
      e.preventDefault();
      counter.current = 0;
      setIsDragging(false);

      const files = Array.from(e.dataTransfer.files);
      if (files.length > 0) {
        const file = files[0];
        const reader = new FileReader();
        reader.onload = ({ target: { result } }) =>
          onDrop({ type: 'image', content: result, fileName: file.name, mimeType: file.type });
        reader.readAsDataURL(file);
        return;
      }

      const text = e.dataTransfer.getData('text/plain');
      if (text?.trim()) onDrop({ type: 'snippet', content: text });
    };

    document.addEventListener('dragenter', handleDragEnter);
    document.addEventListener('dragover', handleDragOver);
    document.addEventListener('dragleave', handleDragLeave);
    document.addEventListener('drop', handleDrop);
    return () => {
      document.removeEventListener('dragenter', handleDragEnter);
      document.removeEventListener('dragover', handleDragOver);
      document.removeEventListener('dragleave', handleDragLeave);
      document.removeEventListener('drop', handleDrop);
    };
  }, [onDrop, disabled]);

  return isDragging;
}
