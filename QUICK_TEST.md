# Quick Test Guide

## Interactive Testing (Recommended)

Run the interactive test script:

```bash
node test-interactive.js
```

This lets you:
- Type messages and send them to the bot
- Change phone numbers (simulate different people)
- See bot responses in real-time

**In another terminal, watch bot responses:**
```bash
tail -f /tmp/voyaj-server.log | grep "MOCK SMS"
```

## Manual Testing with curl

### Test Member Joining

```bash
# Person 1 joins
curl -X POST http://localhost:3002/test/sms \
  -H "Content-Type: application/json" \
  -d '{"from": "+15551111111", "body": "Sarah", "groupId": "my-trip"}'

# Person 2 joins
curl -X POST http://localhost:3002/test/sms \
  -H "Content-Type: application/json" \
  -d '{"from": "+15552222222", "body": "Mike", "groupId": "my-trip"}'

# Person 3 joins (triggers destination voting)
curl -X POST http://localhost:3002/test/sms \
  -H "Content-Type: application/json" \
  -d '{"from": "+15553333333", "body": "Alex", "groupId": "my-trip"}'
```

### Test Destination Voting

After 3 people join, the bot will ask for destinations. Vote:

```bash
curl -X POST http://localhost:3002/test/sms \
  -H "Content-Type: application/json" \
  -d '{"from": "+15551111111", "body": "Tokyo", "groupId": "my-trip"}'

curl -X POST http://localhost:3002/test/sms \
  -H "Content-Type: application/json" \
  -d '{"from": "+15552222222", "body": "Tokyo", "groupId": "my-trip"}'

curl -X POST http://localhost:3002/test/sms \
  -H "Content-Type: application/json" \
  -d '{"from": "+15553333333", "body": "Bali", "groupId": "my-trip"}'
```

### Test Date Voting

After destination is chosen, vote on dates:

```bash
curl -X POST http://localhost:3002/test/sms \
  -H "Content-Type: application/json" \
  -d '{"from": "+15551111111", "body": "March 15-22", "groupId": "my-trip"}'
```

### Test Flight Tracking

After dates are locked:

```bash
curl -X POST http://localhost:3002/test/sms \
  -H "Content-Type: application/json" \
  -d '{"from": "+15551111111", "body": "I booked AA 154", "groupId": "my-trip"}'
```

## Watch Bot Responses

**Option 1: Real-time (recommended)**
```bash
tail -f /tmp/voyaj-server.log | grep "MOCK SMS"
```

**Option 2: Recent responses**
```bash
tail -50 /tmp/voyaj-server.log | grep "MOCK SMS"
```

**Option 3: All bot activity**
```bash
tail -f /tmp/voyaj-server.log
```

## Tips

- Use the same `groupId` for all messages in a trip
- Use different phone numbers to simulate different people
- Bot responses appear in the server log (not in curl output)
- The interactive script makes it easier to test flows




