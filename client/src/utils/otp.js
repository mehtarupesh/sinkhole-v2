const WINDOW_MS = 30_000;

function djb2(str) {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = (((hash << 5) + hash) ^ str.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function otpForWindow(hostId, win) {
  return String(djb2(`${hostId}:${win}`) % 10000).padStart(4, '0');
}

export function generateOtp(hostId) {
  return otpForWindow(hostId, Math.floor(Date.now() / WINDOW_MS));
}

/** Accepts current or previous window to handle edge-of-rotation timing. */
export function validateOtp(hostId, code) {
  if (!code) return false;
  const now = Math.floor(Date.now() / WINDOW_MS);
  const normalized = String(code).padStart(4, '0');
  return normalized === otpForWindow(hostId, now) || normalized === otpForWindow(hostId, now - 1);
}
