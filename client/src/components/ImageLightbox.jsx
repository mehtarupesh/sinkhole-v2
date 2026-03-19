import { useEffect } from 'react';
import { CloseIcon } from './Icons';

export default function ImageLightbox({ src, alt, onClose }) {
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div className="lightbox" onClick={onClose}>
      <button type="button" className="lightbox__close" onClick={onClose} aria-label="Close">
        <CloseIcon />
      </button>
      <img
        src={src}
        alt={alt}
        className="lightbox__img"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}
