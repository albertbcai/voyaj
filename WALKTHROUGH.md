# Complete Walkthrough: Testing Voyaj Step-by-Step

## Setup

**Terminal 1: Watch bot responses**
```bash
tail -f /tmp/voyaj-server.log | grep "MOCK SMS"
```

**Terminal 2: Send messages** (use the commands below)

---

## Complete Trip Flow

### Step 1: Start a New Trip

**Send:**
```bash
curl -X POST http://localhost:3002/test/sms \
  -H "Content-Type: application/json" \
  -d '{"from": "+15551111111", "body": "Sarah", "groupId": "my-trip-123"}'
```

**Expected Bot Response:**
```
Hey! New trip 🎉
Everyone reply with your name to join.
```

---

### Step 2: Add Second Person

**Send:**
```bash
curl -X POST http://localhost:3002/test/sms \
  -H "Content-Type: application/json" \
  -d '{"from": "+15552222222", "body": "Mike", "groupId": "my-trip-123"}'
```

**Expected Bot Response:**
```
Welcome Mike! 🎉 2 people in the trip.
```

---

### Step 3: Add Third Person (Triggers Voting!)

**Send:**
```bash
curl -X POST http://localhost:3002/test/sms \
  -H "Content-Type: application/json" \
  -d '{"from": "+15553333333", "body": "Alex", "groupId": "my-trip-123"}'
```

**Expected Bot Response:**
```
Welcome Alex! 🎉 3 people in the trip.

Got enough people! Let's plan.
Where should we go? Drop destination ideas!
```

---

### Step 4: Vote on Destinations

**Sarah votes for Tokyo:**
```bash
curl -X POST http://localhost:3002/test/sms \
  -H "Content-Type: application/json" \
  -d '{"from": "+15551111111", "body": "Tokyo", "groupId": "my-trip-123"}'
```

**Expected Response:**
```
Got it! Voted for: Tokyo ✓
```

**Mike votes for Tokyo:**
```bash
curl -X POST http://localhost:3002/test/sms \
  -H "Content-Type: application/json" \
  -d '{"from": "+15552222222", "body": "Tokyo", "groupId": "my-trip-123"}'
```

**Alex votes for Bali:**
```bash
curl -X POST http://localhost:3002/test/sms \
  -H "Content-Type: application/json" \
  -d '{"from": "+15553333333", "body": "Bali", "groupId": "my-trip-123"}'
```

**Expected Bot Response (after majority votes):**
```
Tokyo wins with 2 votes! 🎉
Now let's pick dates. When can everyone go?
```

---

### Step 5: Vote on Dates

**Sarah suggests dates:**
```bash
curl -X POST http://localhost:3002/test/sms \
  -H "Content-Type: application/json" \
  -d '{"from": "+15551111111", "body": "March 15-22", "groupId": "my-trip-123"}'
```

**Mike votes for March:**
```bash
curl -X POST http://localhost:3002/test/sms \
  -H "Content-Type: application/json" \
  -d '{"from": "+15552222222", "body": "March 15-22", "groupId": "my-trip-123"}'
```

**Alex votes for March:**
```bash
curl -X POST http://localhost:3002/test/sms \
  -H "Content-Type: application/json" \
  -d '{"from": "+15553333333", "body": "March 15-22", "groupId": "my-trip-123"}'
```

**Expected Bot Response:**
```
March 15-22 locked in! ✓
Text me when you book flights. ✈️
```

---

### Step 6: Track Flights

**Sarah books:**
```bash
curl -X POST http://localhost:3002/test/sms \
  -H "Content-Type: application/json" \
  -d '{"from": "+15551111111", "body": "I booked AA 154", "groupId": "my-trip-123"}'
```

**Expected Response:**
```
Sarah booked! ✈️ AA 154
```

**Mike books:**
```bash
curl -X POST http://localhost:3002/test/sms \
  -H "Content-Type: application/json" \
  -d '{"from": "+15552222222", "body": "I booked UA 456", "groupId": "my-trip-123"}'
```

**Alex books:**
```bash
curl -X POST http://localhost:3002/test/sms \
  -H "Content-Type: application/json" \
  -d '{"from": "+15553333333", "body": "I booked DL 789", "groupId": "my-trip-123"}'
```

**Expected Final Response:**
```
Everyone booked! 🎉 Trip is really happening!
```

---

## Tips

1. **Use the same `groupId`** for all messages in one trip
2. **Use different phone numbers** to simulate different people
3. **Watch Terminal 1** to see all bot responses in real-time
4. **Wait 2-3 seconds** between messages to see responses

## About the 529 Errors

The "529 Overloaded" errors you see are Claude API being temporarily overloaded. The system:
- ✅ Automatically retries 3 times
- ✅ Falls back gracefully if retries fail
- ✅ Only logs final failures (reduced noise)

These are **normal and handled automatically** - the bot still works!



