import React, { useState, useCallback, useEffect } from 'react';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { parseUnits } from 'viem';
import type { Hex } from 'viem';
import { installSessionKeyWithErc20Limits, Erc20SpendingLimit } from '../utils/crypto';

export interface TokenLimit {
  tokenAddress: string;
  tokenSymbol: string;
  tokenDecimals: number;
  amountHuman: string;
  validUntil: Date;
}

type AegisGuardState =
  | { phase: 'loading' }
  | { phase: 'idle'; enabled: boolean }
  | { phase: 'modal_open'; enabled: boolean }
  | { phase: 'submitting'; enabled: boolean }
  | { phase: 'error'; enabled: boolean; message: string };

export function useAegisGuard(deps: {
  keypairRef: React.MutableRefObject<{ privateKey: Hex; address: Hex } | null>;
  keypairAddress: string | null;
  scaAddress: string;
  updateBlob: (newBlob: string) => Promise<void>;
}) {
  const { keypairRef, keypairAddress, scaAddress, updateBlob } = deps;
  const [state, setState] = useState<AegisGuardState>({ phase: 'loading' });
  const { getAccessToken } = usePrivy();
  const { wallets } = useWallets();

  useEffect(() => {
    let active = true;
    async function fetchPreference() {
      try {
        const token = await getAccessToken();
        if (!token) {
          if (active) setState({ phase: 'idle', enabled: false });
          return;
        }

        const res = await fetch(`${import.meta.env.VITE_BACKEND_URL}/preference`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        
        if (res.ok) {
          const data = await res.json();
          if (active) {
            setState({ phase: 'idle', enabled: !!data.aegisGuardEnabled });
          }
        } else {
          if (active) setState({ phase: 'idle', enabled: false });
        }
      } catch (err) {
        console.error('Failed to fetch preference:', err);
        if (active) setState({ phase: 'idle', enabled: false });
      }
    }
    fetchPreference();
    return () => { active = false; };
  }, [getAccessToken]);

  const enabled = state.phase !== 'loading' && state.phase !== 'error' ? state.enabled : false;
  const isModalOpen = state.phase === 'modal_open';
  const isLoading = state.phase === 'loading' || state.phase === 'submitting';
  const error = state.phase === 'error' ? state.message : null;

  const openModal = useCallback(() => {
    if (state.phase === 'idle' && !state.enabled) {
      setState({ phase: 'modal_open', enabled: false });
    }
  }, [state]);

  const closeModal = useCallback(() => {
    if (state.phase === 'modal_open') {
      setState({ phase: 'idle', enabled: state.enabled });
    }
  }, [state]);

  const disable = useCallback(async () => {
    if (state.phase !== 'idle' || !state.enabled) return;
    try {
      setState({ phase: 'submitting', enabled: true });
      const token = await getAccessToken();
      const res = await fetch(`${import.meta.env.VITE_BACKEND_URL}/preference`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ aegisGuardEnabled: false })
      });
      if (!res.ok) throw new Error('Failed to disable Aegis Guard');
      setState({ phase: 'idle', enabled: false });
    } catch (err: any) {
      console.error(err);
      setState({ phase: 'error', enabled: true, message: err.message || 'Failed to disable' });
    }
  }, [state, getAccessToken]);

  const grant = useCallback(async (tokenLimits: TokenLimit[]) => {
    if (!keypairRef.current || !keypairAddress || !scaAddress) {
      throw new Error('No session key found. Please create one first.');
    }

    const embeddedWallet = wallets.find((w) => w.walletClientType === 'privy');
    if (!embeddedWallet) {
      throw new Error('No embedded wallet found.');
    }

    try {
      setState((s) => ({ ...s, phase: 'submitting' }));

      const limits: Erc20SpendingLimit[] = tokenLimits.map(tl => ({
        tokenAddress: tl.tokenAddress as Hex,
        limitWei: parseUnits(tl.amountHuman, tl.tokenDecimals),
        validUntil: Math.floor(tl.validUntil.getTime() / 1000)
      }));

      const signerAddress = embeddedWallet.address as Hex;
      const provider = await embeddedWallet.getEthereumProvider();
      const paymasterUrl = import.meta.env.VITE_PAYMASTER_URL;

      const serializedBlob = await installSessionKeyWithErc20Limits(
        keypairRef.current.privateKey,
        provider,
        signerAddress,
        limits,
        paymasterUrl
      );

      // Store updated serialized blob back to CloudStorage
      await updateBlob(serializedBlob);

      const token = await getAccessToken();
      const backendUrl = import.meta.env.VITE_BACKEND_URL;

      const delegations = tokenLimits.map(tl => ({
        tokenAddress: tl.tokenAddress,
        tokenSymbol: tl.tokenSymbol,
        tokenDecimals: tl.tokenDecimals,
        limitWei: parseUnits(tl.amountHuman, tl.tokenDecimals).toString(),
        validUntil: Math.floor(tl.validUntil.getTime() / 1000)
      }));

      // POST grant to backend
      const grantRes = await fetch(`${backendUrl}/aegis-guard/grant`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          sessionKeyAddress: keypairAddress,
          smartAccountAddress: scaAddress,
          delegations
        })
      });
      if (!grantRes.ok) throw new Error('Failed to post grant to backend');

      // Update preference
      const prefRes = await fetch(`${backendUrl}/preference`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ aegisGuardEnabled: true })
      });
      if (!prefRes.ok) throw new Error('Failed to update preference');

      setState({ phase: 'idle', enabled: true });
    } catch (err: any) {
      console.error(err);
      setState(s => ({ phase: 'error', enabled: s.phase === 'modal_open' ? s.enabled : false, message: (err as Error).message || 'Failed to grant' }));
    }
  }, [keypairRef, keypairAddress, scaAddress, wallets, getAccessToken, updateBlob]);

  return {
    enabled,
    isModalOpen,
    isLoading,
    error,
    openModal,
    closeModal,
    disable,
    grant
  };
}
