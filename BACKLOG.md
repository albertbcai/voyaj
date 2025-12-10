# Voyaj Backlog

Prioritized list of tasks and features organized by phase.

## 🔴 Blocked / Waiting

- [ ] **Wait for A2P compliance approval** - Application submitted to Twilio, waiting for approval. Once approved, implement:
  - STOP/HELP keyword handling in `src/server.js`
  - Opt-out tracking in database (add `opt_outs` table)
  - Updated welcome message with full compliance text in `src/agents/coordinator.js`
  - Prevent messages to opted-out users

---

## 🚨 CRITICAL: AI Reliability Fixes (DO FIRST!)

**Context:** AI behavior is inconsistent due to missing temperature control, overly complex prompts, and race conditions. These fixes will improve reliability from ~70% to ~95%+.

**Estimated Total Time:** 12-15 hours
**Expected Impact:** Massive - transforms system from "flaky" to "reliable"

### Priority 1: Temperature Control & Core Consistency (5 hours) - **DO THIS FIRST**

**Impact:** Fixes 60% of inconsistency issues. Same input will get same output 99% of the time.

- [ ] **#1: Add temperature control to Claude API wrapper** (1 hour)
  - **File:** `src/utils/claude.js`
  - **Task:** Add `temperature` parameter to both functions
  - **Details:**
    ```javascript
    // Line 47: callClaude function
    export async function callClaude(prompt, options = {}) {
      return await retryWithBackoff(async () => {
        const response = await anthropic.messages.create({
          model: options.model || 'claude-sonnet-4-20250514',
          max_tokens: options.maxTokens || 1024,
          temperature: options.temperature ?? 1.0, // ✅ ADD THIS
          messages: [{ role: 'user', content: prompt }],
        });
        return response.content[0].text;
      });
    }

    // Line 64: callClaudeWithSystemPrompt function
    export async function callClaudeWithSystemPrompt(systemPrompt, userPrompt, options = {}) {
      return await retryWithBackoff(async () => {
        const response = await anthropic.messages.create({
          model: options.model || 'claude-sonnet-4-20250514',
          max_tokens: options.maxTokens || 1024,
          temperature: options.temperature ?? 1.0, // ✅ ADD THIS
          system: systemPrompt,
          messages: [{ role: 'user', content: userPrompt }],
        });
        return response.content[0].text;
      });
    }
    ```
  - **Test:** Call with `temperature: 0.0` and verify same result 10 times

- [ ] **#2: Set temperature: 0.0 for all classification tasks** (1 hour)
  - **Files:** Multiple files - see below
  - **Task:** Add `temperature: 0.0` to all deterministic AI calls
  - **Details:**
    1. `src/orchestrator.js:274` - Intent detection
       ```javascript
       const response = await callClaude(prompt, { maxTokens: 200, temperature: 0.0 });
       ```
    2. `src/agents/coordinator.js:448` - Question direction
       ```javascript
       const response = await callClaudeWithSystemPrompt('', prompt, { maxTokens: 150, temperature: 0.0 });
       ```
    3. `src/agents/coordinator.js:519` - Name validation
       ```javascript
       const response = await callClaudeWithSystemPrompt('', prompt, { maxTokens: 150, temperature: 0.0 });
       ```
    4. `src/agents/coordinator.js:574` - Date vs destination detection
       ```javascript
       const response = await callClaudeWithSystemPrompt('', prompt, { maxTokens: 150, temperature: 0.0 });
       ```
    5. `src/agents/voting.js:359` - Vote parsing (first call)
       ```javascript
       const response = await callClaude(prompt, { maxTokens: 100, temperature: 0.0 });
       ```
    6. `src/agents/voting.js:403` - Vote parsing (second call)
       ```javascript
       const response = await callClaude(prompt, { maxTokens: 150, temperature: 0.0 });
       ```
    7. `src/agents/voting.js:459` - Vague preference detection
       ```javascript
       const response = await callClaude(prompt, { maxTokens: 100, temperature: 0.0 });
       ```
    8. `src/agents/voting.js:507` - Destination extraction
       ```javascript
       const response = await callClaude(prompt, { maxTokens: 150, temperature: 0.0 });
       ```
    9. `src/agents/voting.js:596` - Destination normalization
       ```javascript
       const response = await callClaude(prompt, { maxTokens: 100, temperature: 0.0 });
       ```
    10. `src/agents/voting.js:726` - Poll winner correction
       ```javascript
       const response = await callClaude(prompt, { maxTokens: 100, temperature: 0.0 });
       ```
    11. `src/agents/parser.js:179` - Date range parsing
       ```javascript
       const response = await callClaude(prompt, { maxTokens: 150, temperature: 0.0 });
       ```
    12. `src/agents/parser.js:342` - Flight info parsing
       ```javascript
       const response = await callClaude(prompt, { maxTokens: 150, temperature: 0.0 });
       ```
  - **Test:** Run same input 10 times, verify identical results

