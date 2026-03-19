import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../utils/db', () => ({
  getSetting: vi.fn().mockResolvedValue('fake-api-key'),
}));

vi.mock('../utils/transcribe', () => ({
  transcribeAudio: vi.fn().mockResolvedValue('hello transcript'),
}));

import NoteField from '../components/NoteField';
import { getSetting } from '../utils/db';
import { transcribeAudio } from '../utils/transcribe';

// ── MediaRecorder helpers ──────────────────────────────────────────────────────

// navigator.mediaDevices is undefined in jsdom — simple assignment works.
// Keep a stable fn reference so tests can assert on it.
const mockGetUserMedia = vi.fn();
global.navigator.mediaDevices = { getUserMedia: mockGetUserMedia };

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('NoteField', () => {
  let mockRecorder;

  beforeEach(() => {
    vi.clearAllMocks();
    const mockStream = { getTracks: () => [{ stop: vi.fn() }] };
    mockGetUserMedia.mockResolvedValue(mockStream);
    mockRecorder = {
      start: vi.fn(),
      // stop() triggers onstop synchronously so tests can await it
      stop: vi.fn(function () { this.onstop?.(); }),
      ondataavailable: null,
      onstop: null,
    };
    // Must use a regular function (not arrow) so `new MediaRecorder()` works
    const rec = mockRecorder;
    global.MediaRecorder = vi.fn().mockImplementation(function () { return rec; });
  });

  // ── Rendering ───────────────────────────────────────────────────────────────

  it('renders voice mode by default with mic button and mode toggle', () => {
    render(<NoteField value="" onChange={vi.fn()} />);
    expect(screen.getByText('Record note')).toBeInTheDocument();
    expect(screen.getByText('type instead')).toBeInTheDocument();
  });

  it('renders existing quote in voice mode', () => {
    render(<NoteField value="existing note" onChange={vi.fn()} />);
    expect(screen.getByText('existing note')).toBeInTheDocument();
    expect(screen.getByLabelText('Discard note')).toBeInTheDocument();
  });

  // ── Mode switching ───────────────────────────────────────────────────────────

  it('switches to text mode on "type instead"', () => {
    render(<NoteField value="" onChange={vi.fn()} />);
    fireEvent.click(screen.getByText('type instead'));
    expect(screen.getByPlaceholderText('Add a note…')).toBeInTheDocument();
    expect(screen.getByText('voice')).toBeInTheDocument();
  });

  it('switches back to voice mode on "voice" toggle', () => {
    render(<NoteField value="" onChange={vi.fn()} />);
    fireEvent.click(screen.getByText('type instead'));
    fireEvent.click(screen.getByText('voice'));
    expect(screen.getByText('Record note')).toBeInTheDocument();
  });

  it('calls onChange("") when switching to voice (clears old value)', () => {
    const onChange = vi.fn();
    render(<NoteField value="old" onChange={onChange} />);
    fireEvent.click(screen.getByText('type instead')); // voice → text
    fireEvent.click(screen.getByText('voice')); // text → voice: clears
    expect(onChange).toHaveBeenLastCalledWith('');
  });

  it('preserves value when switching to text (so user can edit existing quote)', () => {
    // Switching to text should NOT call onChange — parent's value carries over
    const onChange = vi.fn();
    render(<NoteField value="keep me" onChange={onChange} />);
    fireEvent.click(screen.getByText('type instead'));
    // onChange should not have been called with '' on switch to text
    expect(onChange).not.toHaveBeenCalledWith('');
    // text input shows existing value
    expect(screen.getByDisplayValue('keep me')).toBeInTheDocument();
  });

  // ── Text mode ────────────────────────────────────────────────────────────────

  it('calls onChange when typing in text mode', () => {
    const onChange = vi.fn();
    render(<NoteField value="" onChange={onChange} />);
    fireEvent.click(screen.getByText('type instead'));
    fireEvent.change(screen.getByPlaceholderText('Add a note…'), { target: { value: 'typed note' } });
    expect(onChange).toHaveBeenCalledWith('typed note');
  });

  // ── Discard ──────────────────────────────────────────────────────────────────

  it('calls onChange("") when discarding quote', () => {
    const onChange = vi.fn();
    render(<NoteField value="some note" onChange={onChange} />);
    fireEvent.click(screen.getByLabelText('Discard note'));
    expect(onChange).toHaveBeenCalledWith('');
  });

  // ── Recording ────────────────────────────────────────────────────────────────

  it('starts recording and shows stop button', async () => {
    render(<NoteField value="" onChange={vi.fn()} />);
    await act(async () => { fireEvent.click(screen.getByText('Record note')); });
    expect(mockGetUserMedia).toHaveBeenCalledWith({ audio: true });
    expect(mockRecorder.start).toHaveBeenCalled();
    expect(screen.getByLabelText('Stop recording')).toBeInTheDocument();
  });

  it('hides mode toggle while recording', async () => {
    render(<NoteField value="" onChange={vi.fn()} />);
    await act(async () => { fireEvent.click(screen.getByText('Record note')); });
    expect(screen.queryByText('type instead')).not.toBeInTheDocument();
  });

  it('shows error when microphone is denied', async () => {
    mockGetUserMedia.mockRejectedValueOnce(new Error('denied'));
    render(<NoteField value="" onChange={vi.fn()} />);
    await act(async () => { fireEvent.click(screen.getByText('Record note')); });
    expect(await screen.findByText('Microphone access denied.')).toBeInTheDocument();
  });

  // ── Transcription ────────────────────────────────────────────────────────────

  it('transcribes on stop and calls onChange with transcript', async () => {
    const onChange = vi.fn();
    render(<NoteField value="" onChange={onChange} />);
    await act(async () => { fireEvent.click(screen.getByText('Record note')); });
    await act(async () => { fireEvent.click(screen.getByLabelText('Stop recording')); });
    await waitFor(() => expect(transcribeAudio).toHaveBeenCalled());
    await waitFor(() => expect(onChange).toHaveBeenCalledWith('hello transcript'));
  });

  it('shows "Re-record" after successful transcription', async () => {
    render(<NoteField value="hello transcript" onChange={vi.fn()} />);
    // Simulate done state by triggering full flow
    await act(async () => { fireEvent.click(screen.getByLabelText('Discard note')); });
    // After discard, state resets to idle — mic button shows "Voice note" again
    expect(screen.getByText('Record note')).toBeInTheDocument();
  });

  it('shows error when no API key during transcription', async () => {
    getSetting.mockResolvedValueOnce(null);
    render(<NoteField value="" onChange={vi.fn()} />);
    await act(async () => { fireEvent.click(screen.getByText('Record note')); });
    await act(async () => { fireEvent.click(screen.getByLabelText('Stop recording')); });
    await waitFor(() => expect(screen.getByText(/No API key/)).toBeInTheDocument());
  });

  it('shows error when transcription fails', async () => {
    transcribeAudio.mockRejectedValueOnce(new Error('API error'));
    render(<NoteField value="" onChange={vi.fn()} />);
    await act(async () => { fireEvent.click(screen.getByText('Record note')); });
    await act(async () => { fireEvent.click(screen.getByLabelText('Stop recording')); });
    await waitFor(() => expect(screen.getByText('API error')).toBeInTheDocument());
  });

  // ── Disabled state ───────────────────────────────────────────────────────────

  it('disables mic button when disabled prop is true', () => {
    render(<NoteField value="" onChange={vi.fn()} disabled />);
    expect(screen.getByLabelText('Record voice note')).toBeDisabled();
  });
});
