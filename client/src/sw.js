/* eslint-disable no-restricted-globals */
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching';
import { clientsClaim } from 'workbox-core';
import { writePendingShare } from './utils/pendingShare';

self.skipWaiting();
clientsClaim();

// Injected at build time by vite-plugin-pwa (injectManifest strategy)
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

/**
 * Convert an ArrayBuffer to a base64 data URL.
 * FileReader is not available in service workers, so we use btoa with chunking.
 */
function arrayBufferToDataUrl(buffer, mimeType) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const CHUNK = 8192;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return `data:${mimeType || 'application/octet-stream'};base64,${btoa(binary)}`;
}

/**
 * Classify the share payload into the same shape AddUnitModal expects:
 *   { type, content, fileName?, mimeType? }
 *
 * Priority: file > text/url combo
 */
async function classifyShare(form) {
  const files = form.getAll('files').filter((f) => f?.size > 0);

  if (files.length > 0) {
    const file = files[0];
    const buffer = await file.arrayBuffer();
    return {
      type: 'image', // AddUnitModal's 'image' type handles all file kinds
      content: arrayBufferToDataUrl(buffer, file.type),
      fileName: file.name,
      mimeType: file.type || 'application/octet-stream',
    };
  }

  const parts = [form.get('title'), form.get('text'), form.get('url')]
    .map((v) => String(v ?? '').trim())
    .filter(Boolean);

  return {
    type: 'snippet',
    content: parts.join('\n'),
  };
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (url.pathname.endsWith('/share-target') && request.method === 'POST') {
    event.respondWith(
      (async () => {
        try {
          const form = await request.formData();
          const share = await classifyShare(form);
          await writePendingShare(share);
          return Response.redirect('/?pendingShare=1', 303);
        } catch (err) {
          // On failure, redirect to the app anyway — user can add manually
          console.error('[sw] share-target error:', err);
          return Response.redirect('/', 303);
        }
      })()
    );
  }
});
