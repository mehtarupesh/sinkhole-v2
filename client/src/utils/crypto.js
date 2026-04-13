// ── Encryption via Web Crypto API (AES-GCM 256-bit, device-local key) ────────
// A random key is generated once per device and stored in IndexedDB settings.
// No passphrase needed — encryption/decryption is automatic and transparent.
//
// Encrypted content format: "enc1:<base64(iv[12] | ciphertext)>"

import { getSetting, setSetting } from './db';

const ALGO   = 'AES-GCM';
const PREFIX = 'enc1:';

// ── Device key — generated once, persisted in settings ───────────────────────

let _cachedKey = null;

async function getDeviceKey() {
  if (_cachedKey) return _cachedKey;

  const stored = await getSetting('encryption_key');
  if (stored) {
    _cachedKey = await crypto.subtle.importKey(
      'jwk', stored, { name: ALGO, length: 256 }, false, ['encrypt', 'decrypt'],
    );
    return _cachedKey;
  }

  // First use: generate a new key and persist it
  const key = await crypto.subtle.generateKey({ name: ALGO, length: 256 }, true, ['encrypt', 'decrypt']);
  const jwk = await crypto.subtle.exportKey('jwk', key);
  await setSetting('encryption_key', jwk);
  _cachedKey = key;
  return key;
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Encrypts plaintext with the device key. Returns a portable encoded string. */
export async function encryptContent(plaintext) {
  const iv  = crypto.getRandomValues(new Uint8Array(12));
  const key = await getDeviceKey();
  const ct  = await crypto.subtle.encrypt({ name: ALGO, iv }, key, new TextEncoder().encode(plaintext));
  const buf = new Uint8Array(iv.length + ct.byteLength);
  buf.set(iv);
  buf.set(new Uint8Array(ct), iv.length);
  return PREFIX + btoa(String.fromCharCode(...buf));
}

/** Decrypts a string produced by encryptContent using the device key. */
export async function decryptContent(ciphertext) {
  const raw  = Uint8Array.from(atob(ciphertext.slice(PREFIX.length)), (c) => c.charCodeAt(0));
  const iv   = raw.slice(0, 12);
  const data = raw.slice(12);
  const key  = await getDeviceKey();
  const plain = await crypto.subtle.decrypt({ name: ALGO, iv }, key, data);
  return new TextDecoder().decode(plain);
}

/** Returns true if the value is an encrypted blob produced by encryptContent. */
export const isEncryptedContent = (v) => typeof v === 'string' && v.startsWith(PREFIX);
