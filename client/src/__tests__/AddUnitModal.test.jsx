import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../utils/db', () => ({
  addUnit: vi.fn().mockResolvedValue(1),
  getSetting: vi.fn().mockResolvedValue('fake-key'),
}));

vi.mock('../utils/transcribe', () => ({
  transcribeAudio: vi.fn().mockResolvedValue('transcribed'),
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

  it('renders the modal with type icon buttons', () => {
    renderModal();
    expect(screen.getByLabelText('snippet')).toBeInTheDocument();
    expect(screen.getByLabelText('password')).toBeInTheDocument();
    expect(screen.getByLabelText('image')).toBeInTheDocument();
  });

  it('renders the NoteField with text input and record button', () => {
    renderModal();
    expect(screen.getByPlaceholderText('Add a note…')).toBeInTheDocument();
    expect(screen.getByLabelText('Record voice note')).toBeInTheDocument();
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
    fireEvent.click(screen.getByLabelText('password'));
    expect(screen.getByPlaceholderText('Enter password…')).toBeInTheDocument();
  });

  it('switches to file input when image type is selected', () => {
    renderModal();
    fireEvent.click(screen.getByLabelText('image'));
    expect(document.querySelector('input[type="file"]')).toBeInTheDocument();
  });

  it('marks the active type button', () => {
    renderModal();
    const snippetBtn = screen.getByLabelText('snippet');
    const passwordBtn = screen.getByLabelText('password');
    expect(snippetBtn.className).toContain('add-unit__type-icon--active');
    expect(passwordBtn.className).not.toContain('add-unit__type-icon--active');
    fireEvent.click(passwordBtn);
    expect(passwordBtn.className).toContain('add-unit__type-icon--active');
    expect(snippetBtn.className).not.toContain('add-unit__type-icon--active');
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
    fireEvent.click(screen.getByLabelText('password'));
    fireEvent.click(screen.getByText('Save'));
    expect(await screen.findByText('Content is required')).toBeInTheDocument();
  });

  it('shows an error when saving image with no file selected', async () => {
    renderModal();
    fireEvent.click(screen.getByLabelText('image'));
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

  it('includes a typed note in the saved unit', async () => {
    renderModal();
    fireEvent.change(screen.getByPlaceholderText('Enter text…'), {
      target: { value: 'note with quote' },
    });
    fireEvent.change(screen.getByPlaceholderText('Add a note…'), {
      target: { value: 'my typed note' },
    });
    fireEvent.click(screen.getByText('Save'));
    await waitFor(() =>
      expect(addUnit).toHaveBeenCalledWith(
        expect.objectContaining({ quote: 'my typed note' })
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

  // ── NoteField integration ─────────────────────────────────────────────────

  it('renders NoteField text input alongside record button', () => {
    renderModal();
    expect(screen.getByPlaceholderText('Add a note…')).toBeInTheDocument();
    expect(screen.getByLabelText('Record voice note')).toBeInTheDocument();
  });

  // ── Closing ───────────────────────────────────────────────────────────────

  it('calls onClose when the close button is clicked', () => {
    const { onClose } = renderModal();
    fireEvent.click(screen.getByLabelText('Close'));
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose when the overlay is clicked', () => {
    const { onClose } = renderModal();
    const overlay = document.querySelector('.overlay');
    fireEvent.click(overlay);
    expect(onClose).toHaveBeenCalled();
  });
});
