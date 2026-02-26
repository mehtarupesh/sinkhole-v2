/**
 * Cloud-assisted P2P: public PeerJS for signaling, public STUN for NAT traversal.
 * No host/port/path = use PeerJS cloud (0.peerjs.com).
 */
export const PEER_OPTIONS = {
  config: {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
    ],
  },
};
