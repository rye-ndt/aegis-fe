import React from 'react';
import type { SmartWalletClientType } from '@privy-io/react-auth/smart-wallets';

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

const log = (...args: unknown[]) => console.log('[AEGIS:signing]', ...args);
const warn = (...args: unknown[]) => console.warn('[AEGIS:signing]', ...args);

export function useSigningRequests(options: {
  client: SmartWalletClientType | null;
  jwtToken: string | null;
}): {
  pending: PendingSigningRequest | null;
} {
  const { client, jwtToken } = options;
  const backendUrl = (import.meta.env.VITE_BACKEND_URL as string) ?? '';

  const [pending, setPending] = React.useState<PendingSigningRequest | null>(null);

  const queueRef = React.useRef<SignRequestEvent[]>([]);
  const isPendingRef = React.useRef(false);
  const seenIdsRef = React.useRef<Set<string>>(new Set());

  const clientRef = React.useRef<SmartWalletClientType | null>(client);
  const jwtTokenRef = React.useRef<string | null>(jwtToken);
  React.useEffect(() => {
    log('client ref updated:', client ? 'non-null' : 'null');
    clientRef.current = client;
  }, [client]);
  React.useEffect(() => {
    log('jwtToken ref updated:', jwtToken ? `${jwtToken.slice(0, 20)}…` : 'null');
    jwtTokenRef.current = jwtToken;
  }, [jwtToken]);

  const dequeueRef = React.useRef<() => void>(null!);
  dequeueRef.current = () => {
    while (queueRef.current.length > 0) {
      const head = queueRef.current[0];
      if (head.expiresAt > Date.now() / 1000) break;
      warn('dequeue: dropping expired event', head.requestId, 'expiresAt', head.expiresAt, 'now', Math.floor(Date.now() / 1000));
      queueRef.current.shift();
    }

    const next = queueRef.current.shift();
    if (!next) {
      log('dequeue: queue empty, clearing pending');
      isPendingRef.current = false;
      setPending(null);
      return;
    }

    log('dequeue: showing modal for', next.requestId, next);
    isPendingRef.current = true;

    const approve = async (): Promise<void> => {
      const activeClient = clientRef.current;
      const jwt = jwtTokenRef.current;
      log('approve: client=', activeClient ? 'non-null' : 'null', 'jwt=', jwt ? 'present' : 'null');
      if (!activeClient || !jwt) throw new Error('Client and Session not ready');

      const hash = await activeClient.sendTransaction({
        to: next.to as `0x${string}`,
        value: BigInt(next.value),
        data: next.data as `0x${string}`,
        account: activeClient.account!,
        chain: null,
      });
      log('approve: tx sent, hash=', hash);

      await fetch(`${backendUrl}/sign-response`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` },
        body: JSON.stringify({ requestId: next.requestId, txHash: hash }),
      });

      dequeueRef.current();
    };

    const reject = (): void => {
      log('reject: requestId=', next.requestId);
      const jwt = jwtTokenRef.current;
      if (jwt) {
        fetch(`${backendUrl}/sign-response`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` },
          body: JSON.stringify({ requestId: next.requestId, rejected: true }),
        }).catch(() => {});
      }
      dequeueRef.current();
    };

    setPending({ event: next, approve, reject });
  };

  React.useEffect(() => {
    log('effect fired — jwtToken:', jwtToken ? `${jwtToken.slice(0, 20)}…` : 'null', '| client:', client ? 'non-null' : 'null', '| backendUrl:', backendUrl || '(empty!)');

    if (!jwtToken) {
      log('effect: no jwtToken, aborting');
      return;
    }
    if (!backendUrl) {
      warn('effect: VITE_BACKEND_URL is empty — check your .env');
      return;
    }

    // ── Explicit deep-link fetch ──────────────────────────────────────────────
    const queryParams = new URLSearchParams(window.location.search);
    const explicitId = queryParams.get('requestId');
    log('effect: URL requestId param =', explicitId ?? '(none)');

    if (explicitId && !seenIdsRef.current.has(explicitId)) {
      const fetchUrl = `${backendUrl}/sign-requests/${explicitId}`;
      log('explicit fetch: GET', fetchUrl);
      fetch(fetchUrl, { headers: { Authorization: `Bearer ${jwtToken}` } })
        .then(r => {
          log('explicit fetch: HTTP', r.status, r.ok ? 'OK' : 'NOT OK');
          return r.ok ? r.json() : r.text().then(t => { warn('explicit fetch: error body =', t); return null; });
        })
        .then(data => {
          log('explicit fetch: response data =', data);
          if (!data) { warn('explicit fetch: null data (likely 404/403/500), modal will rely on SSE replay'); return; }
          if (data.status !== 'pending') { warn('explicit fetch: status is', data.status, '(not pending)'); return; }
          const now = Math.floor(Date.now() / 1000);
          if (data.expiresAt <= now) { warn('explicit fetch: request expired — expiresAt', data.expiresAt, 'now', now); return; }
          if (seenIdsRef.current.has(explicitId)) { log('explicit fetch: already queued, skip'); return; }

          seenIdsRef.current.add(explicitId);
          const event: SignRequestEvent = {
            type: 'sign_request',
            requestId: data.requestId,
            to: data.to,
            value: data.value,
            data: data.data,
            description: data.description,
            expiresAt: data.expiresAt,
          };
          log('explicit fetch: queuing event', event);
          queueRef.current.unshift(event);
          if (!isPendingRef.current) dequeueRef.current();
        })
        .catch(err => warn('explicit fetch: network error', err));
    }

    // ── SSE connection ────────────────────────────────────────────────────────
    const sseUrl = `${backendUrl}/events?token=${encodeURIComponent(jwtToken)}`;
    log('SSE: opening connection to', sseUrl.replace(jwtToken, jwtToken.slice(0, 20) + '…'));
    const es = new EventSource(sseUrl);

    es.addEventListener('open', () => {
      log('SSE: connection opened');
    });

    es.onmessage = (ev) => {
      log('SSE: raw message =', ev.data);
      try {
        const data = JSON.parse(ev.data as string);
        if (data.type !== 'sign_request') { log('SSE: ignoring non-sign_request message, type =', data.type); return; }
        const event = data as SignRequestEvent;
        const now = Math.floor(Date.now() / 1000);
        if (event.expiresAt <= now) { warn('SSE: event expired — expiresAt', event.expiresAt, 'now', now); return; }
        if (seenIdsRef.current.has(event.requestId)) { log('SSE: duplicate, already queued', event.requestId); return; }

        log('SSE: queuing event', event);
        seenIdsRef.current.add(event.requestId);
        queueRef.current.push(event);
        if (!isPendingRef.current) dequeueRef.current();
      } catch (e) {
        warn('SSE: failed to parse message', e);
      }
    };

    es.onerror = (err) => {
      warn('SSE: connection error', err);
    };

    return () => {
      log('effect cleanup: closing SSE');
      es.close();
    };
  }, [jwtToken, backendUrl]);

  return { pending };
}
