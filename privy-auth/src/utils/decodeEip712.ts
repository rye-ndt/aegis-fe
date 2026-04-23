import { decodeAbiParameters, parseAbiParameters } from 'viem';

export type KernelEnableRequest = {
  type: 'kernel_enable';
  summary: string;
  fields: { label: string; value: string }[];
  chainId: number;
  contract: string;
};

export type UnknownEip712Request = {
  type: 'unknown';
  summary: string;
  primaryType: string;
  domain: Record<string, unknown>;
  message: Record<string, unknown>;
};

export type HumanReadableSigningRequest = KernelEnableRequest | UnknownEip712Request;

// Known chain names
const CHAIN_NAMES: Record<number, string> = {
  1: 'Ethereum Mainnet',
  11155111: 'Ethereum Sepolia',
  43113: 'Avalanche Fuji',
  43114: 'Avalanche C-Chain',
  137: 'Polygon',
  80001: 'Polygon Mumbai',
  42161: 'Arbitrum One',
  10: 'Optimism',
  8453: 'Base',
};

// Known function selectors
const SELECTOR_NAMES: Record<string, string> = {
  'e9ae5c53': 'execute(ExecutionMode, bytes)',
};

function truncateHex(hex: string, chars = 8): string {
  if (hex.length <= chars * 2 + 2) return hex;
  return `${hex.slice(0, chars + 2)}…${hex.slice(-chars)}`;
}

function decodeKernelEnable(
  domain: Record<string, unknown>,
  message: Record<string, unknown>,
): KernelEnableRequest {
  const chainId = typeof domain.chainId === 'number'
    ? domain.chainId
    : typeof domain.chainId === 'bigint'
      ? Number(domain.chainId)
      : 0;
  const contract = typeof domain.verifyingContract === 'string' ? domain.verifyingContract : '';
  const chainName = CHAIN_NAMES[chainId] ?? `Chain ${chainId}`;

  const fields: { label: string; value: string }[] = [
    { label: 'Chain', value: `${chainName} (${chainId})` },
    { label: 'Smart account', value: truncateHex(contract, 6) },
  ];

  // validationId — first byte indicates plugin type
  const validationId = typeof message.validationId === 'string' ? message.validationId : '';
  if (validationId) {
    const pluginTypeByte = validationId.slice(2, 4);
    const pluginType = pluginTypeByte === '02' ? 'Permission / session key validator' : `Plugin type 0x${pluginTypeByte}`;
    fields.push({ label: 'Plugin type', value: pluginType });
  }

  // nonce
  const nonce = message.nonce;
  if (nonce !== undefined) {
    const nonceNum = typeof nonce === 'bigint' ? Number(nonce) : Number(nonce);
    const nonceLabel = nonceNum === 0
      ? '0 (first installation)'
      : `${nonceNum} (previously installed ${nonceNum} time${nonceNum !== 1 ? 's' : ''})`;
    fields.push({ label: 'Install nonce', value: nonceLabel });
  }

  // hook
  const hook = typeof message.hook === 'string' ? message.hook : '';
  const hookIsZero = /^0x0*$/.test(hook);
  fields.push({ label: 'Hook', value: hookIsZero ? 'None' : truncateHex(hook) });

  // validatorData — ABI decode as (bytes[], bytes[])
  const validatorData = typeof message.validatorData === 'string' ? message.validatorData : '';
  if (validatorData && validatorData !== '0x') {
    try {
      const decoded = decodeAbiParameters(
        parseAbiParameters('bytes[], bytes[]'),
        validatorData as `0x${string}`,
      );
      const signers: string[] = decoded[0] as string[];
      const policies: string[] = decoded[1] as string[];

      if (signers.length > 0) {
        // Each signer entry: strip 1-byte prefix, next 20 bytes = address
        const sessionAddresses = signers.map((s) => {
          const raw = s.replace(/^0x/, '');
          // Skip 1-byte prefix (2 hex chars), take next 40 hex chars = 20 bytes
          const addr = raw.length >= 42 ? `0x${raw.slice(2, 42)}` : s;
          return truncateHex(addr, 6);
        });
        fields.push({ label: 'Session key', value: sessionAddresses.join(', ') });
      }

      if (policies.length > 0) {
        // toSudoPolicy produces a well-known encoding — detect by checking if the
        // policy data is empty/zero (sudo grants full access without constraints)
        const policyLabels = policies.map((p) => {
          const stripped = p.replace(/^0x0*/, '');
          return stripped === '' ? 'Full access (sudo policy)' : `Custom policy (${truncateHex(p)})`;
        });
        fields.push({ label: 'Permissions', value: policyLabels.join(', ') });
      }
    } catch {
      fields.push({ label: 'Validator data', value: truncateHex(validatorData) });
    }
  }

  // selectorData — first 4 bytes = function selector
  const selectorData = typeof message.selectorData === 'string' ? message.selectorData : '';
  if (selectorData && selectorData !== '0x') {
    const selector = selectorData.slice(2, 10).toLowerCase();
    const selectorName = SELECTOR_NAMES[selector] ?? `0x${selector}`;
    fields.push({ label: 'Allowed actions', value: selectorName });
  }

  return {
    type: 'kernel_enable',
    summary: 'Authorize a session key to act on your smart account',
    fields,
    chainId,
    contract,
  };
}

export function decodeEip712(typedDataJson: string): HumanReadableSigningRequest {
  let parsed: {
    domain?: Record<string, unknown>;
    message?: Record<string, unknown>;
    primaryType?: string;
    types?: Record<string, unknown>;
  };

  try {
    parsed = JSON.parse(typedDataJson);
  } catch {
    return {
      type: 'unknown',
      summary: 'Signing request (could not parse data)',
      primaryType: 'Unknown',
      domain: {},
      message: {},
    };
  }

  const domain = (parsed.domain ?? {}) as Record<string, unknown>;
  const message = (parsed.message ?? {}) as Record<string, unknown>;
  const primaryType = parsed.primaryType ?? 'Unknown';

  // Detect Kernel Enable
  if (domain.name === 'Kernel' && primaryType === 'Enable') {
    return decodeKernelEnable(domain, message);
  }

  // Best-effort generic decode
  return {
    type: 'unknown',
    summary: `Sign a ${primaryType} request`,
    primaryType,
    domain,
    message,
  };
}
