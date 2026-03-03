import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { isValidPeerId, getStableHostId } from '../utils/stableHostId';

describe('isValidPeerId', () => {
  it('accepts valid 3-word slug IDs', () => {
    expect(isValidPeerId('elegant-green-coat')).toBe(true);
    expect(isValidPeerId('bored-ashamed-businessperson')).toBe(true);
  });

  it('accepts two-word slugs', () => {
    expect(isValidPeerId('quick-fox')).toBe(true);
  });

  it('accepts legacy host-xxx format', () => {
    expect(isValidPeerId('host-abc123')).toBe(true);
    expect(isValidPeerId('host-ABC')).toBe(true);
  });

  it('rejects empty string', () => {
    expect(isValidPeerId('')).toBe(false);
  });

  it('rejects null and undefined', () => {
    expect(isValidPeerId(null)).toBe(false);
    expect(isValidPeerId(undefined)).toBe(false);
  });

  it('rejects IDs exceeding max length', () => {
    expect(isValidPeerId('a-'.repeat(33))).toBe(false);
  });

  it('rejects uppercase slugs', () => {
    expect(isValidPeerId('Quick-Fox')).toBe(false);
  });

  it('rejects slugs with numbers', () => {
    expect(isValidPeerId('123-numeric-slug')).toBe(false);
  });

  it('rejects strings with spaces', () => {
    expect(isValidPeerId('has spaces')).toBe(false);
  });

  it('rejects bare words (no hyphen)', () => {
    expect(isValidPeerId('singleword')).toBe(false);
  });
});

describe('getStableHostId', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('returns a valid peer ID', async () => {
    const { getStableHostId: freshGetId } = await import('../utils/stableHostId');
    const id = freshGetId();
    expect(isValidPeerId(id)).toBe(true);
  });

  it('returns the same ID on subsequent calls (stable)', async () => {
    const { getStableHostId: freshGetId } = await import('../utils/stableHostId');
    const id1 = freshGetId();
    const id2 = freshGetId();
    expect(id1).toBe(id2);
  });

  it('persists the ID in localStorage', async () => {
    const { getStableHostId: freshGetId } = await import('../utils/stableHostId');
    const id = freshGetId();
    expect(localStorage.getItem('sinkhole-host-id')).toBe(id);
  });
});
