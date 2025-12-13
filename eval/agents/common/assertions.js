import assert from 'assert';

/**
 * Assert intent equals expected (exact match for discrete outputs)
 * @param {*} actual - Actual value
 * @param {*} expected - Expected value
 * @param {string} message - Optional error message
 */
export function assertIntentEquals(actual, expected, message) {
  assert.strictEqual(actual, expected, message || `Expected ${expected}, got ${actual}`);
}

/**
 * Assert date equals expected (fuzzy match, allows tolerance)
 * @param {string|Date} actual - Actual date
 * @param {string|Date} expected - Expected date
 * @param {number} toleranceDays - Tolerance in days (default: 1)
 * @param {string} message - Optional error message
 */
export function assertDateEquals(actual, expected, toleranceDays = 1, message) {
  const actualDate = new Date(actual);
  const expectedDate = new Date(expected);
  const diff = Math.abs(actualDate - expectedDate);
  const diffDays = diff / (1000 * 60 * 60 * 24);
  
  assert(
    diffDays <= toleranceDays,
    message || `Expected date ${expected}, got ${actual} (difference: ${diffDays.toFixed(2)} days)`
  );
}

/**
 * Assert array equals expected (order-independent)
 * @param {Array} actual - Actual array
 * @param {Array} expected - Expected array
 * @param {string} message - Optional error message
 */
export function assertArrayEquals(actual, expected, message) {
  const sortedActual = [...actual].sort();
  const sortedExpected = [...expected].sort();
  
  assert.deepStrictEqual(
    sortedActual,
    sortedExpected,
    message || `Expected [${expected.join(', ')}], got [${actual.join(', ')}]`
  );
}

/**
 * Assert vote parsing result
 * @param {string|null} actual - Actual vote choice
 * @param {string|null} expected - Expected vote choice
 * @param {string} message - Optional error message
 */
export function assertVoteEquals(actual, expected, message) {
  assert.strictEqual(actual, expected, message || `Expected vote ${expected}, got ${actual}`);
}

