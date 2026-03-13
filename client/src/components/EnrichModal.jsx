/**
 * EnrichModal — isolated component
 *
 * Props:
 *   onClose()          close the modal
 *   apiKey (optional)  Gemini API key; falls back to localStorage 'gemini_key'
 */
import { useState, useRef, useEffect } from 'react';
import { GoogleGenAI } from '@google/genai';

const MAX_REC_SECS = 10;
const MODEL = 'gemini-3-flash-preview';

// ─── tiny helpers ────────────────────────────────────────────────────────────

function blobToBase64(blob) {
  return new Promise((res) => {
    const r = new FileReader();
    r.onloadend = () => res(r.result.split(',')[1]);
    r.readAsDataURL(blob);
  });
}

// Render Gemini markdown-ish text as paragraphs
function RichText({ text }) {
  const paragraphs = text.split(/\n\n+/).filter(Boolean);
  return (
    <div>
      {paragraphs.map((p, i) => {
        // Bold **text**
        const parts = p.split(/(\*\*[^*]+\*\*)/g).map((part, j) =>
          part.startsWith('**') ? <strong key={j}>{part.slice(2, -2)}</strong> : part
        );
        return <p key={i} style={S.para}>{parts}</p>;
      })}
    </div>
  );
}

// ─── main component ───────────────────────────────────────────────────────────

