import { generateSlug } from 'random-word-slugs';

const STORAGE_KEY = 'sinkhole-host-id';

// Slug format: lowercase words separated by hyphens (e.g. elegant-green-coat)
const SLUG_REGEX = /^[a-z]+(-[a-z]+)+$/;
// Legacy format (e.g. host-abc123)
const LEGACY_REGEX = /^host-[a-z0-9]+$/i;

/** Max length to avoid abuse (PeerJS accepts longer, we restrict for safety) */
const MAX_PEER_ID_LENGTH = 64;

/**
 * Returns true if the string is a valid peer ID (slug or legacy format).
 * Use this before connecting to avoid malformed or malicious peer IDs.
 */
export function isValidPeerId(id) {
  if (typeof id !== 'string' || id.length === 0 || id.length > MAX_PEER_ID_LENGTH) return false;
  const trimmed = id.trim();
  return SLUG_REGEX.test(trimmed) || LEGACY_REGEX.test(trimmed);
}

/**
 * Returns a stable host peer ID for this browser/device.
 * Generated once as a human-readable slug and stored in localStorage.
 */
export function getStableHostId() {
  try {
    let id = localStorage.getItem(STORAGE_KEY);
    if (!id || !SLUG_REGEX.test(id)) {
      id = generateSlug(3, { format: 'kebab' });
      localStorage.setItem(STORAGE_KEY, id);
    }
    return id;
  } catch {
    return generateSlug(3, { format: 'kebab' });
  }
}
