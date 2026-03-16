/**
 * NoteField — voice-or-text quote input (controlled)
 *
 * Props:
 *   value      string   current quote (controlled by parent)
 *   onChange   fn       (newValue: string) => void
 *   disabled   bool     disables all interactions (e.g. during save)
 */
import { useState, useRef, useEffect } from 'react';
import { MicIcon } from './Icons';
import { getSetting } from '../utils/db';
import { transcribeAudio } from '../utils/transcribe';

const MAX_REC_SECS = 10;

export default function NoteField({ value, onChange, disabled = false }) {
  const [noteMode, setNoteMode] = useState('voice');
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
          setRecState('done');
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

  function discard() {
    onChange('');
    setRecState('idle');
    setCountdown(MAX_REC_SECS);
    setLocalError('');
  }

  function switchMode(mode) {
    // Going to voice: clear value (fresh recording will set it)
    // Going to text: keep value so user can edit the existing quote
    if (mode === 'voice') onChange('');
    setNoteMode(mode);
    setLocalError('');
  }

  const canToggleMode = recState !== 'recording' && recState !== 'transcribing';

  return (
    <div className="add-unit__voice">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: (value || localError) ? 8 : 0 }}>
        {noteMode === 'voice' ? (
          recState === 'transcribing' ? (
            <p style={{ fontSize: 12, color: '#737373', margin: 0 }}>Transcribing…</p>
          ) : (
            <button
              type="button"
              className={`add-unit__mic-btn${recState === 'recording' ? ' add-unit__mic-btn--active' : ''}`}
              onClick={recState === 'recording' ? stopRecording : startRecording}
              disabled={disabled}
              aria-label={recState === 'recording' ? 'Stop recording' : 'Record voice note'}
            >
              <MicIcon active={recState === 'recording'} />
              {recState === 'recording'
                ? `Stop · ${countdown}s`
                : recState === 'done'
                  ? 'Re-record'
                  : 'Voice note'}
            </button>
          )
        ) : (
          <input
            type="text"
            className="connect-input"
            placeholder="Type a note…"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            style={{ flex: 1 }}
          />
        )}

        {canToggleMode && (
          <button
            type="button"
            style={{ fontSize: 11, color: '#525252', background: 'none', border: 'none', cursor: 'pointer', padding: 0, whiteSpace: 'nowrap' }}
            onClick={() => switchMode(noteMode === 'voice' ? 'text' : 'voice')}
            disabled={disabled}
          >
            {noteMode === 'voice' ? 'type instead' : 'voice instead'}
          </button>
        )}
      </div>

      {noteMode === 'voice' && value && recState !== 'transcribing' && (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
          <p className="add-unit__quote" style={{ flex: 1, margin: 0 }}>
            <span className="add-unit__quote-mark">"</span>
            {value}
          </p>
          <button
            type="button"
            style={{ fontSize: 11, color: '#525252', background: 'none', border: 'none', cursor: 'pointer', padding: 0, lineHeight: 1 }}
            onClick={discard}
            aria-label="Discard note"
          >
            ×
          </button>
        </div>
      )}

      {localError && <p className="modal__error" style={{ marginTop: 4 }}>{localError}</p>}
    </div>
  );
}
