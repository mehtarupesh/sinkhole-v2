import { useState, useEffect, useRef } from 'react';
import { CloseIcon, TrashIcon } from './Icons';
import { getSetting, setSetting, deleteSetting, getAllUnits, dumpDB, ucDump, clearDB, mergeUnits, mergeCategorization, mergeAccessOrder, mergeTombstones } from '../utils/db';
import { loadDemoIfFresh } from '../utils/demo';
import { synthesizeFromUnits, testPaidTier } from '../utils/forage';
import { isIOS } from '../utils/device';

const TYPE_LABELS = { snippet: 'text', image: 'img' };

function PreviewCard({ unit }) {
  return (
    <div className="unit-card" style={{ cursor: 'default', pointerEvents: 'none' }}>
      <div className="unit-card__header">
        <span className="unit-card__type">{TYPE_LABELS[unit.type] ?? unit.type}</span>
        <span className="unit-card__date">
          {unit.createdAt ? new Date(unit.createdAt).toLocaleDateString() : ''}
        </span>
      </div>
      <div className="unit-card__body">
        {unit.encrypted ? (
          <p className="unit-card__text unit-card__text--muted">{'•'.repeat(12)}</p>
        ) : unit.type === 'snippet' ? (
          <p className="unit-card__text">{unit.content?.slice(0, 120)}</p>
        ) : unit.type === 'image' && unit.mimeType?.startsWith('image/') ? (
          <img src={unit.content} alt={unit.fileName} className="unit-card__img" />
        ) : unit.type === 'image' ? (
          <p className="unit-card__text unit-card__text--muted">{unit.fileName}</p>
        ) : null}
      </div>
    </div>
  );
}

function useInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(() => window.__installPrompt ?? null);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true;
    if (isStandalone) { setIsInstalled(true); return; }

    // Pick up prompt if it fired before this component mounted
    if (window.__installPrompt) setDeferredPrompt(window.__installPrompt);

    const handler = (e) => { e.preventDefault(); window.__installPrompt = e; setDeferredPrompt(e); };
    window.addEventListener('beforeinstallprompt', handler);
    window.addEventListener('appinstalled', () => { setIsInstalled(true); setDeferredPrompt(null); window.__installPrompt = null; });
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  return { deferredPrompt, isInstalled };
}

