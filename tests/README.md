# Voyaj Test Suite

This directory contains minimal unit tests for pure logic components. **For integration and AI behavior testing, see the [eval framework](../eval/README.md).**

## Test Structure

```
/tests
├── unit/              # Unit tests for pure logic (no AI)
│   ├── voting.test.js      # Vote counting, majority calculation
│   └── stateMachine.test.js # State transition logic
├── edge-cases/        # Infrastructure edge cases
│   └── message-queue.test.js # Message queue ordering and handling
├── mocks/             # Mock services (Twilio, Database)
├── fixtures/          # Test data fixtures
└── utils/             # Test utility functions
```

## Running Tests

### Run All Tests
```bash
npm test
```

### Run Specific Test Suite
```bash
# Unit tests
npm run test:unit

# Edge cases
npm run test:edge-cases
```

### Run Individual Test File
```bash
node --test tests/unit/voting.test.js
```

## What These Tests Cover

### Unit Tests
- **Voting Agent Logic**: Vote tallying, majority calculation, tie-breaking (pure logic, no AI)
- **State Machine**: Stage transitions, condition checking (pure logic)

### Edge Cases
- **Message Queue**: Rapid bursts, ordering, failures (infrastructure concern)

## What's NOT Here

The following are tested in the [eval framework](../eval/README.md):
- **Integration tests**: Full trip flows, end-to-end scenarios
- **AI behavior**: Agent classification accuracy, response quality
- **Parser/Coordinator agents**: Tested via `eval/agents/`
- **Performance/Security**: Not currently tested

## Mock Services

The test suite uses mock services to avoid external dependencies:

- **Mock Twilio Client**: Captures sent SMS messages
- **Mock Database**: In-memory database for testing

Note: We use **snapshot-based testing** for AI calls (see `eval/`), not mock Claude responses.

## Test Utilities

Common utilities in `tests/utils/test-helpers.js`:

- `createTestTrip()`: Create a test trip
- `createTestMember()`: Create a test member
- `simulateMessage()`: Simulate an incoming message
- `clearAllMocks()`: Reset all mocks

## Writing New Tests

1. Import test utilities and mocks
2. Use `beforeEach()` to clear mocks
3. Create test data using helpers
4. Assert expected behavior

Example:
```javascript
import { test, describe } from 'node:test';
import assert from 'node:assert';
import { createTestTrip, clearAllMocks } from '../utils/test-helpers.js';

describe('My Feature', () => {
  beforeEach(() => {
    clearAllMocks();
  });

  test('does something', async () => {
    const trip = await createTestTrip({ stage: 'created' });
    assert(trip);
  });
});
```

## When to Add Tests Here vs Eval

**Add to `tests/`:**
- Pure logic functions (no AI calls)
- Infrastructure concerns (message queue, error handling)
- Fast, deterministic unit tests

**Add to `eval/`:**
- Integration tests (full flows)
- AI behavior tests (agent accuracy)
- End-to-end scenarios
- Anything that needs real AI responses (via snapshots)
