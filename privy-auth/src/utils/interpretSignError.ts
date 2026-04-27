export type InterpretedError = {
  friendly: string;
  raw: string;
};

const PATTERNS: Array<{ test: RegExp; friendly: string }> = [
  {
    test: /Insufficient Pimlico balance for sponsorship/i,
    friendly: 'Sorry, the gas sponsor is out of balance. Please try again later.',
  },
  {
    test: /sponsorship policy.*(not found|invalid|disabled)/i,
    friendly: 'Gas sponsorship is unavailable right now. Please try again later.',
  },
  {
    test: /AA21 didn't pay prefund/i,
    friendly: 'Your account does not have enough balance to pay for gas.',
  },
  {
    test: /AA23 reverted|signature error/i,
    friendly: 'Signature was rejected. The session key may have expired — please re-link.',
  },
  {
    test: /AA25 invalid account nonce/i,
    friendly: 'Transaction was already submitted or out of order. Please try again.',
  },
  {
    test: /AA(31|32|33|34)/i,
    friendly: 'Paymaster rejected this transaction. Please try again later.',
  },
  {
    test: /user rejected|User denied/i,
    friendly: 'Transaction was rejected.',
  },
  {
    test: /timeout|timed out/i,
    friendly: 'The network is slow. Please try again.',
  },
  {
    test: /\b(429|rate.?limit)\b/i,
    friendly: 'Service is busy. Try again in a moment.',
  },
  {
    test: /\b(503|service unavailable)\b/i,
    friendly: 'Service is temporarily unavailable. Try again in a moment.',
  },
];

export function interpretSignError(err: unknown): InterpretedError {
  const raw = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  for (const { test, friendly } of PATTERNS) {
    if (test.test(raw)) return { friendly, raw };
  }
  return { friendly: 'Something went wrong while sending your transaction.', raw };
}