export default function SettingsModal({ onClose }) {
  const [keyDraft, setKeyDraft] = useState('');
  const [hasKey, setHasKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showIOSInstructions, setShowIOSInstructions] = useState(false);
  const { deferredPrompt, isInstalled } = useInstallPrompt();

  const [preview, setPreview] = useState(null); // { newUnits, skipped }
  const [importStatus, setImportStatus] = useState('');
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef();

  useEffect(() => {
    getSetting('gemini_key').then((val) => setHasKey(!!val)).catch(() => {});
  }, []);

  async function handleSave() {
    if (!keyDraft.trim()) return;
    setSaving(true);
    try {
      await setSetting('gemini_key', keyDraft.trim());
      setHasKey(true);
      setKeyDraft('');
    } catch {
      setError('Failed to save key.');
    }
    setSaving(false);
  }

  async function handleDelete() {
    try {
      await deleteSetting('gemini_key');
      setHasKey(false);
    } catch {
      setError('Failed to remove key.');
    }
  }

  const [testResult, setTestResult] = useState('');
  const [testError, setTestError] = useState('');
  const [testLoading, setTestLoading] = useState(false);
  const [showFullTest, setShowFullTest] = useState(false);

  async function handleTestKey() {
    setTestLoading(true);
    setTestResult('');
    setTestError('');
    const [units, apiKey] = await Promise.all([getAllUnits(), getSetting('gemini_key')]);
    // take first 10 units of type image
    const imageUnits = units.filter((u) => u.type === 'image').slice(0, 10);
    console.log('imageUnits', imageUnits);
    try {
      const stream = await testPaidTier(imageUnits, 'Summarize', apiKey);
      let text = '';
      for await (const chunk of stream) {
        text += chunk.text ?? '';
      }
      setTestResult("Test passed");
      await setSetting('gemini_key_tier', 'paid');
    } catch (e) {
      console.log('e', e);
      try {
        const stream = await synthesizeFromUnits({ units: imageUnits, question: 'Summarize', shareContent: true, apiKey });
        let text = '';
        for await (const chunk of stream) {
          text += chunk.text ?? '';
        }
        setTestResult("Test passed");
        await setSetting('gemini_key_tier', 'free').catch(() => {});  
      } catch (e) {
        await setSetting('gemini_key_tier', 'error').catch(() => {});
        setTestError('Test failed.');
      }
    }
    setTestLoading(false);
  }

  async function handleExport() {
    try {
      const dump = await dumpDB();
      const ts = new Date().toISOString().replace(/[:.]/g, '-');
      const blob = new Blob([JSON.stringify(dump, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `sinkhole-${ts}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      setError('Export failed.');
    }
  }

  async function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportStatus('');
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const incoming = Array.isArray(data.units) ? data.units : [];
      const existing = await getAllUnits();
      const knownUids = new Set(existing.map((u) => u.uid).filter(Boolean));
      const newUnits = incoming.filter((u) => u.uid && !knownUids.has(u.uid));
      const getSetting_ = (key) => Array.isArray(data.settings)
        ? (data.settings.find((s) => s.key === key)?.value ?? null)
        : null;
      setPreview({
        newUnits,
        skipped: incoming.length - newUnits.length,
        categorizationGroups: getSetting_('categorization'),
        accessOrder: getSetting_('accessOrder') ?? [],
        tombstones: getSetting_('tombstones') ?? [],
      });
    } catch {
      setImportStatus('Invalid file.');
    }
    e.target.value = '';
  }

  async function handleImportSave() {
    if (!preview) return;
    setImporting(true);
    try {
      const [idRemap, tombstonedUids] = await Promise.all([
        mergeCategorization(preview.categorizationGroups),
        mergeTombstones(preview.tombstones),
      ]);
      await mergeAccessOrder(preview.accessOrder);
      const { added } = await mergeUnits(preview.newUnits.filter((u) => !tombstonedUids.has(u.uid)), idRemap);
      setImportStatus(`Imported ${added} item${added !== 1 ? 's' : ''}.`);
      setPreview(null);
    } catch {
      setImportStatus('Import failed.');
    }
    setImporting(false);
  }

  const [confirmClear, setConfirmClear] = useState(false);

  async function handleUcDump() {
    try {
      const dump = await ucDump();
      const ts = new Date().toISOString().replace(/[:.]/g, '-');
      const blob = new Blob([JSON.stringify(dump, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `uc-dump-${ts}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      setError('UC Dump failed.');
    }
  }

  async function handleLoadDemo() {
    try {
      await loadDemoIfFresh();
      window.location.reload();
    } catch {
      setError('Load demo failed.');
    }
  }

  async function handleInstall() {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
    }
  }

  async function handleClearDB() {
    try {
      await clearDB();
      window.location.reload();
    } catch (e) {
      setError(e.message ?? 'Clear failed.');
      setConfirmClear(false);
    }
  }

  return (
    <div className="overlay" onClick={preview ? undefined : onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal__header">
          <span className="modal__title">Settings</span>
          <button type="button" className="btn-close" onClick={onClose} aria-label="Close">
            <CloseIcon />
          </button>
        </div>

        <p className="modal__hint" style={{ marginBottom: 12 }}>
          Gemini API key —{' '}
          <a
            href="https://aistudio.google.com/apikey"
            target="_blank"
            rel="noreferrer"
            style={{ color: '#a3a3a3' }}
          >
            get a free key
          </a>
        </p>

        {hasKey ? (
          <>
            <p style={{ fontSize: 13, color: '#737373', marginBottom: 12 }}>Key saved ✓</p>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="connect-btn add-unit__save-btn"
                onClick={handleTestKey}
                disabled={testLoading}
              >
                {testLoading ? '…' : 'Test key'}
              </button>
              <button
                type="button"
                className="unit-detail__delete"
                onClick={handleDelete}
              >
                Remove key
              </button>
            </div>
            {(testResult || testError) && (
              <p
                className="modal__hint"
                style={{ marginTop: 8, cursor: testResult.length > 120 ? 'pointer' : 'default', userSelect: 'none' }}
                onClick={() => testResult.length > 120 && setShowFullTest(true)}
              >
                {testError
                  ? <span style={{ color: '#ef4444' }}>{testError.slice(0, 120)}{testError.length > 120 ? '…' : ''}</span>
                  : <>{testResult.slice(0, 120)}{testResult.length > 120 ? <span style={{ color: '#737373' }}> … (tap to expand)</span> : null}</>
                }
              </p>
            )}
            {showFullTest && (
              <div className="overlay" onClick={() => setShowFullTest(false)}>
                <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxHeight: '80vh', overflowY: 'auto' }}>
                  <div className="modal__header">
                    <span className="modal__title">Test result</span>
                    <button type="button" className="btn-close" onClick={() => setShowFullTest(false)} aria-label="Close"><CloseIcon /></button>
                  </div>
                  <p style={{ fontSize: 13, color: '#a3a3a3', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{testResult || testError}</p>
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            <input
              type="password"
              className="connect-input"
              placeholder="Paste your Gemini key…"
              value={keyDraft}
              onChange={(e) => { setKeyDraft(e.target.value); setError(''); }}
              onKeyDown={(e) => e.key === 'Enter' && handleSave()}
              autoFocus
              style={{ marginBottom: 12 }}
            />
            <button
              type="button"
              className="connect-btn add-unit__save-btn"
              onClick={handleSave}
              disabled={saving || !keyDraft.trim()}
            >
              {saving ? '…' : 'Save key'}
            </button>
          </>
        )}

        {error && <p className="modal__error" style={{ marginTop: 8 }}>{error}</p>}

        <hr style={{ border: 'none', borderTop: '1px solid #262626', margin: '20px 0' }} />

        {/* ── Export / Import ── */}
        {preview ? (
          <div data-testid="import-preview">
            <p className="modal__hint" style={{ marginBottom: 8 }}>
              {preview.newUnits.length === 0
                ? 'Nothing new to import.'
                : `${preview.newUnits.length} new item${preview.newUnits.length !== 1 ? 's' : ''}${preview.skipped > 0 ? ` · ${preview.skipped} already exist` : ''}`}
            </p>
            <div
              style={{ maxHeight: 240, overflowY: 'auto', marginBottom: 12 }}
              data-testid="import-preview-list"
            >
              {preview.newUnits.map((u, i) => (
                <PreviewCard key={u.uid ?? i} unit={u} />
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {preview.newUnits.length > 0 && (
                <button
                  type="button"
                  className="connect-btn add-unit__save-btn"
                  onClick={handleImportSave}
                  disabled={importing}
                  data-testid="import-save-btn"
                >
                  {importing ? '…' : `Import ${preview.newUnits.length}`}
                </button>
              )}
              <button
                type="button"
                className="unit-detail__delete"
                onClick={() => { setPreview(null); setImportStatus(''); }}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="connect-btn add-unit__save-btn"
              onClick={handleExport}
              data-testid="export-btn"
            >
              Export
            </button>
            <button
              type="button"
              className="connect-btn add-unit__save-btn"
              onClick={() => fileInputRef.current?.click()}
              data-testid="import-btn"
            >
              Import
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              style={{ display: 'none' }}
              onChange={handleFileChange}
              data-testid="import-file-input"
            />
            {importStatus && (
              <p className="modal__hint" style={{ margin: 0 }} data-testid="import-status">
                {importStatus}
              </p>
            )}
          </div>
        )}

        <hr style={{ border: 'none', borderTop: '1px solid #262626', margin: '20px 0' }} />

        {/* ── Install ── */}
        {!isInstalled && (
          <>
            {isIOS() ? (
              <>
                <button
                  type="button"
                  className="connect-btn add-unit__save-btn"
                  onClick={() => setShowIOSInstructions((v) => !v)}
                >
                  Add to Home Screen
                </button>
                {showIOSInstructions && (
                  <ol className="modal__hint" style={{ marginTop: 10, paddingLeft: 18, lineHeight: 1.8 }}>
                    <li>Tap the <strong>Share</strong> button in Safari (box with arrow)</li>
                    <li>Scroll down and tap <strong>Add to Home Screen</strong></li>
                    <li>Tap <strong>Add</strong> to confirm</li>
                  </ol>
                )}
              </>
            ) : deferredPrompt ? (
              <button
                type="button"
                className="connect-btn add-unit__save-btn"
                onClick={handleInstall}
              >
                Install app
              </button>
            ) : null}
            {/* <hr style={{ border: 'none', borderTop: '1px solid #262626', margin: '20px 0' }} /> */}
          </>
        )}

        {/* ── Dev tools ── */}
        {/* <p className="modal__hint" style={{ marginBottom: 8 }}>Dev tools</p>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            className="connect-btn add-unit__save-btn"
            onClick={handleUcDump}
          >
            UC Dump
          </button>
          <button
            type="button"
            className="connect-btn add-unit__save-btn"
            onClick={handleLoadDemo}
          >
            Load Demo
          </button>
        </div> */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
          <button
            type="button"
            className={`unit-detail__delete${confirmClear ? ' unit-detail__delete--confirm' : ''}`}
            onClick={() => { if (!confirmClear) { setConfirmClear(true); } else { handleClearDB(); } }}
            onBlur={() => setConfirmClear(false)}
            style={{ flexShrink: 0 }}
          >
            {confirmClear ? 'Confirm?' : <TrashIcon />}
          </button>
          <p className="modal__hint" style={{ margin: 0 }}>
            {confirmClear ? 'This will wipe all data and reload.' : 'Reset to default'}
          </p>
        </div>

      </div>
    </div>
  );
}
