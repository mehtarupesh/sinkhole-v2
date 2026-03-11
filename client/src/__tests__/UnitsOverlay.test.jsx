import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../utils/db', () => ({
  getAllUnits: vi.fn(),
  deleteUnit: vi.fn().mockResolvedValue(),
}));

import { getAllUnits, deleteUnit } from '../utils/db';
import UnitsOverlay from '../components/UnitsOverlay';

const SAMPLE_UNITS = [
  { id: 1, type: 'snippet', content: 'hello world', createdAt: Date.now() },
  { id: 2, type: 'password', content: 'secret123', createdAt: Date.now() },
  { id: 3, type: 'snippet', content: 'another note', quote: 'a voice quote', createdAt: Date.now() },
];

function renderOverlay(props = {}) {
  const onClose = vi.fn();
  render(<UnitsOverlay onClose={onClose} {...props} />);
  return { onClose };
}

// Wait for the initial async data load to settle
async function waitForLoad() {
  await waitFor(() => expect(getAllUnits).toHaveBeenCalled());
}

describe('UnitsOverlay', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAllUnits.mockResolvedValue([...SAMPLE_UNITS]);
  });

  // ── Rendering ─────────────────────────────────────────────────────────────

  it('renders the Saved title', async () => {
    renderOverlay();
    await waitForLoad();
    expect(screen.getByText('Saved')).toBeInTheDocument();
  });

  it('renders a search input', async () => {
    renderOverlay();
    await waitForLoad();
    expect(screen.getByPlaceholderText('Search…')).toBeInTheDocument();
  });

  it('renders all loaded units', async () => {
    renderOverlay();
    await waitFor(() => expect(screen.getByText('hello world')).toBeInTheDocument());
    expect(screen.getByText('another note')).toBeInTheDocument();
  });

  it('renders a voice quote when present', async () => {
    renderOverlay();
    await waitFor(() => expect(screen.getByText('a voice quote')).toBeInTheDocument());
  });

  it('shows password content as dots', async () => {
    renderOverlay();
    await waitFor(() => {
      const dots = screen.getByText(/^•+$/);
      expect(dots).toBeInTheDocument();
    });
  });

  it('shows empty state when no units exist', async () => {
    getAllUnits.mockResolvedValue([]);
    renderOverlay();
    await waitFor(() => expect(screen.getByText('Nothing saved yet')).toBeInTheDocument());
  });

  // ── Search ────────────────────────────────────────────────────────────────

  it('filters units by query', async () => {
    renderOverlay();
    await waitFor(() => screen.getByText('hello world'));

    fireEvent.change(screen.getByPlaceholderText('Search…'), { target: { value: 'hello' } });
    expect(screen.getByText('hello world')).toBeInTheDocument();
    expect(screen.queryByText('another note')).not.toBeInTheDocument();
  });

  it('shows no-match message when query has no results', async () => {
    renderOverlay();
    await waitFor(() => screen.getByText('hello world'));

    fireEvent.change(screen.getByPlaceholderText('Search…'), { target: { value: 'zzznomatch' } });
    expect(screen.getByText('No matches')).toBeInTheDocument();
  });

  it('filters by quote text', async () => {
    renderOverlay();
    await waitFor(() => screen.getByText('a voice quote'));

    fireEvent.change(screen.getByPlaceholderText('Search…'), { target: { value: 'voice quote' } });
    expect(screen.getByText('another note')).toBeInTheDocument();
    expect(screen.queryByText('hello world')).not.toBeInTheDocument();
  });

  // ── Delete ────────────────────────────────────────────────────────────────

  it('requires two clicks to delete (confirm pattern)', async () => {
    renderOverlay();
    await waitFor(() => screen.getAllByLabelText('Delete unit'));

    const deleteButtons = screen.getAllByLabelText('Delete unit');
    fireEvent.click(deleteButtons[0]);
    expect(deleteUnit).not.toHaveBeenCalled();

    fireEvent.click(deleteButtons[0]);
    await waitFor(() => expect(deleteUnit).toHaveBeenCalledWith(SAMPLE_UNITS[2].id));
  });

  it('removes deleted unit from the list', async () => {
    renderOverlay();
    await waitFor(() => screen.getAllByLabelText('Delete unit'));

    const deleteButtons = screen.getAllByLabelText('Delete unit');
    fireEvent.click(deleteButtons[0]);
    fireEvent.click(deleteButtons[0]);

    await waitFor(() => expect(screen.queryByText('another note')).not.toBeInTheDocument());
  });

  // ── Closing ───────────────────────────────────────────────────────────────

  it('calls onClose when the close button is clicked', async () => {
    const { onClose } = renderOverlay();
    await waitForLoad();
    fireEvent.click(screen.getByLabelText('Close'));
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose when Escape is pressed', async () => {
    const { onClose } = renderOverlay();
    await waitForLoad();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose when the overlay backdrop is clicked', async () => {
    const { onClose } = renderOverlay();
    await waitForLoad();
    const overlay = document.querySelector('.overlay');
    fireEvent.click(overlay);
    expect(onClose).toHaveBeenCalled();
  });
});