export default function EnrichModal({ onClose, apiKey: apiKeyProp }) {
  // — content
  const [type, setType] = useState('snippet');
  const [content, setContent] = useState('');
  const [fileName, setFileName] = useState('');
  const [mimeType, setMimeType] = useState('');
  const [imgBase64, setImgBase64] = useState('');

  // — instruction
  const [instrMode, setInstrMode] = useState('voice'); // 'voice' | 'text'
  const [typedInstr, setTypedInstr] = useState('');

  // — recording
  const [recState, setRecState] = useState('idle'); // idle | recording | done
  const [countdown, setCountdown] = useState(MAX_REC_SECS);
  const [audioBlob, setAudioBlob] = useState(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);

  // — pipeline
  const [phase, setPhase] = useState('input'); // input | processing | result
  const [step, setStep] = useState('');
  const [transcript, setTranscript] = useState('');
  const [enriched, setEnriched] = useState('');
  const [error, setError] = useState('');

  // — api key setup
  const [geminiKey, setGeminiKey] = useState(
    () => apiKeyProp || localStorage.getItem('gemini_key') || ''
  );
  const [keyDraft, setKeyDraft] = useState('');
  const [showKeySetup, setShowKeySetup] = useState(false);

  useEffect(() => () => clearInterval(timerRef.current), []);

  // ── recording ──────────────────────────────────────────────────────────────

  async function startRecording() {
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunksRef.current = [];
      const rec = new MediaRecorder(stream);
      recorderRef.current = rec;

      rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        setAudioBlob(new Blob(chunksRef.current, { type: 'audio/webm' }));
        setRecState('done');
        setCountdown(MAX_REC_SECS);
        clearInterval(timerRef.current);
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
      setError('Microphone access denied.');
    }
  }

  function stopRecording() {
    clearInterval(timerRef.current);
    recorderRef.current?.stop();
  }

  function discardRecording() {
    setAudioBlob(null);
    setRecState('idle');
    setCountdown(MAX_REC_SECS);
  }

  // ── file pick ──────────────────────────────────────────────────────────────

  function handleFile(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFileName(f.name);
    setMimeType(f.type);
    const r = new FileReader();
    r.onload = ({ target: { result } }) => {
      setContent(result);
      setImgBase64(result.split(',')[1]);
    };
    r.readAsDataURL(f);
  }

  // ── enrich ─────────────────────────────────────────────────────────────────

  async function handleEnrich() {
    if (!geminiKey) { setShowKeySetup(true); return; }
    if (type === 'snippet' && !content.trim()) { setError('Add some content first.'); return; }
    if (type === 'image' && !imgBase64) { setError('Choose an image first.'); return; }

    setPhase('processing');
    setError('');

    try {
      const ai = new GoogleGenAI({ apiKey: geminiKey });
      let instruction = instrMode === 'text' ? typedInstr : '';

      // Step 1 — transcribe voice
      if (instrMode === 'voice' && audioBlob) {
        setStep('Transcribing voice note…');
        const b64 = await blobToBase64(audioBlob);
        const r = await ai.models.generateContent({
          model: MODEL,
          contents: [{
            role: 'user',
            parts: [
              { text: 'Transcribe this audio exactly. Return only the transcript, nothing else.' },
              { inlineData: { mimeType: 'audio/webm', data: b64 } },
            ],
          }],
        });
        instruction = r.text?.trim() || '';
        setTranscript(instruction);
      }

      // Step 2 — enrich
      setStep('Enriching your content…');

      const parts = [];
      let userMsg = '';
      if (instruction) userMsg += `My instruction: "${instruction}"\n\n`;
      userMsg += type === 'snippet'
        ? `Content:\n${content}`
        : `I've shared an image${fileName ? ` (${fileName})` : ''}.`;
      parts.push({ text: userMsg });
      if (type === 'image' && imgBase64) parts.push({ inlineData: { mimeType, data: imgBase64 } });

      const systemInstruction = instruction
        ? 'You are a personal intelligence assistant. Respond with a rich, actionable response based on the user\'s instruction. Be specific and concise (2–4 paragraphs). Avoid filler. Use **bold** for key terms only.'
        : 'You are a personal intelligence assistant. The user saved this content without a specific instruction — surface what is most useful, interesting, or actionable about it. 2–4 paragraphs. Avoid filler.';

      const er = await ai.models.generateContent({
        model: MODEL,
        contents: [{ role: 'user', parts }],
        config: { systemInstruction },
      });

      setEnriched(er.text?.trim() || '(No response)');
      setPhase('result');
    } catch (err) {
      setError(err?.message || 'Something went wrong. Check your API key.');
      setPhase('input');
    }
  }

  // ── key setup ──────────────────────────────────────────────────────────────

  function saveKey() {
    if (!keyDraft.trim()) return;
    localStorage.setItem('gemini_key', keyDraft.trim());
    setGeminiKey(keyDraft.trim());
    setShowKeySetup(false);
    setKeyDraft('');
  }

  function deleteKey() {
    localStorage.removeItem('gemini_key');
    setGeminiKey('');
    setKeyDraft('');
  }

  // ── render ─────────────────────────────────────────────────────────────────

  return (
    <div style={S.overlay} onClick={onClose}>
      <style>{CSS}</style>
      <div style={S.modal} onClick={(e) => e.stopPropagation()}>

        {/* ── key setup overlay ── */}
        {showKeySetup && (
          <div style={S.keySetup}>
            <p style={S.keyTitle}>Gemini API Key</p>
            <p style={S.keySub}>
              Get a free key at{' '}
              <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer" style={S.link}>
                aistudio.google.com
              </a>
            </p>
            <input
              style={S.keyInput}
              type="password"
              placeholder="Paste your key…"
              value={keyDraft}
              onChange={(e) => setKeyDraft(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && saveKey()}
              autoFocus
            />
            <button style={S.primaryBtn} onClick={saveKey}>Save key</button>
            {geminiKey && (
              <>
                <button style={S.ghostBtn} onClick={() => setShowKeySetup(false)}>Cancel</button>
                <button style={S.deleteKeyBtn} onClick={deleteKey}>Delete saved key</button>
              </>
            )}
          </div>
        )}

        {/* ── header ── */}
        <div style={S.header}>
          <span style={S.headerTitle}>
            {phase === 'result' ? 'Enriched' : 'Add + Enrich'}
          </span>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            {!showKeySetup && (
              <button style={S.keyBtn} onClick={() => setShowKeySetup(true)} title="API key">
                ⚙
              </button>
            )}
            <button style={S.closeBtn} onClick={onClose}>×</button>
          </div>
        </div>

        {/* ── processing ── */}
        {phase === 'processing' && (
          <div style={S.processingWrap}>
            <div className="em-spinner" />
            <p style={S.stepText}>{step}</p>
          </div>
        )}

        {/* ── result ── */}
        {phase === 'result' && (
          <div style={S.resultWrap}>
            <div style={S.resultBadge}>✦ gemini</div>
            <RichText text={enriched} />
            {transcript && (
              <div style={S.transcriptBox}>
                <span style={S.transcriptLabel}>Voice note · </span>
                <span style={S.transcriptText}>"{transcript}"</span>
              </div>
            )}
            <button style={S.ghostBtn} onClick={() => {
              setPhase('input'); setEnriched(''); setTranscript('');
              setAudioBlob(null); setRecState('idle');
            }}>
              ← Start over
            </button>
          </div>
        )}

        {/* ── input ── */}
        {phase === 'input' && !showKeySetup && (
          <div style={S.body}>

            {/* type toggle */}
            <div style={S.typeRow}>
              {['snippet', 'image'].map((t) => (
                <button key={t} style={S.typeBtn(type === t)} onClick={() => {
                  setType(t); setContent(''); setFileName('');
                  setMimeType(''); setImgBase64(''); setError('');
                }}>
                  {t === 'snippet' ? '📝 Text' : '🖼 Image'}
                </button>
              ))}
            </div>

            {/* content */}
            {type === 'snippet' && (
              <textarea
                style={S.textarea}
                placeholder="Paste text, a URL, a note…"
                value={content}
                rows={4}
                onChange={(e) => { setContent(e.target.value); setError(''); }}
                autoFocus
              />
            )}
            {type === 'image' && (
              <label style={S.fileZone}>
                {imgBase64 && mimeType?.startsWith('image/') ? (
                  <img src={content} alt={fileName} style={S.imgPreview} />
                ) : (
                  <span style={S.fileHint}>{fileName || '+ Choose image'}</span>
                )}
                <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFile} />
              </label>
            )}

            <div style={S.divider} />

            {/* instruction mode */}
            <div style={S.modeRow}>
              <span style={S.modeLabel}>Instruction</span>
              <div style={{ display: 'flex', gap: '0.4rem' }}>
                {['voice', 'text'].map((m) => (
                  <button key={m} style={S.modeBtn(instrMode === m)} onClick={() => setInstrMode(m)}>
                    {m === 'voice' ? '🎙 Voice' : '✏️ Type'}
                  </button>
                ))}
              </div>
            </div>

            {/* voice recording */}
            {instrMode === 'voice' && (
              <>
                <button
                  style={S.micBtn(recState === 'recording')}
                  onClick={recState === 'recording' ? stopRecording : startRecording}
                >
                  {recState === 'recording' ? (
                    <><span className="em-dot" /> Stop · {countdown}s left</>
                  ) : recState === 'done' ? (
                    '● Re-record'
                  ) : (
                    '● Record voice note (10s)'
                  )}
                </button>
                {recState === 'done' && (
                  <div style={S.audioRow}>
                    <span style={S.audioReady}>Recording ready ✓</span>
                    <button style={S.discardBtn} onClick={discardRecording}>Discard</button>
                  </div>
                )}
                <p style={S.instrHint}>Tell Gemini what to do with the content above</p>
              </>
            )}

            {/* text instruction */}
            {instrMode === 'text' && (
              <textarea
                style={{ ...S.textarea, marginTop: 0 }}
                placeholder="e.g. Summarise this, find key action items, explain it simply…"
                value={typedInstr}
                rows={2}
                onChange={(e) => setTypedInstr(e.target.value)}
                autoFocus
              />
            )}

            {error && <p style={S.error}>{error}</p>}

            <button style={S.primaryBtn} onClick={handleEnrich}>
              Enrich →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── styles ───────────────────────────────────────────────────────────────────

const S = {
  overlay: {
    position: 'fixed', inset: 0,
    background: 'rgba(0,0,0,0.45)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 9999, padding: '1rem',
  },
  modal: {
    background: '#fff',
    borderRadius: '1.25rem',
    width: '100%', maxWidth: '460px',
    maxHeight: '90vh',
    overflow: 'hidden',
    display: 'flex', flexDirection: 'column',
    boxShadow: '0 24px 64px rgba(0,0,0,0.18)',
  },
  header: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '1.1rem 1.25rem 0.6rem',
    borderBottom: '1px solid #f0f0f0',
  },
  headerTitle: { fontSize: '0.95rem', fontWeight: 600, color: '#111' },
  closeBtn: {
    background: 'none', border: 'none', cursor: 'pointer',
    color: '#aaa', fontSize: '1.4rem', lineHeight: 1, padding: 0,
  },
  keyBtn: {
    background: 'none', border: 'none', cursor: 'pointer',
    color: '#bbb', fontSize: '1rem', lineHeight: 1, padding: 0,
  },
  body: { padding: '1rem 1.25rem 1.25rem', overflowY: 'auto' },
  typeRow: { display: 'flex', gap: '0.5rem', marginBottom: '0.9rem' },
  typeBtn: (a) => ({
    padding: '0.35rem 0.85rem', borderRadius: '999px',
    border: `1px solid ${a ? '#111' : '#e5e5e5'}`,
    background: a ? '#111' : 'transparent',
    color: a ? '#fff' : '#666',
    fontSize: '0.78rem', fontWeight: a ? 600 : 400, cursor: 'pointer',
  }),
  textarea: {
    width: '100%', borderRadius: '0.6rem',
    border: '1px solid #e8e8e8', padding: '0.75rem',
    fontSize: '0.88rem', resize: 'none', fontFamily: 'inherit',
    boxSizing: 'border-box', color: '#111', outline: 'none',
    lineHeight: 1.6, marginBottom: '0',
  },
  fileZone: {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    border: '2px dashed #e5e5e5', borderRadius: '0.75rem',
    minHeight: '110px', cursor: 'pointer', overflow: 'hidden',
  },
  fileHint: { color: '#bbb', fontSize: '0.88rem' },
  imgPreview: { maxWidth: '100%', maxHeight: '200px', borderRadius: '0.5rem', display: 'block' },
  divider: { height: '1px', background: '#f5f5f5', margin: '1rem 0 0.85rem' },
  modeRow: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: '0.65rem',
  },
  modeLabel: { fontSize: '0.75rem', color: '#aaa', fontWeight: 500 },
  modeBtn: (a) => ({
    padding: '0.25rem 0.65rem', borderRadius: '999px',
    border: `1px solid ${a ? '#333' : '#e8e8e8'}`,
    background: a ? '#111' : 'transparent',
    color: a ? '#fff' : '#888',
    fontSize: '0.75rem', cursor: 'pointer',
  }),
  micBtn: (rec) => ({
    display: 'flex', alignItems: 'center', gap: '0.5rem',
    width: '100%', padding: '0.7rem 1rem',
    borderRadius: '0.6rem', border: 'none',
    background: rec ? '#ff3b30' : '#f5f5f5',
    color: rec ? '#fff' : '#333',
    fontSize: '0.85rem', fontWeight: 500,
    cursor: 'pointer', justifyContent: 'center',
  }),
  audioRow: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    marginTop: '0.4rem',
  },
  audioReady: { fontSize: '0.78rem', color: '#34c759' },
  discardBtn: {
    background: 'none', border: 'none', cursor: 'pointer',
    color: '#ff3b30', fontSize: '0.75rem', padding: 0,
  },
  instrHint: {
    fontSize: '0.72rem', color: '#c0c0c0', margin: '0.4rem 0 0', lineHeight: 1.4,
  },
  error: { color: '#ff3b30', fontSize: '0.78rem', margin: '0.5rem 0 0' },
  primaryBtn: {
    width: '100%', marginTop: '1rem', padding: '0.85rem',
    background: '#111', color: '#fff', border: 'none',
    borderRadius: '0.75rem', fontSize: '0.9rem', fontWeight: 600, cursor: 'pointer',
  },
  ghostBtn: {
    width: '100%', marginTop: '0.75rem', padding: '0.75rem',
    background: 'transparent', color: '#555',
    border: '1px solid #e8e8e8', borderRadius: '0.75rem',
    fontSize: '0.85rem', cursor: 'pointer',
  },
  // processing
  processingWrap: {
    flex: 1, display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center',
    padding: '3rem 1.5rem', gap: '1rem',
  },
  stepText: { fontSize: '0.88rem', color: '#888' },
  // result
  resultWrap: { padding: '1.25rem', overflowY: 'auto', flex: 1 },
  resultBadge: {
    display: 'inline-block',
    fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.1em',
    textTransform: 'uppercase', color: '#aaa',
    marginBottom: '0.9rem',
  },
  para: {
    fontSize: '0.95rem', lineHeight: 1.75, color: '#1a1a1a',
    margin: '0 0 1rem', fontWeight: 400,
  },
  transcriptBox: {
    marginTop: '1.25rem', padding: '0.75rem 1rem',
    background: '#f8f8f8', borderRadius: '0.6rem',
    borderLeft: '3px solid #e0e0e0',
  },
  transcriptLabel: { fontSize: '0.72rem', color: '#aaa', fontWeight: 600 },
  transcriptText: { fontSize: '0.82rem', color: '#777', fontStyle: 'italic' },
  // key setup
  keySetup: {
    position: 'absolute', inset: 0, background: '#fff',
    borderRadius: '1.25rem', zIndex: 10,
    display: 'flex', flexDirection: 'column', alignItems: 'stretch',
    padding: '2rem 1.5rem', gap: '0.75rem',
  },
  keyTitle: { fontSize: '1rem', fontWeight: 700, color: '#111', margin: 0 },
  keySub: { fontSize: '0.82rem', color: '#888', margin: 0, lineHeight: 1.5 },
  link: { color: '#111' },
  keyInput: {
    padding: '0.75rem', borderRadius: '0.6rem',
    border: '1px solid #e5e5e5', fontSize: '0.88rem',
    fontFamily: 'monospace', outline: 'none',
  },
  deleteKeyBtn: {
    width: '100%', marginTop: '0.5rem', padding: '0.65rem',
    background: 'transparent', color: '#ff3b30',
    border: '1px solid #ffccc9', borderRadius: '0.75rem',
    fontSize: '0.8rem', cursor: 'pointer',
  },
};

const CSS = `
  .em-spinner {
    width: 28px; height: 28px;
    border: 2px solid #eee; border-top-color: #111;
    border-radius: 50%;
    animation: em-spin 0.7s linear infinite;
  }
  @keyframes em-spin { to { transform: rotate(360deg); } }
  .em-dot {
    display: inline-block;
    width: 7px; height: 7px; border-radius: 50%;
    background: #fff;
    animation: em-pulse 0.9s ease-in-out infinite;
  }
  @keyframes em-pulse { 0%,100% { opacity:1 } 50% { opacity:0.25 } }
`;
