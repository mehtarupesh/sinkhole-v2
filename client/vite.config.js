import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { execSync } from 'child_process';

function gitCommit() {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim();
  } catch {
    return null;
  }
}

export default defineConfig({
  base: process.env.VITE_BASE_URL || '/',
  define: {
    __APP_VERSION__: JSON.stringify(gitCommit()),
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      minify: false,
      injectRegister: false,
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',
      injectManifest: {
        // Keep SW output compatible with classic registration.
        rollupFormat: 'iife',
      },
      devOptions: {
        // Makes local testing of Share Target much easier.
        enabled: true,
      },
      manifest: {
        name: 'Instant Mirror',
        short_name: 'Instant Mirror',
        description: 'Instant Mirror',
        theme_color: '#000000',
        background_color: '#000000',
        start_url: process.env.VITE_BASE_URL || '/',
        display: 'standalone',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        ],
        share_target: {
          action: `${(process.env.VITE_BASE_URL || '/').replace(/\/?$/, '/') }share-target`,
          method: 'POST',
          enctype: 'multipart/form-data',
          params: {
            title: 'title',
            text: 'text',
            url: 'url',
            files: [
              {
                name: 'files',
                // Keep it broad: images + common document/media types.
                accept: ['image/*', 'text/*', 'application/pdf', 'audio/*', 'video/*', 'application/*'],
              },
            ],
          },
        },
      },
    }),
  ],
  server: {
    proxy: {
      '/api': { target: 'http://localhost:3000', changeOrigin: true },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/__tests__/setup.js'],
  },
});
