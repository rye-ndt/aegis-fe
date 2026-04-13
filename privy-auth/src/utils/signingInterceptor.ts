import type { EIP1193Provider } from 'viem';
import { decodeEip712, type HumanReadableSigningRequest } from './decodeEip712';

export type PendingSigningRequest = {
  decoded: HumanReadableSigningRequest;
  rawParams: unknown[];
  approve: () => void;
  reject: () => void;
};

export function createInterceptingProvider(
  inner: EIP1193Provider,
  onPending: (req: PendingSigningRequest) => void,
): EIP1193Provider {
  return {
    request(args: { method: string; params?: unknown[] }) {
      const { method, params = [] } = args;

      if (method !== 'eth_signTypedData_v4' && method !== 'eth_signTypedData') {
        return inner.request(args as Parameters<typeof inner.request>[0]);
      }

      // params[1] is the JSON string of the typed data
      const rawJson = params[1];
      const jsonString = typeof rawJson === 'string' ? rawJson : JSON.stringify(rawJson);

      let decoded: HumanReadableSigningRequest;
      try {
        decoded = decodeEip712(jsonString);
      } catch {
        decoded = {
          type: 'unknown',
          summary: 'Signing request',
          primaryType: 'Unknown',
          domain: {},
          message: {},
        };
      }

      return new Promise<unknown>((resolve, reject) => {
        const pendingRequest: PendingSigningRequest = {
          decoded,
          rawParams: params,
          approve: () => {
            inner
              .request(args as Parameters<typeof inner.request>[0])
              .then(resolve)
              .catch(reject);
          },
          reject: () => {
            reject({ code: 4001, message: 'User rejected the request.' });
          },
        };
        onPending(pendingRequest);
      });
    },
  } as EIP1193Provider;
}
