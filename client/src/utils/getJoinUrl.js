/**
 * Returns the URL another device should open to join a session.
 */
export function getJoinUrl(peerId) {
  const basePath = (import.meta.env.BASE_URL || '/').replace(/\/$/, '');
  const baseUrl = basePath ? `${window.location.origin}${basePath}` : window.location.origin;
  return Promise.resolve(`${baseUrl}/connect?peerId=${peerId}`);
}
