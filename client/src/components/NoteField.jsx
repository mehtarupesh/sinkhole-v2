/**
 * NoteField — hold-to-record voice note with live waveform (controlled)
 *
 * Props:
 *   value                string   current note (controlled by parent)
 *   onChange             fn       (newValue: string) => void
 *   disabled             bool     disables all interactions
 *   onTranscriptionDone  fn       (transcript: string) => void — called after auto-save countdown
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import { getSetting } from '../utils/db';
import { transcribeAudio } from '../utils/transcribe';

const MAX_REC_SECS = 60;
const AUTO_SAVE_SECS = 3;
const BARS = 28;
const RADIUS = 31;
const CIRC = 2 * Math.PI * RADIUS;

export default function NoteField({ value, onChange, disabled = false, onTranscriptionDone }) {
  const [recState, setRecState] = useState('idle'); // idle | recording | transcribing | pending
  const [elapsed, setElapsed] = useState(0);
  const [saveCountdown, setSaveCountdown] = useState(AUTO_SAVE_SECS);
  const [localError, setLocalError] = useState('');

  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  const saveTimerRef = useRef(null);
  const pendingTranscriptRef = useRef('');
  const canvasRef = useRef(null);
  const animFrameRef = useRef(null);
  const analyserRef = useRef(null);

  useEffect(() => () => {
    clearInterval(timerRef.current);
    clearInterval(saveTimerRef.current);
    cancelAnimationFrame(animFrameRef.current);
  }, []);

  // Start 3s auto-save countdown after transcription
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

  // User taps the input while pending — cancel auto-save so they can edit
  function cancelSaveCountdown() {
    if (recState !== 'pending') return;
    clearInterval(saveTimerRef.current);
    pendingTranscriptRef.current = '';
    setRecState('idle');
  }

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
      const barW = (w / BARS) * 0.55;
      const gapW = (w / BARS) * 0.45;
      for (let i = 0; i < BARS; i++) {
        const v = data[i * step] / 255;
        const bh = Math.max(3, v * h * 0.88);
        const x = i * (barW + gapW) + gapW / 2;
        const y = (h - bh) / 2;
        ctx.fillStyle = `rgba(248, 113, 113, ${0.35 + v * 0.65})`;
        ctx.beginPath();
        ctx.roundRect(x, y, barW, bh, 2);
        ctx.fill();
      }
    }
    frame();
  }, []);

  async function startRecording() {
    setLocalError('');
    setElapsed(0);
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
        clearInterval(timerRef.current);
        setElapsed(0);

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
      setRecState('recording');
      drawLoop();

      timerRef.current = setInterval(() => {
        setElapsed((prev) => {
          if (prev + 1 >= MAX_REC_SECS) {
            recorderRef.current?.stop();
            return 0;
          }
          return prev + 1;
        });
      }, 1000);
    } catch {
      setLocalError('Microphone access denied.');
    }
  }

  function stopRecording() {
    if (recorderRef.current?.state === 'recording') {
      recorderRef.current.stop();
    }
  }

  function handlePointerDown(e) {
    if (disabled || recState !== 'idle') return;
    e.preventDefault();
    startRecording();
  }

  function handlePointerUp() {
    if (recState === 'recording') stopRecording();
  }

  const isRec = recState === 'recording';
  const isTranscribing = recState === 'transcribing';
  const isPending = recState === 'pending';
  const dashFill = CIRC * (elapsed / MAX_REC_SECS);

  let hint = 'Hold to speak';
  if (isRec) hint = 'Release to save';
  else if (isTranscribing) hint = 'Transcribing…';
  else if (isPending) hint = `Saving in ${saveCountdown}s · tap to edit`;

  return (
    <div className="note-field">
      {/* Live waveform — slides in during recording */}
      <canvas
        ref={canvasRef}
        className={`note-field__waveform${isRec ? ' note-field__waveform--visible' : ''}`}
        width={280}
        height={48}
        aria-hidden="true"
      />

      {/* Mic button with SVG arc progress ring */}
      <div className="note-field__mic-wrap">
        <svg className="note-field__arc" viewBox="0 0 72 72" aria-hidden="true">
          <circle className="note-field__arc-track" cx="36" cy="36" r={RADIUS} />
          {isRec && (
            <circle
              className="note-field__arc-fill"
              cx="36"
              cy="36"
              r={RADIUS}
              strokeDasharray={`${dashFill} ${CIRC}`}
            />
          )}
        </svg>

        <button
          type="button"
          className={`note-field__mic-btn${isRec ? ' note-field__mic-btn--recording' : ''}${isTranscribing ? ' note-field__mic-btn--transcribing' : ''}${isPending ? ' note-field__mic-btn--pending' : ''}`}
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
          onContextMenu={(e) => e.preventDefault()}
          disabled={disabled || isTranscribing || isPending}
          aria-label={isRec ? 'Release to save note' : 'Hold to record note'}
        >
          {isTranscribing ? (
            <span className="note-field__spinner" />
          ) : (
            <MicIcon filled={isRec} />
          )}
        </button>
      </div>

      <p className={`note-field__hint${isPending ? ' note-field__hint--pending' : ''}`}>
        {hint}
      </p>

      <input
        type="text"
        className={`note-field__input${value ? ' note-field__input--has-value' : ''}${isPending ? ' note-field__input--pending' : ''}`}
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

function MicIcon({ filled }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="2" width="6" height="11" rx="3" fill={filled ? 'currentColor' : 'none'} />
      <path d="M5 10a7 7 0 0 0 14 0" />
      <line x1="12" y1="19" x2="12" y2="22" />
      <line x1="8" y1="22" x2="16" y2="22" />
    </svg>
  );
}
