/**
 * Returns the URL another device should open to join a session.
 * On localhost, fetches /api/local-ip so the QR uses the LAN IP the phone can reach.
 */
export async function getJoinUrl(peerId) {
  const basePath = (import.meta.env.BASE_URL || '/').replace(/\/$/, '');
  let baseUrl = basePath ? `${window.location.origin}${basePath}` : window.location.origin;
  try {
    const { ip, port } = await fetch('/api/local-ip').then((r) => r.json());
    const { hostname } = window.location;
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      baseUrl = `http://${ip}:${port}`;
    }
  } catch (_) {}
  return `${baseUrl}/connect?peerId=${peerId}`;
}
