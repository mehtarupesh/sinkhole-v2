import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('../hooks/useClipboardPaste', () => ({
  useClipboardPaste: () => {},
}));

vi.mock('../hooks/useDrop', () => ({
  useDrop: () => false,
}));

vi.mock('../utils/pendingShare', () => ({
  readPendingShare: vi.fn(),
  clearPendingShare: vi.fn().mockResolvedValue(),
}));

vi.mock('../utils/transcribe', () => ({ transcribeAudio: vi.fn() }));

// AddUnitModal is rendered by Landing — let it render for real so we can assert on it
vi.mock('../utils/db', () => ({
  addUnit:           vi.fn().mockResolvedValue(1),
  getAllUnits:        vi.fn().mockResolvedValue([]),
  getSetting:        vi.fn().mockResolvedValue(null),
  getCategorization: vi.fn().mockResolvedValue([{ id: 'g', title: 'G', uids: [] }]),
  setCategorization: vi.fn().mockResolvedValue(),
}));

vi.mock('../utils/categorize', () => ({
  categorizeUnits: vi.fn().mockResolvedValue([]),
}));

vi.mock('../utils/carouselGroups', () => ({
  buildCarousels: vi.fn().mockReturnValue([]),
}));

import { readPendingShare, clearPendingShare } from '../utils/pendingShare';
import Landing from '../pages/Landing';

function renderLanding(initialPath = '/') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Landing />
    </MemoryRouter>
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Landing – pending share', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    readPendingShare.mockResolvedValue(null);
  });

  it('does not open AddUnit modal when there is no pending share param', async () => {
    renderLanding('/');
    await waitFor(() => expect(readPendingShare).not.toHaveBeenCalled());
    expect(document.querySelector('.add-unit-modal')).not.toBeInTheDocument();
  });

  it('opens AddUnit modal when ?pendingShare=1 and IDB has data', async () => {
    readPendingShare.mockResolvedValue({ type: 'snippet', content: 'shared text' });

    renderLanding('/?pendingShare=1');

    await waitFor(() => expect(document.querySelector('.add-unit-modal')).toBeInTheDocument());
    // The pre-populated content should appear in the textarea
    expect(screen.getByDisplayValue('shared text')).toBeInTheDocument();
  });

  it('calls clearPendingShare after reading', async () => {
    readPendingShare.mockResolvedValue({ type: 'snippet', content: 'hi' });

    renderLanding('/?pendingShare=1');

    await waitFor(() => expect(clearPendingShare).toHaveBeenCalled());
  });

  it('does not open modal when ?pendingShare=1 but IDB returns null', async () => {
    readPendingShare.mockResolvedValue(null);

    renderLanding('/?pendingShare=1');

    await waitFor(() => expect(readPendingShare).toHaveBeenCalled());
    expect(document.querySelector('.add-unit-modal')).not.toBeInTheDocument();
  });

  it('opens modal with image type when share is a file', async () => {
    readPendingShare.mockResolvedValue({
      type: 'image',
      content: 'data:image/png;base64,abc',
      fileName: 'photo.png',
      mimeType: 'image/png',
    });

    renderLanding('/?pendingShare=1');

    await waitFor(() => expect(document.querySelector('.add-unit-modal')).toBeInTheDocument());
    // image type icon should be active
    const imageBtn = screen.getByLabelText('image');
    expect(imageBtn.className).toContain('add-unit__type-icon--active');
  });
});
