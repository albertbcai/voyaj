# Eval Framework Best Practices

Guide for testing AI-powered multi-agent systems like Voyaj.

---

## 🎯 Testing Philosophy

### The Challenge

AI systems are non-deterministic:
- Same input can produce different outputs
- LLMs have variance even with `temperature=0`
- Testing requires different strategies than traditional software

### The Solution

**Layer your testing approach:**

1. **Deterministic tests** for discrete outputs (classifications, parsing)
2. **Fuzzy matching** for generated text (semantic similarity)
3. **Checklist validation** for response content (must mention X, Y, Z)
4. **State-based testing** for multi-step flows

---

## ✅ Writing Good Test Scenarios

### Start with Happy Paths

**Good first scenarios:**
```
✅ 3 members join → suggest → vote → dates
✅ 2 members (minimum viable)
✅ Vote with numbers (1, 2, 3)
✅ Vote with destination names (Tokyo, Bali)
```

**Add edge cases later:**
```
⚠️ Tie votes (no majority)
⚠️ Members changing minds
⚠️ Invalid inputs
⚠️ Timeouts
```

### One Scenario = One Behavior

**❌ BAD: Test everything in one scenario**
```json
{
  "name": "mega-test",
  "description": "Test join, suggest, vote, dates, flights, expenses",
  "steps": [ /* 50 steps */ ]
}
```
**Problem:** Hard to debug when it fails at step 37

**✅ GOOD: Focused scenarios**
```json
{
  "name": "destination-voting-majority",
  "description": "3 members vote, Tokyo wins with 2/3 majority",
  "steps": [ /* 8 steps */ ]
}
```
**Benefit:** Clear what's being tested, easy to debug

### Use Clear Expectations

**❌ BAD: Vague expectations**
```json
{
  "step": 5,
  "from": "+1111",
  "message": "Tokyo",
  "expect": {}  // Nothing validated!
}
```

**✅ GOOD: Specific expectations**
```json
{
  "step": 5,
  "from": "+1111",
  "message": "Tokyo",
  "expect": {
    "stage": "planning",
    "destinationSuggestions": ["Tokyo"],
    "responseMustContain": ["Tokyo", "Mike", "Alex"]
  }
}
```

---

## 🧪 Handling AI Variance

### Strategy 1: Test Discrete Outputs (Temperature 0)

**What:** AI classifications with fixed outputs

**Examples:**
- Intent detection: `member_join`, `destination_suggestion`, `vote`
- Vote parsing: `1` → "Tokyo" (option 1)
- Date parsing: "March 15-22" → `{start: "2025-03-15", end: "2025-03-22"}`

**How to test:**
```json
{
  "expect": {
    "stage": "voting_destination",  // Exact match
    "destination": "Tokyo",         // Exact match
    "voteCount": 2                  // Exact match
  }
}
```

**Works because:** With `temperature=0`, same input → same output (99% of time)

### Strategy 2: Checklist for Generated Text

**What:** AI-generated responses (Responder agent)

**Example:** Bot says "Great! Tokyo is on the list. Waiting for Mike and Alex."

**How to test:** Check that response includes key elements
```json
{
  "expect": {
    "responseMustContain": ["Tokyo", "Mike", "Alex"]
  }
}
```

**Why this works:**
- Exact match too brittle ("Great!" vs "Awesome!" both fine)
- Checklist ensures factual correctness
- Flexible enough to allow tone variations

### Strategy 3: State-Based Validation

**What:** Multi-step flows where order matters

**Example:** Join → Suggest → Vote → Dates

**How to test:** Validate state at each step
```json
[
  { "step": 1, "expect": { "stage": "collecting_members" } },
  { "step": 2, "expect": { "stage": "collecting_members" } },
  { "step": 3, "expect": { "stage": "planning" } },
  { "step": 6, "expect": { "stage": "voting_destination" } },
  { "step": 8, "expect": { "stage": "destination_set" } }
]
```

**Why this works:**
- Catches state transition bugs
- Independent of AI response wording
- Tests the most critical system behavior

---

## 🐛 Debugging Strategies

### When a Test Fails

**Step 1: Look at the output**
```bash
cat eval/scenarios/output/my-scenario.log
```

**Step 2: View in UI**
```bash
open eval/ui/index.html
```
- See full conversation like group chat
- Check bot responses
- Look at state changes

**Step 3: Determine root cause**

Ask yourself:
1. **Is the test expectation wrong?**
   - Example: You expected stage=X but stage=Y is actually correct
   - Fix: Update scenario JSON