- [ ] **#3: Refactor Responder prompt - Split into 3 focused prompts** (3 hours)
  - **File:** `src/agents/responder.js`
  - **Current Problem:** 160-line prompt with 14+ conflicting rules (lines 431-591)
  - **Task:** Split into 3 separate AI calls with focused prompts
  - **Implementation Plan:**
    ```javascript
    // NEW: Decision prompt (should I respond?)
    async shouldRespondDecision(agentOutput, context, message) {
      const prompt = `Should the bot respond to this message?

    Message: "${message.body}"
    Event: ${agentOutput.type}
    Recent activity: ${recentMessages.length} messages in last 5 min

    ALWAYS respond if:
    - Event is poll_started, member_joined, poll_completed
    - Message mentions "Voyaj" or "bot"
    - Organizing attempt detected: "we need to organize", "make a spreadsheet"
    - Confusion detected: "confused", "stuck", "help"

    NEVER respond if:
    - Question was answered by group member
    - Casual banter: "ok", "sounds good", "yeah"
    - Group is chatting naturally (3+ messages without bot)

    Return JSON only:
    {"respond": true}
    or
    {"respond": false}`;

      const response = await callClaude(prompt, { maxTokens: 20, temperature: 0.0 });
      return JSON.parse(response.trim()).respond;
    }

    // NEW: Tone prompt (proactive control vs friendly helper)
    async decideTone(agentOutput, context, message) {
      const prompt = `What tone should the bot use?

    Message: "${message.body}"
    Event: ${agentOutput.type}

    "control": Bot takes charge with structure and plan (2-4 sentences)
      - Use when: organizing attempt, confusion, scattered conversation
      - Format: Status + Plan + Acknowledgment + Alternative

    "helper": Bot answers briefly (1-2 sentences)
      - Use when: simple question, acknowledging action

    Return JSON only:
    {"tone": "control"}
    or
    {"tone": "helper"}`;

      const response = await callClaude(prompt, { maxTokens: 20, temperature: 0.0 });
      return JSON.parse(response.trim()).tone;
    }

    // NEW: Content prompt (craft the response) - now much simpler!
    async craftResponseContent(agentOutput, context, tripState, tone) {
      const systemPrompt = tone === 'control'
        ? `You are Voyaj taking control. Format:
           1. Acknowledge: "I see we're stuck - let me take over!"
           2. Status: "Here's where we are: ✅ [done] | ⏳ [pending]"
           3. Plan: "Here's my plan: [step 1], [step 2]"
           4. Alternative: "If you prefer X, just say so!"

           Use 2-4 sentences. Be warm but directive.`
        : `You are Voyaj being helpful. Answer the question directly in 1-2 sentences.
           Be warm and friendly. Then guide to next step.`;

      const userPrompt = `Event: ${JSON.stringify(agentOutput)}
    Trip state: ${JSON.stringify(tripState)}

    Craft response:`;

      const response = await callClaudeWithSystemPrompt(systemPrompt, userPrompt, {
        maxTokens: 150,
        temperature: 0.7  // ✅ Creative for writing!
      });
      return response.trim();
    }
    ```
  - **Migration Steps:**
    1. Add the 3 new methods above to ResponderAgent class
    2. Update `craftResponse` to call them sequentially
    3. Remove old 160-line prompt
    4. Test with variety of messages
  - **Test Cases:**
    - Organizing attempt → Should respond with "control" tone
    - Simple question → Should respond with "helper" tone
    - Casual chat → Should not respond

### Priority 2: Data Consistency & Race Conditions (4 hours)

**Impact:** Fixes 30% of "wrong status" issues. Bot will show accurate real-time state.

