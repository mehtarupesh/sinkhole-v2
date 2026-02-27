import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function Landing() {
  const [showChoice, setShowChoice] = useState(false);
  const navigate = useNavigate();

  const handleInitiate = () => navigate('/host');
  const handleJoin = () => navigate('/scan');
  const handleBack = () => setShowChoice(false);

  return (
    <div style={styles.container}>
      <h1 style={styles.title}>Instant Mirror</h1>
      <p style={styles.sub}>One scan. No buttons. Data stays on your Wi‑Fi.</p>

      {!showChoice ? (
        <button
          className="landing-sync-btn"
          style={styles.syncButton}
          onClick={() => setShowChoice(true)}
          type="button"
          aria-expanded={showChoice}
        >
          Sync
        </button>
      ) : (
        <div style={styles.choiceCard}>
          <p style={styles.choicePrompt}>How do you want to sync?</p>
          <div style={styles.choiceActions}>
            <button
              className="landing-choice-btn"
              style={styles.choiceButton}
              onClick={handleInitiate}
              type="button"
            >
              <span style={styles.choiceIcon} aria-hidden>▢</span>
              <span style={styles.choiceLabel}>Show QR code</span>
              <span style={styles.choiceHint}>Use this device to display the code (e.g. laptop)</span>
            </button>
            <button
              className="landing-choice-btn"
              style={styles.choiceButton}
              onClick={handleJoin}
              type="button"
            >
              <span style={styles.choiceIcon} aria-hidden>◉</span>
              <span style={styles.choiceLabel}>Scan to join</span>
              <span style={styles.choiceHint}>Use this device’s camera (e.g. phone)</span>
            </button>
          </div>
          <button
            style={styles.backLink}
            onClick={handleBack}
            type="button"
          >
            Back
          </button>
        </div>
      )}
    </div>
  );
}

const styles = {
  container: {
    minHeight: '100vh',
    padding: 24,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
  },
  title: {
    fontSize: '1.5rem',
    fontWeight: 600,
    margin: 0,
    color: '#fafafa',
  },
  sub: {
    margin: 0,
    color: '#888',
    fontSize: '0.95rem',
    textAlign: 'center',
    maxWidth: 320,
  },
  syncButton: {
    padding: '14px 40px',
    fontSize: 18,
    fontWeight: 600,
    background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
    color: '#fff',
    border: 'none',
    borderRadius: 12,
    cursor: 'pointer',
    boxShadow: '0 4px 14px rgba(37, 99, 235, 0.4)',
    transition: 'transform 0.15s ease, box-shadow 0.15s ease',
  },
  choiceCard: {
    width: '100%',
    maxWidth: 360,
    padding: 24,
    background: 'rgba(255, 255, 255, 0.04)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: 16,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: 20,
  },
  choicePrompt: {
    margin: 0,
    fontSize: 15,
    color: '#a3a3a3',
    textAlign: 'center',
  },
  choiceActions: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  choiceButton: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 6,
    padding: '18px 20px',
    background: 'rgba(255, 255, 255, 0.06)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    cursor: 'pointer',
    color: '#fafafa',
    textAlign: 'center',
    transition: 'background 0.15s ease, border-color 0.15s ease',
  },
  choiceIcon: {
    fontSize: 24,
    color: '#2563eb',
    lineHeight: 1,
  },
  choiceLabel: {
    fontSize: 16,
    fontWeight: 600,
  },
  choiceHint: {
    fontSize: 12,
    color: '#737373',
    lineHeight: 1.3,
  },
  backLink: {
    alignSelf: 'center',
    padding: '8px 16px',
    background: 'none',
    border: 'none',
    color: '#737373',
    fontSize: 14,
    cursor: 'pointer',
    textDecoration: 'none',
  },
};
