import React from 'react';
import { createSessionKeyClient } from '../utils/crypto';

export type SignRequestEvent = {
  type: 'sign_request';
  requestId: string;
  to: string;
  value: string;      // wei as decimal string
  data: string;       // calldata hex
  description: string;
  expiresAt: number;  // unix timestamp
};

export type PendingSigningRequest = {
  event: SignRequestEvent;
  approve: () => Promise<void>;
  reject: () => void;
};

export function useSigningRequests(options: {
  serializedBlob: string | null;   // decrypted blob — null if not unlocked
  jwtToken: string | null;         // backend JWT for auth
  zerodevRpc: string;
}): {
  pending: PendingSigningRequest | null;
} {
  const { serializedBlob, jwtToken, zerodevRpc } = options;
  const backendUrl = (import.meta.env.VITE_BACKEND_URL as string) ?? '';

  const [pending, setPending] = React.useState<PendingSigningRequest | null>(null);

  // FIFO queue of incoming events
  const queueRef = React.useRef<SignRequestEvent[]>([]);
  // Track whether a request is currently displayed (avoid stale closure)
  const isPendingRef = React.useRef(false);

  // Keep latest values accessible inside stable callbacks
  const serializedBlobRef = React.useRef<string | null>(serializedBlob);
  const jwtTokenRef = React.useRef<string | null>(jwtToken);
  React.useEffect(() => { serializedBlobRef.current = serializedBlob; }, [serializedBlob]);
  React.useEffect(() => { jwtTokenRef.current = jwtToken; }, [jwtToken]);

  // dequeueRef holds a stable pointer to the always-current dequeue logic
  const dequeueRef = React.useRef<() => void>(null!);
  dequeueRef.current = () => {
    // Skip expired items
    while (queueRef.current.length > 0) {
      const head = queueRef.current[0];
      if (head.expiresAt > Date.now() / 1000) break;
      queueRef.current.shift();
    }

    const next = queueRef.current.shift();
    if (!next) {
      isPendingRef.current = false;
      setPending(null);
      return;
    }

    isPendingRef.current = true;

    const approve = async (): Promise<void> => {
      const blob = serializedBlobRef.current;
      const jwt = jwtTokenRef.current;
      if (!blob || !jwt) throw new Error('Session not ready — unlock required');

      const client = await createSessionKeyClient(blob, zerodevRpc);
      // sendTransaction automatically wraps the call as a UserOp for smart accounts.
      // Cast required: KernelAccountClient.sendTransaction accepts a union of
      // SendTransactionParameters | SendUserOperationParameters; providing all
      // required fields explicitly keeps TypeScript happy.
      const hash = await client.sendTransaction({
        to: next.to as `0x${string}`,
        value: BigInt(next.value),
        data: next.data as `0x${string}`,
        account: client.account!,
        chain: null,
      } as Parameters<typeof client.sendTransaction>[0]);

      await fetch(`${backendUrl}/sign-response`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${jwt}`,
        },
        body: JSON.stringify({ requestId: next.requestId, txHash: hash }),
      });

      dequeueRef.current();
    };

    const reject = (): void => {
      const jwt = jwtTokenRef.current;
      if (jwt) {
        fetch(`${backendUrl}/sign-response`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${jwt}`,
          },
          body: JSON.stringify({ requestId: next.requestId, rejected: true }),
        }).catch(() => {/* best-effort */});
      }
      dequeueRef.current();
    };

    setPending({ event: next, approve, reject });
  };

  // Open EventSource when both blob and JWT are available
  React.useEffect(() => {
    if (!jwtToken || !serializedBlob) return;

    const url = `${backendUrl}/events?token=${encodeURIComponent(jwtToken)}`;
    const es = new EventSource(url);

    es.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data as string);
        if (data.type !== 'sign_request') return;
        const event = data as SignRequestEvent;
        // Silently drop already-expired events
        if (event.expiresAt <= Date.now() / 1000) return;
        queueRef.current.push(event);
        if (!isPendingRef.current) {
          dequeueRef.current();
        }
      } catch {
        // ignore malformed messages
      }
    };

    es.onerror = (err) => {
      console.error('[SSE] Connection error', err);
      // EventSource will reconnect automatically
    };

    return () => {
      es.close();
    };
  }, [jwtToken, serializedBlob, backendUrl]);

  return { pending };
}
