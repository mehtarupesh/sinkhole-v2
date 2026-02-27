# Instant Mirror

One-scan sync between two devices. Cloud-assisted signaling; data stays P2P.

## Flow

1. **Laptop:** Open the app, click **Start Sync**. A QR code appears (with a unique Peer ID).
2. **Phone:** Scan the QR. The join URL opens; the app connects via the signaling server and establishes a direct WebRTC data channel.
3. **Done.** Data flows directly between devices (P2P); signaling only helped them find each other.

## Tech (cloud-assisted P2P)

- **Signaling:** Public PeerJS cloud (0.peerjs.com). Only exchanges handshake info; does not see your data.
- **NAT traversal:** Public STUN servers (Google) so the P2P connection can be established across typical networks.
- **Data:** WebRTC `RTCDataChannel` via PeerJS; once connected, data goes device-to-device.
- **QR code:** When deployed, uses the app’s public URL so the phone can open the link from anywhere. When running locally, uses your LAN IP for same-network use.

## Run

```bash
# Install
npm install
cd client && npm install && cd ..

# Production (build + serve on one port)
npm run build && npm start
```

```bash
npm run dev
```

## PWA

The client is a **Progressive Web App**: it registers a service worker (offline caching, `autoUpdate`) and a web app manifest. After deploy, users can “Add to Home Screen” / install the app on laptop and Android.

**Icons:** The repo includes generated `pwa-192.png` and `pwa-512.png` in `client/public`. To regenerate them (e.g. after changing branding), run from `client`: `npm run generate-pwa-icons`. You can also replace those files with custom icons from [PWA Asset Generator](https://vite-pwa-org.netlify.app/assets-generator/) or [favicon.inbrowser.app](https://favicon.inbrowser.app/).

## Deploy (cheap/free) so the phone can connect from anywhere

Deploy the **static build** so the QR points to a public URL. No server needed—signaling is PeerJS cloud.

### GitHub Pages (free)

The repo includes a workflow that builds and deploys on every push to `main`.

1. **One-time setup:** In your GitHub repo → **Settings** → **Pages** → under **Build and deployment**, set **Source** to **GitHub Actions** (not "Deploy from a branch"). If you leave it as a branch, GitHub will serve the repo root and you’ll see this README instead of the app.
2. Push the latest code (including `.github/workflows/deploy-pages.yml`) to `main`. The workflow runs, builds the client, and deploys to Pages.
3. Your app will be at `https://<username>.github.io/<repo-name>/` (or the custom domain you set).
4. Open that URL → **Show QR code** → **Start Sync**. Scan the QR on the phone; the join link uses the same GitHub Pages URL.

Once deployed, both laptop and phone open the **same public URL**; the QR points there, so the phone can connect from cellular or any Wi‑Fi.

## Phone shows "address unreachable"

The QR code encodes `http://<your-lan-ip>:3000/join?peerId=...`. If the phone can’t reach that address:

1. **Same Wi‑Fi**  
   Phone and laptop must be on the **same Wi‑Fi network**. Turn off cellular data on the phone if you’re testing over Wi‑Fi only.

2. **Firewall on the host**  
   Allow incoming TCP on port 3000 (or turn it off temporarily to test). If the firewall is already off and the phone still can’t connect, see (4).

3. **AP / client isolation on the router**  
   Many routers have **AP isolation** (or “client isolation” / “wireless isolation”) that blocks Wi‑Fi devices from talking to each other. If it’s enabled, the phone will never reach the laptop. Log into the router (e.g. 192.168.1.1) → Wireless/Wi‑Fi settings → **disable** AP/client isolation, then try again.

4. **Check the URL on the laptop**  
   After `npm start`, the terminal prints e.g. `Instant Mirror: http://10.80.5.92:3000`. Open that **exact** URL in the laptop’s browser. If it loads, the server is fine; the problem is the phone reaching that IP (network or firewall). If it doesn’t load on the laptop, the server or port is wrong.

5. **Wrong IP in the QR**  
   The app prefers the Wi‑Fi/LAN interface (e.g. `en0` on macOS). If you use VPN or multiple networks, the chosen IP might not be the one the phone can reach. In that case, open the app on the laptop using the URL you want the phone to use (e.g. `http://192.168.1.5:3000`), then Start Sync so the QR uses that host.
