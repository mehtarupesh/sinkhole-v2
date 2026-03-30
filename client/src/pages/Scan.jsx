import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import jsQR from 'jsqr';
import { isValidPeerId } from '../utils/stableHostId';

function parsePeerIdFromScan(data) {
  const s = (data || '').trim();
  const match = s.match(/[?&]peerId=([^&\s]+)/);
  if (match) return decodeURIComponent(match[1]);
  // Accept slug (e.g. elegant-green-coat) or legacy host-xxx
  if (/^[a-z]+(-[a-z]+)+$/.test(s) || /^host-[a-z0-9]+$/i.test(s)) return s;
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
          if (peerId && isValidPeerId(peerId)) {
            scanningRef.current = false;
            navigate(`/connect?peerId=${encodeURIComponent(peerId)}`, { replace: true });
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

  function stopAndGoBack() {
    scanningRef.current = false;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    navigate('/connect');
  }

  if (error) {
    return (
      <div className="scan__error-view">
        <p className="scan__error">{error}</p>
        <button className="scan__back" onClick={() => navigate(-1)}>
          Back
        </button>
      </div>
    );
  }

  return (
    <div className="scan">
      <video ref={videoRef} className="scan__video" muted playsInline />
      <canvas ref={canvasRef} className="scan__canvas" />
      <button
        type="button"
        className="scan__back-overlay btn-icon"
        onClick={stopAndGoBack}
        aria-label="Back to connect"
      >
        ← Back
      </button>
      <p className="scan__hint">Point at the QR code to join</p>
    </div>
  );
}
