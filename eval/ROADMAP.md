# Eval Framework Roadmap

Detailed plan for future evaluation framework enhancements.

---

## ✅ Phase 1: State Transition Testing (COMPLETE)

**Status:** ✅ Shipped

**What we built:**
- Scenario runner for multi-step conversations
- 7 initial test scenarios (JSON definitions)
- Full conversation logging with timestamps
- Visual UI to view conversations like group chat
- Metrics and reporting (pass/fail rates)
- Comprehensive documentation

**Value delivered:**
- Fast feedback loop (2-5 min vs hours)
- Easy iteration (edit JSON, see results)
- Catches state transition bugs
- Visual debugging in UI

**Time invested:** ~6 hours

---

## 📋 Phase 2: Agent Isolation Tests

**Status:** 🟡 Partially Complete (3/4 agents tested)

**Goal:** Test each agent's AI decisions in isolation to catch classification bugs before they cascade into state issues

**Progress:**
- ✅ Coordinator Agent tests (name validation) - 100% accuracy (24/24)
- ✅ Voting Agent tests (vote parsing, destination normalization) - 92.9% accuracy (26/28)
- ✅ Parser Agent tests (date parsing) - 50% accuracy (5/10) - **Bugs found and documented**
- 🔲 Responder Agent tests - **Deferred (hardest to test, response quality vs classification)**

### What to Build

#### 2.1 Agent Test Harness ✅ BUILT
```
eval/agents/
├── coordinator.eval.js      # ✅ Test coordinator AI calls
├── voting.eval.js           # ✅ Test voting agent classification
├── parser.eval.js           # ✅ Test parser accuracy
├── responder.eval.js        # 🔲 Test responder quality (deferred)
├── runner.js                 # ✅ Test runner with logging
├── common/
│   ├── assertions.js        # ✅ Custom assertions
│   ├── fixtures.js          # ✅ Shared test data
│   └── helpers.js           # ✅ Test utilities (DB setup, snapshot mode)
└── output/                  # ✅ Test result logs and JSON files
```

**Features Added:**
- ✅ Snapshot-based mocking (free, fast, deterministic)
- ✅ File logging (`.log` and `.json` files in `output/` directory)
- ✅ Detailed failure reporting with context
- ✅ Ambiguous case tracking (separate from clear failures)
- ✅ Future feature tests (document expected behavior)

#### 2.2 Test Coverage by Agent

**Coordinator Agent** (`eval/agents/coordinator.eval.js`) ✅ COMPLETE
- ✅ Name validation: 25 test cases (24 clear, 1 ambiguous)
  - Simple names: "Sarah", "Mike", "Alex" → is name
  - Full names: "John Smith", "Sarah Johnson" → is name
  - Introductions: "I'm Sarah", "My name is Sarah" → is name
  - Questions: "What dates work?" → not name
  - Dates: "March 15", "march or april" → not name
  - Ambiguous: "April" (could be name or month) - tracked separately
- **Result:** 100% accuracy on clear cases (24/24)

**Voting Agent** (`eval/agents/voting.eval.js`) ✅ COMPLETE
- ✅ Vote parsing: 15 test cases
  - Numeric votes: "1", "2" → correct option
  - Name-based votes: "Tokyo", "Bali" → correct option
  - Enthusiasm: "1 - Tokyo!!!" → correct option
  - Natural language: "I vote for option 1" → correct option
  - Non-votes: "This doesn't look right", "What are the options?" → null
  - **Bug found:** Invalid option numbers ("4", "0") incorrectly parsed - documented in backlog
- ✅ Destination normalization: 13 test cases
  - Simple destinations: "Tokyo", "Bali", "Paris" → normalized
  - Case variations: "tokyo", "TOKYO" → normalized
  - Countries: "Japan", "Portugal" → normalized
  - Non-destinations: "somewhere with good food" → correctly rejected
  - Member names: "Sarah", "Mike" → correctly rejected (NAME_NOT_DESTINATION)
- ✅ Future feature: Add option mid-vote (2 test cases documenting expected behavior)
- **Result:** 92.9% accuracy (26/28) - 2 bugs found and documented

