import { useState, useEffect } from 'react';
import { CloseIcon } from './Icons';
import { getSetting, setSetting, deleteSetting } from '../utils/db';

export default function SettingsModal({ onClose }) {
  const [keyDraft, setKeyDraft] = useState('');
  const [hasKey, setHasKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

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

  return (
    <div className="overlay" onClick={onClose}>
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
      </div>
    </div>
  );
}
