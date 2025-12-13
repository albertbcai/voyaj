# Voyaj Product Requirements Document

## Executive Summary

Voyaj is an AI-powered trip coordination bot that eliminates the need for a "default organizer" in friend group trips. By handling coordination via SMS, Voyaj turns trip ideas into actual bookings—making group trips happen when they otherwise wouldn't.

**Core Value Proposition:** "Group trips where no one does all the work" + "Make group trips actually happen"

**Target User:** Friend groups (20s-30s) who want to travel together but struggle with coordination and decision-making.

---

## Product Vision

### The Problem

Friend groups have trip ideas, but trips never materialize because:
- No one wants to be "the organizer" (leads to resentment)
- Endless group chat debates with no decisions
- Coordination exhausts the one person who tries
- Result: Trip stays in "we should totally do this" phase forever

### The Solution

Voyaj is an SMS-based AI coordinator that:
- Facilitates decisions (voting on destinations, dates)
- Tracks commitments (flight bookings)
- Coordinates without anyone being the default organizer
- Turns trip ideas into actual plane tickets

### Success Metrics

**North Star:** Trips that result in actual plane tickets

**Leading Indicators:**
- Destination locked in < 48 hours
- Dates locked in < 1 week
- First flight booked < 2 weeks
- Majority of group books flights

**Lagging Indicators:**
- Trip actually happens (group lands at destination)
- User testimonial: "Trip wouldn't have happened without Voyaj"
- Group adds Voyaj to their NEXT trip (retention)

---

## MVP Scope (Week 1-2)

### Core Features (Must Have)

#### 1. Trip Creation & Onboarding
- **Auto-create trip** when bot is added to group chat
- **Name collection:** Everyone replies with their name to join
- **Phone → trip mapping:** One active trip per user (free tier)
- **Auto-generated invite code** (for adding people later, not required for initial onboarding)

#### 2. Destination Voting
- Bot asks: "Where should we go? Drop destination ideas"
- Group suggests destinations
- Bot creates poll, tallies votes
- Declares winner when majority votes or 48hr timeout
- Transitions to date voting

#### 3. Date Coordination
- Bot asks: "When can everyone go? Drop your available months/date ranges"
- Group suggests dates
- Bot creates poll, tallies votes
- Locks in dates when majority votes or 48hr timeout
- Transitions to planning stage

