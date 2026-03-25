/**
 * NoteField — tap-to-start / tap-waveform-to-stop voice note (controlled)
 *
 * Interaction:
 *   idle      → tap mic orb  → recording (waveform strip expands, mic shrinks)
 *   recording → tap strip    → transcribing → pending (3s countdown)
 *   pending   → tap input    → cancel countdown, edit manually
 *
 * Props:
 *   value                string   current note (controlled by parent)
 *   onChange             fn       (newValue: string) => void
 *   disabled             bool
 *   onTranscriptionDone  fn       (transcript: string) => void
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import { getSetting } from '../utils/db';
import { transcribeAudio } from '../utils/transcribe';

const MAX_REC_SECS = 60;
const AUTO_SAVE_SECS = 3;
const BARS = 30;

export default function NoteField({ value, onChange, disabled = false, onTranscriptionDone }) {
  const [recState, setRecState] = useState('idle'); // idle | recording | transcribing | pending
  const [saveCountdown, setSaveCountdown] = useState(AUTO_SAVE_SECS);
  const [localError, setLocalError] = useState('');

  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const elapsedRef = useRef(0);
  const recTimerRef = useRef(null);
  const saveTimerRef = useRef(null);
  const pendingTranscriptRef = useRef('');
  const canvasRef = useRef(null);
  const animFrameRef = useRef(null);
  const analyserRef = useRef(null);

  useEffect(() => () => {
    clearInterval(recTimerRef.current);
    clearInterval(saveTimerRef.current);
    cancelAnimationFrame(animFrameRef.current);
  }, []);

  // ── Waveform drawing ─────────────────────────────────────────────────────────

  const drawLoop = useCallback(() => {
    const canvas = canvasRef.current;
    const analyser = analyserRef.current;
    if (!canvas || !analyser) return;
    const ctx = canvas.getContext('2d');
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
        const v = data[i * step] / 255;
        const bh = Math.max(4, v * h * 0.85);
        const x = i * (barW + gapW) + gapW / 2;
        const y = (h - bh) / 2;
        ctx.fillStyle = `rgba(248, 113, 113, ${0.3 + v * 0.7})`;
        ctx.beginPath();
        ctx.roundRect(x, y, barW, bh, 2);
        ctx.fill();
      }
    }
    frame();
  }, []);

  // ── Recording lifecycle ──────────────────────────────────────────────────────

  async function startRecording() {
    if (disabled || recState !== 'idle') return;
    setLocalError('');
    elapsedRef.current = 0;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const audioCtx = new AudioContext();
      const src = audioCtx.createMediaStreamSource(stream);
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
        setRecState('transcribing');
        try {
          const apiKey = await getSetting('gemini_key');
          if (!apiKey) throw new Error('No Gemini key — add it in Settings.');
          const transcript = await transcribeAudio(blob, apiKey);
          onChange(transcript);
          startSaveCountdown(transcript);
        } catch (err) {
          setLocalError(err.message || 'Transcription failed.');
          setRecState('idle');
        }
      };

      rec.start();
      navigator.vibrate?.(40);
      setRecState('recording');
      drawLoop();

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

  // ── Pending countdown ────────────────────────────────────────────────────────

  function startSaveCountdown(transcript) {
    pendingTranscriptRef.current = transcript;
    setSaveCountdown(AUTO_SAVE_SECS);
    setRecState('pending');

    let left = AUTO_SAVE_SECS;
    saveTimerRef.current = setInterval(() => {
      left -= 1;
      setSaveCountdown(left);
      if (left <= 0) {
        clearInterval(saveTimerRef.current);
        setRecState('idle');
        onTranscriptionDone?.(pendingTranscriptRef.current);
      }
    }, 1000);
  }

  function cancelSaveCountdown() {
    if (recState !== 'pending') return;
    clearInterval(saveTimerRef.current);
    pendingTranscriptRef.current = '';
    setRecState('idle');
  }

  // ── Derived state ────────────────────────────────────────────────────────────

  const isRec = recState === 'recording';
  const isTranscribing = recState === 'transcribing';
  const isPending = recState === 'pending';

  let hint = 'Tap to speak';
  if (isRec) hint = 'Tap to stop';
  else if (isTranscribing) hint = 'Transcribing…';
  else if (isPending) hint = `Saving in ${saveCountdown}s · tap to edit`;

  return (
    <div className="note-field">

      {/* ── Voice zone: mic orb ↔ waveform strip ── */}
      <div className="note-field__zone">

        {/* Waveform strip — expands when recording, tap to stop */}
        <div
          className={`note-field__wave-wrap${isRec ? ' note-field__wave-wrap--open' : ''}`}
          onClick={isRec ? stopRecording : undefined}
          role={isRec ? 'button' : undefined}
          aria-label={isRec ? 'Tap to stop recording' : undefined}
        >
          <canvas
            ref={canvasRef}
            className="note-field__waveform"
            width={300}
            height={72}
            aria-hidden="true"
          />
        </div>

        {/* Mic orb — shrinks away when recording */}
        <button
          type="button"
          className={[
            'note-field__mic',
            isRec && 'note-field__mic--hidden',
            isTranscribing && 'note-field__mic--transcribing',
            isPending && 'note-field__mic--pending',
          ].filter(Boolean).join(' ')}
          onClick={startRecording}
          disabled={disabled || isTranscribing || isPending || isRec}
          aria-label="Tap to record note"
        >
          {isTranscribing
            ? <span className="note-field__spinner" />
            : <MicIcon />}
        </button>

      </div>

      {/* Hint — fades between states */}
      <p key={hint} className={`note-field__hint${isPending ? ' note-field__hint--pending' : ''}`}>
        {hint}
      </p>

      {/* Text input — fallback for manual entry, or to edit transcript */}
      <textarea
        className={[
          'note-field__input',
          value && 'note-field__input--has-value',
          isPending && 'note-field__input--pending',
        ].filter(Boolean).join(' ')}
        placeholder="or type a note…"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={cancelSaveCountdown}
        disabled={disabled || isRec || isTranscribing}
      />

      {localError && <p className="modal__error" style={{ marginTop: 4 }}>{localError}</p>}
    </div>
  );
}

function MicIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="2" width="6" height="11" rx="3" />
      <path d="M5 10a7 7 0 0 0 14 0" />
      <line x1="12" y1="19" x2="12" y2="22" />
      <line x1="8" y1="22" x2="16" y2="22" />
    </svg>
  );
}
