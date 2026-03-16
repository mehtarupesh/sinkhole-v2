import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../utils/db', () => ({
  updateUnit: vi.fn(),
  getSetting: vi.fn().mockResolvedValue('fake-key'),
}));

vi.mock('../utils/transcribe', () => ({
  transcribeAudio: vi.fn().mockResolvedValue('transcribed'),
}));

import { updateUnit } from '../utils/db';
import UnitDetail from '../components/UnitDetail';

const SNIPPET = { id: 1, type: 'snippet', content: 'hello world', createdAt: Date.now() };
const PASSWORD = { id: 2, type: 'password', content: 'secret', createdAt: Date.now() };
const IMAGE = { id: 3, type: 'image', content: 'data:image/png;base64,abc', fileName: 'pic.png', mimeType: 'image/png', createdAt: Date.now() };
const WITH_QUOTE = { id: 4, type: 'snippet', content: 'note', quote: 'voice text', createdAt: Date.now() };

function renderDetail(unit = SNIPPET, props = {}) {
  const onBack = vi.fn();
  const onSaved = vi.fn();
  const onDelete = vi.fn();
  render(<UnitDetail unit={unit} onBack={onBack} onSaved={onSaved} onDelete={onDelete} {...props} />);
  return { onBack, onSaved, onDelete };
}

describe('UnitDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updateUnit.mockResolvedValue({ ...SNIPPET, content: 'updated', updatedAt: Date.now() });
  });

  // ── Rendering ─────────────────────────────────────────────────────────────

  it('renders a Close button', () => {
    renderDetail();
    expect(screen.getByLabelText('Close')).toBeInTheDocument();
  });

  it('renders the Edit title', () => {
    renderDetail();
    expect(screen.getByText('Edit')).toBeInTheDocument();
  });

  it('renders the type badge', () => {
    renderDetail();
    expect(screen.getByText('snippet')).toBeInTheDocument();
  });

  it('renders snippet content in a textarea', () => {
    renderDetail(SNIPPET);
    expect(screen.getByDisplayValue('hello world')).toBeInTheDocument();
  });

  it('renders password content masked', () => {
    renderDetail(PASSWORD);
    const input = screen.getByDisplayValue('secret');
    expect(input.type).toBe('password');
  });

  it('renders image preview', () => {
    renderDetail(IMAGE);
    const img = screen.getByAltText('pic.png');
    expect(img).toBeInTheDocument();
  });

  it('renders existing quote in NoteField voice mode', () => {
    renderDetail(WITH_QUOTE);
    expect(screen.getByText('voice text')).toBeInTheDocument();
  });

  it('shows createdAt timestamp', () => {
    renderDetail();
    expect(screen.getByText(/Created/)).toBeInTheDocument();
  });

  it('renders the Save button disabled when unchanged', () => {
    renderDetail();
    const saveBtn = screen.getByText('Save');
    expect(saveBtn).toBeInTheDocument();
    expect(saveBtn).toBeDisabled();
  });

  it('renders the NoteField with voice mode by default', () => {
    renderDetail();
    expect(screen.getByText('Voice note')).toBeInTheDocument();
    expect(screen.getByText('type instead')).toBeInTheDocument();
  });

  // ── Editing ───────────────────────────────────────────────────────────────

  it('enables Save button when content changes', () => {
    renderDetail(SNIPPET);
    const textarea = screen.getByDisplayValue('hello world');
    fireEvent.change(textarea, { target: { value: 'changed' } });
    expect(screen.getByText('Save')).not.toBeDisabled();
  });

  it('enables Save button when a typed note is added', () => {
    renderDetail(SNIPPET);
    fireEvent.click(screen.getByText('type instead'));
    fireEvent.change(screen.getByPlaceholderText('Type a note…'), { target: { value: 'a note' } });
    expect(screen.getByText('Save')).not.toBeDisabled();
  });

  it('disables Save button after reverting to original content', () => {
    renderDetail(SNIPPET);
    const textarea = screen.getByDisplayValue('hello world');
    fireEvent.change(textarea, { target: { value: 'changed' } });
    expect(screen.getByText('Save')).not.toBeDisabled();
    fireEvent.change(textarea, { target: { value: 'hello world' } });
    expect(screen.getByText('Save')).toBeDisabled();
  });

  // ── Password show/hide ─────────────────────────────────────────────────────

  it('reveals password on show toggle', () => {
    renderDetail(PASSWORD);
    expect(screen.getByDisplayValue('secret').type).toBe('password');
    fireEvent.click(screen.getByText('show'));
    expect(screen.getByDisplayValue('secret').type).toBe('text');
    expect(screen.getByText('hide')).toBeInTheDocument();
  });

  // ── NoteField integration ─────────────────────────────────────────────────

  it('can switch NoteField between voice and text mode', () => {
    renderDetail();
    fireEvent.click(screen.getByText('type instead'));
    expect(screen.getByPlaceholderText('Type a note…')).toBeInTheDocument();
    fireEvent.click(screen.getByText('voice instead'));
    expect(screen.getByText('Voice note')).toBeInTheDocument();
  });

  it('existing quote is editable in text mode', () => {
    renderDetail(WITH_QUOTE);
    fireEvent.click(screen.getByText('type instead'));
    // existing quote value should be in the text input
    expect(screen.getByDisplayValue('voice text')).toBeInTheDocument();
  });

  // ── Saving ────────────────────────────────────────────────────────────────

  it('calls updateUnit and onSaved on save', async () => {
    const { onSaved } = renderDetail(SNIPPET);
    fireEvent.change(screen.getByDisplayValue('hello world'), { target: { value: 'updated' } });
    fireEvent.click(screen.getByText('Save'));
    await waitFor(() => expect(updateUnit).toHaveBeenCalledWith(SNIPPET.id, expect.objectContaining({ content: 'updated' })));
    expect(onSaved).toHaveBeenCalled();
  });

  it('includes a typed note in the saved unit', async () => {
    renderDetail(SNIPPET);
    fireEvent.change(screen.getByDisplayValue('hello world'), { target: { value: 'note with voice' } });
    fireEvent.click(screen.getByText('type instead'));
    fireEvent.change(screen.getByPlaceholderText('Type a note…'), { target: { value: 'typed note' } });
    fireEvent.click(screen.getByText('Save'));
    await waitFor(() =>
      expect(updateUnit).toHaveBeenCalledWith(
        SNIPPET.id,
        expect.objectContaining({ quote: 'typed note' })
      )
    );
  });

  it('shows error message when save fails', async () => {
    updateUnit.mockRejectedValueOnce(new Error('disk full'));
    renderDetail(SNIPPET);
    fireEvent.change(screen.getByDisplayValue('hello world'), { target: { value: 'changed' } });
    fireEvent.click(screen.getByText('Save'));
    expect(await screen.findByText('Failed to save.')).toBeInTheDocument();
  });

  // ── Delete ────────────────────────────────────────────────────────────────

  it('requires two clicks to delete', () => {
    const { onDelete } = renderDetail();
    fireEvent.click(screen.getByText('Delete'));
    expect(onDelete).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Confirm delete'));
    expect(onDelete).toHaveBeenCalledWith(SNIPPET.id);
  });

  // ── Navigation ────────────────────────────────────────────────────────────

  it('calls onBack when Close is clicked', () => {
    const { onBack } = renderDetail();
    fireEvent.click(screen.getByLabelText('Close'));
    expect(onBack).toHaveBeenCalled();
  });
});
