import { useState, useRef, useEffect, useCallback } from 'react';
import { ImageTypeIcon, CopyIcon, CheckIcon } from './Icons';
import ImageLightbox from './ImageLightbox';

/**
 * Renders the type-specific content input (snippet / password / image)
 * and a labeled "Share with AI ✦" toggle row below when content exists.
 *
 * Props:
 *   type           'snippet' | 'password' | 'image'
 *   content        string
 *   fileName       string
 *   mimeType       string
 *   onTextChange   (text: string) => void       — snippet / password
 *   onFileSelected ({ content, fileName, mimeType }) => void  — image
 *   shareContent   bool
 *   onShareToggle  () => void
 *   shareBlinking  bool   — blinks to prompt user to share something
 *   disabled       bool
 */
export default function ContentField({
  type, content, fileName, mimeType,
  onTextChange, onFileSelected,
  shareContent, onShareToggle, shareBlinking,
  disabled,
}) {
  const [showPassword, setShowPassword] = useState(false);
  const [showLightbox, setShowLightbox] = useState(false);
  const [copied, setCopied] = useState(false);

  const copyTimerRef = useRef(null);
  const fileRef = useRef(null);
  const textareaRef = useRef(null);

  const hasContent = type === 'image' ? !!content : !!content.trim();

  // Auto-resize textarea to fit its content
  const resizeTextarea = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, []);

  useEffect(() => { resizeTextarea(); }, [content, resizeTextarea]);

  const handleCopy = async () => {
    if (!content) return;
    try {
      await navigator.clipboard.writeText(content);
      clearTimeout(copyTimerRef.current);
      setCopied(true);
      copyTimerRef.current = setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard unavailable */ }
  };

  const handleFileInputChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ({ target: { result } }) =>
      onFileSelected({ content: result, fileName: file.name, mimeType: file.type });
    reader.readAsDataURL(file);
  };

  const shareLabel = type === 'password' && shareContent
    ? 'Sharing password with AI · sensitive'
    : shareContent
    ? 'Sharing with AI'
    : 'Share with AI';

  return (
    <div className="content-field">

      {type === 'snippet' && (
        <div className="add-unit__content-wrap">
          <textarea
            ref={textareaRef}
            className="add-unit__textarea"
            placeholder="Enter text…"
            value={content}
            onChange={(e) => onTextChange(e.target.value)}
            disabled={disabled}
            autoFocus
          />
          {content && (
            <button
              type="button"
              className={`add-unit__copy-btn${copied ? ' add-unit__copy-btn--copied' : ''}`}
              onClick={handleCopy}
              aria-label="Copy to clipboard"
            >
              {copied ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
            </button>
          )}
        </div>
      )}

      {type === 'password' && (
        <div className="add-unit__password-wrap">
          <input
            type={showPassword ? 'text' : 'password'}
            className="add-unit__password-input"
            placeholder="Enter password…"
            value={content}
            onChange={(e) => onTextChange(e.target.value)}
            disabled={disabled}
            autoFocus
          />
          <div className="add-unit__password-btns">
            {content && (
              <button
                type="button"
                className={`add-unit__copy-btn${copied ? ' add-unit__copy-btn--copied' : ''}`}
                onClick={handleCopy}
                aria-label="Copy to clipboard"
              >
                {copied ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
              </button>
            )}
            <button
              type="button"
              className="add-unit__password-toggle"
              onClick={() => setShowPassword((v) => !v)}
            >
              {showPassword ? 'Hide' : 'Show'}
            </button>
          </div>
        </div>
      )}

      {type === 'image' && (
        <div className="add-unit__file-area">
          {!content && (
            <button
              type="button"
              className="add-unit__drop-zone"
              onClick={() => fileRef.current?.click()}
            >
              <ImageTypeIcon />
              <span>Choose a file</span>
            </button>
          )}
          {content && mimeType?.startsWith('image/') && (
            <button
              type="button"
              className="add-unit__preview-btn"
              onClick={() => setShowLightbox(true)}
              aria-label="View full image"
            >
              <img src={content} alt={fileName} className="add-unit__preview" />
            </button>
          )}
          {content && !mimeType?.startsWith('image/') && (
            <p className="add-unit__file-name">{fileName}</p>
          )}
          {content && (
            <button
              type="button"
              className="add-unit__change-file"
              onClick={() => fileRef.current?.click()}
            >
              Choose Different File
            </button>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/*,*"
            style={{ display: 'none' }}
            onChange={handleFileInputChange}
          />
          {showLightbox && content && mimeType?.startsWith('image/') && (
            <ImageLightbox src={content} alt={fileName} onClose={() => setShowLightbox(false)} />
          )}
        </div>
      )}

      {/* Labeled "Share with AI ✦" toggle — appears below content when content exists */}
      {hasContent && (
        <button
          type="button"
          className={[
            'content-field__share-row',
            shareContent && 'content-field__share-row--on',
            shareBlinking && 'content-field__share-row--blink',
          ].filter(Boolean).join(' ')}
          onClick={onShareToggle}
          disabled={disabled}
        >
          <span className="content-field__share-sparkle">✦</span>
          <span className="content-field__share-label">{shareLabel}</span>
        </button>
      )}

    </div>
  );
}
