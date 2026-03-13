const http = require('http');
const express = require('express');
const { ExpressPeerServer } = require('peer');

/** Starts a local PeerJS signaling server on port 9000 for E2E tests. */
module.exports = async function globalSetup() {
  const app = express();
  const server = http.createServer(app);
  const peerServer = ExpressPeerServer(server, { path: '/' });
  app.use('/peerjs', peerServer);

  await new Promise((resolve, reject) => {
    server.listen(9000, resolve);
    server.on('error', reject);
  });

  return async () => {
    await new Promise((resolve) => server.close(resolve));
  };
};
