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

// ── MediaRecorder + AudioContext helpers ───────────────────────────────────────

const mockGetUserMedia = vi.fn();
global.navigator.mediaDevices = { getUserMedia: mockGetUserMedia };

// Stub AudioContext so the waveform analyser doesn't throw
global.AudioContext = vi.fn().mockImplementation(() => ({
  createMediaStreamSource: vi.fn().mockReturnValue({ connect: vi.fn() }),
  createAnalyser: vi.fn().mockReturnValue({
    fftSize: 128,
    frequencyBinCount: 64,
    getByteFrequencyData: vi.fn(),
    connect: vi.fn(),
  }),
}));

// requestAnimationFrame stub
global.requestAnimationFrame = vi.fn((cb) => { cb(); return 1; });
global.cancelAnimationFrame = vi.fn();

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
      state: 'inactive',
      ondataavailable: null,
      onstop: null,
    };
    const rec = mockRecorder;
    global.MediaRecorder = vi.fn().mockImplementation(function () {
      rec.state = 'recording';
      return rec;
    });
  });

  // ── Rendering ───────────────────────────────────────────────────────────────

  it('renders text input and mic button', () => {
    render(<NoteField value="" onChange={vi.fn()} />);
    expect(screen.getByPlaceholderText('or type a note…')).toBeInTheDocument();
    expect(screen.getByLabelText('Hold to record note')).toBeInTheDocument();
  });

  it('shows existing value in text input', () => {
    render(<NoteField value="existing note" onChange={vi.fn()} />);
    expect(screen.getByDisplayValue('existing note')).toBeInTheDocument();
  });

  // ── Text input ──────────────────────────────────────────────────────────────

  it('calls onChange when typing', () => {
    const onChange = vi.fn();
    render(<NoteField value="" onChange={onChange} />);
    fireEvent.change(screen.getByPlaceholderText('or type a note…'), { target: { value: 'typed note' } });
    expect(onChange).toHaveBeenCalledWith('typed note');
  });

  // ── Recording ────────────────────────────────────────────────────────────────

  it('starts recording on pointer down', async () => {
    render(<NoteField value="" onChange={vi.fn()} />);
    await act(async () => { fireEvent.pointerDown(screen.getByLabelText('Hold to record note')); });
    expect(mockGetUserMedia).toHaveBeenCalledWith({ audio: true });
    expect(mockRecorder.start).toHaveBeenCalled();
    expect(screen.getByLabelText('Release to save note')).toBeInTheDocument();
  });

  it('disables text input while recording', async () => {
    render(<NoteField value="" onChange={vi.fn()} />);
    await act(async () => { fireEvent.pointerDown(screen.getByLabelText('Hold to record note')); });
    expect(screen.getByPlaceholderText('or type a note…')).toBeDisabled();
  });

  it('shows error when microphone is denied', async () => {
    mockGetUserMedia.mockRejectedValueOnce(new Error('denied'));
    render(<NoteField value="" onChange={vi.fn()} />);
    await act(async () => { fireEvent.pointerDown(screen.getByLabelText('Hold to record note')); });
    expect(await screen.findByText('Microphone access denied.')).toBeInTheDocument();
  });

  // ── Transcription ────────────────────────────────────────────────────────────

  it('shows "Transcribing…" hint after releasing', async () => {
    transcribeAudio.mockReturnValueOnce(new Promise(() => {})); // never resolves
    render(<NoteField value="" onChange={vi.fn()} />);
    await act(async () => { fireEvent.pointerDown(screen.getByLabelText('Hold to record note')); });
    await act(async () => { fireEvent.pointerUp(screen.getByLabelText('Release to save note')); });
    expect(screen.getByText('Transcribing…')).toBeInTheDocument();
  });

  it('transcribes on release and calls onChange with transcript', async () => {
    const onChange = vi.fn();
    render(<NoteField value="" onChange={onChange} />);
    await act(async () => { fireEvent.pointerDown(screen.getByLabelText('Hold to record note')); });
    await act(async () => { fireEvent.pointerUp(screen.getByLabelText('Release to save note')); });
    await waitFor(() => expect(transcribeAudio).toHaveBeenCalled());
    await waitFor(() => expect(onChange).toHaveBeenCalledWith('hello transcript'));
  });

  it('calls onTranscriptionDone with transcript after transcribing', async () => {
    const onTranscriptionDone = vi.fn();
    render(<NoteField value="" onChange={vi.fn()} onTranscriptionDone={onTranscriptionDone} />);
    await act(async () => { fireEvent.pointerDown(screen.getByLabelText('Hold to record note')); });
    await act(async () => { fireEvent.pointerUp(screen.getByLabelText('Release to save note')); });
    await waitFor(() => expect(onTranscriptionDone).toHaveBeenCalledWith('hello transcript'));
  });

  it('shows error when no API key during transcription', async () => {
    getSetting.mockResolvedValueOnce(null);
    render(<NoteField value="" onChange={vi.fn()} />);
    await act(async () => { fireEvent.pointerDown(screen.getByLabelText('Hold to record note')); });
    await act(async () => { fireEvent.pointerUp(screen.getByLabelText('Release to save note')); });
    await waitFor(() => expect(screen.getByText(/No Gemini key/)).toBeInTheDocument());
  });

  it('shows error when transcription fails', async () => {
    transcribeAudio.mockRejectedValueOnce(new Error('API error'));
    render(<NoteField value="" onChange={vi.fn()} />);
    await act(async () => { fireEvent.pointerDown(screen.getByLabelText('Hold to record note')); });
    await act(async () => { fireEvent.pointerUp(screen.getByLabelText('Release to save note')); });
    await waitFor(() => expect(screen.getByText('API error')).toBeInTheDocument());
  });

  // ── Disabled state ───────────────────────────────────────────────────────────

  it('disables both input and mic button when disabled prop is true', () => {
    render(<NoteField value="" onChange={vi.fn()} disabled />);
    expect(screen.getByPlaceholderText('or type a note…')).toBeDisabled();
    expect(screen.getByLabelText('Hold to record note')).toBeDisabled();
  });
});