- [ ] **#4: Fix voting agent stale context - Refetch after destination save** (1 hour)
  - **File:** `src/agents/voting.js`
  - **Location:** Line 158-190 in `handleDestinationSuggestion`
  - **Current Problem:** Uses stale `destinationSuggestions` from context after saving new ones
  - **Task:** Refetch fresh data after DB saves
  - **Implementation:**
    ```javascript
    // After saving all destinations (line 152):
    for (const dest of destinations) {
      await db.createDestinationSuggestion(trip.id, member.id, normalized);
      savedCount++;
    }

    // ✅ ADD: Refetch fresh data
    const freshSuggestions = await db.getDestinationSuggestions(trip.id);
    const suggestionCount = freshSuggestions.length;

    // Check if ready for voting (using FRESH count)
    if (suggestionCount >= memberCount) {
      return await this.startDestinationVoting(context);
    }

    // ✅ CHANGE: Use fresh data for pending calculation (line 168)
    const pending = context.allMembers
      .filter(m => !freshSuggestions.some(s => s.member_id === m.id)) // Use fresh!
      .map(m => m.name);
    ```
  - **Test:**
    1. Have 3 members
    2. Member 1 suggests "Tokyo"
    3. Member 2 suggests "Bali"
    4. Member 3 suggests "Paris"
    5. Verify: Shows "All suggestions in!" not "Waiting on Member 3"

- [ ] **#5: Fix parser agent stale context - Refetch after date save** (1 hour)
  - **File:** `src/agents/parser.js`
  - **Location:** Lines 79-109 and 124-154 in `handleDateAvailability`
  - **Current Problem:** Same as voting agent - uses stale context
  - **Task:** Refetch after saving date availability
  - **Implementation:**
    ```javascript
    // Line 77: After saving "flexible"
    await db.createDateAvailability(trip.id, member.id, {
      startDate: null,
      endDate: null,
      isFlexible: true,
    });

    // ✅ ADD: Re-fetch fresh data (line 79)
    const freshAvailability = await db.getDateAvailability(trip.id);
    const availabilityCount = freshAvailability.length;
    // ... rest of logic using freshAvailability

    // Line 116: After saving date range
    await db.createDateAvailability(trip.id, member.id, {
      startDate: parsed.startDate,
      endDate: parsed.endDate,
      isFlexible: false,
    });

    // ✅ ADD: Re-fetch fresh data (line 124)
    const freshAvailability = await db.getDateAvailability(trip.id);
    const availabilityCount = freshAvailability.length;
    // ... rest of logic using freshAvailability
    ```
  - **Test:** Same as voting test but with dates

- [ ] **#6: Fix context builder - Add destination suggestions for planning stage** (30 mins)
  - **File:** `src/context/contextBuilder.js`
  - **Location:** Lines 56-57
  - **Current Problem:** Only adds `destinationSuggestions` for `collecting_destinations` stage, but voting agent needs it in `planning` stage too
  - **Task:** Include suggestions for both stages
  - **Implementation:**
    ```javascript
    // Line 56-58: CHANGE from:
    if (trip.stage === 'collecting_destinations') {
      context.destinationSuggestions = await db.getDestinationSuggestions(tripId);
    }

    // ✅ TO:
    if (trip.stage === 'collecting_destinations' || trip.stage === 'planning') {
      context.destinationSuggestions = await db.getDestinationSuggestions(tripId);
    }
    ```
  - **Test:** Create trip in planning stage, submit destination, verify no crash

- [ ] **#7: Fix vote parsing - Single AI call instead of double** (1 hour)
  - **File:** `src/agents/voting.js`
  - **Location:** Lines 314-426 in `parseVote`
  - **Current Problem:** Makes 2 AI calls for same vote (lines 340-379, 387-424)
  - **Task:** Consolidate into single AI call with comprehensive prompt
  - **Implementation:**
    ```javascript
    async parseVote(choice, pollType, context) {
      // Get options
      let options = [];
      if (pollType === 'destination') {
        options = this.consolidateSuggestions(context.destinationSuggestions || []);
      } else if (pollType === 'dates') {
        options = context.dateOptions || [];
      }

      if (options.length === 0) return null;

      // ✅ SINGLE AI call with comprehensive prompt
      const prompt = `Is this a vote for one of the poll options?

    Message: "${choice}"

    Poll options:
    ${options.map((opt, idx) => `${idx + 1}. ${opt}`).join('\n')}

    Return JSON only:
    {"isVote": true, "optionNumber": 1}
    or
    {"isVote": false}

    Rules:
    - If message contains a number 1-${options.length}, it's a vote for that option
    - If message contains option name (e.g., "Tokyo"), it's a vote for that option
    - Extra text is OK: "1 - Tokyo all the way!" is still a vote for option 1
    - Questions/complaints are NOT votes: "This doesn't look right" → isVote: false

    Examples:
    "1" → {"isVote":true,"optionNumber":1}
    "Tokyo" → {"isVote":true,"optionNumber":1} (if Tokyo is option 1)
    "1\\n\\nTokyo!!!" → {"isVote":true,"optionNumber":1}
    "This is confusing" → {"isVote":false}
    "What about Paris?" → {"isVote":false}`;

      try {
        const response = await callClaude(prompt, { maxTokens: 50, temperature: 0.0 });
        const cleaned = response.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        const parsed = JSON.parse(cleaned);

        if (parsed.isVote && parsed.optionNumber >= 1 && parsed.optionNumber <= options.length) {
          return options[parsed.optionNumber - 1];
        }
        return null;
      } catch (error) {
        console.error('Vote parsing failed:', error);
        return null;
      }
    }
    ```
  - **Delete:** Lines 330-384 (old numeric matching logic with first AI call)
  - **Delete:** Lines 387-424 (old natural language logic with second AI call)
  - **Test:**
    - "1" → Returns first option
    - "Tokyo" → Returns Tokyo if it's an option
    - "1\n\nTokyo!!!" → Returns first option
    - "This doesn't look right" → Returns null

