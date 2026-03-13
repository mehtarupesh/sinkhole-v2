/**
 * Cloud-assisted P2P: public PeerJS for signaling, public STUN for NAT traversal.
 * When VITE_PEER_HOST is set (e.g. in E2E tests), uses a local PeerJS server instead.
 */
const _host = import.meta.env.VITE_PEER_HOST;
const _localServer = _host
  ? { host: _host, port: Number(import.meta.env.VITE_PEER_PORT) || 9000, path: import.meta.env.VITE_PEER_PATH || '/peerjs' }
  : {};

export const PEER_OPTIONS = {
  ..._localServer,
  config: {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
    ],
  },
};
