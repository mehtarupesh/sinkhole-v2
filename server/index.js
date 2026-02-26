import express from 'express';
import { createServer } from 'http';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import os from 'os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const server = createServer(app);

const PORT = process.env.PORT || 3000;

// Cloud-assisted P2P: signaling via public PeerJS (no local PeerServer)

// Prefer Wi‑Fi/LAN interface names so the QR code uses an IP the phone can reach
const PREFERRED_PREFIXES = ['en0', 'en1', 'wlan', 'eth', 'wl'];
const SKIP_PREFIXES = ['utun', 'vmnet', 'vbox', 'docker', 'bridge', 'veth', 'lo'];

function getLocalIP() {
  try {
    const ifaces = os.networkInterfaces();
    const candidates = [];
    for (const name of Object.keys(ifaces)) {
      const skip = SKIP_PREFIXES.some((p) => name.toLowerCase().startsWith(p));
      if (skip) continue;
      for (const iface of ifaces[name]) {
        if (iface.family === 'IPv4' && !iface.internal)
          candidates.push({ name, address: iface.address });
      }
    }
    // Prefer common Wi‑Fi/LAN interface (e.g. en0 on macOS)
    const preferred = candidates.find((c) =>
      PREFERRED_PREFIXES.some((p) => c.name.toLowerCase().startsWith(p))
    );
    if (preferred) return preferred.address;
    if (candidates.length) return candidates[0].address;
  } catch (_) {}
  return 'localhost';
}

app.get('/api/local-ip', (req, res) => {
  const ip = getLocalIP();
  res.json({
    ip,
    port: PORT,
    url: `http://${ip}:${PORT}`,
  });
});

// Static app (after build)
app.use(express.static(join(__dirname, '../client/dist')));

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(join(__dirname, '../client/dist/index.html'));
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Instant Mirror: http://${getLocalIP()}:${PORT}`);
  console.log('Scan the QR code on your phone to connect.');
});