- [ ] **#8: Improve intent detection - Tighter prompt with more examples** (1 hour)
  - **File:** `src/orchestrator.js`
  - **Location:** Lines 220-291 in `detectIntentWithAI`
  - **Current Problem:** Vague boundaries between intents, no examples
  - **Task:** Add 10+ examples and tighten definitions
  - **Implementation:**
    ```javascript
    const prompt = `Classify this message into ONE intent category.

    Message: "${message.body}"
    Trip stage: ${trip.stage}
    ${stateContext}

    Return ONLY this JSON (no explanation):
    {"intent": "vote"}

    Valid intents:
    - "member_join": Simple name only, no question marks
    - "destination_suggestion": Place name (city, country, region)
    - "date_availability": Dates, date ranges, or "flexible"
    - "vote": Number 1-9 OR voting on an option
    - "flight": Flight booking information
    - "question": Has "?" OR question words seeking info
    - "conversation": Everything else (acknowledgments, chat)

    Examples (Message → Intent):
    "Alex" → "member_join"
    "Sarah" → "member_join"
    "Tokyo" → "destination_suggestion"
    "Bali, Indonesia" → "destination_suggestion"
    "March 15-22" → "date_availability"
    "I'm flexible in April" → "date_availability"
    "flexible" → "date_availability"
    "1" → "vote"
    "2" → "vote"
    "Tokyo" (in voting stage) → "vote"
    "BOOKED United 154" → "flight"
    "I booked my flight" → "flight"
    "What dates work?" → "question"
    "Where are we going?" → "question"
    "When should I book?" → "question"
    "sounds good" → "conversation"
    "ok cool" → "conversation"
    "yeah!" → "conversation"

    Special cases:
    - If stage is voting_*, numbers are always "vote"
    - If message is just a place name and stage is planning/collecting_destinations, it's "destination_suggestion"
    - Month names alone: "march" or "april" → "date_availability"
    - Name-like words in collecting_members stage → "member_join"`;

    const response = await callClaude(prompt, { maxTokens: 50, temperature: 0.0 });
    ```
  - **Remove:** confidence and reasoning fields (not used)
  - **Test:** Run 20 test messages, verify correct classification

### Priority 3: Validation & Polish (3 hours)

**Impact:** Fixes 10% of edge case issues. Prevents bad data from entering system.

- [ ] **#9: Add date range validation in parser** (1 hour)
  - **File:** `src/agents/parser.js`
  - **Location:** Line 115 (after parsing dates)
  - **Task:** Validate dates before saving
  - **Implementation:**
    ```javascript
    const parsed = await this.parseDateRangeWithAI(message.body);

    // ✅ ADD: Validation
    if (parsed.startDate && parsed.endDate) {
      const start = new Date(parsed.startDate);
      const end = new Date(parsed.endDate);
      const now = new Date();
      now.setHours(0, 0, 0, 0); // Start of today

      // Validation checks
      if (end <= start) {
        await twilioClient.sendSMS(message.from,
          'End date must be after start date. Try again!\nExample: "March 15-22"');
        return { success: false };
      }

      if (start < now) {
        await twilioClient.sendSMS(message.from,
          'Start date must be in the future. Try again!\nExample: "March 15-22"');
        return { success: false };
      }

      const twoYearsFromNow = new Date(now);
      twoYearsFromNow.setFullYear(now.getFullYear() + 2);
      if (start > twoYearsFromNow) {
        await twilioClient.sendSMS(message.from,
          'Date is too far in the future (max 2 years). Try again!');
        return { success: false };
      }

      // All good - save
      await db.createDateAvailability(trip.id, member.id, {
        startDate: parsed.startDate,
        endDate: parsed.endDate,
        isFlexible: false,
      });
      // ... rest of logic
    }
    ```
  - **Test:**
    - "March 31 - March 1" → Rejects (end before start)
    - "January 1, 2020 - January 7, 2020" → Rejects (past)
    - "January 1, 2099 - January 7, 2099" → Rejects (too far future)
    - "March 15-22" → Accepts

