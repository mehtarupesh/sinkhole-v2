import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import jsQR from 'jsqr';

function parsePeerIdFromScan(data) {
  const s = (data || '').trim();
  const match = s.match(/[?&]peerId=([^&\s]+)/);
  if (match) return decodeURIComponent(match[1]);
  if (/^host-[a-z0-9]+$/i.test(s)) return s;
  return null;
}

export default function Scan() {
  const navigate = useNavigate();
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const [error, setError] = useState('');
  const scanningRef = useRef(true);

  useEffect(() => {
    let rafId;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    const ctx = canvas.getContext('2d');

    const tick = () => {
      if (!scanningRef.current || !streamRef.current) return;
      if (video.readyState === video.HAVE_ENOUGH_DATA) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height);
        if (code?.data) {
          const peerId = parsePeerIdFromScan(code.data);
          if (peerId) {
            scanningRef.current = false;
            navigate(`/join?peerId=${encodeURIComponent(peerId)}`, { replace: true });
            return;
          }
        }
      }
      rafId = requestAnimationFrame(tick);
    };

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'environment' } })
      .then((stream) => {
        streamRef.current = stream;
        video.srcObject = stream;
        video.play().then(() => {
          rafId = requestAnimationFrame(tick);
        });
      })
      .catch((e) => setError(e.message || 'Camera access denied'));

    return () => {
      scanningRef.current = false;
      cancelAnimationFrame(rafId);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [navigate]);

  if (error) {
    return (
      <div style={styles.container}>
        <p style={styles.error}>{error}</p>
        <button style={styles.back} onClick={() => navigate(-1)}>
          Back
        </button>
      </div>
    );
  }

  return (
    <div style={styles.wrap}>
      <video ref={videoRef} style={styles.video} muted playsInline />
      <canvas ref={canvasRef} style={styles.hidden} />
      <p style={styles.hint}>Point at the QR code to join</p>
    </div>
  );
}

const styles = {
  wrap: { position: 'relative', width: '100%', minHeight: '100vh', background: '#000' },
  video: { width: '100%', height: '100%', objectFit: 'cover', display: 'block' },
  hidden: { display: 'none' },
  hint: { position: 'absolute', bottom: 32, left: 0, right: 0, textAlign: 'center', color: '#fff', margin: 0 },
  container: { minHeight: '100vh', padding: 24, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 },
  error: { color: '#f87171', margin: 0 },
  back: { padding: '10px 20px', background: '#333', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' },
};
