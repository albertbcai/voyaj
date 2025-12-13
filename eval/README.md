# Voyaj Evaluation Framework

Automated testing framework for Voyaj's multi-agent AI system. Tests state transitions, agent behavior, and end-to-end conversation flows.

## 🎯 Why This Framework?

**Problem:** Manual testing is slow and expensive
- Opening UI and typing messages takes forever
- AI calls add up ($$$)
- Hard to catch regressions
- Difficult to test edge cases

**Solution:** Automated scenario-based testing
- Define conversations as JSON (easy to read/edit)
- Run full trip flows in minutes
- See exactly where things break
- Visual UI to review conversations

---

## 🚀 Quick Start

### Run All Scenarios
```bash
npm run eval
```

### Run Specific Scenario
```bash
npm run eval happy-path-3-members
```

### View Results in UI
```bash
open eval/ui/index.html
```

---

## 📁 Directory Structure

```
eval/
├── README.md                      # This file
├── run.js                         # Main test runner
│
├── lib/
│   ├── scenario-runner.js        # Executes scenarios
│   └── generate-ui-index.js      # Generates UI index
│
├── scenarios/
│   ├── definitions/              # Scenario JSON files (EDIT THESE!)
│   │   ├── happy-path-3-members.json
│   │   ├── vote-with-destination-name.json
│   │   ├── destination-vote-tie.json
│   │   └── ...
│   │
│   └── output/                   # Generated logs (auto-created)
│       ├── happy-path-3-members.log
│       ├── happy-path-3-members.json
│       └── ...
│
└── ui/
    ├── index.html                # Visual conversation viewer
    └── scenarios.json            # Auto-generated index
```

---

## 📝 How to Write Scenarios

Scenarios are JSON files that define a conversation step-by-step.

### Basic Structure

```json
{
  "name": "scenario-name",
  "description": "What this scenario tests",
  "members": [
    { "phone": "+15551111111", "name": "Sarah" },
    { "phone": "+15552222222", "name": "Mike" }
  ],
  "steps": [
    {
      "step": 1,
      "from": "+15551111111",
      "message": "Sarah",
      "expect": {
        "stage": "collecting_members",
        "memberCount": 1
      }
    }
  ]
}
```

### Expectation Fields

You can validate any of these after each step:

| Field | Type | Example |
|-------|------|---------|
| `stage` | string | `"planning"`, `"voting_destination"` |
| `memberCount` | number | `3` |
| `destination` | string | `"Tokyo"` |
| `destinationSuggestions` | array | `["Tokyo", "Bali"]` |
| `voteCount` | number | `2` |
| `responseMustContain` | array | `["Tokyo", "Mike", "Alex"]` |

### Example: Testing Destination Voting

```json
{
  "name": "destination-voting",
  "description": "3 members vote for Tokyo (majority)",
  "members": [
    { "phone": "+1111", "name": "Sarah" },
    { "phone": "+2222", "name": "Mike" },
    { "phone": "+3333", "name": "Alex" }
  ],
  "steps": [
    {
      "step": 1,
      "from": "+1111",
      "message": "Sarah",
      "expect": { "memberCount": 1 }
    },
    {
      "step": 2,
      "from": "+2222",
      "message": "Mike",
      "expect": { "memberCount": 2 }
    },
    {
      "step": 3,
      "from": "+3333",
      "message": "Alex",
      "expect": { "stage": "planning", "memberCount": 3 }
    },
    {
      "step": 4,
      "from": "+1111",
      "message": "Tokyo",
      "expect": { "destinationSuggestions": ["Tokyo"] }
    },
    {
      "step": 5,
      "from": "+2222",
      "message": "Bali",
      "expect": { "destinationSuggestions": ["Tokyo", "Bali"] }
    },
    {
      "step": 6,
      "from": "+3333",
      "message": "Paris",
      "expect": { "stage": "voting_destination" }
    },
    {
      "step": 7,
      "from": "+1111",
      "message": "1",
      "expect": { "voteCount": 1 }
    },
    {
      "step": 8,
      "from": "+2222",
      "message": "1",
      "expect": {
        "stage": "destination_set",
        "destination": "Tokyo",
        "voteCount": 2,
        "responseMustContain": ["Tokyo"]
      }
    }
  ]
}
```

---

## 🎨 Viewing Results

### Terminal Output

