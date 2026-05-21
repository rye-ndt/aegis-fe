// Revives uintN/intN fields in an EIP-712 message from decimal-string back
// to BigInt by walking the type tree. Needed because JSON can't carry
// BigInt and viem's signTypedData requires real BigInts.

interface TypeField {
  name: string;
  type: string;
}

export function bigintRevive(
  message: Record<string, unknown>,
  types: Record<string, Array<TypeField>>,
  primary: string,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const fields = types[primary] ?? [];
  for (const field of fields) {
    const v = message[field.name];
    const t = field.type;
    if (v === undefined || v === null) {
      out[field.name] = v;
      continue;
    }
    const baseType = t.replace(/\[\]$/, '');
    const isArray = t.endsWith('[]');
    if (/^(u?int)\d*$/.test(baseType)) {
      if (isArray && Array.isArray(v)) {
        out[field.name] = v.map((x) => BigInt(x as string));
      } else {
        out[field.name] = typeof v === 'bigint' ? v : BigInt(v as string | number);
      }
      continue;
    }
    if (types[baseType]) {
      if (isArray && Array.isArray(v)) {
        out[field.name] = v.map((x) =>
          bigintRevive(x as Record<string, unknown>, types, baseType),
        );
      } else {
        out[field.name] = bigintRevive(v as Record<string, unknown>, types, baseType);
      }
      continue;
    }
    out[field.name] = v;
  }
  return out;
}
