import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../utils/db', () => ({
  addUnit: vi.fn().mockResolvedValue(1),
}));

import { addUnit } from '../utils/db';
import AddUnitModal from '../components/AddUnitModal';

function renderModal(props = {}) {
  const onClose = vi.fn();
  const onSaved = vi.fn();
  render(<AddUnitModal onClose={onClose} onSaved={onSaved} {...props} />);
  return { onClose, onSaved };
}

describe('AddUnitModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Rendering ─────────────────────────────────────────────────────────────

  it('renders the modal with title and type buttons', () => {
    renderModal();
    expect(screen.getByText('Add')).toBeInTheDocument();
    expect(screen.getByText('snippet')).toBeInTheDocument();
    expect(screen.getByText('password')).toBeInTheDocument();
    expect(screen.getByText('image')).toBeInTheDocument();
  });

  it('renders the voice note button', () => {
    renderModal();
    expect(screen.getByText('Voice note')).toBeInTheDocument();
  });

  it('renders the Save button', () => {
    renderModal();
    expect(screen.getByText('Save')).toBeInTheDocument();
  });

  // ── Type switching ────────────────────────────────────────────────────────

  it('shows a textarea by default (snippet type)', () => {
    renderModal();
    expect(screen.getByPlaceholderText('Enter text…')).toBeInTheDocument();
  });

  it('switches to password input when password type is selected', () => {
    renderModal();
    fireEvent.click(screen.getByText('password'));
    expect(screen.getByPlaceholderText('Enter password…')).toBeInTheDocument();
  });

  it('switches to file input when image type is selected', () => {
    renderModal();
    fireEvent.click(screen.getByText('image'));
    expect(document.querySelector('input[type="file"]')).toBeInTheDocument();
  });

  it('marks the active type button', () => {
    renderModal();
    const snippetBtn = screen.getByText('snippet');
    const passwordBtn = screen.getByText('password');
    expect(snippetBtn.className).toContain('add-unit__type-btn--active');
    expect(passwordBtn.className).not.toContain('add-unit__type-btn--active');
    fireEvent.click(passwordBtn);
    expect(passwordBtn.className).toContain('add-unit__type-btn--active');
    expect(snippetBtn.className).not.toContain('add-unit__type-btn--active');
  });

  // ── Validation ────────────────────────────────────────────────────────────

  it('shows an error when saving snippet with empty content', async () => {
    renderModal();
    fireEvent.click(screen.getByText('Save'));
    expect(await screen.findByText('Content is required')).toBeInTheDocument();
    expect(addUnit).not.toHaveBeenCalled();
  });

  it('shows an error when saving password with empty content', async () => {
    renderModal();
    fireEvent.click(screen.getByText('password'));
    fireEvent.click(screen.getByText('Save'));
    expect(await screen.findByText('Content is required')).toBeInTheDocument();
  });

  it('shows an error when saving image with no file selected', async () => {
    renderModal();
    fireEvent.click(screen.getByText('image'));
    fireEvent.click(screen.getByText('Save'));
    expect(await screen.findByText('Please select a file')).toBeInTheDocument();
  });

  // ── Saving ────────────────────────────────────────────────────────────────

  it('calls addUnit and closes modal on successful save', async () => {
    const { onClose, onSaved } = renderModal();
    fireEvent.change(screen.getByPlaceholderText('Enter text…'), {
      target: { value: 'my snippet' },
    });
    fireEvent.click(screen.getByText('Save'));
    await waitFor(() => expect(addUnit).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'snippet', content: 'my snippet' })
    ));
    expect(onSaved).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('includes the voice quote in the saved unit', async () => {
    renderModal();
    fireEvent.change(screen.getByPlaceholderText('Enter text…'), {
      target: { value: 'note with voice' },
    });
    // Start then stop recording to produce a stub transcript
    fireEvent.click(screen.getByText('Voice note'));
    fireEvent.click(screen.getByText('Recording…'));
    expect(screen.getByText(/Voice transcript placeholder/)).toBeInTheDocument();
    fireEvent.click(screen.getByText('Save'));
    await waitFor(() =>
      expect(addUnit).toHaveBeenCalledWith(
        expect.objectContaining({ quote: '[Voice transcript placeholder]' })
      )
    );
  });

  it('shows an error message when addUnit rejects', async () => {
    addUnit.mockRejectedValueOnce(new Error('quota exceeded'));
    renderModal();
    fireEvent.change(screen.getByPlaceholderText('Enter text…'), {
      target: { value: 'fail' },
    });
    fireEvent.click(screen.getByText('Save'));
    expect(await screen.findByText('Failed to save. Please try again.')).toBeInTheDocument();
  });

  // ── Closing ───────────────────────────────────────────────────────────────

  it('calls onClose when the close button is clicked', () => {
    const { onClose } = renderModal();
    fireEvent.click(screen.getByLabelText('Close'));
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose when the overlay is clicked', () => {
    const { onClose } = renderModal();
    // The overlay is the direct parent of the modal div
    const overlay = document.querySelector('.overlay');
    fireEvent.click(overlay);
    expect(onClose).toHaveBeenCalled();
  });

  // ── Voice recording stub ──────────────────────────────────────────────────

  it('toggles recording state on mic button click', () => {
    renderModal();
    const micBtn = screen.getByText('Voice note');
    fireEvent.click(micBtn);
    expect(screen.getByText('Recording…')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Recording…'));
    expect(screen.getByText('Voice note')).toBeInTheDocument();
  });

  it('displays the stub transcript after stopping recording', () => {
    renderModal();
    fireEvent.click(screen.getByText('Voice note'));
    fireEvent.click(screen.getByText('Recording…'));
    expect(screen.getByText(/Voice transcript placeholder/)).toBeInTheDocument();
  });
});
