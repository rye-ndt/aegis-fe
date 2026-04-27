// Stable codes the BE keys off to drive recovery flows (e.g. nudge user into
// the /buy onramp on insufficient_token_balance). Add a new code here AND wire
// the matching BE branch when introducing one.
export type SignErrorCode =
  | 'insufficient_gas'
  | 'insufficient_token_balance'
  | 'insufficient_allowance'
  | 'paymaster_rejected'
  | 'paymaster_balance'
  | 'sponsorship_unavailable'
  | 'session_key_invalid'
  | 'nonce_invalid'
  | 'user_rejected'
  | 'timeout'
  | 'rate_limited'
  | 'service_unavailable'
  | 'unknown';

export type InterpretedError = {
  friendly: string;
  raw: string;
  code: SignErrorCode;
};

const PATTERNS: Array<{ test: RegExp; friendly: string; code: SignErrorCode }> = [
  {
    test: /Insufficient Pimlico balance for sponsorship/i,
    friendly: 'Sorry, the gas sponsor is out of balance. Please try again later.',
    code: 'paymaster_balance',
  },
  {
    test: /sponsorship policy.*(not found|invalid|disabled)/i,
    friendly: 'Gas sponsorship is unavailable right now. Please try again later.',
    code: 'sponsorship_unavailable',
  },
  {
    test: /AA21 didn't pay prefund/i,
    friendly: 'Your account does not have enough balance to pay for gas.',
    code: 'insufficient_gas',
  },
  {
    // Matches both decoded ("ERC20: transfer amount exceeds balance") and the
    // raw revert-data hex form viem sometimes surfaces. The hex
    // "45524332303a207472616e7366657220616d6f756e7420657863656564732062616c616e6365"
    // is the ASCII for that exact string.
    test: /transfer amount exceeds balance|45524332303a207472616e7366657220616d6f756e7420657863656564732062616c616e6365/i,
    friendly: 'Your account does not have enough token balance to complete this transfer.',
    code: 'insufficient_token_balance',
  },
  {
    // Hex "45524332303a20696e73756666696369656e7420616c6c6f77616e6365" = "ERC20: insufficient allowance".
    test: /insufficient allowance|45524332303a20696e73756666696369656e7420616c6c6f77616e6365/i,
    friendly: 'Token spending allowance is too low. Please approve more and try again.',
    code: 'insufficient_allowance',
  },
  {
    test: /AA23 reverted|signature error/i,
    friendly: 'Signature was rejected. The session key may have expired — please re-link.',
    code: 'session_key_invalid',
  },
  {
    test: /AA25 invalid account nonce/i,
    friendly: 'Transaction was already submitted or out of order. Please try again.',
    code: 'nonce_invalid',
  },
  {
    test: /AA(31|32|33|34)/i,
    friendly: 'Paymaster rejected this transaction. Please try again later.',
    code: 'paymaster_rejected',
  },
  {
    test: /user rejected|User denied/i,
    friendly: 'Transaction was rejected.',
    code: 'user_rejected',
  },
  {
    test: /timeout|timed out/i,
    friendly: 'The network is slow. Please try again.',
    code: 'timeout',
  },
  {
    test: /\b(429|rate.?limit)\b/i,
    friendly: 'Service is busy. Try again in a moment.',
    code: 'rate_limited',
  },
  {
    test: /\b(503|service unavailable)\b/i,
    friendly: 'Service is temporarily unavailable. Try again in a moment.',
    code: 'service_unavailable',
  },
];

export function interpretSignError(err: unknown): InterpretedError {
  const raw = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  for (const { test, friendly, code } of PATTERNS) {
    if (test.test(raw)) return { friendly, raw, code };
  }
  return {
    friendly: 'Something went wrong while sending your transaction.',
    raw,
    code: 'unknown',
  };
}
