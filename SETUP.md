# Voyaj MVP Setup Guide

## Quick Setup (5 minutes)

### 1. Install Dependencies

```bash
npm install
```

### 2. Set Up Database

**Option A: Local PostgreSQL**
```bash
# Create database
createdb voyaj

# Run schema
psql voyaj < src/db/schema.sql
```

**Option B: Use a cloud database (Railway, Supabase, etc.)**
- Create PostgreSQL database
- Get connection string
- Use in `.env` file

### 3. Configure Environment

```bash
cp .env.example .env
```

Edit `.env`:
```bash
DATABASE_URL=postgresql://localhost:5432/voyaj
ANTHROPIC_API_KEY=sk-ant-...  # Get from https://console.anthropic.com
PORT=3000
NODE_ENV=development
```

### 4. Start Server

```bash
npm run dev
```

You should see:
```
🚀 Voyaj server running on port 3000
📱 Test endpoint: POST http://localhost:3000/test/sms
📊 Health check: GET http://localhost:3000/health
```

## Testing

### Quick Test

```bash
# Send a test message
curl -X POST http://localhost:3000/test/sms \
  -H "Content-Type: application/json" \
  -d '{"from": "+15551234567", "body": "Sarah", "groupId": "test1"}'
```

Watch the console - you'll see bot responses logged!

### Full Trip Flow Test

```bash
npm run test:scenarios
```

This simulates:
- 4 people joining
- Destination voting
- Date voting
- Flight tracking

## How to Test Features

### Test Member Joining

```bash
# Person 1
curl -X POST http://localhost:3000/test/sms \
  -d '{"from": "+15551234567", "body": "Sarah", "groupId": "group1"}'

# Person 2
curl -X POST http://localhost:3000/test/sms \
  -d '{"from": "+15551234568", "body": "Mike", "groupId": "group1"}'

# Person 3 (triggers destination voting)
curl -X POST http://localhost:3000/test/sms \
  -d '{"from": "+15551234569", "body": "Alex", "groupId": "group1"}'
```

### Test Destination Voting

```bash
# After 3 people join, bot asks for destinations
# Vote on destinations
curl -X POST http://localhost:3000/test/sms \
  -d '{"from": "+15551234567", "body": "Tokyo", "groupId": "group1"}'

curl -X POST http://localhost:3000/test/sms \
  -d '{"from": "+15551234568", "body": "Tokyo", "groupId": "group1"}'

curl -X POST http://localhost:3000/test/sms \
  -d '{"from": "+15551234569", "body": "Bali", "groupId": "group1"}'
```

### Test Flight Tracking

```bash
# After dates are locked
curl -X POST http://localhost:3000/test/sms \
  -d '{"from": "+15551234567", "body": "I booked AA 154", "groupId": "group1"}'
```

## Troubleshooting

### Database Connection Error

```bash
# Check if PostgreSQL is running
psql -l

# Check connection string in .env
echo $DATABASE_URL
```

### Claude API Error

- Make sure `ANTHROPIC_API_KEY` is set in `.env`
- Check API key is valid at https://console.anthropic.com
- Ensure you have API credits

### Port Already in Use

```bash
# Change PORT in .env
PORT=3001
```

## Next Steps

1. ✅ Test all features locally
2. ✅ Customize bot responses
3. ✅ Add real Twilio integration (when ready)
4. ✅ Deploy to production

## Architecture Notes

- **Mock Twilio**: All SMS messages are logged to console (no real SMS)
- **Message Queue**: In-memory per-trip queues (prevents race conditions)
- **Agents**: Coordinator, Voting, Parser (specialized handlers)
- **State Machine**: Automatic stage transitions
- **Context Management**: Minimal context to save Claude API costs

See `TECHNICAL_ARCHITECTURE.md` for full details.




