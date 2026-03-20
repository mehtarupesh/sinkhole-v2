import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RECENT_MAX, MAX } from '../utils/carouselGroups';

// ── Mock @google/genai ────────────────────────────────────────────────────────
// vi.hoisted ensures the mock fn is available inside the hoisted vi.mock factory.

const { mockGenerateContent } = vi.hoisted(() => ({
  mockGenerateContent: vi.fn(),
}));

vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    constructor() {
      this.models = { generateContent: mockGenerateContent };
    }
  },
  Type: { ARRAY: 'ARRAY', OBJECT: 'OBJECT', STRING: 'STRING' },
}));

import { categorizeUnits } from '../utils/categorize';

// ── Factories ─────────────────────────────────────────────────────────────────

let counter = 0;
const makeUnit = (overrides = {}) => {
  counter += 1;
  return {
    id: counter,
    uid: `uid-${counter}`,
    type: 'snippet',
    content: `raw content ${counter}`, // must NOT appear in LLM payload
    createdAt: counter * 1000,
    ...overrides,
  };
};

function mockLlmResponse(groups) {
  mockGenerateContent.mockResolvedValueOnce({ text: JSON.stringify(groups) });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  counter = 0;
  mockGenerateContent.mockReset();
});

describe('categorizeUnits', () => {
  it('returns [] for an empty units array without calling the LLM', async () => {
    const result = await categorizeUnits([], 'key');
    expect(result).toEqual([]);
    expect(mockGenerateContent).not.toHaveBeenCalled();
  });

  it('does not call the LLM when all units lack a quote', async () => {
    const units = [makeUnit(), makeUnit()];
    const result = await categorizeUnits(units, 'key');
    expect(mockGenerateContent).not.toHaveBeenCalled();
    // needs-context carousel should still appear
    expect(result.some((c) => c.id === 'needs-context')).toBe(true);
  });

  it('never sends raw content to the LLM', async () => {
    const units = [makeUnit({ quote: 'a note' }), makeUnit({ quote: 'another note' })];
    mockLlmResponse([{ id: 'g1', title: 'Group 1', uids: units.map((u) => u.uid) }]);

    await categorizeUnits(units, 'key');

    const call = mockGenerateContent.mock.calls[0][0];
    const sentText = JSON.stringify(call);
    units.forEach((u) => expect(sentText).not.toContain(u.content));
  });

  it('sends uid, type, and note — but not content — to the LLM', async () => {
    const units = [makeUnit({ quote: 'my note' })];
    mockLlmResponse([{ id: 'g1', title: 'G', uids: [units[0].uid] }]);

    await categorizeUnits(units, 'key');

    const call = mockGenerateContent.mock.calls[0][0];
    const sentText = JSON.stringify(call.contents);
    expect(sentText).toContain(units[0].uid);
    expect(sentText).toContain('snippet');
    expect(sentText).toContain('my note');
  });

  it('"recent" carousel is always first', async () => {
    const units = [makeUnit({ quote: 'note' })];
    mockLlmResponse([{ id: 'g1', title: 'G', uids: [units[0].uid] }]);

    const result = await categorizeUnits(units, 'key');
    expect(result[0].id).toBe('recent');
  });

  it('"recent" carousel contains up to RECENT_MAX units, newest-first', async () => {
    const units = Array.from({ length: RECENT_MAX + 5 }, () => makeUnit({ quote: 'n' }));
    mockLlmResponse([{ id: 'g1', title: 'G', uids: units.map((u) => u.uid) }]);

    const result = await categorizeUnits(units, 'key');
    const recent = result.find((c) => c.id === 'recent');
    expect(recent.units.length).toBeLessThanOrEqual(RECENT_MAX);
    // First item should have the highest createdAt
    expect(recent.units[0].createdAt).toBeGreaterThan(recent.units[1].createdAt);
  });

  it('maps LLM uids back to full unit objects', async () => {
    const units = [makeUnit({ quote: 'note' })];
    mockLlmResponse([{ id: 'g1', title: 'Group', uids: [units[0].uid] }]);

    const result = await categorizeUnits(units, 'key');
    const group = result.find((c) => c.id === 'g1');
    expect(group).toBeDefined();
    expect(group.units[0]).toBe(units[0]); // same object reference
  });

  it('silently drops unknown uids returned by the LLM', async () => {
    const units = [makeUnit({ quote: 'note' })];
    mockLlmResponse([{ id: 'g1', title: 'G', uids: ['ghost-uid', units[0].uid] }]);

    const result = await categorizeUnits(units, 'key');
    const group = result.find((c) => c.id === 'g1');
    expect(group.units).toHaveLength(1);
    expect(group.units[0].uid).toBe(units[0].uid);
  });

  it('units without a quote go to needs-context, not the LLM', async () => {
    const withNote    = makeUnit({ quote: 'has note' });
    const withoutNote = makeUnit(); // no quote
    mockLlmResponse([{ id: 'g1', title: 'G', uids: [withNote.uid] }]);

    const result = await categorizeUnits([withNote, withoutNote], 'key');

    const ctx = result.find((c) => c.id === 'needs-context');
    expect(ctx).toBeDefined();
    expect(ctx.units[0].uid).toBe(withoutNote.uid);
  });

  it('needs-context carousel is absent when all units have quotes', async () => {
    const units = [makeUnit({ quote: 'a' }), makeUnit({ quote: 'b' })];
    mockLlmResponse([{ id: 'g1', title: 'G', uids: units.map((u) => u.uid) }]);

    const result = await categorizeUnits(units, 'key');
    expect(result.find((c) => c.id === 'needs-context')).toBeUndefined();
  });

  it('LLM groups are sorted newest-first and capped at MAX', async () => {
    const units = Array.from({ length: MAX + 3 }, () => makeUnit({ quote: 'n' }));
    mockLlmResponse([{ id: 'g1', title: 'G', uids: units.map((u) => u.uid) }]);

    const result = await categorizeUnits(units, 'key');
    const group = result.find((c) => c.id === 'g1');
    expect(group.units.length).toBeLessThanOrEqual(MAX);
    expect(group.units[0].createdAt).toBeGreaterThan(group.units[1].createdAt);
  });

  it('propagates errors thrown by the LLM', async () => {
    const units = [makeUnit({ quote: 'note' })];
    mockGenerateContent.mockRejectedValueOnce(new Error('API error'));

    await expect(categorizeUnits(units, 'key')).rejects.toThrow('API error');
  });
});
