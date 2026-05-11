/**
 * RingBuffer unit tests.
 *
 * Verifies:
 * - Push 201 entries → oldest evicted (capacity 200 enforced)
 * - `since(N)` returns correct subset (items with seq > N)
 * - `toArray()` returns items in insertion order (oldest first)
 * - Clear resets all state
 *
 * @see packages/foundry-module/src/readers/ring-buffer.ts
 */
import { describe, expect, it } from 'vitest';
import { RingBuffer } from './ring-buffer.js';

interface TestItem {
  seq: number;
  value: string;
}

function makeItem(seq: number): TestItem {
  return { seq, value: `item-${seq}` };
}

describe('RingBuffer', () => {
  describe('push / capacity', () => {
    it('stores items up to capacity', () => {
      const buf = new RingBuffer<TestItem>(3);
      buf.push(makeItem(1));
      buf.push(makeItem(2));
      buf.push(makeItem(3));
      expect(buf.size).toBe(3);
      expect(buf.toArray()).toEqual([makeItem(1), makeItem(2), makeItem(3)]);
    });

    it('evicts oldest on overflow (capacity 3, push 4)', () => {
      const buf = new RingBuffer<TestItem>(3);
      buf.push(makeItem(1));
      buf.push(makeItem(2));
      buf.push(makeItem(3));
      buf.push(makeItem(4)); // Evicts seq=1
      expect(buf.size).toBe(3);
      const arr = buf.toArray();
      expect(arr.map((i) => i.seq)).toEqual([2, 3, 4]);
    });

    it('evicts oldest on overflow — 201 pushes into capacity-200 buffer', () => {
      const buf = new RingBuffer<TestItem>(200);
      for (let i = 1; i <= 201; i++) {
        buf.push(makeItem(i));
      }
      expect(buf.size).toBe(200);
      const arr = buf.toArray();
      // Oldest should be seq=2 (seq=1 evicted)
      expect(arr[0]?.seq).toBe(2);
      // Newest should be seq=201
      expect(arr[199]?.seq).toBe(201);
    });

    it('evicts oldest N items when overflowed by N', () => {
      const buf = new RingBuffer<TestItem>(5);
      for (let i = 1; i <= 8; i++) {
        buf.push(makeItem(i));
      }
      // 8 pushes into capacity-5: oldest 3 evicted (1,2,3)
      expect(buf.size).toBe(5);
      const arr = buf.toArray();
      expect(arr.map((i) => i.seq)).toEqual([4, 5, 6, 7, 8]);
    });
  });

  describe('toArray()', () => {
    it('returns empty array when buffer is empty', () => {
      const buf = new RingBuffer<TestItem>(5);
      expect(buf.toArray()).toEqual([]);
    });

    it('returns items in insertion order (oldest first)', () => {
      const buf = new RingBuffer<TestItem>(5);
      buf.push(makeItem(10));
      buf.push(makeItem(20));
      buf.push(makeItem(30));
      const arr = buf.toArray();
      expect(arr.map((i) => i.seq)).toEqual([10, 20, 30]);
    });

    it('maintains insertion order after overflow', () => {
      const buf = new RingBuffer<TestItem>(3);
      buf.push(makeItem(1));
      buf.push(makeItem(2));
      buf.push(makeItem(3));
      buf.push(makeItem(4)); // Evicts 1
      buf.push(makeItem(5)); // Evicts 2
      const arr = buf.toArray();
      expect(arr.map((i) => i.seq)).toEqual([3, 4, 5]);
    });
  });

  describe('since(cursor)', () => {
    it('returns empty array for empty buffer', () => {
      const buf = new RingBuffer<TestItem>(5);
      expect(buf.since(0)).toEqual([]);
    });

    it('returns all items when cursor is 0', () => {
      const buf = new RingBuffer<TestItem>(5);
      buf.push(makeItem(1));
      buf.push(makeItem(2));
      buf.push(makeItem(3));
      const result = buf.since(0);
      expect(result.map((i) => i.seq)).toEqual([1, 2, 3]);
    });

    it('returns items with seq strictly greater than cursor', () => {
      const buf = new RingBuffer<TestItem>(5);
      buf.push(makeItem(1));
      buf.push(makeItem(2));
      buf.push(makeItem(5));
      buf.push(makeItem(7));
      const result = buf.since(2);
      expect(result.map((i) => i.seq)).toEqual([5, 7]);
    });

    it('returns empty when cursor >= all seqs', () => {
      const buf = new RingBuffer<TestItem>(5);
      buf.push(makeItem(1));
      buf.push(makeItem(2));
      expect(buf.since(2)).toEqual([]);
      expect(buf.since(10)).toEqual([]);
    });

    it('returns correct subset after overflow', () => {
      const buf = new RingBuffer<TestItem>(3);
      for (let i = 1; i <= 5; i++) {
        buf.push(makeItem(i));
      }
      // Buffer contains [3, 4, 5]
      const result = buf.since(3);
      expect(result.map((i) => i.seq)).toEqual([4, 5]);
    });
  });

  describe('clear()', () => {
    it('resets buffer to empty state', () => {
      const buf = new RingBuffer<TestItem>(5);
      buf.push(makeItem(1));
      buf.push(makeItem(2));
      buf.clear();
      expect(buf.size).toBe(0);
      expect(buf.toArray()).toEqual([]);
    });

    it('allows re-use after clear', () => {
      const buf = new RingBuffer<TestItem>(3);
      buf.push(makeItem(1));
      buf.push(makeItem(2));
      buf.push(makeItem(3));
      buf.clear();
      buf.push(makeItem(10));
      buf.push(makeItem(11));
      const arr = buf.toArray();
      expect(arr.map((i) => i.seq)).toEqual([10, 11]);
    });
  });

  describe('edge cases', () => {
    it('handles capacity of 1', () => {
      const buf = new RingBuffer<TestItem>(1);
      buf.push(makeItem(1));
      expect(buf.size).toBe(1);
      buf.push(makeItem(2)); // Evicts 1
      expect(buf.size).toBe(1);
      expect(buf.toArray()[0]?.seq).toBe(2);
    });

    it('exactly at capacity does not evict', () => {
      const buf = new RingBuffer<TestItem>(3);
      buf.push(makeItem(1));
      buf.push(makeItem(2));
      buf.push(makeItem(3));
      expect(buf.size).toBe(3);
      // All 3 should still be there
      const seqs = buf.toArray().map((i) => i.seq);
      expect(seqs).toContain(1);
      expect(seqs).toContain(2);
      expect(seqs).toContain(3);
    });
  });
});
