
## Tech
No backend server is required. All data is stored in the browser.

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
npm test src/__tests__
```

End to end tests live in client e2e. These can be run as follows

```
cd client
npx playwright test --config e2e/playwright.config.js e2e/ --headed
```


## Deployment

Deploys the static build to GitHub Pages. No server required — signaling uses PeerJS cloud.

### GitHub Pages

The repo includes `.github/workflows/deploy-pages.yml` which builds and deploys on every push to `main`.

1. In your GitHub repo → **Settings → Pages → Build and deployment** → set source to **GitHub Actions**.
2. Push to `main`. The workflow builds the client and deploys to Pages.
3. App will be at `https://<username>.github.io/<repo-name>/`.
