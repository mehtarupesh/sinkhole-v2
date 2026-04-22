import { useState, useRef, useEffect, useCallback } from 'react';
import { ImageTypeIcon, CameraIcon, CopyIcon, CheckIcon } from './Icons';
import ImageLightbox from './ImageLightbox';
import SimpleMarkdown from './SimpleMarkdown';

/**
 * Renders the type-specific content input (snippet / password / image).
 *
 * Props:
 *   type           'snippet' | 'password' | 'image'
 *   content        string
 *   fileName       string
 *   mimeType       string
 *   onTextChange   (text: string) => void       — snippet / password
 *   onFileSelected ({ content, fileName, mimeType }) => void  — image
 *   disabled       bool
 */
export default function ContentField({
  type, content, fileName, mimeType, caption,
  onTextChange, onFileSelected,
  disabled,
}) {
  const [showPassword, setShowPassword] = useState(false);
  const [showLightbox, setShowLightbox] = useState(false);
  const [lightboxKey, setLightboxKey] = useState(0);
  const [copied, setCopied] = useState(false);
  const [isEditing, setIsEditing] = useState(!content);

  const copyTimerRef = useRef(null);
  const fileRef = useRef(null);
  const cameraRef = useRef(null);
  const textareaRef = useRef(null);

  // Auto-resize textarea to fit its content
  const resizeTextarea = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, []);

  useEffect(() => { resizeTextarea(); }, [content, isEditing, resizeTextarea]);

  // If content is cleared externally (e.g. type switch), return to edit mode
  useEffect(() => { if (!content) setIsEditing(true); }, [content]);

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

  return (
    <div className="content-field">

      {type === 'snippet' && (
        <div className="add-unit__content-wrap">
          {!isEditing && content ? (
            <>
              <div
                className="snippet__tap-to-edit"
                onClick={() => !disabled && setIsEditing(true)}
                role="button"
                tabIndex={disabled ? -1 : 0}
                aria-label="Tap to edit"
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setIsEditing(true); }}
              >
                <SimpleMarkdown text={content} className="snippet__markdown" />
              </div>
              <div className="snippet__view-btns">
                <button
                  type="button"
                  className={`add-unit__copy-btn${copied ? ' add-unit__copy-btn--copied' : ''}`}
                  onClick={handleCopy}
                  aria-label="Copy to clipboard"
                >
                  {copied ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
                </button>
              </div>
            </>
          ) : (
            <>
              <textarea
                ref={textareaRef}
                className="add-unit__textarea"
                placeholder="Enter text…"
                value={content}
                onChange={(e) => onTextChange(e.target.value)}
                onBlur={() => { if (content) setIsEditing(false); }}
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
            </>
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
            <div className="add-unit__upload-primary">
              <button
                type="button"
                className="add-unit__upload-main"
                onClick={() => cameraRef.current?.click()}
              >
                <CameraIcon />
                <span>Take photo</span>
              </button>
              <button
                type="button"
                className="add-unit__upload-secondary"
                onClick={() => fileRef.current?.click()}
              >
                or choose file
              </button>
            </div>
          )}
          {content && mimeType?.startsWith('image/') && (
            <>
              <p className="add-unit__preview-hint">Tap to view full image</p>
              <button
                type="button"
                className="add-unit__preview-btn"
                onClick={() => { setShowLightbox(true); setLightboxKey((k) => k + 1); }}
                aria-label="View full image"
              >
                <img src={content} alt={fileName} className="add-unit__preview" />
              </button>
            </>
          )}
          {content && !mimeType?.startsWith('image/') && (
            <p className="add-unit__file-name">{fileName}</p>
          )}
          {content && (
            <div className="add-unit__reupload-row">
              <button
                type="button"
                className="add-unit__change-file"
                onClick={() => fileRef.current?.click()}
              >
                Choose File
              </button>
              <button
                type="button"
                className="add-unit__change-file"
                onClick={() => cameraRef.current?.click()}
              >
                Retake photo
              </button>
            </div>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/*,*"
            style={{ display: 'none' }}
            onChange={handleFileInputChange}
          />
          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            style={{ display: 'none' }}
            onChange={handleFileInputChange}
          />
          {showLightbox && content && mimeType?.startsWith('image/') && (
            <ImageLightbox src={content} alt={fileName} caption={caption} onClose={() => setShowLightbox(false)} replayKey={lightboxKey} />
          )}
        </div>
      )}

    </div>
  );
}
