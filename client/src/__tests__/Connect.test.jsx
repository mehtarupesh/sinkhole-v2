import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockStart = vi.fn();
const mockStop = vi.fn();
const mockConnect = vi.fn();
const mockDisconnect = vi.fn();
let mockConnections = [];

vi.mock('../hooks/usePeer', () => ({
  usePeer: () => ({
    connections: mockConnections,
    start: mockStart,
    stop: mockStop,
    connect: mockConnect,
    disconnect: mockDisconnect,
  }),
}));

vi.mock('../hooks/useSync', () => ({
  useSync: () => [{ content: '' }, vi.fn(), vi.fn()],
}));

vi.mock('../hooks/useVaultSync', () => ({
  useVaultSync: () => ({
    sync: vi.fn(),
    getState: () => ({ status: 'idle', added: 0 }),
  }),
}));

vi.mock('../utils/getJoinUrl', () => ({
  getJoinUrl: vi.fn().mockResolvedValue('http://localhost/connect?peerId=test-id'),
}));

vi.mock('../utils/stableHostId', () => ({
  getStableHostId: () => 'test-host-id',
  isValidPeerId: (id) => id === 'valid-peer',
}));

vi.mock('qrcode.react', () => ({
  QRCodeSVG: ({ value }) => <div data-testid="qr-code">{value}</div>,
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, useNavigate: () => mockNavigate };
});

import Connect from '../pages/Connect';

function renderConnect(initialPath = '/connect') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Connect />
    </MemoryRouter>
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

// ── Clipboard mock ────────────────────────────────────────────────────────────
const mockWriteText = vi.fn().mockResolvedValue(undefined);
Object.defineProperty(navigator, 'clipboard', {
  value: { writeText: mockWriteText },
  configurable: true,
});

describe('Connect page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockConnections = [];
  });

  // ── Mount / unmount ───────────────────────────────────────────────────────

  it('calls start() on mount', () => {
    renderConnect();
    expect(mockStart).toHaveBeenCalledWith('test-host-id');
  });

  it('calls stop() on unmount', () => {
    const { unmount } = renderConnect();
    unmount();
    expect(mockStop).toHaveBeenCalled();
  });

  // ── Not-connected view ────────────────────────────────────────────────────

  it('shows QR code when qrUrl is ready', async () => {
    renderConnect();
    await waitFor(() => expect(screen.getByTestId('qr-code')).toBeInTheDocument());
  });

  it('shows "Scan QR code" button when not connected', () => {
    renderConnect();
    expect(screen.getByText('Scan QR code')).toBeInTheDocument();
  });

  it('shows manual connect form when not connected', () => {
    renderConnect();
    expect(screen.getByPlaceholderText('Host ID')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Connect' })).toBeInTheDocument();
  });

  it('navigates to /scan when Scan QR code is clicked', () => {
    renderConnect();
    fireEvent.click(screen.getByText('Scan QR code'));
    expect(mockNavigate).toHaveBeenCalledWith('/scan');
  });

  it('navigates to / when Back is clicked', () => {
    renderConnect();
    fireEvent.click(screen.getByLabelText('Back to home'));
    expect(mockNavigate).toHaveBeenCalledWith('/');
  });

  // ── Manual connect ────────────────────────────────────────────────────────

  it('calls connect() with the entered host ID', () => {
    renderConnect();
    fireEvent.change(screen.getByPlaceholderText('Host ID'), { target: { value: 'some-peer' } });
    fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
    expect(mockConnect).toHaveBeenCalledWith('some-peer', expect.any(Object));
  });

  it('does not call connect() when Host ID is empty', () => {
    renderConnect();
    fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
    expect(mockConnect).not.toHaveBeenCalled();
  });

  it('calls connect() on Enter key in Host ID input', () => {
    renderConnect();
    const input = screen.getByPlaceholderText('Host ID');
    fireEvent.change(input, { target: { value: 'some-peer' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(mockConnect).toHaveBeenCalledWith('some-peer', expect.any(Object));
  });

  // ── URL param auto-connect ─────────────────────────────────────────────────

  it('does not auto-connect for an invalid ?peerId= param', () => {
    renderConnect('/connect?peerId=invalid!!');
    expect(mockConnect).not.toHaveBeenCalled();
  });

  it('auto-connects when ?peerId= is a valid peer ID and no connection exists', () => {
    renderConnect('/connect?peerId=valid-peer');
    expect(mockConnect).toHaveBeenCalledWith('valid-peer');
  });

  it('does not auto-connect when a connection already exists', () => {
    mockConnections = [{ open: true, peer: 'existing-peer' }];
    renderConnect('/connect?peerId=valid-peer');
    expect(mockConnect).not.toHaveBeenCalled();
  });

  // ── Connected view ────────────────────────────────────────────────────────

  it('shows mirror textarea and sync button when connected', () => {
    mockConnections = [{ open: true, peer: 'peer-abc' }];
    renderConnect();
    expect(screen.getByPlaceholderText('Type here…')).toBeInTheDocument();
    expect(screen.getByText('Sync vault')).toBeInTheDocument();
  });

  it('shows peer label when connected', () => {
    mockConnections = [{ open: true, peer: 'peer-abc' }];
    renderConnect();
    expect(screen.getByText(/Connected/)).toBeInTheDocument();
  });

  it('hides QR and manual form when connected', () => {
    mockConnections = [{ open: true, peer: 'peer-abc' }];
    renderConnect();
    expect(screen.queryByPlaceholderText('Host ID')).not.toBeInTheDocument();
    expect(screen.queryByTestId('qr-code')).not.toBeInTheDocument();
  });

  it('calls disconnect() when the close button is clicked', () => {
    const conn = { open: true, peer: 'peer-abc' };
    mockConnections = [conn];
    renderConnect();
    fireEvent.click(screen.getByLabelText('Disconnect'));
    expect(mockDisconnect).toHaveBeenCalledWith(conn);
  });

  // ── Host ID display ───────────────────────────────────────────────────────

  it('shows the device host ID when not connected', () => {
    renderConnect();
    expect(screen.getByLabelText('Copy device ID')).toBeInTheDocument();
    expect(screen.getByLabelText('Copy device ID').textContent).toContain('test-host-id');
  });

  it('copies host ID to clipboard when clicked', async () => {
    renderConnect();
    await act(async () => {
      fireEvent.click(screen.getByLabelText('Copy device ID'));
    });
    expect(mockWriteText).toHaveBeenCalledWith('test-host-id');
  });

  it('shows "Copied!" feedback after clicking, then reverts', async () => {
    vi.useFakeTimers();
    renderConnect();

    await act(async () => {
      fireEvent.click(screen.getByLabelText('Copy device ID'));
    });
    expect(screen.getByText('Copied!')).toBeInTheDocument();

    await act(async () => { vi.advanceTimersByTime(1500); });
    expect(screen.queryByText('Copied!')).not.toBeInTheDocument();

    vi.useRealTimers();
  });

  it('does not show host ID when connected', () => {
    mockConnections = [{ open: true, peer: 'peer-abc' }];
    renderConnect();
    expect(screen.queryByLabelText('Copy device ID')).not.toBeInTheDocument();
  });
});