- [ ] **#10: Fix state machine duplicate dates_set definition** (30 mins)
  - **File:** `src/state/stateMachine.js`
  - **Location:** Lines 111-149 and 184-199
  - **Current Problem:** `dates_set` defined twice, second overwrites first
  - **Task:** Remove duplicate, keep comprehensive version
  - **Implementation:**
    - Delete lines 184-199 (second definition)
    - Keep lines 111-149 (first definition with dynamic logic)
  - **Test:** Set dates before destination, verify correct message

- [ ] **#11: Simplify destination normalization - Aggressive pre-filtering** (1 hour)
  - **File:** `src/agents/voting.js`
  - **Location:** Lines 551-623 in `normalizeDestination`
  - **Current Problem:** AI called even for obvious non-destinations
  - **Task:** Add aggressive pre-filtering to save API costs
  - **Implementation:**
    ```javascript
    async normalizeDestination(destination, allMembers = []) {
      const trimmed = destination.trim();
      if (trimmed.length === 0 || trimmed.length > 100) {
        throw new Error('NOT_A_DESTINATION');
      }

      // ✅ EXPAND: More aggressive pre-filtering
      const memberNames = allMembers.map(m => m.name.toLowerCase());
      const lowerDest = trimmed.toLowerCase();

      // Reject if matches member name
      if (memberNames.includes(lowerDest)) {
        throw new Error('NAME_NOT_DESTINATION');
      }

      // Reject obvious non-destinations (save AI costs!)
      const obviousNonDestinations = [
        // Single words that are never destinations
        /^(ok|yeah|yes|no|maybe|sounds?|good|cool|nice|sure|great|awesome|perfect|agreed?|yep|yup|nope)$/i,
        // First-person statements
        /\b(i|i'm|i am|we|we're|we are|you|you're|you are)\s/i,
        // Questions/confusion
        /^(wait|what|how|why|when|where|who|confused|huh|hmm)$/i,
        // Common non-destination phrases
        /\b(doesn't|don't|can't|won't|shouldn't|isn't|aren't|wasn't|weren't)/i,
        /\b(overruled|right vote|wrong|look like|this is)\b/i,
      ];

      if (obviousNonDestinations.some(p => p.test(trimmed))) {
        throw new Error('NOT_A_DESTINATION');
      }

      // THEN call AI for remaining cases (with temperature: 0.0 already added in #2)
      // ... rest of existing AI validation logic
    }
    ```
  - **Test:**
    - "ok" → Rejects immediately (no AI call)
    - "sounds good" → Rejects immediately
    - "I'm flexible" → Rejects immediately
    - "Tokyo" → Calls AI, normalizes to "Tokyo"

- [ ] **#12: Improve message queue fairness - Process one message per trip** (30 mins)
  - **File:** `src/queue/messageQueue.js`
  - **Location:** Lines 31-52 in `processQueue`
  - **Current Problem:** Processes ALL messages for one trip before moving to next
  - **Task:** Process one message per trip, then reschedule
  - **Implementation:**
    ```javascript
    async processQueue(tripId) {
      const queue = this.queues.get(tripId) || [];

      if (queue.length > 0) {
        const message = queue.shift(); // Take first message
        console.log(`   🔄 Queue: Processing 1 message for trip ${tripId} (${queue.length} remaining)`);

        try {
          const { orchestrator } = await import('../orchestrator.js');
          await orchestrator.process(tripId, message);
          console.log(`   ✅ Queue: Message processed`);
        } catch (error) {
          console.error(`   ❌ Queue: Failed to process:`, error);
        }

        // ✅ CHANGE: If more messages, reschedule (allows other trips to interleave)
        if (queue.length > 0) {
          setImmediate(() => this.processQueue(tripId));
        } else {
          this.processing.delete(tripId);
          console.log(`   🏁 Queue: Finished trip ${tripId}`);
        }
      } else {
        this.processing.delete(tripId);
      }
    }
    ```
  - **Test:**
    - Trip A has 10 messages queued
    - Trip B has 1 message queued
    - Verify: Messages interleave (A1, B1, A2, A3, ...) not (A1-A10, then B1)

