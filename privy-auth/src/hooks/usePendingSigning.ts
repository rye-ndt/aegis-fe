import React from 'react';
import type { PendingSigningRequest } from '../utils/signingInterceptor';

export function usePendingSigning(): {
  pending: PendingSigningRequest | null;
  onPending: (req: PendingSigningRequest) => void;
} {
  const [pending, setPending] = React.useState<PendingSigningRequest | null>(null);

  // Stable ref so we can safely pass onPending to the interceptor once without
  // re-creating it on every render.
  const onPendingRef = React.useRef<(req: PendingSigningRequest) => void>(null!);

  onPendingRef.current = (req: PendingSigningRequest) => {
    const wrappedApprove = () => {
      req.approve();
      setPending(null);
    };
    const wrappedReject = () => {
      req.reject();
      setPending(null);
    };
    setPending({ ...req, approve: wrappedApprove, reject: wrappedReject });
  };

  const stableOnPending = React.useCallback((req: PendingSigningRequest) => {
    onPendingRef.current(req);
  }, []);

  return { pending, onPending: stableOnPending };
}
