import { useState, useEffect, useRef } from 'react';
import { CloseIcon } from './Icons';
import { getSetting, setSetting, deleteSetting, getAllUnits, dumpDB, mergeUnits, mergeCategorization, mergeAccessOrder, mergeTombstones } from '../utils/db';

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

export default function SettingsModal({ onClose }) {
  const [keyDraft, setKeyDraft] = useState('');
  const [hasKey, setHasKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

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
            <button
              type="button"
              className="unit-detail__delete"
              onClick={handleDelete}
            >
              Remove key
            </button>
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

      </div>
    </div>
  );
}
