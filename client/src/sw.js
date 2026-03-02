/* eslint-disable no-restricted-globals */
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching';
import { clientsClaim } from 'workbox-core';

self.skipWaiting();
clientsClaim();

// Injected at build time by vite-plugin-pwa (injectManifest strategy)
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

function escapeHtml(input) {
  return String(input)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function byteLength(str) {
  try {
    return new TextEncoder().encode(String(str ?? '')).byteLength;
  } catch {
    // Fallback (approx)
    return String(str ?? '').length;
  }
}

function shareResultHtml(payload) {
  const pretty = escapeHtml(JSON.stringify(payload, null, 2));
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Shared into Instant Mirror</title>
    <style>
      body { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; padding: 16px; }
      a { color: inherit; }
      pre { background: #111; color: #eee; padding: 12px; border-radius: 8px; overflow: auto; }
    </style>
  </head>
  <body>
    <div style="margin-bottom:12px;">
      <strong>Received share payload</strong>
      <div style="margin-top:6px;"><a href="./">Open app</a></div>
    </div>
    <pre>${pretty}</pre>
  </body>
</html>`;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (url.pathname.endsWith('/share-target') && request.method === 'POST') {
    event.respondWith(
      (async () => {
        try {
          const form = await request.formData();

          const title = form.get('title') ?? '';
          const text = form.get('text') ?? '';
          const sharedUrl = form.get('url') ?? '';

          const rawFiles = form.getAll('files') ?? [];
          const files = rawFiles
            .filter((f) => typeof f === 'object' && f && 'name' in f && 'size' in f)
            .map((f) => ({
              name: f.name,
              type: f.type || '',
              size: f.size,
            }));

          const payload = {
            title: { bytes: byteLength(title), valuePreview: String(title).slice(0, 200) },
            text: { bytes: byteLength(text), valuePreview: String(text).slice(0, 200) },
            url: { bytes: byteLength(sharedUrl), valuePreview: String(sharedUrl).slice(0, 200) },
            files,
            receivedAt: new Date().toISOString(),
          };

          return new Response(shareResultHtml(payload), {
            status: 200,
            headers: { 'Content-Type': 'text/html; charset=utf-8' },
          });
        } catch (err) {
          return new Response(`Share Target error: ${err?.message || String(err)}`, {
            status: 500,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
          });
        }
      })()
    );
  }
});

