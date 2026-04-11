import type { DelegationRecord } from '../utils/crypto';

export function DelegationDebugPanel({ record }: { record: DelegationRecord }) {
  return (
    <div className="w-full max-w-sm flex flex-col gap-3 mt-2">
      <p className="text-[10px] font-semibold tracking-widest text-amber-400 uppercase px-1">
        Debug — Delegation Key (On-Chain Session Key Active)
      </p>

      <DebugRow label="Delegated Address" value={record.address} />
      <DebugRow label="Public Key" value={record.publicKey} />
      <DebugRow label="Smart Account" value={record.smartAccountAddress} />
      <DebugRow label="Signer (EOA)" value={record.signerAddress} />

      <p className="text-[10px] font-semibold tracking-widest text-white/30 uppercase px-1 mt-1">
        Granted Permissions
      </p>

      {record.permissions.map((p, i) => (
        <div key={i} className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 flex flex-col gap-1">
          <p className="font-mono text-xs text-white/60">Token: {p.tokenAddress}</p>
          <p className="font-mono text-xs text-white/60">Max: {p.maxAmount} wei</p>
          <p className="font-mono text-xs text-white/60">
            Until: {new Date(p.validUntil * 1000).toISOString()}
          </p>
        </div>
      ))}
    </div>
  );
}

function DebugRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="w-full">
      <p className="text-[10px] font-semibold tracking-widest text-white/30 uppercase mb-1 px-1">
        {label}
      </p>
      <div className="bg-white/5 border border-white/10 rounded-xl px-4 py-3">
        <p className="font-mono text-xs text-white/70 break-all">{value}</p>
      </div>
    </div>
  );
}
