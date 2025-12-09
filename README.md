# Voyaj - Group Trip Coordination Bot

AI-powered SMS bot that helps friend groups plan trips without anyone being the "default organizer."

## Features

- **Auto-creates trips** when bot is added to group chat
- **Member collection** - Everyone joins by replying with their name
- **Destination voting** - Coordinate where to go
- **Date coordination** - Lock in dates
- **Flight tracking** - Track who's booked flights

## Quick Start

### Prerequisites

- Node.js 18+
- PostgreSQL database
- Claude API key (from Anthropic)

### Setup

1. **Clone and install:**
```bash
npm install
```

2. **Set up database:**
```bash
# Create database
createdb voyaj

# Run schema
psql voyaj < src/db/schema.sql
```

3. **Configure environment:**
```bash
cp .env.example .env
# Edit .env and add your ANTHROPIC_API_KEY
```

4. **Start server:**
```bash
npm run dev
```

Server will start on `http://localhost:3000`

## Testing Without Real SMS

The MVP uses a **mock Twilio client** - no real SMS needed for testing!

### Method 1: Test Endpoint (Recommended)

```bash
# Send a message
curl -X POST http://localhost:3000/test/sms \
  -H "Content-Type: application/json" \
  -d '{
    "from": "+15551234567",
    "body": "Sarah",
    "groupId": "test-group-1"
  }'
```

### Method 2: Test Script

```bash
npm run test:scenarios
```

This runs a full trip flow:
1. Members join
2. Destination voting
3. Date voting
4. Flight tracking

### Method 3: Interactive Testing

Use the test endpoint to simulate a group chat:

```bash
# Person 1 joins
curl -X POST http://localhost:3000/test/sms \
  -H "Content-Type: application/json" \
  -d '{"from": "+15551234567", "body": "Sarah", "groupId": "group1"}'

# Person 2 joins
curl -X POST http://localhost:3000/test/sms \
  -H "Content-Type: application/json" \
  -d '{"from": "+15551234568", "body": "Mike", "groupId": "group1"}'

# Person 3 joins
curl -X POST http://localhost:3000/test/sms \
  -H "Content-Type: application/json" \
  -d '{"from": "+15551234569", "body": "Alex", "groupId": "group1"}'

# Now voting starts - vote on destination
curl -X POST http://localhost:3000/test/sms \
  -H "Content-Type: application/json" \
  -d '{"from": "+15551234567", "body": "Tokyo", "groupId": "group1"}'
```

All bot responses will appear in the console (mock SMS client).

## Project Structure

```
src/
├── server.js              # Express server, webhook handlers
├── orchestrator.js        # Routes messages to agents
├── agents/                # Specialist agents
│   ├── coordinator.js    # Member joining, conversation
│   ├── voting.js         # Poll management
│   └── parser.js         # Flight info extraction
├── queue/                 # Message queue (per-trip FIFO)
├── context/               # Context builder (minimal context)
├── state/                 # State machine, event emitter
├── db/                    # Database queries
└── utils/                 # Claude API, Twilio mock, helpers
```

## How It Works

1. **Message arrives** → Added to per-trip queue
2. **Orchestrator** → Detects intent, builds context, routes to agent
3. **Agent processes** → Updates database, sends response
4. **State machine** → Checks for stage transitions
5. **Events emitted** → Coordinate across channels (future)

## Environment Variables

```bash
DATABASE_URL=postgresql://localhost:5432/voyaj
ANTHROPIC_API_KEY=your_key_here
PORT=3000
NODE_ENV=development
```

## Development

```bash
# Start with auto-reload
npm run dev

# Run tests
npm test

# Run full trip flow test
npm run test:scenarios
```

## Mock Twilio Client

The MVP uses a mock Twilio client that:
- Logs all messages to console
- Doesn't send real SMS
- Perfect for testing

To see bot responses, watch the console output.

## Next Steps

- [ ] Add real Twilio integration (when ready for production)
- [ ] Add web dashboard
- [ ] Add expense tracking
- [ ] Add itinerary generation

## Architecture

See `TECHNICAL_ARCHITECTURE.md` for detailed architecture documentation.

## License

MIT




