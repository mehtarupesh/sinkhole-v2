const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: '.',
  testMatch: '**/*.spec.js',
  globalSetup: require.resolve('./global-setup.js'),
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  use: {
    baseURL: 'http://localhost:5175',
    headless: true,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'cd .. && VITE_PEER_HOST=localhost VITE_PEER_PORT=9000 VITE_PEER_PATH=/peerjs npx vite --port 5175',
    url: 'http://localhost:5175',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
