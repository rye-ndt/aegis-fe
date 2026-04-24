export function toErrorMessage(err: unknown): string {
  if (typeof err === 'string' && /^(429|503)$/.test(err)) {
    return 'Service is busy. Try again in a moment.';
  }
  if (err instanceof Error && /^(429|503)$/.test(err.message)) {
    return 'Service is busy. Try again in a moment.';
  }
  if (err instanceof Error) return err.message;
  return String(err);
}
