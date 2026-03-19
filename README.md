# 1 burrow

This is a PWA (Progressive Web App) that allows you to quickly store snippets, passwords, files (screenshots, images, pdfs, etc.), and links with contextual notes.
It can be accessed from any device with a web browser, and 2 devices can be connected to each other to sync the data.

## Goals
- Easily available on mobile and desktop.
- Private
- Quick Context Share, Quick Personalized Access
- 0 notifications. User should not be bothered unless they decide to check the app.

## How it works

- User opens app and presented with categories of data presented in carousels (Landing.jsx -> Carousel.jsx)
- The app is a valid share target, so data can be shared from other apps to the app. This is primary source of data for the app.
  - User shares data, provides context (audio preferred, but text is also supported), and the app stores the data.
  - In background, app converts audio to text and uses an LLM to categorize the data.
- When user wants to access data, they browse through carousel OR search for specific data (UnitsOverlay.jsx).

## Data Storage and Sync
Data is stored in IndexedDB in the browser.
It can be exported to a file and imported back.
It can be synced between devices using PeerJS.

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
npm test

# Watch mode (re-runs on file changes)
npm run test:watch
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
