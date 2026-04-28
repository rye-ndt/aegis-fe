import React from 'react';
import { useFundWallet, usePrivy } from '@privy-io/react-auth';
import type { OnrampRequest } from '../../types/miniAppRequest.types';
import { FullScreen } from '../atomics/FullScreen';
import { Spinner } from '../atomics/spinner';
import { ShieldIcon } from '../atomics/icons';
import { createLogger } from '../../utils/logger';
import { toErrorMessage } from '../../utils/toErrorMessage';

const log = createLogger('OnrampHandler');

export function OnrampHandler({ request }: { request: OnrampRequest }) {
  const { ready, authenticated } = usePrivy();
  const { fundWallet } = useFundWallet();
  const attemptedRef = React.useRef(false);
  const [status, setStatus] = React.useState<'idle' | 'opening' | 'done' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

  const open = React.useCallback(async () => {
    setStatus('opening');
    setErrorMsg(null);
    log.info('step', { step: 'started', requestId: request.requestId });
    try {
      await fundWallet({
        address: request.walletAddress,
        options: {
          chain: { id: request.chainId },
          amount: String(request.amount),
          asset: request.asset === 'USDC' ? 'USDC' : 'native-currency',
        },
      });
      log.info('step', { step: 'succeeded', requestId: request.requestId });
      setStatus('done');
    } catch (err) {
      const msg = toErrorMessage(err);
      log.error('fundWallet failed', { requestId: request.requestId, err: msg });
      setErrorMsg(msg);
      setStatus('error');
    }
  }, [fundWallet, request]);

  // Auto-open once Privy is ready and the user is authenticated.
  React.useEffect(() => {
    if (attemptedRef.current) return;
    if (!ready || !authenticated) return;
    attemptedRef.current = true;
    void open();
  }, [ready, authenticated, open]);

  if (status === 'opening' || status === 'idle') {
    return (
      <FullScreen>
        <div className="flex flex-col items-center gap-4">
          <Spinner size="lg" />
          <p className="text-white">Opening card payment…</p>
        </div>
      </FullScreen>
    );
  }

  if (status === 'done') {
    return (
      <FullScreen>
        <div className="flex flex-col items-center gap-4 text-center">
          <ShieldIcon size={48} variant="success" />
          <p className="text-white font-semibold">Payment submitted</p>
          <p className="text-white/70 text-sm max-w-xs">
            Funds typically arrive within a few minutes. You can close this window and return to Telegram.
          </p>
        </div>
      </FullScreen>
    );
  }

  // error
  return (
    <FullScreen>
      <div className="flex flex-col items-center gap-4 text-center max-w-sm">
        <div className="text-5xl">⚠️</div>
        <p className="text-white font-semibold">Couldn't open card payment</p>
        {errorMsg ? <p className="text-white/60 text-xs break-words">{errorMsg}</p> : null}
        <button
          onClick={() => {
            attemptedRef.current = false;
            void open();
          }}
          className="rounded-lg bg-white px-4 py-2 text-black font-medium"
        >
          Try again
        </button>
        <div className="mt-4 rounded-lg bg-white/5 p-3 text-left">
          <p className="text-white/60 text-xs mb-1">Or deposit manually to:</p>
          <p className="text-white font-mono text-xs break-all">{request.walletAddress}</p>
        </div>
      </div>
    </FullScreen>
  );
}
