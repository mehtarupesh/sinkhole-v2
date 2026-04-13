import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import './index.css';

const basename = (import.meta.env.BASE_URL || '/').replace(/\/$/, '') || '/';

// Failsafe: reload the page whenever a new SW takes control.
// This is synchronous and doesn't depend on workbox-window's async import,
// so it fires even if the registerSW activated listener races and loses.
// The `refreshing` flag prevents a double-reload if both paths fire.
if ('serviceWorker' in navigator) {
  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!refreshing) {
      refreshing = true;
      window.location.reload();
    }
  });
}

registerSW({ immediate: true });

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter basename={basename}>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