**Parser Agent** (`eval/agents/parser.eval.js`) ✅ COMPLETE
- ✅ Date parsing: 10 test cases
  - Exact dates: "July 15-31", "07/15 - 07/31" → correct
  - Flexible: "flexible", "I'm flexible in April" → correct
  - **Bug found:** Dates defaulting to 2023 instead of 2025 - documented in backlog
  - **Bug found:** Relative dates ("next week", "late May") parsed as "flexible" instead of date ranges - documented in backlog
- ✅ Future feature: Relative date confirmation (2 test cases, test setup issue - documented)
- **Result:** 50% accuracy (5/10) - 3 bugs found and documented

**Responder Agent** (`eval/agents/responder.eval.js`) 🔲 DEFERRED
- **Status:** Not yet implemented - hardest to test (response quality vs classification)
- **Planned tests:**
  - Response decision: Should respond vs skip (based on context)
  - Tone selection: Control vs helper tone
  - Content quality: Includes destination, pending members, next steps
- **Reason for deferral:** Requires different testing approach (quality evaluation vs pass/fail), better suited for Phase 3

#### 2.3 Accuracy Metrics ✅ IMPLEMENTED

**Output format:**
```bash
npm run eval:agents

🧪 Agent Isolation Tests
🎬 Using 164 saved snapshots (free, fast, deterministic)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
👤 Coordinator Agent Tests
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Clear Cases: 100% accuracy (24/24 correct)
⚠️  Ambiguous: 1 cases (tracked separately)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🗳️  Voting Agent Tests
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Vote Parsing: 86.7% accuracy (13/15 correct)
  ❌ "4" → Expected null, got Paris (Invalid option number)
  ❌ "0" → Expected null, got Tokyo (Invalid option number)

Destination Normalization: 100% accuracy (13/13 correct)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✈️  Parser Agent Tests
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Date Parsing: 50% accuracy (5/10 correct)
  ❌ Year parsing issues (2023 vs 2025)
  ❌ Relative dates parsed as "flexible"

Overall: 88.7% accuracy (55/62 correct)

💾 Results saved to:
   📄 eval/agents/output/agent-tests-{timestamp}.log
   📄 eval/agents/output/agent-tests-{timestamp}.json
```

**Features:**
- ✅ Detailed failure reports with input/expected/actual
- ✅ Ambiguous case tracking (separate from failures)
- ✅ Future feature test tracking
- ✅ File logging for historical review

#### 2.4 Implementation Approach

**Test data generation:**
```javascript
// Generate variations programmatically
const memberJoinCases = [
  { input: 'Sarah', expected: 'member_join' },
  { input: 'Mike', expected: 'member_join' },
  { input: 'march', expected: 'member_join' }, // Edge case: month name
  { input: 'may', expected: 'member_join' },   // Edge case: month name
  { input: 'I\'m Sarah', expected: 'member_join' },
  { input: 'My name is Sarah', expected: 'member_join' },
  // ... 20-30 more cases
];

// Test each case
for (const { input, expected } of memberJoinCases) {
  const result = await detectIntent(trip, { body: input });
  assert.strictEqual(result.intent, expected);
}
```

**Custom assertions:**
```javascript
// eval/agents/common/assertions.js

// Exact match for discrete outputs
export function assertIntentEquals(actual, expected) {
  assert.strictEqual(actual, expected);
}

// Fuzzy match for dates (allow 1 day difference)
export function assertDateEquals(actual, expected) {
  const diff = Math.abs(new Date(actual) - new Date(expected));
  assert(diff < 24 * 60 * 60 * 1000, 'Dates should match within 1 day');
}

// Array equality (order-independent)
export function assertArrayEquals(actual, expected) {
  assert.deepStrictEqual([...actual].sort(), [...expected].sort());
}
```

### Timeline

**Estimated time:** 4-6 hours
**Actual time:** ~6-8 hours (including logging, bug documentation, and resolving uncertain test cases)