#### 4. Flight Tracking
- Bot asks: "Text me when you book flights"
- Users report: "I booked" or "AA 154, lands 2pm March 15"
- Bot tracks who's booked (honor system)
- Optionally collects flight details (airline, flight #, arrival time)
- Shows status: "3/7 people booked"

#### 5. Basic Itinerary Suggestions
- Bot generates day-by-day activity suggestions (post-MVP, Week 2)
- Uses "engage when disagree" model: silence = consent, speak up to change
- Not critical for MVP (people can figure things out once there)

### Technical Architecture (Scalable Foundation)

#### Agent System
- **Orchestrator:** Routes messages to specialist agents
  - Intent detection (rule-based first, AI fallback)
  - Context building (minimal, agent-specific)
  - Error handling & fallbacks
- **Coordinator Agent:** Conversational, guides flow, handles member joining
- **Voting Agent:** Poll management, vote tallying, winner declaration
- **Parser Agent:** Extracts structured data (flight info, expenses)

#### Infrastructure
- **Per-trip message queue:** FIFO processing, prevents race conditions
- **State machine:** Explicit trip progression (created → voting → planning → active)
- **Context management:** Only send relevant data to agents (last 10 messages, not all 200)
- **Event system:** Coordinates SMS + Web + future channels

#### Data Model
- **Trips:** id, invite_code, group_chat_id, destination, dates, stage
- **Members:** trip_id, phone_number, name (one active trip per phone, free tier)
- **Votes:** trip_id, poll_type, member_id, choice
- **Flights:** trip_id, member_id, airline, flight_number, arrival_time
- **Messages:** trip_id, from_phone, body, timestamp (for context/debugging)

### Out of Scope for MVP

- ❌ Web dashboard (can be Week 2)
- ❌ Expense tracking (can be Week 2)
- ❌ Detailed itinerary generation (can be Week 2)
- ❌ Daily notifications during trip (can be Week 2)
- ❌ Payment/upgrade flow (can be Week 3)
- ❌ Affiliate links (can be Week 3+)
- ❌ Email parsing (can be Week 4+)

---

## Scalable Architecture Design

### Agent System (Designed for Growth)

**MVP Agents (Week 1-2):**
- Coordinator Agent
- Voting Agent
- Parser Agent

**Future Agents (Plug into same orchestrator):**
- Itinerary Agent (Week 2)
- Expense Agent (Week 3)
- Notification Agent (Week 4)
- Recommendation Agent (Week 4+)
- Flight Status Agent (Week 5+)

**Key Principle:** Orchestrator is smart (routing, context, errors), agents are dumb (do one thing, stateless)

### Context Management Strategy

**Problem:** Trip conversations are long (50-200+ messages over 2 months). Can't send everything to Claude.

**Solution:** Layered context
- Layer 1: Essential trip facts (destination, dates, stage, members) - always included
- Layer 2: Agent-specific recent data (last 10 messages for conversation, last 5 expenses for expense agent)
- Layer 3: Current message

**Token Budget:** ~2,000 tokens per call ($0.006) vs. 70,000 tokens ($0.21) if sending everything

### State Machine

**Stages:**
1. `created` → Trip just created, bot added to chat
2. `collecting_members` → Gathering people to join the trip (minimum 2 members)
3. `planning` → Pre-voting phase: collecting destination suggestions and/or date availability
4. `voting_destination` → Active poll for destination
5. `voting_dates` → Active poll for dates
6. `tracking_flights` → Both destination and dates set, tracking flight bookings
7. `trip_confirmed` → All flights booked, waiting for trip to start
8. `active` → Trip is happening (during trip)
9. `completed` → Trip ended, post-trip settlement

**State Flow:**
- `planning` → `voting_destination` → `planning` (with destination set)
- `planning` → `voting_dates` → `planning` (with dates set)
- `planning` (with both set) → `tracking_flights`

**Planning State Behavior:**
- Accepts both destination suggestions and date availability simultaneously
- Tracks counts: distinct members with destination suggestions vs date availability
- Default: Nudges toward dates ("Let's start with dates...")
- Tone adjustment: If destination count > date count, be less pushy about dates
- Voting triggers (whichever happens first):
  - Destination threshold: All members have suggested destinations → start `voting_destination`
  - Date threshold: All members have shared date availability → start `voting_dates` (default preference)
  - Timeout: 12 hours in planning → vote on whichever has more suggestions

**Transition Logic:** Check after every message + cron job (hourly)

### Multi-Channel Architecture

**Inputs:**
- SMS (Twilio) - primary for MVP
- Web API (future)
- Email (future)
- Cron jobs (scheduled triggers)

**Outputs:**
- SMS (Twilio) - primary for MVP
- Web dashboard (future)
- Email (future)

**Event System:** All changes emit events, listeners coordinate across channels

---

## Business Model

### Freemium Structure

**Free Tier:**
- One active trip at a time
- 150 messages per trip
- All coordination features
- Revenue: Affiliate commissions (~$35/trip at 4% conversion)
- Cost: ~$6/trip (Claude API + SMS)
- Margin: ~$29/trip (if affiliates work)

**Paid Tier ($49/year or $9.99/trip):**
- Unlimited active trips
- Dedicated phone number per trip
- Unlimited messages
- Ad-free experience
- Revenue: $9.99/trip
- Cost: ~$6/trip
- Margin: ~$3.99/trip

**Key Risk:** Affiliate conversion rate unknown. If <1%, paid tier becomes primary revenue.

### Monetization Strategy

**MVP:** Focus on free tier, test affiliate conversion
**Month 2:** If affiliates work (3-5% conversion) → keep generous free tier
**Month 2:** If affiliates fail (<1% conversion) → limit free tier, push paid

---

## User Experience Flow

### Trip Creation (SMS-First)

1. Sarah creates group chat with friends
2. Adds +1 (855) VOYAJ to chat
3. Bot: "Hey! New trip 🎉 Everyone reply with your name to join."
4. Sarah: "Sarah" → Bot: "Welcome Sarah! 🎉"
5. Mike: "Mike" → Bot: "Welcome Mike! 2 people in."
6. Alex: "Alex" → Bot: "Welcome Alex! 3 people in."
7. Bot: "Got enough people! Let's plan. Where should we go? Drop destination ideas."

### Destination Voting

1. Group suggests: "Tokyo!" "Bali!" "Iceland!"
2. Bot: "Got 3 options: Tokyo, Bali, Iceland. Vote by replying with your choice."
3. Sarah: "Tokyo" → Bot: "Got it! Voted for Tokyo ✓"
4. Mike: "Tokyo" → Bot: "Got it! Voted for Tokyo ✓"
5. Alex: "Bali" → Bot: "Got it! Voted for Bali ✓"
6. Bot: "2/3 voted. Still waiting on: Jordan"
7. Jordan: "Tokyo" → Bot: "Tokyo wins with 3 votes! 🎉 Now let's pick dates."

### Date Coordination

1. Bot: "When can everyone go? Drop your available months or date ranges."
2. Group suggests: "March works" "April is better" "Either works"
3. Bot: "Got options: March 15-22, April 5-12. Vote by replying with your choice."
4. [Voting proceeds...]
5. Bot: "March 15-22 locked in! ✓ Text me when you book flights. ✈️"

### Flight Tracking

1. Sarah: "I booked"
2. Bot: "Awesome! ✈️ What's your flight number and arrival time?"
3. Sarah: "AA 154, lands 2pm March 15"
4. Bot: "Got it! Sarah: AA 154 arrives 2pm March 15"
5. Bot (to group): "Sarah booked! ✈️ AA 154. 1/4 people booked."

---

## Technical Implementation

### Technology Stack

- **Backend:** Node.js + Express
- **Database:** PostgreSQL (with JSONB for flexibility)
- **SMS:** Twilio
- **AI:** Claude API (Anthropic)
- **Queue:** In-memory for MVP (BullMQ/Redis for scale)
- **Hosting:** Railway or similar

### Key Design Decisions

1. **One trip per user (free tier):** Phone number → trip mapping is clean, no ambiguity
2. **Auto-create trips:** No web step required for MVP, reduces friction
3. **Rule-based first, AI second:** Keeps costs down, faster responses
4. **Per-trip message queue:** Prevents race conditions, ensures ordering
5. **Minimal context:** Only send relevant data to agents, saves tokens

### File Structure

```
/src
├─ orchestrator.js          # Main router
├─ /agents
│  ├─ coordinator.js        # MVP: Conversational agent
│  ├─ voting.js             # MVP: Poll management
│  └─ parser.js             # MVP: Extract structured data
├─ /context
│  └─ contextBuilder.js    # Builds minimal context
├─ /state
│  ├─ stateMachine.js      # Stage transitions
│  └─ eventEmitter.js      # Event coordination
├─ /queue
│  └─ messageQueue.js      # Per-trip FIFO queue
├─ /db
│  └─ queries.js           # Database operations
└─ server.js               # Express app
```

---

## Key Decisions (Resolved)

### 1. Group Chat Identification & Membership
**Decision:** Auto-detect when group chat changes (recreated with new person)
- For MVP: Phone number → trip mapping handles group chat changes
- Future: Add invite code system in Week 2 if needed

### 2. Itinerary Generation & Voting
**Decision:** Basic suggestions (Day 1: Morning activity, Lunch, Afternoon, Evening)
- "Engage when disagree" model: silence = consent, speak up to change
- Generate after dates locked (can happen in parallel with flight tracking)

### 3. Payment & Upgrade Flow
**Decision:** Paywall after 150 messages (Option B)
- One person pays for entire group (simplest)
- Stripe checkout link sent via SMS: "Upgrade: voyaj.app/upgrade/trip123"
- Bot pauses until payment succeeds

### 4. Affiliate Link Integration
**Decision:** Skip for MVP, focus on core value
- Add in Week 3-4 after validating core product

### 5. Error Recovery & Edge Cases
**Decision:** Multi-layer fallbacks
- **Layer 1:** Retry with exponential backoff (Claude API failures)
- **Layer 2:** Web fallback link: "Having trouble? View/edit at voyaj.app/trip123"
- **Layer 3:** Simple error message: "I didn't quite catch that. Can you rephrase?"
- **Layer 4:** Log errors for debugging, no user-facing panic

### 6. Web Dashboard Scope
**Decision:** Skip entirely for MVP
- Focus on SMS-first experience
- Add view-only dashboard in Week 2 if needed for debugging/feedback

### 7. Bot Personality & Tone
**Decision:** Consistent casual tone (easiest to implement)
- Default: Casual and friendly ("Tokyo wins! 🗾 Let's go!")
- Future: Can add tone adaptation based on group messages (Week 3+)

### 8. Privacy & Compliance
**Decision:** Basic privacy policy for MVP
- Include in first bot message: "Privacy: voyaj.app/privacy"
- Full GDPR/CCPA compliance before public launch

### 9. Time Zone Handling
**Decision:** Store everything in UTC, display in destination timezone
- Infer timezone from phone number area code (basic)
- Can ask explicitly if needed (Week 2+)

---

## Testing Strategy

### Overview

Testing a multi-user, SMS-based coordination product requires a layered approach. The goal is to validate core functionality without requiring real SMS integrations or multiple real phone numbers.

### Testing Architecture

#### 1. Unit Tests (No External Dependencies)

**Purpose:** Test individual functions and logic in isolation

**What to Test:**
- Vote tallying logic
- Expense parsing (regex patterns)
- Flight number extraction
- State machine transitions
- Balance calculations
- Date parsing

**Implementation:**
```javascript
// tests/unit/voting.test.js
describe('Voting Agent', () => {
  test('tallies votes correctly', () => {
    const votes = [
      { choice: 'Tokyo', member_id: '1' },
      { choice: 'Tokyo', member_id: '2' },
      { choice: 'Bali', member_id: '3' }
    ];
    const result = tallyVotes(votes);
    expect(result.winner).toBe('Tokyo');
    expect(result.voteCount).toBe(2);
  });
});
```

**Tools:** Jest or Mocha
**Coverage Target:** 80%+ for core logic

---

#### 2. Integration Tests (Mocked External Services)

**Purpose:** Test full flows with mocked Twilio and Claude APIs

**What to Test:**
- End-to-end destination voting flow
- Member joining flow
- Flight tracking flow
- State transitions
- Message queue ordering

**Mock Setup:**
```javascript
// tests/mocks/twilio.js
const mockTwilio = {
  messages: {
    create: jest.fn().mockResolvedValue({ sid: 'test_sid' })
  }
};

// tests/mocks/claude.js
const mockClaude = {
  messages: {
    create: jest.fn().mockResolvedValue({
      content: [{ text: JSON.stringify({ intent: 'vote' }) }]
    })
  }
};
```

**Test Database:**
- Use test PostgreSQL database (separate from production)
- Reset before each test suite
- Seed with test data

**Example Test:**
```javascript
// tests/integration/destination-voting.test.js
describe('Destination Voting Flow', () => {
  beforeEach(async () => {
    await db.reset();
  });

  test('full flow from creation to destination locked', async () => {
    // 1. Create trip
    const trip = await createTestTrip();
    
    // 2. Simulate member joining
    await handleSMS({ from: '+15551234567', body: 'Sarah' }, trip.id);
    
    // 3. Simulate destination voting
    await handleSMS({ from: '+15551234567', body: 'Tokyo' }, trip.id);
    await handleSMS({ from: '+15551234568', body: 'Tokyo' }, trip.id);
    await handleSMS({ from: '+15551234569', body: 'Bali' }, trip.id);
    
    // 4. Check result
    const updated = await db.getTrip(trip.id);
    expect(updated.destination).toBe('Tokyo');
    expect(updated.stage).toBe('destination_set');
  });
});
```

---

#### 3. Local Development Testing (Simulated SMS)

**Purpose:** Test with simulated group chats without real SMS costs

**Setup: Local SMS Simulator**

Create a test endpoint that simulates Twilio webhooks:

```javascript
// server.js (development only)
if (process.env.NODE_ENV === 'development') {
  app.post('/test/sms', async (req, res) => {
    // Simulate Twilio webhook
    const { from, body, groupId } = req.body;
    
    // Process as if it came from Twilio
    await handleIncomingSMS({
      From: from,
      Body: body,
      GroupId: groupId
    });
    
    res.json({ success: true });
  });
}
```

**Usage:**
```bash
# Simulate group chat messages
curl -X POST http://localhost:3000/test/sms \
  -d 'from=+15551234567&body=Sarah&groupId=test-group-1'

curl -X POST http://localhost:3000/test/sms \
  -d 'from=+15551234568&body=Mike&groupId=test-group-1'
```

**Benefits:**
- No SMS costs
- Fast iteration
- Can simulate multiple users
- Can test edge cases easily

---

#### 4. Test Scripts (Automated Scenarios)

**Purpose:** Run common user flows automatically

**Create test scenarios:**

```javascript
// tests/scripts/full-trip-flow.js
async function testFullTripFlow() {
  console.log('Testing full trip flow...');
  
  // Create trip
  const trip = await createTestTrip();
  console.log('✓ Trip created');
  
  // Members join
  await simulateMessage(trip.id, '+15551234567', 'Sarah');
  await simulateMessage(trip.id, '+15551234568', 'Mike');
  await simulateMessage(trip.id, '+15551234569', 'Alex');
  console.log('✓ 3 members joined');
  
  // Destination voting
  await simulateMessage(trip.id, '+15551234567', 'Tokyo');
  await simulateMessage(trip.id, '+15551234568', 'Tokyo');
  await simulateMessage(trip.id, '+15551234569', 'Bali');
  console.log('✓ Destination voting complete');
  
  // Check result
  const updated = await db.getTrip(trip.id);
  assert(updated.destination === 'Tokyo');
  assert(updated.stage === 'destination_set');
  
  console.log('✓ All tests passed!');
}
```

**Run with:** `npm run test:scenarios`

---

#### 5. Manual Testing Checklist

**Purpose:** Validate UX and edge cases that are hard to automate

**Setup:**
1. Use Twilio test credentials (free test numbers)
2. Create test group chat with 2-3 real phone numbers
3. Go through full flow manually

**Checklist:**
- [ ] Bot responds to first message
- [ ] Name collection works
- [ ] Destination voting works
- [ ] Date voting works
- [ ] Flight tracking works
- [ ] State transitions happen correctly
- [ ] Error messages are helpful
- [ ] Bot doesn't send duplicate messages
- [ ] Messages arrive in order
- [ ] Bot handles typos gracefully

---

#### 6. Feedback Loops (Built-in)

**Purpose:** Collect feedback from real usage without complex integrations

**Simple Feedback System:**

```javascript
// After every trip stage completion
async function requestFeedback(tripId, stage) {
  await sendSMS(tripId, 
    `How was that? Reply 1-5 (1=confusing, 5=perfect) or send feedback`
  );
  
  // Store feedback in database
  // Simple analytics: average rating per stage
}

// After trip completes
async function requestTripFeedback(tripId) {
  await sendSMS(tripId,
    `Trip complete! How was Voyaj? Reply 1-5 or share feedback`
  );
}
```

**Analytics Dashboard (Simple):**
- Track: average rating per stage, common feedback themes
- Store in database, query with simple SQL
- No need for complex analytics tools initially

**Error Reporting:**
```javascript
// When bot fails
async function logError(tripId, error, context) {
  // Log to database
  await db.insert('error_logs', {
    trip_id: tripId,
    error: error.message,
    context: JSON.stringify(context),
    timestamp: new Date()
  });
  
  // Simple admin view: voyaj.app/admin/errors
  // Shows recent errors, can filter by trip
}
```

---

### Testing Workflow

#### Week 1: Development Testing
1. **Unit tests:** Write as you build each feature
2. **Integration tests:** Write for each major flow
3. **Local simulator:** Test manually with curl commands
4. **Test scripts:** Run automated scenarios daily

#### Week 2: Pre-Launch Testing
1. **Manual testing:** Use Twilio test numbers, real group chat
2. **Edge case testing:** Test error scenarios, race conditions
3. **Performance testing:** Test with 10 concurrent trips
4. **Feedback system:** Deploy with basic feedback collection

#### Week 3+: Real User Testing
1. **Beta with 3-5 groups:** Real trips, monitor closely
2. **Collect feedback:** Use built-in feedback system
3. **Monitor errors:** Check error logs daily
4. **Iterate:** Fix issues, improve based on feedback

---

### Testing Tools & Setup

**Required:**
- Jest (unit/integration tests)
- Test PostgreSQL database
- Mock Twilio client
- Mock Claude client

**Optional (Week 2+):**
- Postman (API testing)
- ngrok (expose local server for webhook testing)
- Twilio test credentials (for manual testing)

**No Need For:**
- Complex E2E frameworks (Playwright, Cypress)
- Multiple real phone numbers
- Paid SMS during development
- Complex CI/CD initially

---

### Success Criteria for Testing

**Before MVP Launch:**
- ✅ All unit tests pass
- ✅ Integration tests cover core flows
- ✅ Manual testing checklist complete
- ✅ Can simulate full trip flow locally
- ✅ Error handling tested
- ✅ Feedback system working

**During Beta:**
- ✅ Monitor error logs daily
- ✅ Collect feedback from 3-5 groups
- ✅ Fix critical bugs within 24 hours
- ✅ Iterate based on feedback

---

## Success Criteria for MVP

### Functional Requirements

✅ Can add bot to group chat
✅ Bot collects member names
✅ Bot coordinates destination vote
✅ Bot coordinates date vote
✅ Bot tracks flight bookings
✅ Trip progresses from idea → destination + dates locked + flights tracked

### Non-Functional Requirements

✅ Messages processed in order (no race conditions)
✅ Claude costs < $2/trip (context management working)
✅ Response time < 5 seconds (rule-based routing)
✅ Can handle 10 concurrent trips (queue system working)
✅ Error recovery (graceful fallbacks)

### User Experience Requirements

✅ Bot feels helpful, not robotic
✅ Decisions get made (destination + dates locked)
✅ No one feels like default organizer
✅ Trip actually happens (flights get booked)

---

## Post-MVP Roadmap

### Week 3-4: Polish & Scale

- Web dashboard (view-only)
- Basic expense tracking
- Itinerary generation (suggestions)
- Better error handling
- Testing with 20-50 real trips

### Month 2: Features & Revenue

- Payment/upgrade flow
- Affiliate link integration
- Advanced expense tracking
- Daily notifications during trip
- Email parsing (flight confirmations)

### Month 3+: Growth

- Recommendation engine (affiliate links)
- Flight status tracking (API integration)
- Photo sharing
- Post-trip settlement
- Mobile app (if needed)

---

## Risks & Mitigations

### Technical Risks

**Risk:** Claude costs spiral out of control
**Mitigation:** Context management, rule-based routing, cost monitoring

**Risk:** Race conditions corrupt data
**Mitigation:** Per-trip message queue, sequential processing

**Risk:** Group chat ID changes break trip
**Mitigation:** Phone number → trip mapping (stable identifier)

### Product Risks

**Risk:** Affiliate conversion is low (<1%)
**Mitigation:** Focus on paid tier, limit free tier

**Risk:** Users ignore bot, coordinate via regular texts
**Mitigation:** Make bot genuinely helpful, not annoying

**Risk:** Bot misunderstands messages frequently
**Mitigation:** Rule-based parsing first, clear error messages, web fallback

### Business Risks

**Risk:** Unit economics don't work
**Mitigation:** Monitor costs closely, adjust pricing if needed

**Risk:** Competition (Splitwise, Troupe, etc.)
**Mitigation:** Focus on SMS-first coordination (differentiation)

---

## Appendix: Key Conversations Summary

### Product Positioning
- **Target:** Friend groups (20s-30s)
- **Value Prop:** Relationship protector + decision facilitator
- **Focus:** Pre-trip coordination (make trip happen)
- **Tone:** Casual, helpful, like a friend who's good at organizing

### Architecture Decisions
- **Multi-agent system:** Orchestrator routes to specialist agents
- **Context management:** Minimal, agent-specific (saves costs)
- **State machine:** Explicit trip progression
- **Message queue:** Per-trip FIFO (prevents races)
- **Rule-based first:** AI only when necessary (cost control)

### Feature Priorities
1. **Critical:** Destination + dates voting, flight tracking
2. **Important:** Basic itinerary, expense tracking
3. **Nice-to-have:** Daily notifications, detailed planning

---

## Next Steps

1. **This Weekend:** Build MVP (orchestrator + 3 agents + basic flows)
2. **Week 2:** Test with 3-5 real friend groups
3. **Week 3-4:** Iterate based on feedback, add polish
4. **Month 2:** Launch publicly, test monetization

**Key Milestone:** First trip that goes from idea → actual plane tickets booked using Voyaj

---

## Testing Quick Reference

### How to Test Without Real SMS

**Option 1: Local SMS Simulator (Recommended)**
```bash
# Start server
npm run dev

# In another terminal, simulate messages
curl -X POST http://localhost:3000/test/sms \
  -d 'from=+15551234567&body=Sarah&groupId=test-group-1'
```

**Option 2: Test Scripts**
```bash
# Run automated scenarios
npm run test:scenarios

# Run full trip flow
npm run test:full-flow
```

**Option 3: Twilio Test Credentials**
- Use Twilio test numbers (free)
- Create test group chat
- Test manually with real SMS (no cost)

### Basic Feedback Loop

**Built-in Feedback:**
- After each stage: "How was that? Reply 1-5"
- After trip: "How was Voyaj? Reply 1-5 or share feedback"
- Errors logged to database, view at `/admin/errors`

**No Complex Integrations Needed:**
- Store feedback in database
- Simple SQL queries for analytics
- No need for Mixpanel/Amplitude initially

### Testing Checklist

**Before Building:**
- [ ] Set up test database
- [ ] Create mock Twilio client
- [ ] Create mock Claude client
- [ ] Write unit tests for voting logic

**While Building:**
- [ ] Test each feature with local simulator
- [ ] Write integration tests for flows
- [ ] Test error scenarios

**Before Launch:**
- [ ] Run full trip flow test script
- [ ] Manual testing with Twilio test numbers
- [ ] Test with 2-3 real friends (small group)
- [ ] Verify feedback system works

---

## Additional Critical Questions for MVP

### 1. Database Schema & Migrations
**Question:** How do we handle schema changes as we iterate?
**Recommendation:** Use migration tool (node-pg-migrate or Prisma)
**Action:** Set up migration system from day 1

### 2. Environment Variables & Secrets
**Question:** How do we manage API keys securely?
**Recommendation:** Use `.env` file, never commit secrets
**Action:** Create `.env.example` with required variables

### 3. Logging & Debugging
**Question:** How do we debug issues in production?
**Recommendation:** Structured logging (JSON logs), log levels (info, error, debug)
**Action:** Set up logging from day 1, can use console.log initially

### 4. Rate Limiting
**Question:** Do we need rate limiting for MVP?
**Recommendation:** Basic rate limiting (10 messages/minute per trip) to prevent abuse
**Action:** Add simple in-memory rate limiter

### 5. Deployment Strategy
**Question:** How do we deploy and update?
**Recommendation:** Railway or similar (easy deployment), can add CI/CD later
**Action:** Set up basic deployment pipeline

### 6. Monitoring & Alerts
**Question:** How do we know if something breaks?
**Recommendation:** Basic error logging + manual checks initially
**Action:** Set up error log table, check daily during beta

### 7. Data Backup
**Question:** How do we prevent data loss?
**Recommendation:** Database backups (Railway handles this automatically)
**Action:** Verify backup strategy with hosting provider

### 8. Cost Monitoring
**Question:** How do we track Claude API costs?
**Recommendation:** Log token usage, calculate cost per trip
**Action:** Add cost tracking to database, alert if > $5/trip

---

## MVP Build Checklist

### Infrastructure (Day 1)
- [ ] Set up PostgreSQL database
- [ ] Set up Express server
- [ ] Configure Twilio webhook endpoint
- [ ] Set up Claude API client
- [ ] Create database schema
- [ ] Set up test database
- [ ] Create mock clients for testing

### Core Features (Day 2-3)
- [ ] Trip auto-creation
- [ ] Member name collection
- [ ] Destination voting
- [ ] Date voting
- [ ] Flight tracking
- [ ] State machine transitions

### Testing (Day 4)
- [ ] Unit tests for core logic
- [ ] Integration tests for flows
- [ ] Local SMS simulator
- [ ] Test scripts
- [ ] Manual testing checklist

### Polish (Day 5-7)
- [ ] Error handling
- [ ] Feedback system
- [ ] Logging
- [ ] Basic rate limiting
- [ ] Cost tracking
- [ ] Documentation

### Launch Prep (Week 2)
- [ ] Test with 3-5 real friend groups
- [ ] Collect feedback
- [ ] Fix critical bugs
- [ ] Deploy to production
- [ ] Monitor closely