2. **Is the code behavior wrong?**
   - Example: Vote wasn't counted, should have been
   - Fix: Debug voting agent

3. **Is there an AI variance issue?**
   - Example: Test passes 8/10 times, fails randomly
   - Fix: Adjust expectations to be more flexible

### Common Failure Patterns

#### Pattern: "voteCount: expected 2, got 1"

**Likely causes:**
1. Vote parsing failed (AI didn't recognize "1" as vote)
2. Vote was for wrong option (got filtered out)
3. Test expectation is wrong

**How to debug:**
- Check bot response: Did it acknowledge the vote?
- Check vote parsing logic in `src/agents/voting.js`
- Check database: Was vote saved?

#### Pattern: "stage: expected 'destination_set', got 'voting_destination'"

**Likely causes:**
1. State transition didn't trigger (not enough votes)
2. Majority threshold not met (need 60%, have 50%)
3. State machine logic issue

**How to debug:**
- Check vote count: Did we hit threshold?
- Check state machine transitions in `src/state/stateMachine.js`
- Check logs for transition attempts

#### Pattern: "response missing: 'Tokyo'"

**Likely causes:**
1. Responder didn't include destination in response
2. Response was skipped entirely
3. Destination was rephrased ("the chosen location" instead of "Tokyo")

**How to debug:**
- Check bot response in logs
- Was response sent at all?
- Adjust test to be more flexible if rephrasing is acceptable

---

## 📝 Naming Conventions

### Scenario Names

**Format:** `what-edge-case-scenario`

**Examples:**
- ✅ `happy-path-3-members`
- ✅ `destination-vote-tie`
- ✅ `vote-with-enthusiasm`
- ✅ `member-joins-late`
- ❌ `test-1` (not descriptive)
- ❌ `voting_test` (use hyphens not underscores)

### Descriptions

**Format:** Brief sentence describing what's tested

**Examples:**
- ✅ "3 members vote for Tokyo (2/3 majority wins)"
- ✅ "Member suggests multiple destinations in one message"
- ✅ "Vote includes extra text (1 - Tokyo!!!)"
- ❌ "Test voting" (too vague)
- ❌ "Checks if voting works when 3 people vote and 2 pick the same thing" (too verbose)

---

## 🎨 Organizing Scenarios

### Current Organization

```
eval/scenarios/definitions/
├── happy-path-3-members.json       # Golden path
├── minimum-two-members.json        # Minimum viable
├── vote-with-destination-name.json # Vote variations
├── vote-with-enthusiasm.json
├── destination-vote-tie.json       # Edge cases
├── flexible-dates.json
└── multiple-destinations-one-message.json
```

### Future Organization (as you add more)

```
eval/scenarios/definitions/
├── happy-paths/
│   ├── 2-members-simple.json
│   ├── 3-members-full-flow.json
│   └── 5-members-complex.json
├── voting/
│   ├── numeric-votes.json
│   ├── name-votes.json
│   ├── tie-votes.json
│   └── enthusiasm-votes.json
├── edge-cases/
│   ├── late-joiner.json
│   ├── invalid-input.json
│   └── timeout.json
└── regression/
    ├── bug-123-vote-parsing.json
    └── bug-456-state-transition.json
```

---

## ⚡ Performance Tips

### Run Fast During Development

**Strategy:** Test specific scenarios instead of all
```bash
# Fast: Run one scenario (2-3 seconds)
npm run eval happy-path-3-members

# Slow: Run all scenarios (30-60 seconds)
npm run eval
```

### Optimize Scenario Length

**Avoid:**
```json
{
  "steps": [ /* 50 steps testing everything */ ]
}
```
**Problem:** Takes 2-3 minutes to run one scenario

**Better:**
```json
// Split into multiple scenarios
happy-path-members.json    // 3 steps
happy-path-voting.json     // 8 steps
happy-path-dates.json      // 6 steps
```
**Benefit:** Run just what you're working on

### Use Expectations Wisely

**Don't validate everything at every step:**
```json
{
  "step": 5,
  "expect": {
    "stage": "planning",
    "memberCount": 3,
    "destinationSuggestions": ["Tokyo"],
    "voteCount": 0,
    "dateAvailability": []
    // Too much validation!
  }
}
```

**Validate what matters for this step:**
```json
{
  "step": 5,
  "expect": {
    "destinationSuggestions": ["Tokyo"]
    // Just check the new thing
  }
}
```

---

## 🔄 Iterative Testing Workflow

### Typical Development Flow

1. **Make a code change**
   ```bash
   # Example: Fix vote parsing in voting agent
   vim src/agents/voting.js
   ```

2. **Run relevant scenario**
   ```bash
   npm run eval vote-with-destination-name
   ```

3. **Check results**
   ```
   ✅ PASS - Great, it works!
   ❌ FAIL - Hmm, still broken
   ```

4. **If failed, debug**
   ```bash
   # View detailed logs
   cat eval/scenarios/output/vote-with-destination-name.log

   # Or view in UI
   open eval/ui/index.html
   ```

5. **Fix and repeat**
   ```bash
   vim src/agents/voting.js
   npm run eval vote-with-destination-name
   ```

6. **Once passing, run all scenarios**
   ```bash
   npm run eval
   ```
   Check for regressions

---

## 🎓 Advanced Patterns

### Testing Error Handling

**Scenario:** What happens when user sends invalid input?

```json
{
  "name": "invalid-date-format",
  "description": "User sends gibberish instead of date",
  "steps": [
    {
      "step": 1,
      "from": "+1111",
      "message": "asdfasdf",
      "expect": {
        "stage": "planning",
        "responseMustContain": ["date"]
      }
    }
  ]
}
```
**Expected:** Bot asks for clarification, state doesn't change

### Testing Race Conditions

**Scenario:** Two messages arrive simultaneously

```json
{
  "name": "simultaneous-suggestions",
  "description": "Two members suggest destinations at same time",
  "steps": [
    {
      "step": 1,
      "from": "+1111",
      "message": "Tokyo",
      "expect": { "destinationSuggestions": ["Tokyo"] }
    },
    {
      "step": 2,
      "from": "+2222",
      "message": "Bali",
      "expect": { "destinationSuggestions": ["Tokyo", "Bali"] }
    }
  ]
}
```
**Expected:** Both get counted (message queue ensures FIFO)

### Testing Timeouts

**Scenario:** Not enough votes, timeout triggers

**Note:** Can't test real 48hr timeout in eval, but can test the logic:
```json
{
  "name": "vote-timeout-logic",
  "description": "Poll closes with no majority (test logic, not actual timeout)",
  "steps": [
    // ... members vote 1-1-1 (tie)
    // In real system, after 48hr timeout:
    // - Should pick most recent vote
    // This test would need manual intervention or mock time
  ]
}
```

---

## 📊 Metrics to Track

### Scenario Pass Rate
```
7 scenarios → 6 passed (86%)
```
**Target:** 95%+ pass rate

### Failure Categories
```
3 failures:
  - 2 vote parsing issues
  - 1 state transition bug
```
**Use to prioritize fixes**

### Coverage
```
Tested:
  ✅ Member joining (3 scenarios)
  ✅ Destination voting (4 scenarios)
  ✅ Date submission (2 scenarios)

Not tested:
  ❌ Flight booking
  ❌ Expense tracking
  ❌ Timeout behavior
```
**Use to identify gaps**

---

## 🚫 Anti-Patterns

### ❌ Flaky Tests

**Problem:**
```bash
npm run eval
# ✅ Pass

npm run eval
# ❌ Fail

npm run eval
# ✅ Pass
```

**Causes:**
- AI variance (even with temp=0)
- Race conditions
- External dependencies (database state)

**Solutions:**
- Tighten expectations (use checklists not exact match)
- Ensure test isolation (clean database between runs)
- Add retry logic for known-flaky AI calls

### ❌ Testing Too Much

**Problem:**
```json
{
  "name": "everything-test",
  "steps": [ /* 100 steps */ ]
}
```

**Issues:**
- Takes forever to run
- Hard to debug when it fails
- Fragile (any small change breaks it)

**Solution:** Split into focused scenarios

### ❌ Not Using the UI

**Problem:** Only looking at terminal output

**Miss out on:**
- Visual conversation flow
- Easy pattern recognition
- Faster debugging

**Solution:** Always review failures in UI

---

## 🎯 Summary: Key Principles

1. **Start simple, add complexity**
   - Happy paths first, edge cases later

2. **One scenario = one behavior**
   - Easy to debug, clear purpose

3. **Use checklists for AI text**
   - `responseMustContain` instead of exact match

4. **Validate state, not wording**
   - Test behavior, not phrasing

5. **Review in UI**
   - Visual debugging is faster

6. **Iterate quickly**
   - Run specific scenarios during development

7. **Keep scenarios focused**
   - 5-10 steps max, test one thing well

---

**Happy testing! 🎉**
