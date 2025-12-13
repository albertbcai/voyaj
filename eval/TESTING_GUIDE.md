# Voyaj Testing Guide

## Overview

The Voyaj evaluation framework supports two testing modes:

1. **Mock Mode** (default) - Fast, free, deterministic tests for state machine and logic
2. **Real API Mode** - Tests actual AI responses for quality and tone validation

## When to Use Each Mode

### Mock Mode (Default) - Use For:

✅ **State machine logic**
- State transitions (planning → voting → planning)
- Data processing (destination suggestions, votes, dates)
- Business logic (vote counting, thresholds, tie detection)
- Edge cases and error handling
- Database operations

✅ **Development and debugging**
- Fast iteration cycles
- No API costs
- Deterministic results (same every time)
- CI/CD pipelines

**What it tests:** Your code's behavior, not AI quality

**What it doesn't test:** Actual AI response quality, tone, or language

### Real API Mode - Use For:

✅ **AI response quality**
- Response tone and naturalness
- Language quality and clarity
- Prompt effectiveness
- Context understanding
- User experience of actual messages

✅ **Pre-deployment validation**
- Before major releases
- Validating critical paths work end-to-end
- Catching API changes/regressions

**What it tests:** Actual AI behavior and response quality

**What it doesn't test well:** Frequent iteration (too slow/expensive)

## How to Run Tests

### Mock Mode (Default)

```bash
# Run all scenarios with mocks (fast, free)
npm run eval

# Run specific scenario with mocks
npm run eval minimum-two-members

# Explicit mock mode (same as default)
npm run eval --mock
# or
MOCK_CLAUDE=true npm run eval
```

### Real API Mode

```bash
# Run all scenarios with real API
npm run eval --real-api

# Run specific scenario with real API
npm run eval --real-api happy-path-3-members

# Explicit real API mode
MOCK_CLAUDE=false npm run eval
```

## Testing Workflow Recommendations

### Daily Development

```bash
# Use mocks for fast iteration
npm run eval --mock

# Fix issues, iterate quickly
# No cost, instant feedback
```

### Before Committing

```bash
# Still use mocks for speed
npm run eval --mock

# Verify all logic tests pass
```

### Before Deploying

```bash
# Run real API tests for critical scenarios
npm run eval --real-api minimum-two-members
npm run eval --real-api happy-path-3-members

# Validate AI quality is still good
```

### Weekly/Monthly

```bash
# Full real API test suite
npm run eval --real-api

# Catch API changes, validate everything works
```

## What Gets Tested in Each Mode

### Mock Mode Tests

- ✅ State transitions work correctly
- ✅ Data is saved to database correctly
- ✅ Vote counting and thresholds
- ✅ Edge cases (ties, timeouts)
- ✅ Business logic flows
- ❌ AI response quality (skipped)
- ❌ Response content checks (skipped in mock mode)

### Real API Mode Tests

- ✅ Everything mock mode tests
- ✅ Actual AI response quality
- ✅ Response tone and language
- ✅ Prompt effectiveness
- ✅ Response content validation

## Cost Comparison

**Mock Mode:**
- Cost: $0.00
- Speed: Instant (no API latency)
- API Calls: 0 (all mocked)

**Real API Mode (Haiku model):**
- Cost: ~$0.02-0.05 per scenario
- Speed: ~30-60 seconds per scenario
- API Calls: 15-35 per scenario

**Savings:** Mock mode saves 100% of API costs during development

## Common Testing Scenarios

### Testing State Machine Changes

```bash
# Use mocks - you're testing logic, not AI
npm run eval --mock
```

### Testing Prompt Improvements

```bash
# Use real API - you need to see actual responses
npm run eval --real-api happy-path-3-members
```

### Debugging a Failing Test

```bash
# Start with mocks to isolate logic issues
npm run eval --mock failing-scenario

# If logic is fine, test with real API
npm run eval --real-api failing-scenario
```

### CI/CD Pipeline

```bash
# Use mocks for speed and cost
npm run eval --mock
```

### Pre-Release Validation

```bash
# Use real API for confidence
npm run eval --real-api
```

## Troubleshooting

### Mock responses don't match expected behavior

- Check if prompt patterns need updating in `src/utils/claude.js`
- Look for warnings: `⚠️ Mock: Unmatched prompt pattern`
- Add new mock patterns as needed

### Tests pass in mock mode but fail in real API mode

- This is expected! Mock mode skips AI quality checks
- Use real API mode to validate AI responses
- Check if prompts need improvement

### Response content checks failing in mock mode

- This is by design - response content checks are skipped in mock mode
- Use real API mode to test response quality
- Mock mode focuses on logic, not AI quality

## Best Practices

1. **Default to mocks** - Use mock mode for most testing
2. **Real API for quality** - Use real API when testing AI improvements
3. **Run real API before deploy** - Validate critical paths
4. **Keep mocks updated** - Update mock patterns when prompts change
5. **Document mock patterns** - Add comments explaining mock behavior

## Future Enhancements

- [ ] Mark scenarios as "logic" vs "ai-quality" tests
- [ ] Auto-select mode based on scenario type
- [ ] Cache real API responses for faster re-runs
- [ ] Mock response snapshots for easier maintenance

