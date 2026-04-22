import { useEffect, useState } from 'react';
import { CloseIcon } from './Icons';

export default function ImageLightbox({ src, alt, caption, onClose, replayKey }) {
  const [imgSrc, setImgSrc] = useState(null);

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  // Create a fresh Blob URL each open so the browser treats it as a new resource,
  // forcing GIF animation to restart from frame 1.
  useEffect(() => {
    if (!src) return;
    let url;
    if (src.startsWith('data:')) {
      const [header, b64] = src.split(',');
      const mime = header.match(/:(.*?);/)?.[1] ?? 'image/gif';
      const bytes = atob(b64);
      const arr = new Uint8Array(bytes.length);
      for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
      url = URL.createObjectURL(new Blob([arr], { type: mime }));
      setImgSrc(url);
    } else {
      setImgSrc(src);
    }
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [src, replayKey]);

  if (!imgSrc) return null;

  return (
    <div className="lightbox" onClick={onClose}>
      <button type="button" className="lightbox__close" onClick={onClose} aria-label="Close">
        <CloseIcon />
      </button>
      <div className="lightbox__content" onClick={(e) => e.stopPropagation()}>
        <img src={imgSrc} alt={alt} className="lightbox__img" />
        {caption && (
          <p className="lightbox__caption">{caption}</p>
        )}
      </div>
    </div>
  );
}
