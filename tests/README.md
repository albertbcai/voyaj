# Voyaj Test Suite

This directory contains the comprehensive test suite for the Voyaj MVP.

## Test Structure

```
/tests
├── unit/              # Unit tests for individual components
├── integration/       # Integration tests for full flows
├── edge-cases/       # Edge case and error scenario tests
├── scenarios/        # Realistic scenario tests
├── performance/      # Performance and load tests
├── security/         # Security and authentication tests
├── mocks/            # Mock services (Twilio, Claude, Database)
├── fixtures/         # Test data fixtures
└── utils/            # Test utility functions
```

## Running Tests

### Run All Tests
```bash
npm test
```

### Run Specific Test Suite
```bash
# Unit tests
node --test tests/unit/**/*.test.js

# Integration tests
node --test tests/integration/**/*.test.js

# Edge cases
node --test tests/edge-cases/**/*.test.js
```

### Run Individual Test File
```bash
node --test tests/unit/voting.test.js
```

## Test Coverage

### Unit Tests
- Voting Agent: Vote tallying, majority calculation, tie-breaking
- Parser Agent: Flight extraction, date parsing
- State Machine: Stage transitions, condition checking
- Helpers: Date parsing, utility functions
- Context Builder: Context building, agent-specific context

### Integration Tests
- Full trip flow: Creation → Members → Voting → Flights
- Member management: Joining, leaving, name changes
- Voting flows: Destination, dates, timeouts
- Flight tracking: Booking, updates, cancellation

### Edge Cases
- Message queue: Rapid bursts, ordering, failures
- API errors: Rate limits, timeouts, retries
- Data consistency: Race conditions, transactions
- Input validation: Empty messages, SQL injection, XSS
- State machine: Invalid transitions, concurrent checks

### Scenarios
- Natural conversation: Greetings, questions, ambiguous messages
- Group dynamics: Large groups, small groups, silent members
- Timing: Fast planning, slow planning, timezones

### Performance
- Load testing: 100 concurrent trips, 1000 messages/minute
- Cost testing: Token usage, cost per trip, context optimization

### Security
- Authentication: Phone validation, API keys, rate limiting
- Data protection: PII handling, encryption, backups

## Mock Services

The test suite uses mock services to avoid external dependencies:

- **Mock Twilio Client**: Captures sent SMS messages
- **Mock Claude Client**: Simulates AI responses
- **Mock Database**: In-memory database for testing

## Test Utilities

Common utilities in `tests/utils/test-helpers.js`:

- `createTestTrip()`: Create a test trip
- `createTestMember()`: Create a test member
- `simulateMessage()`: Simulate an incoming message
- `waitForState()`: Wait for state transition
- `clearAllMocks()`: Reset all mocks

## Writing New Tests

1. Import test utilities and mocks
2. Use `beforeEach()` to clear mocks
3. Create test data using helpers
4. Assert expected behavior
5. Clean up in `afterEach()` if needed

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

## Product Decisions Implemented

The test suite reflects the following product decisions:

1. **Tie-breaking**: Extend voting period, ask group to break tie
2. **Multiple flights**: Store both, ask for clarification
3. **Late member joining**: Can vote until voting ends
4. **Past dates**: Use AI to infer intent
5. **Member leaving**: Not supported in MVP
6. **Voting timeout**: Ask group to decide
7. **Flight cancellation**: Mark as cancelled but keep record
8. **Ambiguous votes**: Use AI to extract location
9. **Minimum group size**: Allow 2 people, no warning
10. **Timezone handling**: Label all timezones

## Continuous Testing

Tests should be run:
- Before committing code
- In CI/CD pipeline
- Before deploying to production

Target: 80%+ test coverage



