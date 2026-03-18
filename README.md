# Instant Mirror

One-scan sync between two devices. Cloud-assisted signaling; data stays P2P on your network.

## How it works

1. **Host device:** Open the app, click the signal icon → a QR code appears.
2. **Joining device:** Scan the QR (or use the camera button on the app). The join URL opens and a direct WebRTC data channel is established.
3. **Done.** Data flows device-to-device; the cloud only helps them find each other.

The host gets a stable human-readable ID (e.g. `bored-ashamed-businessperson`) stored in the browser. Any device can join by scanning a QR or entering the host ID manually.

## Tech

| Layer | What |
|---|---|
| P2P / signaling | PeerJS (WebRTC DataChannel); signaling via public PeerJS cloud |
| NAT traversal | Public STUN (Google) |
| Client | React 18, Vite 5, React Router 6 |
| Server | Express — serves static build + `/api/local-ip` for LAN QR codes |
| PWA | vite-plugin-pwa, custom service worker, web app manifest, Share Target |

## Run

```bash
# Install (run once)
npm install
cd client && npm install && cd ..

# Development — server + Vite dev server with HMR
npm run dev

# Production — build then serve on port 3000
npm run build && npm start
```

Open `http://localhost:3000` (or the LAN IP printed in the terminal) in your browser.

## Test

Unit tests live in `client/src/__tests__/` and use [Vitest](https://vitest.dev/) + Testing Library.

```bash
cd client

# Run all tests once
npm test

# Watch mode (re-runs on file changes)
npm run test:watch
```

### What is tested

| File | Covers |
|---|---|
| `useSync.test.js` | Core P2P sync hook — push sends correct messages, incoming data updates state, closed connections are handled safely |
| `usePeer.test.js` | Peer lifecycle — start/stop, event wiring, idempotency, connection list management |
| `stableHostId.test.js` | Peer ID validation and stable ID persistence in localStorage |

End to end tests live in client e2e. These can be run as follows

```
cd client
npx playwright test --config e2e/playwright.config.js e2e/ --headed
```

## Project structure

```
client/src/
├── hooks/
│   ├── usePeer.js        # P2P lifecycle: create peer, accept/make connections
│   └── useSync.js        # Sync state over a DataConnection (data-format agnostic)
├── utils/
│   ├── stableHostId.js   # Stable per-device peer ID (localStorage)
│   └── getJoinUrl.js     # Build join URL; uses LAN IP on localhost
├── components/
│   ├── Icons.jsx         # Inline SVG icons
│   └── MirrorPopup.jsx   # Live mirror floating popup
├── pages/
│   ├── Landing.jsx       # Main UI: QR, scan, manual connect, connections list
│   ├── Host.jsx          # Dedicated host view: QR + mirror textarea
│   └── Scan.jsx          # Camera QR scanner → redirect to /?peerId=...
├── peerConfig.js         # PeerJS options (STUN; no custom server)
├── App.jsx               # Routes + footer
└── index.css             # All styles
```

## Deploy (free) — phone connects from anywhere

Deploy the static build so the QR points to a public URL. No server required — signaling uses PeerJS cloud.

### GitHub Pages

The repo includes `.github/workflows/deploy-pages.yml` which builds and deploys on every push to `main`.

1. In your GitHub repo → **Settings → Pages → Build and deployment** → set source to **GitHub Actions**.
2. Push to `main`. The workflow builds the client and deploys to Pages.
3. App will be at `https://<username>.github.io/<repo-name>/`.

### PWA icons

```bash
cd client && npm run generate-pwa-icons
```

## Troubleshooting

### Phone shows "address unreachable"

The QR encodes `http://<lan-ip>:3000/?peerId=...`. If the phone can't reach it:

1. **Same Wi-Fi** — phone and laptop must be on the same network. Disable cellular data on the phone if testing locally.
2. **Firewall** — allow incoming TCP on port 3000, or disable temporarily to test.
3. **AP/client isolation** — many routers block Wi-Fi devices from talking to each other. Log into your router and disable AP/client isolation.
4. **Check the URL** — after `npm start`, open the printed LAN URL (e.g. `http://10.0.0.5:3000`) in the laptop browser first. If it loads there, the server is fine and the issue is the phone reaching that IP.
5. **Wrong IP** — if you use VPN or multiple interfaces, the chosen IP may not be reachable from the phone. Open the app at the correct IP on the laptop before starting hosting so the QR uses that address.

### PeerJS errors

Signaling goes through the public PeerJS cloud. Check network/firewall isn't blocking WebSockets. No custom peer server is bundled in this repo — see `client/src/peerConfig.js` to add one.
