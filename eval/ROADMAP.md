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

**Status:** 🔲 Not started

**Goal:** Test each agent's AI decisions in isolation to catch classification bugs before they cascade into state issues

### What to Build

#### 2.1 Agent Test Harness
```
eval/agents/
├── coordinator.eval.js      # Test coordinator AI calls
├── voting.eval.js           # Test voting agent classification
├── parser.eval.js           # Test parser accuracy
├── responder.eval.js        # Test responder quality
└── common/
    ├── assertions.js        # Custom assertions
    └── fixtures.js          # Shared test data
```

#### 2.2 Test Coverage by Agent

**Coordinator Agent** (`eval/agents/coordinator.eval.js`)
- ✅ Name validation: "Sarah" → is name, "March" → not name
- ✅ Question routing: "What dates work?" → question intent
- ✅ Date vs destination detection: "March" → date, "Paris" → destination
- ✅ Organizing language detection: "Let's make a spreadsheet" → proactive control

**Voting Agent** (`eval/agents/voting.eval.js`)
- ✅ Destination extraction: "Tokyo and Paris" → ["Tokyo", "Paris"]
- ✅ Vote parsing: "1" → option 1, "Tokyo" → option 1 (if Tokyo is option 1)
- ✅ Vote with enthusiasm: "1 - Tokyo!!!" → option 1
- ✅ Non-vote detection: "This doesn't look right" → null
- ✅ Vague preference: "somewhere with good food" → vague (not destination)

**Parser Agent** (`eval/agents/parser.eval.js`)
- ✅ Date parsing accuracy: "March 15-22" → {start: "2025-03-15", end: "2025-03-22"}
- ✅ Various date formats: "April 1 to 10", "March", "flexible in April"
- ✅ Date validation: end > start, future dates, within 2 years
- ✅ Flight parsing: "BOOKED United 154" → {airline: "United", flight: "154"}

**Responder Agent** (`eval/agents/responder.eval.js`)
- ✅ Response decision: Should respond vs skip (based on context)
- ✅ Tone selection: Control vs helper tone
- ✅ Content quality: Includes destination, pending members, next steps

#### 2.3 Accuracy Metrics

**Output format:**
```bash
npm run eval:agents

Intent Detection: 95% accuracy (38/40 correct)
  ✅ member_join: 100% (10/10)
  ✅ destination_suggestion: 90% (9/10)
  ❌ "march" → classified as date_availability (expected: member_join)
  ✅ vote: 100% (10/10)
  ✅ question: 90% (9/10)

Vote Parsing: 97% accuracy (29/30 correct)
  ✅ Numeric votes: 100% (10/10)
  ✅ Name votes: 90% (9/10)
  ✅ Enthusiasm votes: 100% (10/10)
  ❌ "This doesn't look right" → parsed as vote (expected: null)

Date Parsing: 90% accuracy (27/30 correct)
  ✅ Exact dates: 95% (19/20)
  ✅ Flexible: 100% (5/5)
  ❌ "April" → failed to parse (expected: flexible in April)
  ❌ "next week" → failed to parse
```

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

**Breakdown:**
- Agent test harness setup: 1 hour
- Write test cases (20-30 per agent): 2-3 hours
- Metrics and reporting: 1 hour
- Documentation: 30 min

### Success Criteria

- ✅ 95%+ accuracy on all agent classifications
- ✅ Tests run in under 2 minutes
- ✅ Clear failure reports ("Intent detection: 92% → Need to improve")
- ✅ Easy to add new test cases

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

**Phase 2: Agent Isolation Tests**
- **Why:** Catch bugs at the source (agent level) before they cascade
- **Time:** 4-6 hours
- **Value:** 30% faster debugging, 20% fewer integration test failures

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

**Last updated:** 2025-01-13

**Next review:** After Phase 2 completion
