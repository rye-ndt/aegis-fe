import { describe, it, expect } from 'vitest';
import { parsePmPositions } from '../useAppData';

describe('parsePmPositions', () => {
  it('returns positions array from { positions: [...] } shape', () => {
    const body = {
      positions: [
        { id: 'p-1', marketId: 'm-a', side: 'yes', marketQuestion: 'Q?', outcomeLabel: 'YES' },
      ],
    };
    const out = parsePmPositions(body);
    expect(out.positions).toHaveLength(1);
    expect(out.positions[0]!.id).toBe('p-1');
  });

  it('returns empty array for {}', () => {
    expect(parsePmPositions({}).positions).toEqual([]);
  });

  it('returns empty array for null / undefined', () => {
    expect(parsePmPositions(null).positions).toEqual([]);
    expect(parsePmPositions(undefined).positions).toEqual([]);
  });

  it('returns empty array when positions field is missing', () => {
    expect(parsePmPositions({ other: 'field' }).positions).toEqual([]);
  });

  it('returns empty array when positions is not an array (bare-array legacy shape)', () => {
    // Strict shape: bare array input returns empty rather than throwing.
    expect(parsePmPositions([{ id: 'p-1' }]).positions).toEqual([]);
    expect(parsePmPositions({ positions: 'not-an-array' }).positions).toEqual([]);
    expect(parsePmPositions({ positions: null }).positions).toEqual([]);
  });

  it('does not throw on malformed input', () => {
    expect(() => parsePmPositions('string')).not.toThrow();
    expect(() => parsePmPositions(42)).not.toThrow();
    expect(() => parsePmPositions(true)).not.toThrow();
  });
});
