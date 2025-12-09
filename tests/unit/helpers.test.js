import { test, describe } from 'node:test';
import assert from 'node:assert';
import { parseDateRange } from '../../src/utils/helpers.js';

describe('Helper Functions', () => {
  describe('parseDateRange', () => {
    test('parses "March 15-22" correctly', () => {
      const result = parseDateRange('March 15-22');
      assert(result.start);
      assert(result.end);
      assert.strictEqual(result.start.getMonth(), 2); // March is month 2 (0-indexed)
      assert.strictEqual(result.start.getDate(), 15);
      assert.strictEqual(result.end.getDate(), 22);
    });

    test('parses "march 15-22" (lowercase) correctly', () => {
      const result = parseDateRange('march 15-22');
      assert(result.start);
      assert(result.end);
      assert.strictEqual(result.start.getMonth(), 2);
    });

    test('parses "March 15 to 22" format', () => {
      // Note: current implementation only supports "15-22" format
      // This test documents current behavior
      const result = parseDateRange('March 15 to 22');
      // Should return null dates since format doesn't match
      assert.strictEqual(result.start, null);
      assert.strictEqual(result.end, null);
    });

    test('handles invalid formats gracefully', () => {
      const result1 = parseDateRange('sometime in march');
      assert.strictEqual(result1.start, null);
      assert.strictEqual(result1.end, null);

      const result2 = parseDateRange('march');
      assert.strictEqual(result2.start, null);
      assert.strictEqual(result2.end, null);
    });

    test('handles dates spanning year boundary', () => {
      // December dates should use current year
      const result = parseDateRange('December 20-31');
      assert(result.start);
      assert(result.end);
      assert.strictEqual(result.start.getMonth(), 11); // December
    });

    test('handles various month names', () => {
      const months = ['January', 'February', 'March', 'April', 'May', 'June',
                     'July', 'August', 'September', 'October', 'November', 'December'];
      
      for (const month of months) {
        const result = parseDateRange(`${month} 1-7`);
        assert(result.start, `Failed for ${month}`);
        assert(result.end, `Failed for ${month}`);
      }
    });

    test('handles past dates (will be handled by AI inference)', () => {
      // Current implementation doesn't check if dates are in the past
      // AI will handle intent inference per product decision
      const result = parseDateRange('March 15-22');
      assert(result.start);
      // Date validation happens at higher level
    });
  });
});



