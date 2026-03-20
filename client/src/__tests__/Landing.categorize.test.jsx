import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('../hooks/useClipboardPaste', () => ({ useClipboardPaste: () => {} }));
vi.mock('../hooks/useDrop', () => ({ useDrop: () => false }));
vi.mock('../utils/pendingShare', () => ({
  readPendingShare: vi.fn().mockResolvedValue(null),
  clearPendingShare: vi.fn(),
}));
vi.mock('../utils/transcribe', () => ({ transcribeAudio: vi.fn() }));

vi.mock('../utils/db', () => ({
  getAllUnits:        vi.fn(),
  deleteUnit:        vi.fn().mockResolvedValue(),
  updateUnit:        vi.fn(),
  getSetting:        vi.fn(),
  getCategorization: vi.fn(),
  setCategorization: vi.fn().mockResolvedValue(),
}));

vi.mock('../utils/carouselGroups', () => ({
  buildCarousels: vi.fn().mockReturnValue([]),
}));

vi.mock('../utils/categorize', () => ({
  categorizeUnits: vi.fn(),
}));

import { getAllUnits, getSetting, getCategorization, setCategorization } from '../utils/db';
import { categorizeUnits } from '../utils/categorize';
import { buildCarousels } from '../utils/carouselGroups';
import Landing from '../pages/Landing';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const UNITS = [
  { id: 1, uid: 'uid-1', type: 'snippet', content: 'Alpha', quote: 'note a', createdAt: 1000 },
  { id: 2, uid: 'uid-2', type: 'snippet', content: 'Beta',  quote: 'note b', createdAt: 2000 },
];

const STORED_GROUPS = [{ id: 'g', title: 'Group', uids: ['uid-1'] }];

function renderLanding() {
  return render(<MemoryRouter><Landing /></MemoryRouter>);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Landing – categorization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAllUnits.mockResolvedValue([...UNITS]);
    getSetting.mockResolvedValue(null);
    getCategorization.mockResolvedValue(STORED_GROUPS); // prevent auto-categorize by default
    buildCarousels.mockReturnValue([]);
    categorizeUnits.mockResolvedValue([]);
  });

  // ── Initial load ────────────────────────────────────────────────────────────

  it('loads stored groups from DB on mount', async () => {
    renderLanding();
    await waitFor(() => expect(getCategorization).toHaveBeenCalled());
  });

  it('passes stored groups to buildCarousels', async () => {
    renderLanding();
    await waitFor(() =>
      expect(buildCarousels).toHaveBeenCalledWith(expect.any(Array), STORED_GROUPS)
    );
  });

  it('passes null to buildCarousels when no stored groups', async () => {
    getCategorization.mockResolvedValue(null);
    getSetting.mockResolvedValue(null); // no API key → auto-categorize fails silently
    renderLanding();
    await waitFor(() =>
      expect(buildCarousels).toHaveBeenCalledWith(expect.any(Array), null)
    );
  });

  // ── Auto-categorize ─────────────────────────────────────────────────────────

  it('auto-categorizes on mount when no stored groups and units exist', async () => {
    getCategorization.mockResolvedValue(null);
    getSetting.mockResolvedValue('test-api-key');
    categorizeUnits.mockResolvedValue([]);
    renderLanding();
    await waitFor(() => expect(categorizeUnits).toHaveBeenCalledWith(UNITS, 'test-api-key'));
  });

  it('does NOT auto-categorize when stored groups already exist', async () => {
    renderLanding();
    await waitFor(() => expect(getCategorization).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 30));
    expect(categorizeUnits).not.toHaveBeenCalled();
  });

  it('does NOT auto-categorize when there are no units', async () => {
    getCategorization.mockResolvedValue(null);
    getAllUnits.mockResolvedValue([]);
    renderLanding();
    await waitFor(() => expect(getCategorization).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 30));
    expect(categorizeUnits).not.toHaveBeenCalled();
  });

  // ── Categorize button ───────────────────────────────────────────────────────

  it('categorize button is present', async () => {
    renderLanding();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Categorize' })).toBeInTheDocument()
    );
  });

  it('categorize button is disabled when no units', async () => {
    getAllUnits.mockResolvedValue([]);
    renderLanding();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Categorize' })).toBeDisabled()
    );
  });

  it('clicking categorize calls categorizeUnits with current units', async () => {
    getSetting.mockResolvedValue('my-key');
    const mockCarousels = [
      { id: 'recent',   title: 'Recent',   units: UNITS },
      { id: 'my-group', title: 'My Group', units: [UNITS[0]] },
    ];
    categorizeUnits.mockResolvedValue(mockCarousels);

    renderLanding();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Categorize' })).toBeInTheDocument()
    );

    fireEvent.click(screen.getByRole('button', { name: 'Categorize' }));
    await waitFor(() => expect(categorizeUnits).toHaveBeenCalledWith(UNITS, 'my-key'));
  });

  it('saves LLM groups (excluding recent and needs-context) to DB', async () => {
    getSetting.mockResolvedValue('my-key');
    const mockCarousels = [
      { id: 'recent',        title: 'Recent',           units: UNITS },
      { id: 'my-group',      title: 'My Group',         units: [UNITS[0]] },
      { id: 'needs-context', title: 'Add Some Context?', units: [UNITS[1]] },
    ];
    categorizeUnits.mockResolvedValue(mockCarousels);

    renderLanding();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Categorize' })).toBeInTheDocument()
    );

    fireEvent.click(screen.getByRole('button', { name: 'Categorize' }));
    await waitFor(() =>
      expect(setCategorization).toHaveBeenCalledWith([
        { id: 'my-group', title: 'My Group', uids: ['uid-1'] },
      ])
    );
  });

  // ── Error toast ─────────────────────────────────────────────────────────────

  it('shows toast when no API key (auto-categorize path)', async () => {
    getCategorization.mockResolvedValue(null);
    getSetting.mockResolvedValue(null);
    renderLanding();
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.getByRole('alert')).toHaveTextContent('No Gemini API key');
  });

  it('shows toast when categorizeUnits throws', async () => {
    getSetting.mockResolvedValue('bad-key');
    categorizeUnits.mockRejectedValue(new Error('LLM exploded'));

    renderLanding();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Categorize' })).toBeInTheDocument()
    );

    fireEvent.click(screen.getByRole('button', { name: 'Categorize' }));
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.getByRole('alert')).toHaveTextContent('LLM exploded');
  });

  it('continues showing stored groups when categorization fails', async () => {
    getSetting.mockResolvedValue('bad-key');
    categorizeUnits.mockRejectedValue(new Error('fail'));

    renderLanding();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Categorize' })).toBeInTheDocument()
    );

    fireEvent.click(screen.getByRole('button', { name: 'Categorize' }));
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());

    // Stored groups were passed to buildCarousels before the failed attempt
    expect(buildCarousels).toHaveBeenCalledWith(expect.any(Array), STORED_GROUPS);
  });

  it('toast can be dismissed by clicking close', async () => {
    getCategorization.mockResolvedValue(null);
    getSetting.mockResolvedValue(null);

    renderLanding();
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  });
});
