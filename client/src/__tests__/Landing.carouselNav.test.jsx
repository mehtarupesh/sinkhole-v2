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
  getSetting:        vi.fn().mockResolvedValue(null),
  // Return a non-null value so Landing doesn't auto-trigger categorization
  getCategorization: vi.fn().mockResolvedValue([{ id: 'g', title: 'G', uids: [] }]),
  setCategorization: vi.fn().mockResolvedValue(),
}));

vi.mock('../utils/categorize', () => ({
  categorizeUnits: vi.fn().mockResolvedValue([]),
}));

// Control carousel content directly so tests are deterministic
vi.mock('../utils/carouselGroups', () => ({
  buildCarousels: vi.fn(),
}));

import { getAllUnits } from '../utils/db';
import { buildCarousels } from '../utils/carouselGroups';
import Landing from '../pages/Landing';

const UNITS = [
  { id: 1, type: 'snippet', content: 'Alpha content', createdAt: Date.now() },
  { id: 2, type: 'snippet', content: 'Beta content',  createdAt: Date.now() },
  { id: 3, type: 'snippet', content: 'Gamma content', createdAt: Date.now() },
];

function renderLanding() {
  return render(
    <MemoryRouter>
      <Landing />
    </MemoryRouter>
  );
}

describe('Landing – carousel navigation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAllUnits.mockResolvedValue([...UNITS]);
    buildCarousels.mockReturnValue([
      { id: 'test', title: 'Test Carousel', units: UNITS },
    ]);
  });

  async function openFirstCard() {
    await waitFor(() => expect(screen.getByText('Test Carousel')).toBeInTheDocument());
    fireEvent.click(screen.getAllByRole('button', { name: /open unit/i })[0]);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Next' })).toBeInTheDocument());
  }

  // ── Regression: content must update when navigating ───────────────────────

  it('shows the correct content for the first card', async () => {
    renderLanding();
    await openFirstCard();
    expect(screen.getByDisplayValue('Alpha content')).toBeInTheDocument();
  });

  it('shows the next unit content after clicking Next — regression for stale useState bug', async () => {
    renderLanding();
    await openFirstCard();

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    // Without key={currentUnit.id} on UnitDetail this would still show 'Alpha content'
    await waitFor(() =>
      expect(screen.getByDisplayValue('Beta content')).toBeInTheDocument()
    );
    expect(screen.queryByDisplayValue('Alpha content')).not.toBeInTheDocument();
  });

  it('shows the previous unit content after clicking Prev', async () => {
    renderLanding();
    await openFirstCard();

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() => expect(screen.getByDisplayValue('Beta content')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Previous' }));
    await waitFor(() => expect(screen.getByDisplayValue('Alpha content')).toBeInTheDocument());
  });

  // ── Navigation counter ────────────────────────────────────────────────────

  it('counter starts at 1 / 3', async () => {
    renderLanding();
    await openFirstCard();
    expect(screen.getByTestId('unit-detail-nav')).toHaveTextContent('1 / 3');
  });

  it('counter advances after clicking Next', async () => {
    renderLanding();
    await openFirstCard();

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() =>
      expect(screen.getByTestId('unit-detail-nav')).toHaveTextContent('2 / 3')
    );
  });

  // ── Button disabled states ─────────────────────────────────────────────────

  it('Prev is disabled on the first item', async () => {
    renderLanding();
    await openFirstCard();
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
  });

  it('Next is disabled on the last item', async () => {
    renderLanding();
    await openFirstCard();

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() =>
      expect(screen.getByTestId('unit-detail-nav')).toHaveTextContent('3 / 3')
    );
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
  });

  // ── Keyboard navigation ───────────────────────────────────────────────────

  it('ArrowRight navigates to next unit content', async () => {
    renderLanding();
    await openFirstCard();

    fireEvent.keyDown(document, { key: 'ArrowRight' });
    await waitFor(() => expect(screen.getByDisplayValue('Beta content')).toBeInTheDocument());
  });

  it('ArrowLeft navigates back to previous unit content', async () => {
    renderLanding();
    await openFirstCard();

    fireEvent.keyDown(document, { key: 'ArrowRight' });
    await waitFor(() => expect(screen.getByDisplayValue('Beta content')).toBeInTheDocument());

    fireEvent.keyDown(document, { key: 'ArrowLeft' });
    await waitFor(() => expect(screen.getByDisplayValue('Alpha content')).toBeInTheDocument());
  });

  it('Escape closes the detail panel', async () => {
    renderLanding();
    await openFirstCard();

    expect(screen.getByRole('button', { name: 'Next' })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Next' })).not.toBeInTheDocument()
    );
  });
});