```
📋 Running: happy-path-3-members
   3 members join, suggest destinations, vote

   Step 1: Sarah → "Sarah"
   ✅ PASS
   Bot: "Welcome Sarah! You're the first member..."

   Step 2: Mike → "Mike"
   ✅ PASS
   Bot: "Great! Mike has joined..."

   ...

   ✅ happy-path-3-members (12 steps, 3452ms)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 EVALUATION REPORT

   Total scenarios: 7
   ✅ Passed: 6 (86%)
   ❌ Failed: 1 (14%)
   ⏱️  Total time: 24.3s

Failed scenarios:
   ❌ destination-vote-tie (1 failures)
      Step 9: stage: expected "destination_set", got "voting_destination"

📁 Logs saved to: eval/scenarios/output/
👁️  View UI: open eval/ui/index.html
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### Visual UI

Open `eval/ui/index.html` in your browser to see:
- ✅ Summary of pass/fail rates
- 💬 Full conversation transcripts (like a group chat)
- 🕒 Timestamps for each message
- 📊 State changes at each step
- ❌ Highlighted failures with reasons

---

## 🔧 Adding New Scenarios

### Method 1: Copy and Modify

1. Copy an existing scenario:
   ```bash
   cp eval/scenarios/definitions/happy-path-3-members.json \
      eval/scenarios/definitions/my-new-scenario.json
   ```

2. Edit the JSON file:
   - Change `name` and `description`
   - Modify `members` if needed
   - Update `steps` with your test case
   - Adjust `expect` fields

3. Run it:
   ```bash
   npm run eval my-new-scenario
   ```

### Method 2: Create from Scratch

Create `eval/scenarios/definitions/my-scenario.json`:

```json
{
  "name": "my-scenario",
  "description": "Test XYZ behavior",
  "members": [
    { "phone": "+1111", "name": "Alice" },
    { "phone": "+2222", "name": "Bob" }
  ],
  "steps": [
    {
      "step": 1,
      "from": "+1111",
      "message": "Alice",
      "expect": { "memberCount": 1 }
    },
    {
      "step": 2,
      "from": "+2222",
      "message": "Bob",
      "expect": { "stage": "planning", "memberCount": 2 }
    }
  ]
}
```

---

## 🐛 Debugging Failed Tests

### When a test fails, you'll see:

```
❌ FAIL: stage: expected "destination_set", got "voting_destination"
```

### Steps to debug:

1. **Check the log file:**
   ```bash
   cat eval/scenarios/output/my-scenario.log
   ```

2. **View in UI:**
   - Open `eval/ui/index.html`
   - Click on failed scenario
   - See full conversation with state changes

3. **Determine if it's a test issue or code issue:**
   - Is the expectation wrong? → Edit scenario JSON
   - Is the behavior wrong? → Fix the code
   - Not sure? → Look at bot responses and state changes

4. **Run just that scenario:**
   ```bash
   npm run eval my-scenario
   ```

### Common Issues

**Issue:** "voteCount: expected 2, got 1"
- **Likely cause:** Vote parsing failed (AI didn't recognize vote)
- **Fix:** Check voting agent logic or adjust test input

**Issue:** "stage: expected 'destination_set', got 'planning'"
- **Likely cause:** State transition didn't trigger (threshold not met)
- **Fix:** Check state machine transition logic

**Issue:** "response missing: 'Tokyo'"
- **Likely cause:** Responder didn't mention destination
- **Fix:** Check responder agent response generation

---

## 📊 Current Scenarios

| Scenario | What It Tests |
|----------|---------------|
| `happy-path-3-members` | Full flow: join → suggest → vote → dates |
| `vote-with-destination-name` | Voting using "Tokyo" instead of "1" |
| `destination-vote-tie` | 3-way tie (no majority) |
| `minimum-two-members` | Smallest viable group |
| `vote-with-enthusiasm` | Votes with extra text ("1 - Tokyo!!!") |
| `flexible-dates` | Members submit "flexible" availability |
| `multiple-destinations-one-message` | "Tokyo or Paris" in one message |

---

## 🎓 Best Practices

### ✅ DO

- **Start simple:** Test happy paths first, then edge cases
- **Be specific:** Clear expectations make debugging easier
- **Use descriptive names:** `vote-with-enthusiasm` > `test-3`
- **Test one thing:** Each scenario should test a specific behavior
- **Review failures in UI:** Visual review catches issues faster

### ❌ DON'T

- **Don't test everything in one scenario:** Split into multiple scenarios
- **Don't assume AI responses:** Use `responseMustContain` to validate
- **Don't ignore flaky tests:** If a test fails randomly, investigate
- **Don't commit output files:** `.log` and `.json` in `output/` are auto-generated

---

## 🚀 What's Next?

This is **Phase 1** of the eval framework, focused on **state transitions**.

### Future Enhancements (Not Built Yet)

**Phase 2: Agent Isolation Tests**
- Test individual agent AI calls (intent detection, vote parsing, etc.)
- Measure classification accuracy
- Find bugs before they cascade to state issues

**Phase 3: Response Quality Evaluation**
- Grade all bot responses
- Check for factual correctness, completeness, tone
- Aggregate feedback: "85% of responses mentioned pending members"

**Phase 4: Advanced Features**
- LLM-generated test cases (auto-create 100s of variations)
- Semantic similarity scoring (fuzzy matching for responses)
- Historical tracking (accuracy over time)
- Cost/performance benchmarks

---

## 💡 Tips

### Fast Iteration
```bash
# Edit scenario
vim eval/scenarios/definitions/my-scenario.json

# Run just that scenario
npm run eval my-scenario

# View in UI
open eval/ui/index.html
```

### Finding Issues
```bash
# Run all scenarios, see what fails
npm run eval

# Check specific failure
cat eval/scenarios/output/failed-scenario.log

# Review in UI
open eval/ui/index.html
```

### Creating Test Cases
```bash
# Copy existing scenario
cp eval/scenarios/definitions/happy-path-3-members.json \
   eval/scenarios/definitions/my-edge-case.json

# Edit expectations
vim eval/scenarios/definitions/my-edge-case.json

# Test it
npm run eval my-edge-case
```

---

## 📖 Additional Resources

- **BACKLOG.md** - See AI reliability fixes in progress
- **src/state/stateMachine.js** - Understand state transitions
- **src/agents/** - Agent implementation details

---

## 🙋 Questions?

**How do I add a new scenario?**
→ Copy an existing JSON, modify it, run `npm run eval scenario-name`

**Why did my test fail?**
→ Check `eval/scenarios/output/scenario-name.log` or view in UI

**Can I test just one agent?**
→ Not yet - Phase 2 will add agent isolation tests

**How do I speed up tests?**
→ Run specific scenarios instead of all: `npm run eval scenario-name`

**Where are the results saved?**
→ `eval/scenarios/output/` (logs and JSON)

---

**Built with ❤️ to make testing Voyaj faster and more reliable**
