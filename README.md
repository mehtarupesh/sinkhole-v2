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

Then open **http://localhost:3000** (or **http://&lt;your-lan-ip&gt;:3000**). Use the same LAN IP so the phone can reach the server.

For development (client dev server + API/Peer proxy):

```bash
npm run dev
```

Open http://localhost:5173; ensure the backend is on 3000 so the proxy works. You may see an occasional `ws proxy socket error: ECONNRESET` in the terminal when the PeerJS WebSocket is closed; the app should still work. For the most reliable run (no proxy), use **production**: `npm run build && npm start` and open http://localhost:3000 (or your LAN URL).

## How to test

1. **Start the app** (from project root):
   ```bash
   npm run build && npm start
   ```
   Or for dev (Vite + server): `npm run dev` then open http://localhost:5173.

2. **Host (e.g. laptop):**
   - Open http://localhost:3000 (or http://\<your-lan-ip\>:3000).
   - Click **Show QR code** → **Start Sync**. The QR appears; no camera is used on this device.

3. **Joiner (e.g. phone):**
   - Ensure the phone is on the **same Wi‑Fi** as the host.
   - Use the laptop’s **LAN IP** in the URL (e.g. `http://192.168.1.5:3000`) so the phone can reach the server. Check the terminal for the printed URL after `npm start`.
   - Scan the QR with the phone’s camera → the join URL opens in the browser and connects.

4. **Verify sync:** Type in the text area on either device; the other should update immediately.

**Quick test on one machine:** Run the app, open two browser tabs. In tab 1 go to `/host`, click Start Sync, copy the join URL from the QR (or open `/join?peerId=host-xxxxx` with the same peerId). In tab 2 open that join URL. Both tabs should sync.

## Deploy (cheap/free) so the phone can connect from anywhere

Deploy the **static build** so the QR points to a public URL. No server needed—signaling is PeerJS cloud.

### Option A: Vercel (free)

1. Push the repo to GitHub (if not already).
2. Go to [vercel.com](https://vercel.com) → Sign in → **Add New** → **Project** → Import your repo.
3. **Root Directory:** leave default (repo root).
4. **Build and Output:**
   - Build Command: `cd client && npm install && npm run build`
   - Output Directory: `client/dist`
5. **Install Command:** `npm install` (root) or leave empty and use Build Command above.
6. Deploy. Your app will be at `https://<your-project>.vercel.app`.
7. Open that URL on the laptop → **Show QR code** → **Start Sync**. Scan the QR on the phone (any network). The join link will open the same Vercel URL and connect.

### Option B: Netlify (free)

1. Push to GitHub. Go to [netlify.com](https://netlify.com) → **Add new site** → **Import from Git**.
2. Build command: `cd client && npm install && npm run build`
3. Publish directory: `client/dist`
4. Deploy. Use the generated URL (e.g. `https://your-site.netlify.app`) the same way as above.

### Option C: Cloudflare Pages (free)

1. Push to GitHub. In Cloudflare Dashboard → **Pages** → **Create** → **Connect to Git**.
2. Build command: `cd client && npm install && npm run build`
3. Build output directory: `client/dist`
4. Deploy and use the `*.pages.dev` URL.

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
