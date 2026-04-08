/**
 * Returns the URL another device should open to join a session.
 * Pass `otp` to embed the current device code (for QR-based auth).
 */
export function getJoinUrl(peerId, otp) {
  const basePath = (import.meta.env.BASE_URL || '/').replace(/\/$/, '');
  const baseUrl = basePath ? `${window.location.origin}${basePath}` : window.location.origin;
  const otpParam = otp ? `&otp=${encodeURIComponent(otp)}` : '';
  return Promise.resolve(`${baseUrl}/connect?peerId=${peerId}${otpParam}`);
}
