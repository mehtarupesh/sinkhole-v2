import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../utils/db', () => ({
  getAllUnits: vi.fn(),
  deleteUnit: vi.fn().mockResolvedValue(),
  updateUnit: vi.fn(),
}));

import { getAllUnits, deleteUnit, updateUnit } from '../utils/db';
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

  it('renders the search input', async () => {
    renderOverlay();
    await waitForLoad();
    expect(screen.getByPlaceholderText('Search…')).toBeInTheDocument();
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

  // ── Delete (via detail view) ─────────────────────────────────────────────

  it('requires two clicks to delete (confirm pattern)', async () => {
    renderOverlay();
    await waitFor(() => screen.getByText('hello world'));

    fireEvent.click(screen.getByLabelText('Open unit 1'));
    expect(document.querySelector('.unit-detail-modal')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Delete unit'));
    expect(deleteUnit).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText('Confirm delete'));
    await waitFor(() => expect(deleteUnit).toHaveBeenCalledWith(SAMPLE_UNITS[0].id));
  });

  it('removes deleted unit from the list', async () => {
    renderOverlay();
    await waitFor(() => screen.getByText('hello world'));

    fireEvent.click(screen.getByLabelText('Open unit 1'));
    fireEvent.click(screen.getByLabelText('Delete unit'));
    fireEvent.click(screen.getByText('Confirm delete'));

    await waitFor(() => expect(screen.getByPlaceholderText('Search…')).toBeInTheDocument());
    expect(screen.queryByText('hello world')).not.toBeInTheDocument();
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

  // ── Detail view ─────────────────────────────────────────────────────────────

  it('opens detail view when a unit card is clicked', async () => {
    renderOverlay();
    await waitFor(() => screen.getByText('hello world'));

    fireEvent.click(screen.getByLabelText('Open unit 1'));
    expect(document.querySelector('.unit-detail-modal')).toBeInTheDocument();
  });

  it('returns to list view after saving in detail view', async () => {
    const updatedUnit = { ...SAMPLE_UNITS[0], content: 'updated content', updatedAt: Date.now() };
    updateUnit.mockResolvedValue(updatedUnit);
    renderOverlay();
    await waitFor(() => screen.getByText('hello world'));

    fireEvent.click(screen.getByLabelText('Open unit 1'));
    expect(document.querySelector('.unit-detail-modal')).toBeInTheDocument();

    fireEvent.change(screen.getByDisplayValue('hello world'), { target: { value: 'updated content' } });
    fireEvent.click(screen.getByText('Save'));

    await waitFor(() => expect(screen.getByPlaceholderText('Search…')).toBeInTheDocument());
    expect(screen.getByText('updated content')).toBeInTheDocument();
  });

  it('returns to list view when Close is clicked in detail view', async () => {
    renderOverlay();
    await waitFor(() => screen.getByText('hello world'));

    fireEvent.click(screen.getByLabelText('Open unit 1'));
    expect(document.querySelector('.unit-detail-modal')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Close'));
    expect(screen.getByPlaceholderText('Search…')).toBeInTheDocument();
  });

  it('returns to list view when Escape is pressed in detail view', async () => {
    const { onClose } = renderOverlay();
    await waitFor(() => screen.getByText('hello world'));

    fireEvent.click(screen.getByLabelText('Open unit 1'));
    expect(document.querySelector('.unit-detail-modal')).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.getByPlaceholderText('Search…')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });
});