**Breakdown:**
- ✅ Agent test harness setup: 1 hour
- ✅ Write test cases (25+ per agent): 3-4 hours
- ✅ Metrics and reporting: 1 hour
- ✅ File logging: 1 hour
- ✅ Bug documentation: 30 min
- ✅ Documentation: 30 min

### Success Criteria

- ✅ Tests run in under 2 minutes (using snapshots)
- ✅ Clear failure reports with detailed context
- ✅ Easy to add new test cases
- ✅ File logging for historical review
- ⚠️ 95%+ accuracy on all agent classifications - **Not yet achieved:**
  - Coordinator: 100% ✅
  - Voting: 92.9% (2 bugs found)
  - Parser: 50% (3 bugs found)
- ✅ Bugs documented in backlog for fixing

### Bugs Found and Documented

All bugs found during testing have been documented in `BACKLOG.md`:
- **#12:** Invalid option numbers parsed as votes (Voting Agent)
- **#13:** Date parsing defaults to 2023 instead of 2025 (Parser Agent)
- **#14:** Relative dates parsed as "flexible" instead of date ranges (Parser Agent)
- **#15:** Test setup issue for relative date confirmation (Parser Agent)

### Next Steps

1. **Fix documented bugs** - Address issues #12, #13, #14, #15
2. **Re-run tests** - Verify fixes improve accuracy
3. **Responder Agent tests** - Defer to Phase 3 (response quality evaluation) or implement later with different approach

---

## 📝 Phase 3: Response Quality Evaluation

**Status:** 🔲 Not started

**Goal:** Grade all bot responses for factual correctness, completeness, and consistency

### What to Build

#### 3.1 Response Evaluator
```
eval/responses/
├── evaluator.js             # Grade individual responses
├── metrics.js               # Aggregate metrics
└── fixtures/
    ├── good-responses.json  # Examples of good responses
    └── bad-responses.json   # Examples of bad responses
```

#### 3.2 Evaluation Criteria

