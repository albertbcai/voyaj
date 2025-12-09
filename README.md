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

## Backlog

### 🔴 Blocked / Waiting

- [ ] **Wait for A2P compliance approval** - Application submitted to Twilio, waiting for approval. Once approved, implement:
  - STOP/HELP keyword handling in `src/server.js`
  - Opt-out tracking in database (add `opt_outs` table)
  - Updated welcome message with full compliance text in `src/agents/coordinator.js`
  - Prevent messages to opted-out users

---

### 🟢 Phase 1: MVP Completion (Current Focus)

#### SMS Integration & Group Messaging
- [ ] **Integrate real Twilio SMS** - Replace mock Twilio client with real Twilio integration
  - Configure Twilio webhook endpoint in `src/server.js`
  - Update `src/utils/twilio.js` to use real Twilio client
  - Test with Twilio test credentials first
- [ ] **Implement group messaging support** - Ensure SMS works properly with group messaging
  - Handle group chat ID changes (recreated with new person)
  - Test group message delivery and responses
  - Verify all group members receive bot messages

#### Testing & Validation
- [ ] **Continue backend testing** - Comprehensive testing to ensure stability
  - Run full trip flow test script
  - Manual testing with Twilio test numbers
  - Test error scenarios and edge cases
  - Verify message queue ordering
  - Test state machine transitions
- [ ] **Test with real users** - Beta testing with 3-5 real friend groups
  - Collect feedback from each group
  - Monitor error logs daily
  - Fix critical bugs within 24 hours
  - Iterate based on feedback

#### Infrastructure & Polish
- [ ] **Error handling improvements** - Multi-layer fallbacks
  - Retry with exponential backoff (Claude API failures)
  - Web fallback link: "Having trouble? View/edit at voyaj.app/trip123"
  - Simple error messages: "I didn't quite catch that. Can you rephrase?"
  - Log errors for debugging
- [ ] **Logging & monitoring** - Structured logging setup
  - JSON logs with log levels (info, error, debug)
  - Error log table in database
  - Basic admin view: `/admin/errors`
- [ ] **Rate limiting** - Basic rate limiting (10 messages/minute per trip) to prevent abuse
- [ ] **Cost tracking** - Track Claude API costs
  - Log token usage per trip
  - Calculate cost per trip
  - Alert if > $5/trip
- [ ] **Deployment** - Set up production deployment
  - Deploy to Railway/Render/Fly.io
  - Configure environment variables
  - Set up database backups
  - Verify backup strategy

---

### 🟡 Phase 2: Post-MVP Polish (Week 2-4)

#### Core Features
- [ ] **Basic itinerary generation** - Day-by-day activity suggestions
  - Generate after dates locked (parallel with flight tracking)
  - "Engage when disagree" model: silence = consent
  - Create Itinerary Agent
- [ ] **Web dashboard (view-only)** - Basic trip viewing interface
  - View trip details, members, votes, flights
  - No editing required for MVP
  - Useful for debugging and feedback
- [ ] **Basic expense tracking** - Track group expenses
  - Create Expense Agent
  - Parse expense messages
  - Calculate balances

#### Infrastructure Improvements
- [ ] **Database migrations** - Set up migration system
  - Use node-pg-migrate or Prisma
  - Handle schema changes as we iterate
- [ ] **Redis-based message queue** - Scale beyond in-memory queues
  - Use BullMQ for production
  - Handle higher message volumes
- [ ] **Feedback system** - Built-in feedback collection
  - After each stage: "How was that? Reply 1-5"
  - After trip: "How was Voyaj? Reply 1-5 or share feedback"
  - Store feedback in database
  - Simple analytics dashboard

#### Testing & Scale
- [ ] **Testing with 20-50 real trips** - Scale testing
- [ ] **Performance testing** - Test with 10+ concurrent trips
- [ ] **Better error handling** - Enhanced error recovery

---

### 🔵 Phase 3: Future Features (Month 2+)

#### Revenue & Monetization
- [ ] **Payment/upgrade flow** - Stripe integration
  - Paywall after 150 messages (free tier limit)
  - Stripe checkout link via SMS: "Upgrade: voyaj.app/upgrade/trip123"
  - Bot pauses until payment succeeds
- [ ] **Affiliate link integration** - Revenue from bookings
  - Test affiliate conversion rates
  - Integrate booking links (hotels, flights, activities)
  - Track conversions

#### Advanced Features
- [ ] **Advanced expense tracking** - Full expense management
  - Split calculations
  - Settlement tracking
- [ ] **Daily notifications during trip** - Active trip support
  - Check-in messages
  - Activity reminders
  - Create Notification Agent
- [ ] **Email parsing** - Flight confirmation parsing
  - Parse flight confirmation emails
  - Auto-update flight tracking
- [ ] **Flight status tracking** - API integration
  - Real-time flight status
  - Delay notifications
  - Create Flight Status Agent

#### Platform Expansion
- [ ] **iOS app** - Native iOS application
  - Add `/api/ios/message` endpoint
  - Device token storage
  - Push notification service
  - Build basic iOS app (Swift/SwiftUI)
  - Rich trip views
  - In-app voting interface
  - Real-time updates (WebSocket)
  - Offline support
- [ ] **Web API** - Full REST API for web/mobile
  - Trip management endpoints
  - Member management
  - Real-time updates

#### Growth Features
- [ ] **Recommendation engine** - AI-powered suggestions
  - Activity recommendations
  - Restaurant suggestions
  - Integrate with affiliate links
- [ ] **Photo sharing** - Group photo collection
- [ ] **Post-trip settlement** - Expense finalization
- [ ] **Mobile app (Android)** - If iOS app successful

---

### 📋 Additional Technical Debt

#### From PRD Additional Questions
- [ ] **Environment variables & secrets** - Secure management
  - Create `.env.example` with required variables
  - Never commit secrets
- [ ] **Monitoring & alerts** - Production monitoring
  - Error rate > 5% alerts
  - Response time > 5s alerts
  - Claude costs > $10/day alerts
  - Database connection failure alerts

#### From Technical Architecture
- [ ] **Connection pooling** - Database optimization
- [ ] **CDN for static assets** - If web dashboard added
- [ ] **Database read replicas** - For scale
- [ ] **Load balancer** - Multiple servers

---

### Notes

- **Priority order**: Complete Phase 1 before moving to Phase 2
- **Testing**: Continuous testing throughout all phases
- **Cost monitoring**: Track Claude API costs at every phase
- **User feedback**: Collect and iterate based on real usage

## Architecture

See `TECHNICAL_ARCHITECTURE.md` for detailed architecture documentation.

## License

MIT




