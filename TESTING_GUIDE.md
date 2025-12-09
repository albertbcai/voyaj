# Voyaj Testing Guide

## Overview

This guide explains how to run and understand the comprehensive test suite for Voyaj MVP.

## Quick Start

### Run All Tests
```bash
npm test
```

### Run Specific Test Suites
```bash
npm run test:unit          # Unit tests only
npm run test:integration  # Integration tests only
npm run test:edge-cases   # Edge case tests
npm run test:performance  # Performance tests
npm run test:security     # Security tests
```

## Test Structure

### Unit Tests (`tests/unit/`)
Tests individual components in isolation:
- `voting.test.js` - Voting agent logic
- `parser.test.js` - Flight/date parsing
- `helpers.test.js` - Utility functions
- `stateMachine.test.js` - State transitions
- `contextBuilder.test.js` - Context building

### Integration Tests (`tests/integration/`)
Tests full flows end-to-end:
- `full-trip-flow.test.js` - Complete trip lifecycle
- `member-management.test.js` - Member operations
- `voting-flows.test.js` - Voting scenarios
- `flight-tracking.test.js` - Flight booking flows

### Edge Cases (`tests/edge-cases/`)
Tests error scenarios and edge cases:
- `message-queue.test.js` - Queue handling
- `api-errors.test.js` - API error handling
- `data-consistency.test.js` - Race conditions
- `input-validation.test.js` - Input sanitization
- `state-machine.test.js` - State edge cases

### Scenario Tests (`tests/scenarios/`)
Realistic user scenarios:
- `natural-conversation.test.js` - Natural language
- `group-dynamics.test.js` - Group behavior
- `timing.test.js` - Time-based scenarios

### Performance Tests (`tests/performance/`)
Load and cost testing:
- `load.test.js` - Concurrent trips, message volume
- `cost.test.js` - API costs, token usage

### Security Tests (`tests/security/`)
Security and authentication:
- `auth.test.js` - Authentication, rate limiting
- `data-protection.test.js` - PII handling, encryption

## Mock Services

The test suite uses mocks to avoid external dependencies:

### Mock Twilio (`tests/mocks/twilio.js`)
- Captures all sent SMS messages
- No actual SMS sent during tests
- Use `mockTwilioClient.getSentMessages()` to verify

### Mock Claude (`tests/mocks/claude.js`)
- Simulates AI responses
- Can set predefined responses
- Tracks API call count

### Mock Database (`tests/mocks/database.js`)
- In-memory database
- Resets between tests
- Same interface as real database

## Test Utilities

Common helpers in `tests/utils/test-helpers.js`:

```javascript
// Create test data
const trip = await createTestTrip({ stage: 'voting_destination' });
const member = await createTestMember(trip.id, '+15551111111', 'Sarah');

// Simulate messages
await simulateMessage(trip.id, '+15551111111', 'Tokyo', 'group-1');

// Check bot responses
const message = getLastMessageTo('+15551111111');

// Clean up
clearAllMocks();
```

## Product Decisions in Tests

The test suite implements all product decisions:

1. **Tie-breaking**: Tests extend voting period and ask group
2. **Multiple flights**: Tests store both and ask for clarification
3. **Late member joining**: Tests allow voting until voting ends
4. **Past dates**: Tests use AI inference
5. **Member leaving**: Tests document not supported in MVP
6. **Voting timeout**: Tests ask group to decide
7. **Flight cancellation**: Tests mark as cancelled but keep record
8. **Ambiguous votes**: Tests use AI extraction
9. **Minimum group size**: Tests allow 2 people
10. **Timezone handling**: Tests label all timezones

## Running Tests in CI/CD

### GitHub Actions Example
```yaml
name: Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
      - run: npm install
      - run: npm test
```

## Test Coverage Goals

- **Unit Tests**: 80%+ coverage of core logic
- **Integration Tests**: All major flows covered
- **Edge Cases**: All identified edge cases tested
- **Performance**: Load and cost targets validated

## Troubleshooting

### Tests Fail with Import Errors
- Ensure you're using Node.js 18+ (for `node:test`)
- Check that all dependencies are installed: `npm install`

### Mock Services Not Working
- Ensure mocks are imported correctly
- Check that `clearAllMocks()` is called in `beforeEach()`

### Database Tests Fail
- Mock database resets between tests
- Ensure test data is created fresh in each test

## Next Steps

1. Run tests: `npm test`
2. Fix any failing tests
3. Add new tests as features are added
4. Maintain 80%+ coverage
5. Run tests before each commit

## Additional Resources

- See `tests/README.md` for detailed test documentation
- See `PRD.md` for product requirements
- See `TECHNICAL_ARCHITECTURE.md` for system design



