/**
 * NoteField — voice + text quote input (controlled)
 *
 * Props:
 *   value      string   current quote (controlled by parent)
 *   onChange   fn       (newValue: string) => void
 *   disabled   bool     disables all interactions (e.g. during save)
 */
import { useState, useRef, useEffect } from 'react';
import { MicIcon, StopIcon } from './Icons';
import { getSetting } from '../utils/db';
import { transcribeAudio } from '../utils/transcribe';

const MAX_REC_SECS = 10;

export default function NoteField({ value, onChange, disabled = false }) {
  const [recState, setRecState] = useState('idle'); // idle | recording | transcribing | done
  const [countdown, setCountdown] = useState(MAX_REC_SECS);
  const [localError, setLocalError] = useState('');
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);

  useEffect(() => () => clearInterval(timerRef.current), []);

  async function startRecording() {
    setLocalError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunksRef.current = [];
      const rec = new MediaRecorder(stream);
      recorderRef.current = rec;

      rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        clearInterval(timerRef.current);
        setCountdown(MAX_REC_SECS);
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        setRecState('transcribing');
        try {
          const apiKey = await getSetting('gemini_key');
          if (!apiKey) throw new Error('No API key — add your Gemini key in Settings.');
          const transcript = await transcribeAudio(blob, apiKey);
          onChange(transcript);
          setRecState('idle');
        } catch (err) {
          setLocalError(err.message || 'Transcription failed.');
          setRecState('idle');
        }
      };

      rec.start();
      setRecState('recording');
      let left = MAX_REC_SECS;
      setCountdown(left);
      timerRef.current = setInterval(() => {
        left -= 1;
        setCountdown(left);
        if (left <= 0) { clearInterval(timerRef.current); rec.stop(); }
      }, 1000);
    } catch {
      setLocalError('Microphone access denied.');
    }
  }

  function stopRecording() {
    clearInterval(timerRef.current);
    recorderRef.current?.stop();
  }

  const busy = recState === 'recording' || recState === 'transcribing';

  return (
    <div className="note-field">
      <input
        type="text"
        className={`note-field__input${value ? ' note-field__input--has-value' : ''}`}
        placeholder={recState === 'transcribing' ? 'Transcribing…' : 'Add a note…'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled || busy}
      />

      <div className="note-field__rec-row">
        {recState === 'recording' ? (
          <>
            <button
              type="button"
              className="note-field__rec-circle note-field__rec-circle--stop"
              onClick={stopRecording}
              disabled={disabled}
              aria-label="Stop recording"
            >
              <StopIcon size={18} />
            </button>
            <span className="note-field__countdown">{countdown}s</span>
          </>
        ) : (
          <button
            type="button"
            className="note-field__rec-circle"
            onClick={startRecording}
            disabled={disabled || recState === 'transcribing'}
            aria-label="Record voice note"
          >
            <MicIcon size={22} />
          </button>
        )}
      </div>

      {localError && <p className="modal__error" style={{ marginTop: 4 }}>{localError}</p>}
    </div>
  );
}
