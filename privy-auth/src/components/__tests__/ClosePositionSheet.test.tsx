import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

// Mock the persistTabAfterSign side-effect helper.
const persistSpy = vi.fn();
vi.mock('../StatusView', () => ({
  persistTabAfterSign: (tab: string) => persistSpy(tab),
}));

// Mock useAppConfig so the sheet doesn't need an AppDataProvider.
vi.mock('../../hooks/useAppData', async () => {
  const actual = await vi.importActual<typeof import('../../hooks/useAppData')>('../../hooks/useAppData');
  return {
    ...actual,
    useAppConfig: () => ({ backendUrl: 'http://backend', privyToken: 'tkn' }),
  };
});

// Mock sonner toast — capture calls so assertions can check.
const toastInfo = vi.fn();
const toastWarning = vi.fn();
vi.mock('sonner', () => ({
  toast: { info: (m: string) => toastInfo(m), warning: (m: string) => toastWarning(m) },
}));

// Mock loggedFetch so we can drive responses.
const fetchMock = vi.fn();
vi.mock('../../utils/loggedFetch', () => ({
  loggedFetch: (...args: unknown[]) => fetchMock(...args),
}));

import { ClosePositionSheet } from '../ClosePositionSheet';
import type { PmPosition } from '../../hooks/useAppData';

const POSITION: PmPosition = {
  id: 'pos-1',
  marketId: 'm-a',
  outcomeTokenId: '777',
  side: 'yes',
  marketQuestion: 'Will A?',
  outcomeLabel: 'YES',
  sizeShares: '10',
  entryPriceAvgBps: 5000,
  entryStakeUsdcCents: 500,
  currentValueUsdcCents: 600,
  status: 'open',
  openedAtEpoch: 1,
};

function mockResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// Fresh Response per call — Response.json() can only be read once, so
// reusing a constant across re-renders/strict-mode double effects fails with
// "Body has already been read".
const PREVIEW_OK = () => mockResponse(200, {
  bestBidPriceBps: 6000,
  estProceedsUsdcCents: 600,
  estPnlUsdcCents: 100,
});

const originalLocation = window.location;

beforeEach(() => {
  vi.resetAllMocks();
});

afterEach(() => {
  Object.defineProperty(window, 'location', {
    value: originalLocation,
    writable: true,
    configurable: true,
  });
});

function renderSheet() {
  const onDismiss = vi.fn();
  const onRefetch = vi.fn();
  const utils = render(
    <ClosePositionSheet position={POSITION} onDismiss={onDismiss} onRefetch={onRefetch} />,
  );
  return { ...utils, onDismiss, onRefetch };
}

describe('ClosePositionSheet — preview', () => {
  it('renders preview rows once /previewClose returns 200', async () => {
    fetchMock.mockResolvedValueOnce(PREVIEW_OK());
    renderSheet();
    expect(await screen.findByText('Close position')).toBeInTheDocument();
    expect(await screen.findByText(/Est\. proceeds/i)).toBeInTheDocument();
  });

  it('renders "no longer open" state on 404', async () => {
    fetchMock.mockResolvedValueOnce(mockResponse(404, { code: 'POSITION_NOT_OPEN' }));
    renderSheet();
    expect(await screen.findByText(/no longer open/i)).toBeInTheDocument();
  });
});

describe('ClosePositionSheet — close action', () => {
  it('on 200 with enqueuedRequestId: persists tab and navigates to ?requestId', async () => {
    fetchMock.mockResolvedValueOnce(PREVIEW_OK()).mockResolvedValueOnce(
      mockResponse(200, { enqueuedRequestId: 'req-abc' }),
    );
    const assignSpy = vi.fn();
    Object.defineProperty(window, 'location', {
      value: { pathname: '/app', assign: assignSpy },
      writable: true,
      configurable: true,
    });

    renderSheet();
    const btn = await screen.findByRole('button', { name: /Close position/i });
    fireEvent.click(btn);

    await waitFor(() => expect(assignSpy).toHaveBeenCalledTimes(1));
    expect(assignSpy.mock.calls[0]![0]).toMatch(/\?requestId=req-abc$/);
    expect(persistSpy).toHaveBeenCalledWith('home');
  });

  it('on 200 with null enqueuedRequestId: shows info toast, refetches, dismisses', async () => {
    fetchMock.mockResolvedValueOnce(PREVIEW_OK()).mockResolvedValueOnce(
      mockResponse(200, { enqueuedRequestId: null }),
    );

    const { onDismiss, onRefetch } = renderSheet();
    fireEvent.click(await screen.findByRole('button', { name: /Close position/i }));

    await waitFor(() => expect(toastInfo).toHaveBeenCalled());
    expect(onRefetch).toHaveBeenCalled();
    expect(onDismiss).toHaveBeenCalled();
  });

  it('on 409 BET_IN_FLIGHT: warning toast, sheet stays open', async () => {
    fetchMock.mockResolvedValueOnce(PREVIEW_OK()).mockResolvedValueOnce(
      mockResponse(409, { code: 'BET_IN_FLIGHT', error: 'in flight' }),
    );

    const { onDismiss, onRefetch } = renderSheet();
    fireEvent.click(await screen.findByRole('button', { name: /Close position/i }));

    await waitFor(() => expect(toastWarning).toHaveBeenCalled());
    expect(onRefetch).not.toHaveBeenCalled();
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('on 409 POSITION_WRONG_STATUS: warning toast, refetch, dismiss', async () => {
    fetchMock.mockResolvedValueOnce(PREVIEW_OK()).mockResolvedValueOnce(
      mockResponse(409, { code: 'POSITION_WRONG_STATUS' }),
    );

    const { onDismiss, onRefetch } = renderSheet();
    fireEvent.click(await screen.findByRole('button', { name: /Close position/i }));

    await waitFor(() => expect(toastWarning).toHaveBeenCalled());
    expect(onRefetch).toHaveBeenCalled();
    expect(onDismiss).toHaveBeenCalled();
  });

  it('on 404 POSITION_NOT_OPEN at close-time: info toast, refetch, dismiss', async () => {
    fetchMock.mockResolvedValueOnce(PREVIEW_OK()).mockResolvedValueOnce(
      mockResponse(404, { code: 'POSITION_NOT_OPEN' }),
    );

    const { onDismiss, onRefetch } = renderSheet();
    fireEvent.click(await screen.findByRole('button', { name: /Close position/i }));

    await waitFor(() => expect(toastInfo).toHaveBeenCalled());
    expect(onRefetch).toHaveBeenCalled();
    expect(onDismiss).toHaveBeenCalled();
  });

  it('double-tap fires the close POST exactly once', async () => {
    let resolveClose: (r: Response) => void = () => {};
    fetchMock
      .mockResolvedValueOnce(PREVIEW_OK())
      .mockImplementationOnce(
        () => new Promise<Response>((r) => { resolveClose = r; }),
      );

    renderSheet();
    const btn = await screen.findByRole('button', { name: /Close position/i });
    fireEvent.click(btn);
    fireEvent.click(btn);
    fireEvent.click(btn);

    // 1 preview call + 1 close call only
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const closeCallUrl = String(fetchMock.mock.calls[1]![0]);
    expect(closeCallUrl).toContain('/predictionMarket/positions/pos-1/close');
    resolveClose(mockResponse(200, { enqueuedRequestId: null }));
  });
});
