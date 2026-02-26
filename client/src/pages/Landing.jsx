import { Link } from 'react-router-dom';

export default function Landing() {
  return (
    <div style={styles.container}>
      <h1 style={styles.title}>Instant Mirror</h1>
      <p style={styles.sub}>One scan. No buttons. Data stays on your Wi‑Fi.</p>
      <div style={styles.actions}>
        <Link to="/host" style={styles.primaryButton}>
          Show QR code
        </Link>
        <Link to="/join" style={styles.secondaryLink}>
          I’ll open the link from the other device
        </Link>
      </div>
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
    gap: 16,
  },
  title: { fontSize: '1.5rem', fontWeight: 600, margin: 0 },
  sub: { margin: 0, color: '#888', fontSize: '0.95rem', textAlign: 'center' },
  actions: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 },
  primaryButton: {
    padding: '12px 24px',
    fontSize: 16,
    background: '#2563eb',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    cursor: 'pointer',
    textDecoration: 'none',
  },
  secondaryLink: { color: '#888', fontSize: 14, textDecoration: 'none' },
};
