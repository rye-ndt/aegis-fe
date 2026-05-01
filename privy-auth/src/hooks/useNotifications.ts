export type NotificationItem = {
  id: string;
  senderHandle: string | null;
  senderDisplayName: string | null;
  tokenSymbol: string;
  amountFormatted: string;
  chainId: number;
  txHash: string | null;
  createdAtEpoch: number;
  status: 'pending' | 'delivered' | 'failed';
};

export function useNotifications(_limit = 20) {
  return { items: [] as NotificationItem[], loading: false, error: null as string | null };
}
