# Uncertain Test Cases - Need Review

These are test cases where the "correct" behavior is ambiguous or questionable. We should discuss and potentially adjust expectations.

## 🔴 High Uncertainty

### 1. **Voting: "Let's go with Tokyo"** (voting.eval.js:20)
```javascript
{ input: 'Let\'s go with Tokyo', options: ['Tokyo', 'Bali', 'Paris'], expected: 'Tokyo', description: 'Natural language vote' }
```
**Issue:** This is ambiguous! It could be:
- A vote for Tokyo (current expectation)
- A suggestion to add Tokyo as a new destination
- Just expressing preference without voting

**Question:** Should this parse as a vote, or should it be rejected/treated differently?

---

### 2. **Parser: "next week"** (parser.eval.js:24)
```javascript
{ input: 'next week', expected: { startDate: null, endDate: null, type: 'date_range' }, description: 'Relative date', tolerance: 7 }
```
**Issue:** 
- "next week" is relative to "now" - but what is "now" in the test?
- The expected dates are `null` but type is `date_range` - this is contradictory
- Should we provide a reference date in the test?

**Question:** How should relative dates be handled? Should we test with a specific "current date" context?

---

### 3. **Parser: "late May"** (parser.eval.js:25)
```javascript
{ input: 'late May', expected: { startDate: null, endDate: null, type: 'date_range' }, description: 'Vague date range', tolerance: 30 }
```
**Issue:**
- "late May" is very vague - could be May 20-31, or May 15-31, etc.
- Expected dates are `null` but type is `date_range` - contradictory
- 30-day tolerance is huge - is this even useful?

**Question:** Should vague dates like "late May" be parsed at all, or should we ask for clarification?

---

## 🟡 Medium Uncertainty

### 4. **Coordinator: "April" with context** (coordinator.eval.js:46-47)
```javascript
{ input: 'April', expected: true, description: 'Ambiguous name with context (existing members: Sarah, Mike)', 
  context: [{ name: 'Sarah' }, { name: 'Mike' }], ambiguous: true }
```
**Issue:**
- Even with context of other members, "April" is still ambiguous
- The context doesn't really help - it's still unclear if it's a name or month
- Maybe we should test with more context (like if someone said "Hi, I'm April" vs just "April")

**Question:** Does context actually help here, or should we accept that "April" is always ambiguous?

---

### 5. **Voting: "1 - Tokyo!!!"** (voting.eval.js:18)
```javascript
{ input: '1 - Tokyo!!!', options: ['Tokyo', 'Bali', 'Paris'], expected: 'Tokyo', description: 'Vote with enthusiasm' }
```
**Issue:**
- The code uses AI to parse votes with extra text
- What if the AI sees the enthusiasm and thinks it's not a formal vote?
- What if it extracts "Tokyo" from text instead of using the number?

**Question:** Is the current expectation correct, or should we test what the AI actually does?

---

### 6. **Voting: "I vote for option 1"** (voting.eval.js:19)
```javascript
{ input: 'I vote for option 1', options: ['Tokyo', 'Bali', 'Paris'], expected: 'Tokyo', description: 'Natural language vote' }
```
**Issue:**
- This should work, but depends on AI recognizing the pattern
- What if the AI doesn't recognize "option 1" as referring to the poll?

**Question:** Should we verify the AI actually recognizes this pattern, or is it safe to assume?

---

### 7. **Destination Normalization: Member names** (voting.eval.js:52-53)
```javascript
{ input: 'Sarah', expected: null, description: 'Member name, not destination', context: [{ name: 'Sarah' }], shouldThrow: 'NAME_NOT_DESTINATION' }
```
**Issue:**
- What if someone's name IS a destination name? (e.g., "Paris", "London", "Sydney")
- The test only covers common names, not destination-names

**Question:** Should we test edge cases where a name could also be a destination?

---

## 🟢 Low Uncertainty (But Worth Noting)

### 8. **Coordinator: "Tokyo" with context** (coordinator.eval.js:48-49)
```javascript
{ input: 'Tokyo', expected: false, description: 'Destination with context (existing members: Sarah, Mike)', 
  context: [{ name: 'Sarah' }, { name: 'Mike' }] }
```
**Issue:** 
- Very unlikely someone's name is "Tokyo", but technically possible
- The expectation seems reasonable

**Note:** Probably fine, but worth acknowledging the edge case exists.

---

## Recommendations

1. **Remove or adjust** the contradictory parser tests ("next week", "late May" with null dates but date_range type)
2. **Clarify** the "Let's go with Tokyo" test - is it a vote or suggestion?
3. **Test with actual AI** to see what happens with ambiguous cases rather than assuming
4. **Add more context** to relative date tests (provide "current date")
5. **Consider** making some tests "ambiguous" category rather than strict pass/fail

