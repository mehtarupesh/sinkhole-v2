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
      stop: vi.fn(function () { this.onstop?.(); }),
      ondataavailable: null,
      onstop: null,
    };
    const rec = mockRecorder;
    global.MediaRecorder = vi.fn().mockImplementation(function () { return rec; });
  });

  // ── Rendering ───────────────────────────────────────────────────────────────

  it('renders text input and record button', () => {
    render(<NoteField value="" onChange={vi.fn()} />);
    expect(screen.getByPlaceholderText('Add a note…')).toBeInTheDocument();
    expect(screen.getByLabelText('Record voice note')).toBeInTheDocument();
  });

  it('shows existing value in text input', () => {
    render(<NoteField value="existing note" onChange={vi.fn()} />);
    expect(screen.getByDisplayValue('existing note')).toBeInTheDocument();
  });

  // ── Text input ──────────────────────────────────────────────────────────────

  it('calls onChange when typing', () => {
    const onChange = vi.fn();
    render(<NoteField value="" onChange={onChange} />);
    fireEvent.change(screen.getByPlaceholderText('Add a note…'), { target: { value: 'typed note' } });
    expect(onChange).toHaveBeenCalledWith('typed note');
  });

  // ── Recording ────────────────────────────────────────────────────────────────

  it('starts recording and shows stop button', async () => {
    render(<NoteField value="" onChange={vi.fn()} />);
    await act(async () => { fireEvent.click(screen.getByLabelText('Record voice note')); });
    expect(mockGetUserMedia).toHaveBeenCalledWith({ audio: true });
    expect(mockRecorder.start).toHaveBeenCalled();
    expect(screen.getByLabelText('Stop recording')).toBeInTheDocument();
  });

  it('disables text input while recording', async () => {
    render(<NoteField value="" onChange={vi.fn()} />);
    await act(async () => { fireEvent.click(screen.getByLabelText('Record voice note')); });
    expect(screen.getByPlaceholderText('Add a note…')).toBeDisabled();
  });

  it('shows error when microphone is denied', async () => {
    mockGetUserMedia.mockRejectedValueOnce(new Error('denied'));
    render(<NoteField value="" onChange={vi.fn()} />);
    await act(async () => { fireEvent.click(screen.getByLabelText('Record voice note')); });
    expect(await screen.findByText('Microphone access denied.')).toBeInTheDocument();
  });

  // ── Transcription ────────────────────────────────────────────────────────────

  it('shows "Transcribing…" placeholder after stopping', async () => {
    transcribeAudio.mockReturnValueOnce(new Promise(() => {})); // never resolves
    render(<NoteField value="" onChange={vi.fn()} />);
    await act(async () => { fireEvent.click(screen.getByLabelText('Record voice note')); });
    await act(async () => { fireEvent.click(screen.getByLabelText('Stop recording')); });
    expect(screen.getByPlaceholderText('Transcribing…')).toBeInTheDocument();
  });

  it('transcribes on stop and calls onChange with transcript', async () => {
    const onChange = vi.fn();
    render(<NoteField value="" onChange={onChange} />);
    await act(async () => { fireEvent.click(screen.getByLabelText('Record voice note')); });
    await act(async () => { fireEvent.click(screen.getByLabelText('Stop recording')); });
    await waitFor(() => expect(transcribeAudio).toHaveBeenCalled());
    await waitFor(() => expect(onChange).toHaveBeenCalledWith('hello transcript'));
  });

  it('shows error when no API key during transcription', async () => {
    getSetting.mockResolvedValueOnce(null);
    render(<NoteField value="" onChange={vi.fn()} />);
    await act(async () => { fireEvent.click(screen.getByLabelText('Record voice note')); });
    await act(async () => { fireEvent.click(screen.getByLabelText('Stop recording')); });
    await waitFor(() => expect(screen.getByText(/No API key/)).toBeInTheDocument());
  });

  it('shows error when transcription fails', async () => {
    transcribeAudio.mockRejectedValueOnce(new Error('API error'));
    render(<NoteField value="" onChange={vi.fn()} />);
    await act(async () => { fireEvent.click(screen.getByLabelText('Record voice note')); });
    await act(async () => { fireEvent.click(screen.getByLabelText('Stop recording')); });
    await waitFor(() => expect(screen.getByText('API error')).toBeInTheDocument());
  });

  // ── Disabled state ───────────────────────────────────────────────────────────

  it('disables both input and mic button when disabled prop is true', () => {
    render(<NoteField value="" onChange={vi.fn()} disabled />);
    expect(screen.getByPlaceholderText('Add a note…')).toBeDisabled();
    expect(screen.getByLabelText('Record voice note')).toBeDisabled();
  });
});
