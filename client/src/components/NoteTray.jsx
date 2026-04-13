/**
 * NoteTray — unified note input with two modes:
 *
 * mic-hero (touch devices, default):
 *   Large breathing mic orb + "Tap to speak" + "← type instead"
 *   Swipe left → text-hero
 *
 * text-hero (desktop default, or after swipe):
 *   [small mic btn] [textarea] [✦ share toggle]
 *   Quick starter chips below when empty
 *   Swipe right (when empty) → mic-hero
 *
 * recording (any mode):
 *   Full-width waveform strip — tap to stop
 *
 * transcribing:
 *   Collapses to text-hero with spinner in mic btn, disabled input
 *   Note populates once done
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import { getSetting } from '../utils/db';
import { transcribeAudio } from '../utils/transcribe';

const MAX_REC_SECS = 60;
const BARS = 28;

function isTouchDevice() {
  return true; //typeof window !== 'undefined' &&
    window.matchMedia('(hover: none) and (pointer: coarse)').matches;
}

export default function NoteTray({
  value,
  onChange,
  onSubmit,
  className = '',
  disabled = false,
  transcribeFn,
  shareContent,
  onShareToggle,
  hasContent = false,
  placeholder = 'add a note…',
  defaultMode = isTouchDevice() ? 'mic-hero' : 'text-hero',
}) {
  const [mode, setMode] = useState(() => defaultMode);
  const [exitingMic, setExitingMic] = useState(false);
  const [recState, setRecState] = useState('idle'); // idle | recording | transcribing
  const [localError, setLocalError] = useState('');

  const recorderRef   = useRef(null);
  const chunksRef     = useRef([]);
  const elapsedRef    = useRef(0);
  const recTimerRef   = useRef(null);
  const canvasRef     = useRef(null);
  const animFrameRef  = useRef(null);
  const analyserRef   = useRef(null);
  const textareaRef   = useRef(null);
  const shouldFocus   = useRef(false);

  // Auto-switch to text-hero when value is set externally (e.g. quick-prompt chip)
  useEffect(() => {
    if (value && mode === 'mic-hero') {
      setMode('text-hero');
    }
  }, [value]);

  useEffect(() => () => {
    clearInterval(recTimerRef.current);
    cancelAnimationFrame(animFrameRef.current);
  }, []);

  // Focus textarea when switching to text-hero manually
  useEffect(() => {
    if (mode === 'text-hero' && shouldFocus.current) {
      shouldFocus.current = false;
      setTimeout(() => textareaRef.current?.focus(), 60);
    }
  }, [mode]);

  // ── Waveform ─────────────────────────────────────────────────────────────────

  const drawLoop = useCallback(() => {
    const canvas  = canvasRef.current;
    const analyser = analyserRef.current;
    if (!canvas || !analyser) return;
    const ctx  = canvas.getContext('2d');
    const data = new Uint8Array(analyser.frequencyBinCount);

    function frame() {
      animFrameRef.current = requestAnimationFrame(frame);
      analyser.getByteFrequencyData(data);
      const { width: w, height: h } = canvas;
      ctx.clearRect(0, 0, w, h);
      const step = Math.floor(data.length / BARS);
      const barW = (w / BARS) * 0.5;
      const gapW = (w / BARS) * 0.5;
      for (let i = 0; i < BARS; i++) {
        const v  = data[i * step] / 255;
        const bh = Math.max(4, v * h * 0.85);
        const x  = i * (barW + gapW) + gapW / 2;
        const y  = (h - bh) / 2;
        ctx.fillStyle = `rgba(248, 113, 113, ${0.3 + v * 0.7})`;
        ctx.beginPath();
        ctx.roundRect(x, y, barW, bh, 2);
        ctx.fill();
      }
    }
    frame();
  }, []);

  // Start draw loop only after canvas is mounted (recState → 'recording' triggers re-render first)
  useEffect(() => {
    if (recState === 'recording') drawLoop();
  }, [recState, drawLoop]);

  // ── Recording lifecycle ───────────────────────────────────────────────────────

  async function startRecording() {
    if (disabled || recState !== 'idle') return;
    setLocalError('');
    elapsedRef.current = 0;

    try {
      const stream   = await navigator.mediaDevices.getUserMedia({ audio: true });
      const audioCtx = new AudioContext();
      const src      = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 128;
      src.connect(analyser);
      analyserRef.current = analyser;

      chunksRef.current = [];
      const rec = new MediaRecorder(stream);
      recorderRef.current = rec;

      rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        cancelAnimationFrame(animFrameRef.current);
        clearInterval(recTimerRef.current);

        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        // Switch to text-hero so user sees the result land
        setMode('text-hero');
        setRecState('transcribing');
        try {
          const apiKey    = await getSetting('gemini_key');
          if (!apiKey) throw new Error('No Gemini key — add it in Settings.');
          const transcript = await (transcribeFn ?? transcribeAudio)(blob, apiKey);
          onChange(transcript);
          setRecState('idle');
        } catch (err) {
          setLocalError(err.message || 'Transcription failed.');
          setRecState('idle');
        }
      };

      rec.start();
      navigator.vibrate?.(40);
      setRecState('recording');

      recTimerRef.current = setInterval(() => {
        elapsedRef.current += 1;
        if (elapsedRef.current >= MAX_REC_SECS) recorderRef.current?.stop();
      }, 1000);
    } catch {
      setLocalError('Microphone access denied.');
    }
  }

  function stopRecording() {
    if (recorderRef.current?.state === 'recording') {
      navigator.vibrate?.(40);
      recorderRef.current.stop();
    }
  }

  // ── Mode switching ────────────────────────────────────────────────────────────

  function switchToTextMode() {
    shouldFocus.current = true;
    setExitingMic(true);
    setTimeout(() => {
      setMode('text-hero');
      setExitingMic(false);
    }, 140);
  }

  // ── Derived ───────────────────────────────────────────────────────────────────

  const isRec          = recState === 'recording';
  const isTranscribing = recState === 'transcribing';

  // ── Render: recording (waveform takeover) ────────────────────────────────────

  if (isRec) {
    return (
      <div className={`note-tray${className ? ` ${className}` : ''}`}>
        <div
          className="note-tray__wave-zone"
          onClick={stopRecording}
          role="button"
          aria-label="Tap to stop recording"
        >
          <canvas
            ref={canvasRef}
            className="note-tray__waveform"
            width={600}
            height={44}
            aria-hidden="true"
          />
          <p className="note-tray__wave-hint">Tap to stop</p>
        </div>
      </div>
    );
  }

  // ── Render: mic-hero ─────────────────────────────────────────────────────────

  if (mode === 'mic-hero') {
    return (
      <div
        className={`note-tray note-tray--mic-hero${exitingMic ? ' note-tray--mic-exit' : ''}${className ? ` ${className}` : ''}`}
      >
        {/* Three-column stage: swipe hint | orb + hint | empty */}
        <div className="note-tray__mic-stage">

          {/* Left: tap-to-type affordance */}
          <button
            type="button"
            className="note-tray__swipe-left"
            onClick={switchToTextMode}
            aria-label="Tap to type a note"
          >
            <PencilIcon />
            <span className="note-tray__swipe-label">tap to type</span>
          </button>

          {/* Center: orb + hint stacked together */}
          <div className="note-tray__center-col">
            <button
              type="button"
              className={`note-tray__orb${isTranscribing ? ' note-tray__orb--busy' : ''}`}
              onClick={startRecording}
              disabled={disabled || isTranscribing}
              aria-label="Tap to record note"
            >
              {isTranscribing ? <span className="note-tray__spinner" /> : <MicIcon size={52} />}
            </button>
            <p className="note-tray__hint">
              {isTranscribing ? 'Transcribing…' : ''}
            </p>
          </div>

          {/* Right: empty column — keeps orb visually centered */}
          <div className="note-tray__mic-stage-right" />
        </div>

        {localError && <p className="modal__error" style={{ margin: '4px 0 0', textAlign: 'center' }}>{localError}</p>}
      </div>
    );
  }

  // ── Render: text-hero ────────────────────────────────────────────────────────

  return (
    <div
      className={`note-tray note-tray--text-hero${className ? ` ${className}` : ''}`}
    >
      <div className="note-tray__row">
        <button
          type="button"
          className={`note-tray__mic-btn${isTranscribing ? ' note-tray__mic-btn--busy' : ''}`}
          onClick={startRecording}
          disabled={disabled || isTranscribing}
          aria-label="Tap to record"
        >
          {isTranscribing
            ? <span className="note-tray__spinner note-tray__spinner--sm" />
            : <MicIcon size={52} />}
        </button>

        <textarea
          ref={textareaRef}
          className={`note-tray__input${value ? ' note-tray__input--has-value' : ''}`}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && onSubmit) {
              e.preventDefault();
              onSubmit();
            }
          }}
          disabled={disabled || isTranscribing}
          rows={1}
        />

        {/* share-content toggle — disabled for now
        {hasContent && (
          <button
            type="button"
            className="note-tray__share-btn"
            onClick={onShareToggle}
            disabled={disabled}
            title={shareContent ? 'Sharing content with AI' : 'Share content with AI'}
          >
            <span className={`note-tray__sparkle${shareContent ? ' note-tray__sparkle--on' : ''}`}>✦</span>
          </button>
        )}
        */}
      </div>

      {localError && <p className="modal__error" style={{ margin: '4px 0 0' }}>{localError}</p>}
    </div>
  );
}

function MicIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="2" width="6" height="11" rx="3" />
      <path d="M5 10a7 7 0 0 0 14 0" />
      <line x1="12" y1="19" x2="12" y2="22" />
      <line x1="8" y1="22" x2="16" y2="22" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
    </svg>
  );
}