### Priority 4: Prompt Improvements (Optional - 2-3 hours)

**Impact:** Incremental improvements to edge cases.

- [ ] **#13: Improve name validation - Add more examples** (30 mins)
  - **File:** `src/agents/coordinator.js:500-517`
  - **Task:** Add edge case examples to prompt
  - **Implementation:** Add examples for "march", "may", "march or april", etc.

- [ ] **#14: Improve question direction detection - Add examples** (30 mins)
  - **File:** `src/agents/coordinator.js:430-446`
  - **Task:** Add clear examples for each direction type

- [ ] **#15: Improve date vs destination detection - Add examples** (30 mins)
  - **File:** `src/agents/coordinator.js:552-572`
  - **Task:** Add 10+ examples covering edge cases

- [ ] **#16: Simplify vague preference detection** (30 mins)
  - **File:** `src/agents/voting.js:428-489`
  - **Task:** AI-only with temperature: 0.0, remove fallback

- [ ] **#17: Simplify poll winner validation** (30 mins)
  - **File:** `src/agents/voting.js:688-764`
  - **Task:** Remove AI correction, use simple fallback to most common valid option

- [ ] **#18: Refactor shouldSendMessage to decision tree** (1 hour)
  - **File:** `src/agents/responder.js:270-422`
  - **Task:** Replace 150 lines of conditionals with clear priority tree

---

## 🟢 Phase 1: MVP Completion (Current Focus)

### SMS Integration & Group Messaging
- [ ] **Integrate real Twilio SMS** - Replace mock Twilio client with real Twilio integration
  - Configure Twilio webhook endpoint in `src/server.js`
  - Update `src/utils/twilio.js` to use real Twilio client
  - Test with Twilio test credentials first
- [ ] **Implement group messaging support** - Ensure SMS works properly with group messaging
  - Handle group chat ID changes (recreated with new person)
  - Test group message delivery and responses
  - Verify all group members receive bot messages

### Testing & Validation
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

### Infrastructure & Polish
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

## 🟡 Phase 2: Post-MVP Polish (Week 2-4)

### Core Features
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

### Infrastructure Improvements
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

### Testing & Scale
- [ ] **Testing with 20-50 real trips** - Scale testing
- [ ] **Performance testing** - Test with 10+ concurrent trips
- [ ] **Better error handling** - Enhanced error recovery

---

## 🔵 Phase 3: Future Features (Month 2+)

### Revenue & Monetization
- [ ] **Payment/upgrade flow** - Stripe integration
  - Paywall after 150 messages (free tier limit)
  - Stripe checkout link via SMS: "Upgrade: voyaj.app/upgrade/trip123"
  - Bot pauses until payment succeeds
- [ ] **Affiliate link integration** - Revenue from bookings
  - Test affiliate conversion rates
  - Integrate booking links (hotels, flights, activities)
  - Track conversions

### Advanced Features
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

### Platform Expansion
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

### Growth Features
- [ ] **Recommendation engine** - AI-powered suggestions
  - Activity recommendations
  - Restaurant suggestions
  - Integrate with affiliate links
- [ ] **Photo sharing** - Group photo collection
- [ ] **Post-trip settlement** - Expense finalization
- [ ] **Mobile app (Android)** - If iOS app successful

---

## 📋 Additional Technical Debt

### From PRD Additional Questions
- [ ] **Environment variables & secrets** - Secure management
  - Create `.env.example` with required variables
  - Never commit secrets
- [ ] **Monitoring & alerts** - Production monitoring
  - Error rate > 5% alerts
  - Response time > 5s alerts
  - Claude costs > $10/day alerts
  - Database connection failure alerts

### From Technical Architecture
- [ ] **Connection pooling** - Database optimization
- [ ] **CDN for static assets** - If web dashboard added
- [ ] **Database read replicas** - For scale
- [ ] **Load balancer** - Multiple servers

---

## Notes

- **Priority order**: Complete Phase 1 before moving to Phase 2
- **Testing**: Continuous testing throughout all phases
- **Cost monitoring**: Track Claude API costs at every phase
- **User feedback**: Collect and iterate based on real usage
