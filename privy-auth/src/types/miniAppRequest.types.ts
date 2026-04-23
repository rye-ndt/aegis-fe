export type RequestType = 'auth' | 'sign' | 'approve' | 'onramp';
export type ApproveSubtype = 'session_key' | 'aegis_guard';

interface BaseRequest {
  requestId: string;
  requestType: RequestType;
  createdAt: number;
  expiresAt: number;
}

export interface AuthRequest extends BaseRequest {
  requestType: 'auth';
  telegramChatId: string;
}

export interface SignRequest extends BaseRequest {
  requestType: 'sign';
  userId: string;
  to: string;
  value: string;          // wei as decimal string
  data: string;           // 0x calldata
  description: string;
  autoSign: boolean;
}

export interface ApproveRequest extends BaseRequest {
  requestType: 'approve';
  userId: string;
  subtype: ApproveSubtype;
  reapproval?: boolean;
  tokenAddress?: string;
  amountRaw?: string;
}

export interface OnrampRequest extends BaseRequest {
  requestType: 'onramp';
  userId: string;
  amount: number;
  asset: string;
  chainId: number;
  walletAddress: string;
}

export type MiniAppRequest = AuthRequest | SignRequest | ApproveRequest | OnrampRequest;

interface BaseResponse {
  requestId: string;
  requestType: RequestType;
  privyToken: string;
}

export interface AuthResponse extends BaseResponse {
  requestType: 'auth';
  telegramChatId: string;
}

export interface SignResponse extends BaseResponse {
  requestType: 'sign';
  txHash?: string;
  rejected?: boolean;
}

interface DelegationRecordDto {
  publicKey: string;
  address: `0x${string}`;
  smartAccountAddress: `0x${string}`;
  signerAddress: `0x${string}`;
  permissions: unknown[];
  grantedAt: number;
}

export interface ApproveResponse extends BaseResponse {
  requestType: 'approve';
  subtype: ApproveSubtype;
  delegationRecord?: DelegationRecordDto;
  rejected?: boolean;
}

export type MiniAppResponse = AuthResponse | SignResponse | ApproveResponse;
