# Voyaj Technical Architecture Document

## Table of Contents

1. [System Overview](#system-overview)
2. [Architecture Layers](#architecture-layers)
3. [Agent System Design](#agent-system-design)
4. [Data Flow](#data-flow)
5. [Database Schema](#database-schema)
6. [Message Queue System](#message-queue-system)
7. [State Machine](#state-machine)
8. [Context Management](#context-management)
9. [Error Handling](#error-handling)
10. [API Design](#api-design)
11. [Deployment Architecture](#deployment-architecture)
12. [Code Structure](#code-structure)

---

## System Overview

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    INPUT LAYER                           │
│  SMS (Twilio) │ Web API │ Email │ Cron Jobs             │
└───────────────────┬─────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────┐
│              MESSAGE QUEUE LAYER                         │
│         Per-Trip FIFO Queues (In-Memory)                 │
└───────────────────┬─────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────┐
│           ORCHESTRATOR LAYER                             │
│  - Intent Detection (Rules + AI)                         │
│  - Context Building                                      │
│  - Agent Routing                                         │
│  - Error Handling                                        │
└───────────────────┬─────────────────────────────────────┘
                    │
        ┌───────────┼───────────┐
        │           │           │
        ▼           ▼           ▼
┌──────────┐ ┌──────────┐ ┌──────────┐
│Coordinator│ │  Voting  │ │  Parser  │
│  Agent   │ │  Agent   │ │  Agent   │
└──────────┘ └──────────┘ └──────────┘
        │           │           │
        └───────────┼───────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────┐
│              STATE LAYER                                 │
│  - State Machine (Transitions)                          │
│  - Event Emitter (Cross-Channel Coordination)            │
└───────────────────┬─────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────┐
│           PERSISTENCE LAYER                             │
│  PostgreSQL Database                                    │
│  - Trips, Members, Votes, Flights, Messages             │
└───────────────────┬─────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────┐
│              OUTPUT LAYER                               │
│  SMS (Twilio) │ WebSocket │ Email │ Push                │
└─────────────────────────────────────────────────────────┘
```

### Core Principles

1. **Orchestrator is Smart, Agents are Dumb**
   - Orchestrator handles routing, context, errors
   - Agents do one thing well, are stateless

2. **Rule-Based First, AI Second**
   - Try rules (fast, free) before Claude (slow, expensive)
   - Reduces costs and latency

3. **Minimal Context**
   - Only send relevant data to agents
   - Prevents token bloat and cost overruns

4. **Per-Trip Message Queue**
   - FIFO processing per trip
   - Prevents race conditions
   - Ensures message ordering

5. **Event-Driven Coordination**
   - All changes emit events
   - Keeps SMS, Web, Email in sync

---

## Architecture Layers

### Layer 1: Input Layer

**Purpose:** Receive messages from various channels

**Components:**
- Twilio webhook handler (`/sms/incoming`)
- Web API endpoints (future)
- Email parser (future)
- Cron job scheduler

**Responsibilities:**
- Validate incoming requests
- Extract message data
- Route to message queue
- Respond immediately (200 OK to Twilio)

**Implementation:**
```javascript
// server.js
app.post('/sms/incoming', async (req, res) => {
  const { From, Body, GroupId } = req.body;
  
  // Validate
  if (!From || !Body) {
    return res.status(400).send('Missing required fields');
  }
  
  // Queue message (don't process immediately)
  await messageQueue.add({
    from: From,
    body: Body,
    groupChatId: GroupId,
    timestamp: new Date()
  });
  
  // Respond to Twilio immediately (required)
  res.status(200).send('OK');
});
```

---

### Layer 2: Message Queue Layer

**Purpose:** Ensure messages are processed in order, prevent race conditions

**Design:**
- One queue per trip (in-memory Map for MVP)
- FIFO processing (first in, first out)
- Sequential processing per trip (parallel across trips)

**Data Structure:**
```javascript
// Map<tripId, Array<Message>>
const tripQueues = new Map();

// Example:
tripQueues.set('trip_123', [
  { from: '+15551234567', body: 'Sarah', timestamp: Date.now() },
  { from: '+15551234568', body: 'Mike', timestamp: Date.now() + 100 }
]);
```

**Processing Logic:**
```javascript
async function processTripQueue(tripId) {
  const queue = tripQueues.get(tripId) || [];
  
  while (queue.length > 0) {
    const message = queue[0];
    
    try {
      // Process message
      await orchestrator.process(tripId, message);
      
      // Remove from queue only after success
      queue.shift();
      
    } catch (error) {
      // Log error, remove message, continue
      console.error(`Failed to process message:`, error);
      queue.shift();
    }
  }
}
```

**Why This Matters:**
- Prevents race conditions (two people vote simultaneously)
- Ensures data consistency
- Handles bursts (10 messages at once)

---

### Layer 3: Orchestrator Layer

**Purpose:** Route messages to appropriate agents, build context, handle errors

**Components:**

#### 3.1 Intent Detection

**Rule-Based Detection (First):**
```javascript
function detectIntent(trip, message) {
  const body = message.body.toLowerCase().trim();
  
  // Member joining
  if (trip.stage === 'collecting_members' && body.length < 30) {
    return { type: 'member_join', agent: 'coordinator' };
  }
  
  // Voting
  if (trip.stage === 'voting_destination' || trip.stage === 'voting_dates') {
    return { type: 'vote', agent: 'voting' };
  }
  
  // Flight booking
  if (/\b(booked|flight|AA|UA|Delta)\b/i.test(body)) {
    return { type: 'flight', agent: 'parser' };
  }
  
  // Commands
  if (body.startsWith('@bot')) {
    return { type: 'command', agent: 'coordinator' };
  }
  
  // Default: conversation
  return { type: 'conversation', agent: 'coordinator' };
}
```

**AI-Based Detection (Fallback):**
```javascript
async function detectIntentWithAI(trip, message) {
  const prompt = `
    Trip stage: ${trip.stage}
    Message: "${message.body}"
    
    What is the user's intent?
    - member_join: User is joining with their name
    - vote: User is voting on something
    - flight: User reporting flight booking
    - question: User asking a question
    - conversation: General chat
    
    Reply with just the intent name.
  `;
  
  const response = await claude.complete(prompt);
  const intentType = response.trim().toLowerCase();
  
  return { 
    type: intentType, 
    agent: mapIntentToAgent(intentType) 
  };
}
```

#### 3.2 Context Building

**Layered Context Strategy:**
```javascript
async function buildContext(tripId, phone, intent) {
  const trip = await db.getTrip(tripId);
  
  // Layer 1: Essential trip facts (always included)
  const baseContext = {
    trip: {
      id: trip.id,
      stage: trip.stage,
      destination: trip.destination,
      dates: { start: trip.start_date, end: trip.end_date }
    },
    member: await db.getMemberByPhone(tripId, phone),
    allMembers: await db.getMembers(tripId)
  };
  
  // Layer 2: Agent-specific context
  let agentContext = {};
  
  switch(intent.agent) {
    case 'voting':
      agentContext = {
        currentPoll: await db.getCurrentPoll(tripId),
        existingVotes: await db.getVotes(tripId)
      };
      break;
      
    case 'parser':
      agentContext = {
        flights: await db.getFlights(tripId)
      };
      break;
      
    case 'coordinator':
      agentContext = {
        recentMessages: await db.getRecentMessages(tripId, 5)
      };
      break;
  }
  
  // Layer 3: Current message
  return {
    ...baseContext,
    ...agentContext,
    currentMessage: message
  };
}
```

**Token Budget:**
- Base context: ~500 tokens
- Agent-specific: ~500 tokens
- Current message: ~100 tokens
- **Total: ~1,100 tokens ($0.003 per call)**

#### 3.3 Agent Routing

```javascript
class Orchestrator {
  constructor() {
    this.agents = {
      coordinator: new CoordinatorAgent(),
      voting: new VotingAgent(),
      parser: new ParserAgent()
    };
  }
  
  async process(tripId, message) {
    // 1. Get trip
    const trip = await db.getTrip(tripId);
    
    // 2. Detect intent
    const intent = this.detectIntent(trip, message) || 
                   await this.detectIntentWithAI(trip, message);
    
    // 3. Build context
    const context = await this.buildContext(tripId, message.from, intent);
    
    // 4. Select agent
    const agent = this.agents[intent.agent];
    
    // 5. Execute
    try {
      const result = await agent.handle(context, message);
      return result;
    } catch (error) {
      return await this.handleError(tripId, message, error);
    }
  }
}
```

---

## Agent System Design

### Agent Interface

All agents implement the same interface:

```javascript
class BaseAgent {
  async handle(context, message) {
    // context: { trip, member, allMembers, agent-specific data }
    // message: { from, body, timestamp }
    // Returns: { success: boolean, ... }
  }
}
```

### MVP Agents

#### 1. Coordinator Agent

**Purpose:** Handle conversations, guide flow, manage member joining

**Responsibilities:**
- Welcome new trips
- Collect member names
- Answer questions
- Guide through stages
- Handle general conversation

**Key Methods:**
```javascript
class CoordinatorAgent extends BaseAgent {
  async handle(context, message) {
    switch(context.trip.stage) {
      case 'created':
        return await this.handleFirstMember(context, message);
      case 'collecting_members':
        return await this.handleMemberJoin(context, message);
      case 'voting_destination':
        return { handoff: 'voting' };
      case 'planning':
        return await this.handlePlanning(context, message);
      default:
        return await this.handleGeneral(context, message);
    }
  }
  
  async handleMemberJoin(context, message) {
    const name = message.body.trim();
    await db.createMember(context.trip.id, message.from, name);
    
    const memberCount = context.allMembers.length + 1;
    await sendToGroup(context.trip.id, 
      `Welcome ${name}! 🎉 ${memberCount} people in.`);
    
    if (memberCount >= 3) {
      await this.startDestinationVoting(context.trip);
    }
    
    return { success: true };
  }
  
  async handleGeneral(context, message) {
    // Use Claude for natural response
    const prompt = `
      You are Voyaj, a friendly trip coordinator.
      Trip: ${context.trip.destination || 'Planning'} (${context.trip.stage})
      Members: ${context.allMembers.map(m => m.name).join(', ')}
      User message: "${message.body}"
      Respond helpfully in 1-2 sentences.
    `;
    
    const response = await claude.complete(prompt, { max_tokens: 100 });
    await sendSMS(message.from, response);
    
    return { success: true };
  }
}
```

#### 2. Voting Agent

**Purpose:** Manage polls, tally votes, declare winners

**Responsibilities:**
- Record votes
- Track who voted
- Tally results
- Declare winners
- Trigger state transitions

**Key Methods:**
```javascript
class VotingAgent extends BaseAgent {
  async handle(context, message) {
    const choice = message.body.trim();
    
    // Record vote
    await db.createVote({
      trip_id: context.trip.id,
      poll_type: context.trip.stage === 'voting_destination' ? 'destination' : 'dates',
      member_id: context.member.id,
      choice: choice
    });
    
    // Check if poll should close
    const totalVotes = await db.getVoteCount(context.trip.id);
    const totalMembers = context.allMembers.length;
    const majorityVoted = totalVotes >= totalMembers * 0.6;
    
    if (majorityVoted) {
      return await this.closePoll(context);
    }
    
    // Show status
    await sendToGroup(context.trip.id,
      `${totalVotes}/${totalMembers} voted. Still waiting on: ${this.getPendingVoters(context)}`);
    
    return { success: true };
  }
  
  async closePoll(context) {
    const results = await db.getVoteResults(context.trip.id);
    const winner = results[0].choice;
    
    if (context.currentPoll.type === 'destination') {
      await db.updateTrip(context.trip.id, {
        destination: winner,
        stage: 'destination_set'
      });
      
      await sendToGroup(context.trip.id,
        `${winner} wins! 🎉 Now let's pick dates.`);
    }
    
    return { success: true, poll_closed: true };
  }
}
```

#### 3. Parser Agent

**Purpose:** Extract structured data from natural language

**Responsibilities:**
- Parse flight information
- Extract expense data (future)
- Parse dates/times
- Handle ambiguous input

**Key Methods:**
```javascript
class ParserAgent extends BaseAgent {
  async handle(context, message) {
    // Try rule-based parsing first
    const parsed = this.parseWithRules(message.body);
    
    if (parsed.confidence > 0.7) {
      return await this.handleFlight(context, parsed);
    }
    
    // Fall back to AI
    const aiParsed = await this.parseWithAI(message.body);
    return await this.handleFlight(context, aiParsed);
  }
  
  parseWithRules(text) {
    // Extract flight info with regex
    const flightPattern = /\b([A-Z]{2})\s*(\d{2,4})\b/;
    const flightMatch = text.match(flightPattern);
    
    if (flightMatch) {
      return {
        confidence: 0.9,
        airline: flightMatch[1],
        flightNumber: flightMatch[2]
      };
    }
    
    // Check for "I booked" without details
    if (/\b(booked|book|flight)\b/i.test(text)) {
      return { confidence: 0.5, booked: true };
    }
    
    return { confidence: 0 };
  }
  
  async parseWithAI(text) {
    const prompt = `
      Extract flight information from: "${text}"
      Return JSON: { "booked": true/false, "airline": "AA", "flightNumber": "154" }
    `;
    
    const response = await claude.complete(prompt);
    return JSON.parse(response);
  }
  
  async handleFlight(context, parsed) {
    await db.createFlight({
      trip_id: context.trip.id,
      member_id: context.member.id,
      airline: parsed.airline,
      flight_number: parsed.flightNumber
    });
    
    await sendToGroup(context.trip.id,
      `${context.member.name} booked! ✈️ ${parsed.airline} ${parsed.flightNumber}`);
    
    return { success: true };
  }
}
```

### Adding New Agents

**Future agents plug into the same orchestrator:**

```javascript
// Week 2: Add Itinerary Agent
class ItineraryAgent extends BaseAgent {
  async handle(context, message) {
    // Generate itinerary
    const itinerary = await this.generateItinerary(context.trip);
    await sendToGroup(context.trip.id, itinerary);
    return { success: true };
  }
}

// Register in orchestrator
orchestrator.agents.itinerary = new ItineraryAgent();

// Add routing rule
if (body.includes('itinerary')) {
  return { type: 'itinerary', agent: 'itinerary' };
}
```

---

## Data Flow

### Message Processing Flow

```
1. Twilio Webhook
   └─ POST /sms/incoming
   └─ Extract: From, Body, GroupId
   └─ Respond: 200 OK (immediately)

2. Message Queue
   └─ Add to trip queue
   └─ If first message in queue, start processing

3. Orchestrator
   └─ Detect intent (rules → AI fallback)
   └─ Build context (minimal, agent-specific)
   └─ Route to agent

4. Agent
   └─ Process message
   └─ Update database
   └─ Send response (SMS)

5. State Machine
   └─ Check transitions
   └─ Execute transition actions
   └─ Update trip stage

6. Event Emitter
   └─ Emit events (vote_added, flight_booked, etc.)
   └─ Listeners handle cross-channel coordination
```

### Example: Destination Voting Flow

```
User: "Tokyo"
  ↓
Twilio Webhook → Queue → Orchestrator
  ↓
Intent Detection: "vote" → Voting Agent
  ↓
Voting Agent:
  - Record vote in database
  - Check if majority voted
  - If yes: Declare winner, update trip
  - Send response to group
  ↓
State Machine:
  - Check transition condition
  - If destination_set: Transition to voting_dates
  ↓
Event Emitter:
  - Emit: destination_voted
  - Listeners: Update web dashboard (future)
```

---

## Database Schema

### Tables

#### trips
```sql
CREATE TABLE trips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invite_code TEXT UNIQUE NOT NULL,
  group_chat_id TEXT,
  destination TEXT,
  start_date DATE,
  end_date DATE,
  stage TEXT NOT NULL DEFAULT 'created',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_trips_group_chat ON trips(group_chat_id);
CREATE INDEX idx_trips_stage ON trips(stage);
```

#### members
```sql
CREATE TABLE members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID REFERENCES trips(id) ON DELETE CASCADE,
  phone_number TEXT NOT NULL,
  name TEXT,
  joined_at TIMESTAMP DEFAULT NOW(),
  
  -- Constraint: One phone in one active trip at a time (free tier)
  CONSTRAINT unique_active_member UNIQUE(phone_number)
);

CREATE INDEX idx_members_phone ON members(phone_number);
CREATE INDEX idx_members_trip ON members(trip_id);
```

#### votes
```sql
CREATE TABLE votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID REFERENCES trips(id) ON DELETE CASCADE,
  poll_type TEXT NOT NULL, -- 'destination', 'dates', 'activity'
  member_id UUID REFERENCES members(id) ON DELETE CASCADE,
  choice TEXT NOT NULL,
  voted_at TIMESTAMP DEFAULT NOW(),
  
  -- One vote per member per poll
  UNIQUE(trip_id, poll_type, member_id)
);

CREATE INDEX idx_votes_trip_poll ON votes(trip_id, poll_type);
```

#### flights
```sql
CREATE TABLE flights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID REFERENCES trips(id) ON DELETE CASCADE,
  member_id UUID REFERENCES members(id) ON DELETE CASCADE,
  airline TEXT,
  flight_number TEXT,
  departure_time TIMESTAMP,
  arrival_time TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  
  -- One flight per member per trip
  UNIQUE(trip_id, member_id)
);

CREATE INDEX idx_flights_trip ON flights(trip_id);
```

#### messages
```sql
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID REFERENCES trips(id) ON DELETE CASCADE,
  from_phone TEXT NOT NULL,
  body TEXT NOT NULL,
  group_chat_id TEXT,
  received_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_messages_trip ON messages(trip_id);
CREATE INDEX idx_messages_received ON messages(received_at DESC);
```

### JSONB for Flexibility

```sql
-- Add metadata column for flexible data
ALTER TABLE trips ADD COLUMN metadata JSONB DEFAULT '{}';

-- Example usage:
UPDATE trips 
SET metadata = jsonb_set(metadata, '{interests}', '["food", "culture"]'::jsonb)
WHERE id = 'trip_123';

-- Query:
SELECT * FROM trips WHERE metadata->>'budget' = 'medium';
```

---

## Message Queue System

### In-Memory Implementation (MVP)

```javascript
// queue/messageQueue.js
class MessageQueue {
  constructor() {
    this.queues = new Map(); // tripId → Array<Message>
    this.processing = new Set(); // tripIds currently processing
  }
  
  async add(tripId, message) {
    const queue = this.queues.get(tripId) || [];
    queue.push({
      ...message,
      timestamp: Date.now()
    });
    this.queues.set(tripId, queue);
    
    // Start processing if not already processing
    if (!this.processing.has(tripId)) {
      this.processing.add(tripId);
      this.processQueue(tripId);
    }
  }
  
  async processQueue(tripId) {
    const queue = this.queues.get(tripId) || [];
    
    while (queue.length > 0) {
      const message = queue[0];
      
      try {
        await orchestrator.process(tripId, message);
        queue.shift();
      } catch (error) {
        console.error(`Failed to process message:`, error);
        queue.shift(); // Remove failed message
      }
    }
    
    this.processing.delete(tripId);
  }
}
```

### Future: Redis-Based Queue (Scale)

```javascript
// Use BullMQ for production
const Queue = require('bullmq');

const messageQueue = new Queue('messages', {
  connection: { host: 'localhost', port: 6379 }
});

messageQueue.process(async (job) => {
  const { tripId, message } = job.data;
  return await orchestrator.process(tripId, message);
});
```

---

## State Machine

### State Definitions

**Core States (9 total):**
1. `created` - Trip just created, bot added to chat
2. `collecting_members` - Gathering people to join the trip (minimum 2 members)
3. `planning` - Pre-voting phase: collecting destination suggestions and/or date availability
4. `voting_destination` - Active poll for destination
5. `voting_dates` - Active poll for dates
6. `tracking_flights` - Both destination and dates set, tracking flight bookings
7. `trip_confirmed` - All flights booked, waiting for trip to start
8. `active` - Trip is happening
9. `completed` - Trip is over

**State Flow:**
```
planning → voting_destination → planning (with destination set)
planning → voting_dates → planning (with dates set)
planning (with both set) → tracking_flights
```

### Planning State Design

**Key Principles:**
- Accepts both destination suggestions and date availability simultaneously
- Tracks counts in database: distinct members with destination suggestions vs date availability
- Default: Nudges toward dates ("Let's start with dates...")
- Tone adjustment: Compare counts - if destination count > date count, be less pushy about dates

**Voting Triggers (whichever happens first):**
- Destination threshold: All members have suggested destinations → start `voting_destination`
- Date threshold: All members have shared date availability → start `voting_dates` (default preference)
- Timeout: 12 hours in planning → vote on whichever has more suggestions

**After Voting:**
- After destination voting completes → return to `planning` (planning checks if dates are set)
- After date voting completes → return to `planning` (planning checks if destination is set)
- If both destination and dates are set → transition to `tracking_flights`

### Architecture Principles

1. **Single Source of Truth**: Only `checkStateTransitions()` should modify stage
2. **Actions Are Pure**: Actions return outputs only, never modify state directly
3. **Observable States**: States should be observable (not immediately transitioned away)
4. **Centralized Transitions**: All state changes go through `requestStateTransition()` function

```javascript
// state/stateMachine.js
const STAGES = {
  created: {
    next: 'collecting_members',
    trigger: 'first_member_joined',
  },
  
  collecting_members: {
    next: 'planning',
    trigger: 'enough_members',
    condition: async (trip) => {
      const memberCount = await db.getMemberCount(trip.id);
      return memberCount >= 2;
    },
  },
  
  planning: {
    next: null, // Dynamic - can go to voting_destination, voting_dates, or tracking_flights
    trigger: 'check_whats_ready',
    // Planning state checks:
    // - Count of destination suggestions vs date availability
    // - If both destination and dates are set → tracking_flights
    // - If threshold met → voting_destination or voting_dates
  },
  
  voting_destination: {
    next: 'planning', // Return to planning after voting
    trigger: 'poll_complete',
    condition: async (trip) => {
      const votes = await db.getVotes(trip.id, 'destination');
      const members = await db.getMembers(trip.id);
      const majority = votes.length >= Math.ceil(members.length * 0.6);
      const timeout = Date.now() - new Date(trip.stage_entered_at).getTime() > 48 * 60 * 60 * 1000;
      return majority || timeout;
    },
  },
  
  voting_dates: {
    next: 'planning', // Return to planning after voting
    trigger: 'poll_complete',
    condition: async (trip) => {
      const votes = await db.getVotes(trip.id, 'dates');
      const members = await db.getMembers(trip.id);
      const majority = votes.length >= Math.ceil(members.length * 0.6);
      const timeout = Date.now() - new Date(trip.stage_entered_at).getTime() > 48 * 60 * 60 * 1000;
      return majority || timeout;
    },
  },
  
  tracking_flights: {
    next: 'trip_confirmed',
    trigger: 'all_flights_booked',
    condition: async (trip) => {
      const flightCount = await db.getFlightCount(trip.id);
      const memberCount = await db.getMemberCount(trip.id);
      return flightCount >= memberCount;
    },
  },
  
  // ... etc for remaining stages
};
```

### Transition Logic

```javascript
async function checkStateTransitions(tripId) {
  const trip = await db.getTrip(tripId);
  const stage = STAGES[trip.stage];
  
  if (!stage) return; // Final state
  
  // Check condition
  const shouldTransition = stage.condition 
    ? await stage.condition(trip)
    : true;
  
  if (shouldTransition) {
    // Execute action
    if (stage.action) {
      await stage.action(trip);
    }
    
    // Update to next stage
    await db.updateTrip(tripId, {
      stage: stage.next,
      stage_entered_at: new Date()
    });
    
    // Check if next stage immediately transitions
    await checkStateTransitions(tripId);
  }
}

// Call after every message
orchestrator.on('message_processed', async (tripId) => {
  await checkStateTransitions(tripId);
});

// Also check on cron (hourly)
cron.schedule('0 * * * *', async () => {
  const activeTrips = await db.getActiveTrips();
  for (const trip of activeTrips) {
    await checkStateTransitions(trip.id);
  }
});
```

---

## Context Management

### Problem

Trip conversations are long (50-200+ messages). Sending everything to Claude:
- Costs: $0.21 per call (70,000 tokens)
- Slow: High latency
- Unnecessary: Most context irrelevant

### Solution: Layered Context

```javascript
// context/contextBuilder.js
class ContextBuilder {
  async build(tripId, phone, intent) {
    const trip = await db.getTrip(tripId);
    
    // Layer 1: Essential (always included, ~500 tokens)
    const essential = {
      trip: {
        id: trip.id,
        stage: trip.stage,
        destination: trip.destination,
        dates: { start: trip.start_date, end: trip.end_date }
      },
      member: await db.getMemberByPhone(tripId, phone),
      allMembers: await db.getMembers(tripId)
    };
    
    // Layer 2: Agent-specific (~500 tokens)
    const agentSpecific = await this.getAgentContext(tripId, intent.agent);
    
    // Layer 3: Current message (~100 tokens)
    return {
      ...essential,
      ...agentSpecific,
      currentMessage: message
    };
  }
  
  async getAgentContext(tripId, agentType) {
    switch(agentType) {
      case 'voting':
        return {
          currentPoll: await db.getCurrentPoll(tripId),
          existingVotes: await db.getVotes(tripId, limit: 10)
        };
        
      case 'coordinator':
        return {
          recentMessages: await db.getRecentMessages(tripId, limit: 5)
        };
        
      case 'parser':
        return {
          flights: await db.getFlights(tripId)
        };
        
      default:
        return {};
    }
  }
}
```

### Token Budget

- Essential context: ~500 tokens
- Agent-specific: ~500 tokens
- Current message: ~100 tokens
- System prompt: ~300 tokens
- **Total: ~1,400 tokens ($0.004 per call)**

**Savings:** 35x cheaper than sending everything

---

## Error Handling

### Multi-Layer Fallbacks

```javascript
// orchestrator.js
async function handleError(tripId, message, error) {
  console.error('Agent error:', error);
  
  // Layer 1: Retry (for transient errors)
  if (error.retryable && retryCount < 3) {
    await sleep(1000 * retryCount);
    return await orchestrator.process(tripId, message);
  }
  
  // Layer 2: Simple fallback response
  await sendSMS(message.from,
    "I didn't quite catch that. Can you rephrase?");
  
  // Layer 3: Web fallback link
  await sendSMS(message.from,
    "Having trouble? View/edit at voyaj.app/trip/" + tripId);
  
  // Layer 4: Log for debugging
  await db.logError({
    trip_id: tripId,
    error: error.message,
    stack: error.stack,
    message: message.body,
    timestamp: new Date()
  });
  
  return { success: false, error: error.message };
}
```

### Error Types

```javascript
// errors.js
class RetryableError extends Error {
  constructor(message) {
    super(message);
    this.retryable = true;
  }
}

class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.retryable = false;
  }
}

// Usage
if (claudeAPI.status === 529) {
  throw new RetryableError('Claude API overloaded');
}

if (!trip) {
  throw new ValidationError('Trip not found');
}
```

---

## API Design

### SMS Webhook (Twilio)

```javascript
POST /sms/incoming
Content-Type: application/x-www-form-urlencoded

From=+15551234567&Body=Tokyo&GroupId=abc123

Response: 200 OK
```

### Test Endpoint (Development)

```javascript
POST /test/sms
Content-Type: application/json

{
  "from": "+15551234567",
  "body": "Tokyo",
  "groupId": "test-group-1"
}

Response: { "success": true }
```

### Web API (Future)

```javascript
GET /api/trips/:tripId
Response: {
  "id": "trip_123",
  "destination": "Tokyo",
  "stage": "voting_dates",
  "members": [...],
  "votes": [...]
}

GET /api/trips/:tripId/members
GET /api/trips/:tripId/votes
GET /api/trips/:tripId/flights
```

---

## Deployment Architecture

### MVP Deployment

```
┌─────────────────┐
│   Railway /     │
│   Render /      │
│   Fly.io        │
│                 │
│  ┌───────────┐  │
│  │  Express  │  │
│  │   Server  │  │
│  └─────┬─────┘  │
│        │        │
└────────┼────────┘
         │
    ┌────┴────┐
    │         │
    ▼         ▼
┌────────┐ ┌──────────┐
│Postgres│ │  Twilio  │
│  (DB)  │ │   API    │
└────────┘ └──────────┘
```

### Environment Variables

```bash
# .env
DATABASE_URL=postgresql://...
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
TWILIO_PHONE_NUMBER=+1855...
ANTHROPIC_API_KEY=...
NODE_ENV=production
```

### Scaling Considerations

**Week 1-2 (MVP):**
- Single server
- In-memory queues
- PostgreSQL on Railway

**Month 2+ (Scale):**
- Multiple servers (load balancer)
- Redis for queues
- Database read replicas
- CDN for static assets

---

## Code Structure

```
/src
├─ server.js                 # Express app, webhook handlers
│
├─ orchestrator.js           # Main router, intent detection
│
├─ /agents
│  ├─ base.js               # Base agent class
│  ├─ coordinator.js        # MVP: Conversational agent
│  ├─ voting.js             # MVP: Poll management
│  └─ parser.js             # MVP: Extract structured data
│
├─ /context
│  └─ contextBuilder.js     # Builds minimal context
│
├─ /state
│  ├─ stateMachine.js       # Stage transitions
│  └─ eventEmitter.js       # Event coordination
│
├─ /queue
│  └─ messageQueue.js        # Per-trip FIFO queue
│
├─ /db
│  ├─ schema.sql            # Database schema
│  ├─ migrations/           # Schema migrations
│  └─ queries.js            # Database operations
│
├─ /utils
│  ├─ claude.js             # Claude API wrapper
│  ├─ twilio.js             # Twilio client
│  └─ errors.js             # Error handling
│
├─ /tests
│  ├─ unit/                 # Unit tests
│  ├─ integration/          # Integration tests
│  ├─ mocks/                # Mock clients
│  └─ scripts/              # Test scenarios
│
└─ /config
   └─ index.js              # Configuration
```

### Key Files

**server.js:**
```javascript
const express = require('express');
const app = express();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Twilio webhook
app.post('/sms/incoming', async (req, res) => {
  await messageQueue.add(req.body);
  res.status(200).send('OK');
});

// Test endpoint (dev only)
if (process.env.NODE_ENV === 'development') {
  app.post('/test/sms', async (req, res) => {
    await messageQueue.add(req.body);
    res.json({ success: true });
  });
}

app.listen(process.env.PORT || 3000);
```

**orchestrator.js:**
```javascript
const Orchestrator = require('./orchestrator');
const orchestrator = new Orchestrator();

module.exports = orchestrator;
```

---

## Performance Considerations

### Response Time Targets

- **Rule-based routing:** < 100ms
- **AI-based routing:** < 2s
- **Agent processing:** < 1s
- **Total:** < 3s (acceptable for SMS)

### Cost Targets

- **Per message:** < $0.01
- **Per trip (100 messages):** < $1.00
- **Context management saves:** ~$15-20 per trip

### Scalability Targets

- **Concurrent trips:** 100+ (MVP)
- **Messages per second:** 10+ (MVP)
- **Database connections:** Connection pooling
- **Memory:** < 512MB (MVP)

---

## Security Considerations

### API Keys
- Store in environment variables
- Never commit to git
- Rotate regularly

### Input Validation
- Sanitize all user input
- Validate phone numbers
- Rate limit per phone number

### Database
- Use parameterized queries (prevent SQL injection)
- Encrypt sensitive data at rest
- Regular backups

### SMS
- Verify Twilio webhook signatures
- Validate message sources
- Rate limit to prevent abuse

---

## Monitoring & Observability

### Logging

```javascript
// Structured logging
logger.info('message_received', {
  tripId: trip.id,
  from: message.from,
  body: message.body,
  timestamp: Date.now()
});

logger.error('agent_failed', {
  tripId: trip.id,
  agent: 'voting',
  error: error.message,
  stack: error.stack
});
```

### Metrics

- Messages processed per minute
- Agent success rate
- Average response time
- Claude API costs
- Error rate

### Alerts

- Error rate > 5%
- Response time > 5s
- Claude costs > $10/day
- Database connection failures

---

## Future Enhancements

### Week 2-3
- Redis-based message queue
- Web dashboard
- Itinerary agent
- Expense agent

### Month 2
- Notification agent
- Recommendation agent
- Email parsing
- Payment integration

### Month 3+
- Flight status API integration
- Photo sharing
- Mobile app
- Advanced analytics

---

## iOS App & iMessage Integration

### Overview

The current architecture is **already designed** to support iOS app and iMessage without major re-architecting. The key insight: the Input Layer and Output Layer are abstracted, so adding new channels is straightforward.

### iMessage Clarification

**Important:** iMessage messages to a phone number are actually SMS messages that appear in iMessage. Here's how it works:

1. **User texts bot phone number** → Goes through SMS (Twilio handles this)
2. **If user has iMessage enabled** → Message appears in iMessage app
3. **If user doesn't have iMessage** → Message appears in SMS app
4. **Bot's response** → Sent via SMS (Twilio), appears in iMessage if user has it

**Bottom line:** iMessage support is already handled by SMS (Twilio). No additional integration needed.

**Exception:** True iMessage-to-iMessage (blue bubbles) requires:
- Both users to have iMessage enabled
- Apple Business Chat (requires Apple partnership, complex)
- **Recommendation:** Skip for MVP, SMS works for everyone

### iOS App Integration

#### Architecture Impact: Minimal

The current architecture supports iOS app with **zero changes** to core logic:

```
┌─────────────────────────────────────────────────────────┐
│                    INPUT LAYER                           │
│  SMS (Twilio) │ iOS App API │ Web API │ Email │ Cron   │
└───────────────────┬─────────────────────────────────────┘
                    │
                    ▼
         [Message Queue] → [Orchestrator] → [Agents]
                    │
                    ▼
┌─────────────────────────────────────────────────────────┐
│              OUTPUT LAYER                               │
│  SMS │ iOS Push │ WebSocket │ Email │ Push              │
└─────────────────────────────────────────────────────────┘
```

**Key Point:** Message Queue, Orchestrator, Agents, State Machine - **none of these care about the input source.**

#### Required Changes

**1. Add iOS App API Endpoint (New Input Channel)**

```javascript
// server.js
app.post('/api/ios/message', async (req, res) => {
  const { tripId, userId, body } = req.body;
  
  // Validate (iOS app sends tripId directly, no need to look up)
  if (!tripId || !userId || !body) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  
  // Get user's phone number from userId
  const member = await db.getMember(userId);
  
  // Queue message (same as SMS)
  await messageQueue.add(tripId, {
    from: member.phone_number, // Use phone number for consistency
    body: body,
    source: 'ios_app', // Track source for analytics
    timestamp: new Date()
  });
  
  res.json({ success: true });
});
```

**That's it.** The message flows through the exact same pipeline:
- Message Queue → Orchestrator → Agent → State Machine → Database

**2. Add iOS Push Notifications (New Output Channel)**

```javascript
// outputs/pushNotifications.js
const apn = require('apn'); // Apple Push Notification service

class PushNotificationService {
  async sendToUser(userId, message, tripId) {
    const deviceToken = await db.getDeviceToken(userId);
    
    if (!deviceToken) return; // User hasn't enabled push
    
    const notification = new apn.Notification({
      alert: message,
      sound: 'default',
      badge: 1,
      topic: 'com.voyaj.app',
      payload: { tripId }
    });
    
    await apnProvider.send(notification, deviceToken);
  }
}

// In event listeners:
eventEmitter.on('vote_added', async (data) => {
  const { tripId, memberId } = data;
  
  // Send SMS (existing)
  await sendSMS(tripId, `New vote! Check status: voyaj.app/${tripId}`);
  
  // Send push to iOS users (new)
  const iosMembers = await db.getIOSMembers(tripId);
  for (const member of iosMembers) {
    await pushService.sendToUser(member.id, 
      `New vote in your trip!`, tripId);
  }
});
```

**3. Update Event System (Already Designed for This)**

The event system already coordinates across channels:

```javascript
// When vote is added
eventEmitter.emit('vote_added', {
  tripId: trip.id,
  memberId: member.id,
  choice: 'Tokyo'
});

// Listeners handle different channels
eventEmitter.on('vote_added', async (data) => {
  // SMS listener (existing)
  await sendSMS(data.tripId, `Vote recorded!`);
  
  // iOS push listener (new)
  await pushService.notifyTripMembers(data.tripId, 'New vote!');
  
  // WebSocket listener (future)
  await websocket.broadcast(data.tripId, { type: 'vote_added', data });
});
```

### Database Changes

**Minimal additions:**

```sql
-- Add device tokens for push notifications
ALTER TABLE members ADD COLUMN device_token TEXT;
ALTER TABLE members ADD COLUMN platform TEXT; -- 'ios', 'android', 'web'

-- Add source tracking to messages
ALTER TABLE messages ADD COLUMN source TEXT; -- 'sms', 'ios_app', 'web'
```

### iOS App Architecture

**Native iOS App Structure:**

```
iOS App
├─ Authentication (Phone number + SMS verification)
├─ Trip List (User's active trips)
├─ Trip Detail View
│  ├─ Destination, dates, members
│  ├─ Voting interface
│  ├─ Flight tracking
│  └─ Chat interface (messages from bot)
├─ Push Notifications
└─ Settings
```

**API Endpoints Needed:**

```javascript
// Authentication
POST /api/auth/send-code      // Send SMS verification code
POST /api/auth/verify         // Verify code, get token

// Trips
GET  /api/trips               // List user's trips
GET  /api/trips/:id           // Get trip details
POST /api/trips/:id/message   // Send message to bot

// Real-time (WebSocket or polling)
GET  /api/trips/:id/updates   // Get recent updates
WS   /api/trips/:id/stream    // WebSocket for real-time
```

### Unified Message Flow

**Scenario: Mixed group (SMS + iOS app users)**

1. Sarah (SMS user): "Tokyo"
   - Twilio webhook → Message Queue → Orchestrator → Voting Agent
   - Vote recorded in database
   - Event emitted: `vote_added`

2. Event listeners:
   - SMS: Send confirmation to Sarah via SMS
   - iOS Push: Send notification to Mike (iOS user)
   - WebSocket: Update web dashboard (future)

3. Mike (iOS user): Opens app, sees vote, responds "Tokyo"
   - iOS app → `/api/ios/message` → Message Queue → Orchestrator → Voting Agent
   - Same pipeline, different entry point

4. Result: Both votes processed identically, everyone notified via their preferred channel

### Why This Works

**1. Input Layer Abstraction**
- Input Layer doesn't care about source
- All messages normalized to: `{ tripId, from, body, source }`
- Message Queue receives same format regardless of source

**2. Orchestrator is Source-Agnostic**
- Orchestrator processes messages based on content, not source
- Intent detection works the same for SMS or iOS app
- Context building is identical

**3. Agents Don't Know About Channels**
- Agents receive: `{ context, message }`
- They don't know if message came from SMS, iOS, or web
- Same agent logic for all channels

**4. Event System Coordinates Output**
- Events are channel-agnostic
- Listeners handle channel-specific delivery
- Easy to add new output channels

### Implementation Plan

**Phase 1: iOS App (Week 3-4)**
- [ ] Add `/api/ios/message` endpoint
- [ ] Add device token storage
- [ ] Add push notification service
- [ ] Update event listeners to send pushes
- [ ] Build basic iOS app (Swift/SwiftUI)

**Phase 2: Enhanced iOS Features (Month 2)**
- [ ] Rich trip views
- [ ] In-app voting interface
- [ ] Real-time updates (WebSocket)
- [ ] Offline support

**Phase 3: iMessage App (Month 3+, if needed)**
- [ ] Apple Business Chat integration (if approved)
- [ ] Or: iMessage extension (limited functionality)

### Cost Considerations

**iOS App:**
- Push notifications: Free (Apple handles delivery)
- API calls: Same as web (minimal)
- Development: One-time iOS app build

**iMessage:**
- Already handled by SMS (Twilio)
- No additional cost
- Apple Business Chat: Free (but requires approval)

### Testing Strategy

**Test with iOS app:**
1. Use iOS Simulator for development
2. Test push notifications with real device
3. Test mixed groups (SMS + iOS users)
4. Verify messages sync across channels

**No changes needed to existing tests:**
- Unit tests: Same (agents don't change)
- Integration tests: Add iOS endpoint tests
- Message queue tests: Same (queue doesn't change)

### Conclusion

**iOS app and iMessage support require minimal changes:**

✅ **No changes needed:**
- Message Queue
- Orchestrator
- Agents
- State Machine
- Database schema (core tables)

✅ **Minimal additions:**
- iOS API endpoint (one new route)
- Push notification service (new output channel)
- Device token storage (one column)
- Event listener for push (one listener)

✅ **Architecture already supports:**
- Multiple input channels
- Multiple output channels
- Event-driven coordination
- Source-agnostic processing

**The architecture was designed for this from day one.**

---

## Conclusion

This architecture is designed to:
1. **Scale incrementally** - Start simple, add complexity as needed
2. **Control costs** - Context management, rule-based routing
3. **Prevent bugs** - Message queues, state machine, error handling
4. **Enable growth** - Agent system allows easy feature additions
5. **Support multiple channels** - SMS, iOS, Web, Email all use same pipeline

The MVP focuses on core coordination (destination, dates, flights) with a foundation that supports future features without major refactoring. iOS app and iMessage integration are natural extensions that require minimal architectural changes.

