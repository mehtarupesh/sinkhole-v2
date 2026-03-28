import { useState, useRef, useEffect, useCallback } from 'react';
import { ImageTypeIcon, CameraIcon, CopyIcon, CheckIcon } from './Icons';
import ImageLightbox from './ImageLightbox';

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
  type, content, fileName, mimeType,
  onTextChange, onFileSelected,
  disabled,
}) {
  const [showPassword, setShowPassword] = useState(false);
  const [showLightbox, setShowLightbox] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showCamera, setShowCamera] = useState(false);

  const copyTimerRef = useRef(null);
  const fileRef = useRef(null);
  const cameraRef = useRef(null);
  const textareaRef = useRef(null);
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  // Auto-resize textarea to fit its content
  const resizeTextarea = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, []);

  useEffect(() => { resizeTextarea(); }, [content, resizeTextarea]);

  // Start camera stream when showCamera becomes true
  useEffect(() => {
    if (!showCamera) return;
    let active = true;
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'environment' }, audio: false })
      .then((stream) => {
        if (!active) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
      })
      .catch(() => {
        // Permission denied or unavailable — fall back to file input
        if (active) {
          setShowCamera(false);
          cameraRef.current?.click();
        }
      });
    return () => {
      active = false;
      streamRef.current?.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    };
  }, [showCamera]);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    setShowCamera(false);
  }, []);

  const handleCapture = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
    stopCamera();
    onFileSelected({ content: dataUrl, fileName: 'photo.jpg', mimeType: 'image/jpeg' });
  }, [stopCamera, onFileSelected]);

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
            <div className="add-unit__upload-row">
              <button
                type="button"
                className="add-unit__upload-option"
                onClick={() => setShowCamera(true)}
              >
                <CameraIcon />
                <span>Take photo</span>
              </button>
              <button
                type="button"
                className="add-unit__upload-option"
                onClick={() => fileRef.current?.click()}
              >
                <ImageTypeIcon />
                <span>Choose file</span>
              </button>
            </div>
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
            <div className="add-unit__reupload-row">
              <button
                type="button"
                className="add-unit__change-file"
                onClick={() => fileRef.current?.click()}
              >
                Choose Different File
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
            <ImageLightbox src={content} alt={fileName} onClose={() => setShowLightbox(false)} />
          )}
        </div>
      )}

      {showCamera && (
        <div className="camera-overlay">
          <video
            ref={videoRef}
            className="camera-overlay__video"
            autoPlay
            playsInline
            muted
          />
          <div className="camera-overlay__controls">
            <button
              type="button"
              className="camera-overlay__cancel"
              onClick={stopCamera}
            >
              Cancel
            </button>
            <button
              type="button"
              className="camera-overlay__shutter"
              onClick={handleCapture}
              aria-label="Take photo"
            />
          </div>
        </div>
      )}

    </div>
  );
}