**Factual Correctness (Must-haves)**
- ✅ Mentions correct destination when relevant
- ✅ Mentions pending member names (who hasn't acted yet)
- ✅ Accurate counts (e.g., "2/3 members have voted")
- ✅ Correct stage information
- ❌ No hallucinations (made-up destinations, fake member names)

**Completeness (Should-haves)**
- ✅ Includes next step guidance ("Now share your dates")
- ✅ Acknowledges user action ("Great! Tokyo is added")
- ✅ Provides context (why we're asking for something)

**Tone Consistency**
- ✅ Warm and friendly
- ✅ Not too verbose (2-4 sentences for control, 1-2 for helper)
- ✅ Not robotic or terse

#### 3.3 Evaluation Methods

**Method 1: Checklist Validation** (fast, deterministic)
```javascript
function evaluateResponse(response, context) {
  const checks = {
    factual: {
      mentionsDestination: context.destination ?
        response.includes(context.destination) : true,
      mentionsPendingMembers: context.pendingMembers.every(name =>
        response.includes(name)),
      noHallucinations: !hasUnknownNames(response, context.allMembers),
    },
    completeness: {
      includesNextStep: hasNextStepGuidance(response),
      acknowledgesAction: hasAcknowledgment(response),
    },
    tone: {
      isWarm: !isTerse(response) && !isRobotic(response),
      isAppropriateLength: response.split('.').length >= 2 &&
                           response.split('.').length <= 4,
    }
  };

  return checks;
}
```

**Method 2: Semantic Similarity** (for fuzzy matching)
```javascript
// Compare generated response to expected response
const expected = "Great! Tokyo is on the list. Waiting for Mike and Alex.";
const actual = "Awesome! Tokyo added. Still need Mike and Alex to suggest.";

const similarity = await semanticSimilarity(expected, actual);
assert(similarity > 0.85, 'Response should be semantically similar');
```

#### 3.4 Output Format

```bash
npm run eval:responses

Evaluated 50 bot responses across 10 scenarios:

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Factual Correctness: 94% (47/50)
  ✅ Mentioned correct destination: 48/50 (96%)
  ✅ Mentioned pending members: 45/50 (90%)
  ✅ Accurate counts: 47/50 (94%)
  ❌ 3 responses missing pending member names

Completeness: 88% (44/50)
  ✅ Included next step: 44/50 (88%)
  ✅ Acknowledged action: 50/50 (100%)
  ❌ 6 responses didn't guide user on what to do next

Tone Consistency: 96% (48/50)
  ✅ Warm and friendly: 50/50 (100%)
  ✅ Appropriate length: 48/50 (96%)
  ❌ 2 responses were too terse

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Top Issues:
  1. Missing pending member names (3 occurrences)
     Examples:
     - Step 4 in happy-path-3-members
     - Step 7 in vote-with-enthusiasm

  2. No guidance on next step (6 occurrences)
     Examples:
     - Step 5 in destination-vote-tie
     - Step 3 in flexible-dates

Overall Score: 93% (Good)
Target: 95% (Needs minor improvements)
```

### Timeline

**Estimated time:** 4-5 hours

**Breakdown:**
- Response evaluator implementation: 2 hours
- Checklist validation logic: 1 hour
- Metrics and reporting: 1 hour
- Integration with existing scenarios: 30 min
- Documentation: 30 min

### Success Criteria

- ✅ 95%+ factual correctness
- ✅ Clear feedback on what's missing
- ✅ Runs automatically with `npm run eval`
- ✅ Easy to see patterns (e.g., "often missing pending members")

---

## 🧠 Phase 4: Advanced Features (Future)

**Status:** 🔲 Not started

**Goal:** LLM-powered test generation, semantic matching, historical tracking

### 4.1 LLM-Generated Test Cases

**Problem:** Writing 100s of test cases by hand is tedious

**Solution:** Use Claude to generate variations
```javascript
// eval/generators/llm-generator.js

async function generateIntentTestCases(intent, count = 50) {
  const prompt = `Generate ${count} different ways a user might express a "${intent}" intent.

Intent: ${intent}

Examples for reference:
${getExampleMessages(intent)}

Return as JSON array of strings.`;

  const variations = await callClaude(prompt);
  return JSON.parse(variations);
}

// Usage
const memberJoinVariations = await generateIntentTestCases('member_join', 50);
// → ["Sarah", "I'm Sarah", "My name is Sarah", "Sarah here", ...]
```

**What to generate:**
- ✅ Member join variations (50+)
- ✅ Destination suggestions (100+)
- ✅ Vote variations (50+)
- ✅ Date formats (50+)
- ✅ Question phrasings (50+)

### 4.2 Semantic Similarity Scoring

**Problem:** Exact string match too brittle for AI-generated text

**Solution:** Use embeddings or LLM to compare meaning
```javascript
async function semanticSimilarity(text1, text2) {
  const prompt = `Rate the semantic similarity of these two texts on a scale of 0.0 to 1.0:

Text 1: "${text1}"
Text 2: "${text2}"

Return only a number between 0.0 and 1.0.`;

  const score = parseFloat(await callClaude(prompt, {
    temperature: 0.0,
    maxTokens: 10
  }));

  return score;
}

// Usage
const expected = "Great! Tokyo is on the list. Waiting for Mike and Alex.";
const actual = "Awesome! Tokyo added. Still need Mike and Alex.";

const similarity = await semanticSimilarity(expected, actual);
// → 0.92 (very similar)

assert(similarity > 0.85, 'Responses should be semantically similar');
```

### 4.3 Historical Tracking

**Problem:** Want to see if accuracy improves or regresses over time

**Solution:** Track metrics across eval runs
```javascript
// eval/history/tracker.js

async function recordEvalRun(results) {
  const record = {
    timestamp: new Date(),
    commit: getCurrentGitCommit(),
    results: {
      scenarios: { passed: 6, failed: 1, total: 7 },
      agents: {
        intentDetection: { accuracy: 0.95 },
        voteParsing: { accuracy: 0.97 },
        dateParsing: { accuracy: 0.90 },
      },
      responses: {
        factual: 0.94,
        completeness: 0.88,
        tone: 0.96,
      }
    }
  };

  await saveToFile('eval/history/runs.jsonl', record);
}
```

**Output:**
```bash
npm run eval:history

Eval Accuracy Over Time:

Intent Detection:
  2025-01-10: 92%
  2025-01-15: 95% ↑ (+3%)
  2025-01-20: 93% ↓ (-2%) ⚠️ REGRESSION

Vote Parsing:
  2025-01-10: 95%
  2025-01-15: 97% ↑ (+2%)
  2025-01-20: 97% → (no change)

Overall Trend: Improving (92% → 95%)
```

### 4.4 Cost/Performance Benchmarks

**Track:**
- ✅ API cost per scenario
- ✅ API cost per trip flow
- ✅ Latency (p50, p95, p99)
- ✅ Token usage

**Output:**
```bash
npm run eval:performance

Cost Analysis:

Per Scenario (average):
  API calls: 15
  Total tokens: 2,500
  Cost: $0.015

Per Full Trip (estimate):
  Messages: 25
  API calls: 45
  Total tokens: 7,500
  Cost: $0.045

Latency:
  p50: 1.2s
  p95: 3.5s
  p99: 5.2s

Recommendations:
  ⚠️ Consider caching for intent detection (30% of API calls)
  ✅ Current latency is acceptable (<5s p99)
```

### Timeline

**Estimated time:** 6-8 hours

**Breakdown:**
- LLM test generation: 2 hours
- Semantic similarity: 1 hour
- Historical tracking: 2 hours
- Performance benchmarks: 2 hours
- Documentation: 1 hour

### Success Criteria

- ✅ Can generate 100s of test cases automatically
- ✅ Semantic similarity reduces false negatives
- ✅ Historical tracking shows trends
- ✅ Cost/performance insights actionable

---

## 📊 Summary: What to Build Next

### Immediate Priority (Do This First)

**Phase 2: Agent Isolation Tests** 🟡 **75% Complete**
- **Why:** Catch bugs at the source (agent level) before they cascade
- **Time:** 4-6 hours (estimated), ~6-8 hours (actual)
- **Value:** 30% faster debugging, 20% fewer integration test failures
- **Status:** 3/4 agents tested, 5 bugs found and documented
- **Next:** Fix documented bugs (#12, #13, #14, #15), then consider Responder Agent tests

### Medium Priority (Do When Response Quality Matters)

**Phase 3: Response Quality Evaluation**
- **Why:** Ensure bot responses are helpful and correct
- **Time:** 4-5 hours
- **Value:** Catch bad responses before users see them

### Low Priority (Nice to Have)

**Phase 4: Advanced Features**
- **Why:** Convenience and deeper insights
- **Time:** 6-8 hours
- **Value:** Easier test creation, better trend analysis

---

## 🎯 Recommended Next Steps

1. **Use Phase 1 for a few weeks** - Get familiar, add more scenarios as you find bugs
2. **Identify pain points** - Which agent breaks most often?
3. **Build Phase 2 for that agent** - Start with isolation tests for the problematic agent
4. **Expand gradually** - Add more agents as needed
5. **Phase 3 when you have real users** - Response quality matters more with production traffic

---

## 🤔 Open Questions

Things to decide later:

1. **Should we test with real AI calls or mocks?**
   - Real: More accurate, slower, costs money
   - Mocks: Faster, free, but may not catch AI issues
   - Hybrid: Use real for critical paths, mocks for everything else?

2. **How to handle flaky tests?**
   - Retry logic (run 3 times, pass if 2/3 succeed)?
   - Consensus testing (run 5 times, expect 80% agreement)?
   - Tighter prompts to reduce variance?

3. **Integration with CI/CD?**
   - Run evals on every commit?
   - Only on main branch?
   - Manual trigger only?

4. **Test data management?**
   - Keep growing `definitions/` folder?
   - Organize into subdirectories?
   - Generate dynamically with LLMs?

---

**Last updated:** 2025-12-13

**Phase 2 Status:** 75% complete (3/4 agents tested, Responder Agent deferred)
**Next review:** After bug fixes (#12, #13, #14, #15) are complete
