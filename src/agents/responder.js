import { BaseAgent } from './base.js';
import * as db from '../db/queries.js';
import { callClaudeWithSystemPrompt } from '../utils/claude.js';

/**
 * ResponderAgent - The intelligent social face of Voyaj
 * 
 * Responsibilities:
 * - Uses AI to craft context-aware, intelligent responses
 * - Reads full conversation history to understand group dynamics
 * - Decides when to respond vs when to skip (avoids spam)
 * - Formats all agent outputs intelligently based on context
 * - Acts as both friendly presence AND project manager
 */
export class ResponderAgent extends BaseAgent {
  constructor() {
    super('Responder', '💬');
  }

  /**
   * Format a response based on agent output
   * Uses AI to craft intelligent, context-aware messages
   * Returns message to be sent (or null if skipped)
   */
  async formatResponse(agentOutput, context, message) {
    this.logEntry('formatResponse', context, message);
    
    try {
    const { trip, allMembers } = context;
    
    // Get full conversation context (last 15 messages for better understanding)
    const recentMessages = await db.getRecentMessages(trip.id, 15);
    
    // Build comprehensive context for AI with proper sender names
    const conversationHistory = recentMessages.map((m) => {
      // Try to find member name from phone number
      const member = allMembers.find(mem => mem.phone_number === m.from_phone);
      let senderName = 'Someone';
      if (member) {
        senderName = member.name;
      } else if (m.from_phone === 'bot' || m.from_phone === 'Voyaj' || m.source === 'bot') {
        senderName = 'Voyaj';
      }
      return `${senderName}: ${m.body}`;
    });
    
    const conversationText = conversationHistory.join('\n');
    
    // Build trip state by fetching data directly
    const tripState = await this.buildTripState(context, agentOutput);
    
    // If agent output already has a formatted message (e.g., poll_started), use it
    if (agentOutput.message) {
      const sendTo = agentOutput.sendTo || 'group';
      const recipient = agentOutput.recipient || null;
      this.log('info', `Using pre-formatted message from agent output`);
      this.logExit('formatResponse', { message: agentOutput.message, sendTo, recipient });
      return {
        message: agentOutput.message,
        sendTo,
        recipient,
        reasoning: `Using pre-formatted message from ${agentOutput.type}`,
      };
    }
    
    // Use AI to decide if we should respond and what to say
    const shouldRespondResult = await this.shouldSendMessage(agentOutput, context, recentMessages, message);
    
    if (!shouldRespondResult.shouldRespond) {
      const result = {
        message: null,
        sendTo: agentOutput.sendTo || 'group',
        recipient: agentOutput.recipient || null,
        reasoning: shouldRespondResult.reasoning || 'Decided to skip this message (not needed or would be spam)',
      };
      this.log('info', result.reasoning);
      this.logExit('formatResponse', result);
      return result;
    }
    
    // Pass through organizing attempt flag if detected
    if (agentOutput.needsProactiveControl) {
      this.log('info', 'Organizing attempt detected - crafting proactive control response');
    }
    
    // Use AI to craft the perfect response
    const response = await this.craftResponse(agentOutput, context, conversationText, tripState, message);
    
    // Check if response is empty, just quotes, or looks like reasoning/explanation
    const trimmed = response ? response.trim() : '';
    const isEmpty = trimmed.length === 0;
    const isJustQuotes = trimmed === '"""' || (trimmed.startsWith('"""') && trimmed.endsWith('"""'));
    const lowerTrimmed = trimmed.toLowerCase();
    const isReasoning = 
      (lowerTrimmed.includes('the group is') || lowerTrimmed.includes('group is')) &&
      (lowerTrimmed.includes('should step back') || 
       lowerTrimmed.includes('should skip') ||
       lowerTrimmed.includes('should not respond') ||
       lowerTrimmed.includes('naturally') ||
       lowerTrimmed.includes('making progress') ||
       lowerTrimmed.includes('flowing well'));
    
    if (isEmpty || isJustQuotes || isReasoning) {
      const reasoning = `AI decided not to respond (empty/reasoning detected: "${trimmed.substring(0, 50)}...")`;
      this.log('info', reasoning);
      const result = {
        message: null,
        sendTo: agentOutput.sendTo || 'group',
        recipient: agentOutput.recipient || null,
        reasoning,
      };
      this.logExit('formatResponse', result);
      return result;
    }
    
    // Return the AI-crafted response
    const sendTo = agentOutput.sendTo === 'group' || !agentOutput.recipient ? 'group' : 'individual';
    const recipient = agentOutput.recipient || null;
    
    const result = {
      message: response,
      sendTo,
      recipient,
      reasoning: 'Crafted intelligent response based on context',
    };
    this.logExit('formatResponse', result);
    return result;
    } catch (error) {
      await this.logError(error, context, message, { 
        method: 'formatResponse',
        agentOutputType: agentOutput?.type,
      });
      throw error;
    }
  }
  
  /**
   * Build comprehensive trip state information by fetching data directly
   */
  async buildTripState(context, agentOutput) {
    const { trip, allMembers } = context;
    
    // CRITICAL: Only mark as set if actually in database (not null)
    const destination = trip.destination || null;
    const startDate = trip.start_date ? new Date(trip.start_date).toLocaleDateString() : null;
    const endDate = trip.end_date ? new Date(trip.end_date).toLocaleDateString() : null;
    
    const state = {
      stage: trip.stage,
      members: allMembers.map(m => m.name),
      memberCount: allMembers.length,
      destination, // null if not set
      startDate, // null if not set
      endDate, // null if not set
      // Explicit flags for AI to check
      destinationIsSet: destination !== null,
      datesAreSet: startDate !== null && endDate !== null,
    };
    
    // Fetch stage-specific data directly
    if (trip.stage === 'planning' || trip.stage === 'collecting_destinations') {
      const suggestions = await db.getDestinationSuggestions(trip.id);
      state.suggestions = suggestions.map(s => s.destination);
      state.suggestionCount = suggestions.length;
      state.pendingSuggesters = allMembers
        .filter(m => !suggestions.some(s => s.member_id === m.id))
        .map(m => m.name);
      // Add confirmed members (inverse of pending)
      state.confirmedSuggesters = allMembers
        .filter(m => suggestions.some(s => s.member_id === m.id))
        .map(m => m.name);
    }
    
    if (trip.stage === 'planning' || trip.stage === 'collecting_dates' || trip.stage === 'voting_dates') {
      const availability = await db.getDateAvailability(trip.id);
      state.availabilityCount = availability.length;
      state.pendingAvailability = allMembers
        .filter(m => !availability.some(a => a.member_id === m.id))
        .map(m => m.name);
      // Add confirmed members (inverse of pending)
      state.confirmedAvailability = allMembers
        .filter(m => availability.some(a => a.member_id === m.id))
        .map(m => m.name);
    }
    
    if (trip.stage === 'voting_destination' || trip.stage === 'voting_dates') {
      const votes = await db.getVotes(trip.id, trip.stage === 'voting_destination' ? 'destination' : 'dates');
      const voteCount = votes.length;
      const majorityThreshold = Math.ceil(allMembers.length * 0.6);
      const votesNeeded = Math.max(0, majorityThreshold - voteCount);
      
      state.voteCount = voteCount;
      state.majorityThreshold = majorityThreshold;
      state.votesNeeded = votesNeeded;
      state.pendingVoters = allMembers
        .filter(m => !votes.some(v => v.member_id === m.id))
        .map(m => m.name);
      state.confirmedVoters = allMembers
        .filter(m => votes.some(v => v.member_id === m.id))
        .map(m => m.name);
    }
    
    if (trip.stage === 'tracking_flights' || trip.stage === 'trip_confirmed') {
      const flights = await db.getFlights(trip.id);
      state.flightCount = flights.length;
      state.bookedMembers = flights.map(f => f.member_name);
      state.unbookedMembers = allMembers
        .filter(m => !flights.some(f => f.member_id === m.id))
        .map(m => m.name);
    }
    
    // Fetch preferences from notes
    const preferences = await db.getTripPreferences(trip.id);
    if (preferences) {
      state.preferences = preferences;
      state.hasPreferences = true;
      
      // Format preferences summary for AI
      const summaryParts = [];
      if (preferences.destination_criteria && preferences.destination_criteria.length > 0) {
        const criteria = preferences.destination_criteria.map(p => `${p.member_name}: ${p.text}`).join('; ');
        summaryParts.push(`Destination criteria: ${criteria}`);
      }
      if (preferences.budget_preferences && preferences.budget_preferences.length > 0) {
        const budgets = preferences.budget_preferences.map(p => `${p.member_name}: ${p.text}`).join('; ');
        summaryParts.push(`Budget preferences: ${budgets}`);
      }
      if (preferences.accommodation_preferences && preferences.accommodation_preferences.length > 0) {
        const accoms = preferences.accommodation_preferences.map(p => `${p.member_name}: ${p.text}`).join('; ');
        summaryParts.push(`Accommodation preferences: ${accoms}`);
      }
      state.preferencesSummary = summaryParts.length > 0 ? summaryParts.join('. ') : null;
    } else {
      state.hasPreferences = false;
      state.preferencesSummary = null;
    }
    
    // Build status summary for proactive responses
    const statusParts = [];
    
    // Dates status
    if (state.confirmedAvailability && state.confirmedAvailability.length > 0) {
      statusParts.push(`✅ ${state.confirmedAvailability.length}/${state.memberCount} dates (${state.confirmedAvailability.join(', ')})`);
    } else if (state.availabilityCount !== undefined) {
      statusParts.push(`⏳ ${state.availabilityCount}/${state.memberCount} dates`);
    }
    
    // Destinations status
    if (state.suggestionCount !== undefined) {
      if (state.suggestionCount > 0) {
        statusParts.push(`✅ ${state.suggestionCount} destination${state.suggestionCount > 1 ? 's' : ''}`);
      } else {
        statusParts.push(`⏳ 0 destinations`);
      }
    }
    
    // Budget status
    if (preferences?.budget_preferences && preferences.budget_preferences.length > 0) {
      const budgetText = preferences.budget_preferences.map(p => p.text).join(', ');
      statusParts.push(`⏳ Budget: Not set (but tracking: ${budgetText})`);
    } else {
      statusParts.push(`⏳ Budget: Not set`);
    }
    
    state.statusSummary = statusParts.length > 0 ? statusParts.join(' | ') : 'Planning in progress';
    
    return state;
  }
  
  /**
   * Use AI to decide if we should send a message
   * Avoids spam and unnecessary responses
   * Returns { shouldRespond: boolean, reasoning?: string }
   */
  async shouldSendMessage(agentOutput, context, recentMessages, message) {
    // Always respond to important events
    if (['poll_started', 'poll_completed', 'member_joined', 'member_joined_during_vote'].includes(agentOutput.type)) {
      return { shouldRespond: true, reasoning: `Important event: ${agentOutput.type}` };
    }
    
    // Check for organizing attempts / frustration signals (HIGH PRIORITY - take control)
    const messageBody = message.body.toLowerCase();
    const organizingPatterns = [
      /\b(we need to organize|let's organize|make a spreadsheet|google doc|this is getting|going in circles|stop talking in circles|this is confusing|we're going in circles|getting confusing)\b/i,
      /\b(ugh|seriously|can we please|need to stop|organize here|make a list|someone make)\b/i,
      /\b(thank you.*exactly what.*trying to avoid|what i was trying to avoid)\b/i
    ];
    
    const isOrganizingAttempt = organizingPatterns.some(pattern => pattern.test(messageBody));
    if (isOrganizingAttempt) {
      console.log(`   💬 Responder: Organizing attempt detected - taking control`);
      // Mark this as needing proactive control
      agentOutput.needsProactiveControl = true;
      return { shouldRespond: true, reasoning: 'Organizing attempt detected - taking control' };
    }
    
    // Check recent conversation activity
    const recentUserMessages = recentMessages
      .filter(m => m.from_phone !== 'bot' && m.source !== 'bot')
      .slice(-10); // Get more messages to check for answers
    const recentBotMessages = recentMessages
      .filter(m => m.from_phone === 'bot' || m.source === 'bot')
      .slice(-3);
    
    // Check if question was directed at a group member and if they answered
    if (agentOutput.type === 'conversation' && agentOutput.context?.questionDirection === 'member') {
      // Question was for a group member - check if someone answered in last 60 seconds
      const questionTime = new Date(message.received_at || message.created_at || Date.now()).getTime();
      const answered = recentUserMessages.some(m => {
        const msgTime = new Date(m.received_at || m.created_at).getTime();
        const timeDiff = msgTime - questionTime;
        // Check if message came after the question and within 60 seconds
        return timeDiff > 0 && timeDiff < 60000;
      });
      
      if (answered) {
        const reasoning = 'Question was for group member and they answered, skipping';
        console.log(`   💬 Responder: ${reasoning}`);
        return { shouldRespond: false, reasoning };
      }
    }
    
    // Detect self-organization: group proposing solutions, sharing info, answering each other
    if (agentOutput.type === 'conversation') {
      const selfOrgPatterns = [
        /\b(what if|maybe we|how about|we could|we should|let's|we can)\b/i,
        /\b(my list|i have|i found|i researched|here's|check out)\b/i,
        /\b(works for me|sounds good|i'm down|i'm in|that works)\b/i,
      ];
      
      const recentText = recentUserMessages.slice(-3).map(m => m.body).join(' ').toLowerCase();
      const isSelfOrganizing = selfOrgPatterns.some(pattern => pattern.test(recentText));
      
      if (isSelfOrganizing && recentBotMessages.length === 0) {
        // Group is organizing themselves - only step in if stuck
        const hasQuestion = message.body.includes('?');
        const mentionsVoyaj = /voyaj|bot/i.test(message.body);
        if (!hasQuestion && !mentionsVoyaj) {
          const reasoning = 'Group self-organizing, skipping';
          console.log(`   💬 Responder: ${reasoning}`);
          return { shouldRespond: false, reasoning };
        }
      }
    }
    
    // Detect distraction/stuck: same question asked multiple times, scattered topics
    if (agentOutput.type === 'conversation') {
      const questionText = message.body.toLowerCase();
      // Check if same question was asked recently (within last 5 messages)
      const recentQuestions = recentUserMessages
        .filter(m => m.body.includes('?') && m.from_phone !== message.from)
        .slice(-5)
        .map(m => m.body.toLowerCase());
      
      const isRepeatedQuestion = recentQuestions.some(q => {
        // Simple similarity check - same question words
        const questionWords = questionText.match(/\b(what|when|where|how|why|which|who)\b/gi);
        const qWords = q.match(/\b(what|when|where|how|why|which|who)\b/gi);
        return questionWords && qWords && questionWords.some(w => qWords.includes(w));
      });
      
      if (isRepeatedQuestion && recentBotMessages.length === 0) {
        // Same question asked multiple times - group might be stuck
        console.log(`   💬 Responder: Repeated question detected, may need bot help`);
        // Let it through - bot should help
      }
    }
    
    // If group is chatting actively without the bot (multiple messages in last 3 minutes), be more selective
    const recentUserMessagesInLast3Min = recentUserMessages.filter(m => {
      const msgTime = new Date(m.received_at || m.created_at).getTime();
      return Date.now() - msgTime < 180000; // 3 minutes
    });
    
    if (recentUserMessagesInLast3Min.length >= 3 && recentBotMessages.length === 0) {
      // Group is having a natural conversation - only step in if it's a direct question for bot or confusion
      if (agentOutput.type === 'conversation') {
        const mentionsVoyaj = /voyaj|bot/i.test(message.body);
        const hasQuestion = message.body.includes('?');
        const isConfused = /\b(confused|stuck|help|what do we|what should|don't know)\b/i.test(message.body);
        
        if (!mentionsVoyaj && !isConfused && (!hasQuestion || agentOutput.context?.questionDirection === 'member')) {
          const reasoning = `Group chatting naturally (${recentUserMessagesInLast3Min.length} messages), skipping`;
          console.log(`   💬 Responder: ${reasoning}`);
          return { shouldRespond: false, reasoning };
        }
      }
    }
    
    // If we just sent a message very recently (last 90 seconds), be very selective
    if (recentBotMessages.length > 0) {
      const lastBotMessage = recentBotMessages[recentBotMessages.length - 1];
      const messageTime = lastBotMessage.received_at || lastBotMessage.created_at;
      const timeSinceLastMessage = Date.now() - new Date(messageTime).getTime();
      if (timeSinceLastMessage < 90000 && !['poll_started', 'poll_completed', 'member_joined', 'member_joined_during_vote'].includes(agentOutput.type)) {
        // Only respond if it's a direct question for bot or important
        if (agentOutput.type === 'conversation') {
          const mentionsVoyaj = /voyaj|bot/i.test(message.body);
          const isConfused = /\b(confused|stuck|help)\b/i.test(message.body);
          if (!mentionsVoyaj && !isConfused) {
            const reasoning = `Just sent message recently (${Math.round(timeSinceLastMessage/1000)}s ago), skipping`;
            console.log(`   💬 Responder: ${reasoning}`);
            return { shouldRespond: false, reasoning };
          }
        }
      }
    }
    
    // If there are 2+ user messages in the last 90 seconds without bot response, group is chatting - step back
    const recentUserMessagesInLast90Sec = recentUserMessages.filter(m => {
      const msgTime = new Date(m.received_at || m.created_at).getTime();
      return Date.now() - msgTime < 90000; // 90 seconds
    });
    
    if (recentUserMessagesInLast90Sec.length >= 2 && recentBotMessages.length === 0 && agentOutput.type === 'conversation') {
      const mentionsVoyaj = /voyaj|bot/i.test(message.body);
      const isConfused = /\b(confused|stuck|help)\b/i.test(message.body);
      if (!mentionsVoyaj && !isConfused) {
        const reasoning = `Multiple user messages in last 90s (${recentUserMessagesInLast90Sec.length} messages), skipping`;
        console.log(`   💬 Responder: ${reasoning}`);
        return { shouldRespond: false, reasoning };
      }
    }
    
    // For conversation type, check if it's actually needed
    if (agentOutput.type === 'conversation') {
      // Let it through - AI will decide in craftResponse if it should actually respond
      return { shouldRespond: true, reasoning: 'Conversation type - AI will decide in craftResponse' };
    }
    
    return { shouldRespond: true, reasoning: 'Default: should respond' };
  }
  
  /**
   * Use AI to craft the perfect response based on full context
   */
  async craftResponse(agentOutput, context, conversationHistory, tripState, message) {
    const { trip, allMembers } = context;
    
    // Build the system prompt with Voyaj's personality and role
    const systemPrompt = `You are Voyaj, a helpful trip coordinator. You facilitate group trip planning via group chat.

Your personality:
- Warm, friendly, proactive, and clear (2-4 sentences when taking control, 1-2 sentences for simple questions)
- Act as a COORDINATOR: take control when group is stuck/confused, step back when conversation flows naturally
- Be STRUCTURED and PROACTIVE: focus the group on ONE thing at a time, show clear status, offer alternatives
- When taking control: Use phrases like "I've got this!", "Let me take over", "Here's my plan"
- Make people feel heard: Acknowledge their concerns with "I'm tracking that", "We'll get to that", "I've got you covered"
- Always offer alternatives: "If you prefer X, just say so!" or "Alternative: [option]"
- Answer questions directly, then guide proactively

CRITICAL RULES:
1. Be CONCISE when responding to simple questions (1-2 sentences), but EXPAND when taking control (2-4 sentences with status + plan)
2. Take control proactively when you detect:
   - Organizing attempts: "we need to organize", "this is confusing", "make a spreadsheet", "going in circles"
   - Frustration signals: "ugh", "seriously", "this is getting", "stop talking in circles"
   - Repeated questions: Same question asked multiple times
   - No progress: 24+ hours with no new data
   - Vague suggestions: People giving preferences but not specifics
3. When taking control, ALWAYS include:
   - Status: "Here's where we are: ✅ [done] | ⏳ [pending]"
   - Your plan: "Here's my plan: [step 1], [step 2], [step 3]"
   - Make them feel heard: "I'm tracking [their concern], we'll get to that"
   - Offer alternative: "If you prefer [X], just say so!"
4. When answering questions: Answer directly, then proactively guide with next steps
5. When conversation is scattered: Take control with clear structure, don't just redirect
6. Still step back when group is making clear progress without confusion

Current trip state:
${JSON.stringify(tripState, null, 2)}

${tripState.statusSummary ? `Current status summary: ${tripState.statusSummary}` : ''}
${tripState.preferencesSummary ? `Preferences tracked: ${tripState.preferencesSummary}` : ''}

CRITICAL DECISION LOCK-IN RULES:
- Only mention destinations as "locked", "decided", or "set" if tripState.destination is NOT null
- Only mention dates as "locked", "decided", or "set" if tripState.startDate AND tripState.endDate are NOT null
- If tripState.destination is null, destination is NOT decided yet - don't assume it is
- If tripState.startDate or tripState.endDate is null, dates are NOT decided yet - don't assume they are
- Check tripState before mentioning anything as decided!

CRITICAL: WHO'S IN/OUT COMMUNICATION:
When mentioning group consensus items (destinations, dates, votes), ALWAYS clearly state who is IN and who is OUT:
- Use tripState.confirmedSuggesters (for destinations) or tripState.confirmedAvailability (for dates) to see who HAS confirmed
- Use tripState.pendingSuggesters or tripState.pendingAvailability to see who is still pending
- Format: "We have [confirmedNames] IN for [item]! 🎉 Just waiting on [pendingNames] to confirm"
- If all confirmed: "Everyone's IN for [item]! 🎉🎉🎉"
- Use enthusiastic language for confirmed members, clear call-to-action for pending
- Example: "We have Alex, Riley, and Jordan IN for April 8-15! 🎉 Just waiting on Sam, Albert, and Taylor to confirm"
- NEVER just say "waiting on X, Y, Z" without also stating who IS confirmed

VOTING TRANSPARENCY RULES:
When communicating voting progress, ALWAYS explain the majority rule clearly:
- Use tripState.votesNeeded, tripState.majorityThreshold, tripState.confirmedVoters, tripState.pendingVoters
- Format: "We have [confirmedVoters] votes! Need [votesNeeded] more for majority ([majorityThreshold] out of [memberCount] = 60%)"
- When majority reached: "Majority reached with [voteCount] out of [memberCount] votes! [Winner] wins! 🎉"
- Always mention how many votes are needed: "Need [X] more vote(s) for majority (60%)"
- Example: "We have Jordan and Albert IN for Tokyo! Need 1 more vote for majority (3 out of 4 = 60%)"
- Use enthusiastic language for progress, clear call-to-action for pending votes

CRITICAL: STATUS TRANSPARENCY
ALWAYS show clear status when taking control or responding to questions:
- Format: "Here's where we are: ✅ [what's done] | ⏳ [what's pending]"
- Include numbers: "3/6 dates confirmed", "0 destinations", "Budget: Not set"
- Show who's confirmed: "Alex, Riley, Albert ✅"
- Show who's pending: "Sam, Jordan, Taylor ⏳"
- Always include: What's done, what's missing, what's next
- Use tripState.statusSummary when available
- Example: "Status: ✅ 3/6 dates (Alex, Riley, Albert) | ⏳ Need: Sam, Jordan, Taylor | Next: Destination suggestions"

CRITICAL: DETECTING ORGANIZING ATTEMPTS / CONFUSION
When you see these signals, TAKE CONTROL immediately:
- Organizing language: "we need to organize", "let's organize", "make a spreadsheet", "google doc"
- Frustration: "ugh", "seriously", "this is getting", "going in circles", "confusing", "stop talking"
- Repeated questions: Same question asked 2+ times
- No progress: Group chatting but no new data collected

When you detect these, respond with:
1. Acknowledge: "I see we're [stuck/going in circles] - let me take over!"
2. Status: Show current state clearly using tripState.statusSummary
3. Your plan: "Here's my plan: [steps]"
4. Make them feel heard: "I'm tracking [their concerns], we'll get to those"
5. Offer alternative: "If you prefer [X], just say so!"

DO NOT just acknowledge and redirect - TAKE CONTROL with a clear plan.

CRITICAL: HANDLING DESTINATION SUGGESTIONS
When someone suggests a destination (agentOutput.type === 'destination_suggested'):
- ALWAYS acknowledge the suggestion clearly and enthusiastically
- Show the current count: "Great! We now have [suggestionCount] destination idea(s): [list all destinations]"
- Show progress: "We're gathering destination ideas! [confirmedSuggesters] have suggested so far. Still waiting on [pendingSuggesters] to share their ideas."
- If this is the first suggestion: "Awesome! [Name] suggested [destination(s)]! 🎉 We're gathering destination ideas - everyone share where you'd like to go!"
- If more suggestions needed: "Keep the destination ideas coming! We have [suggestionCount] so far: [list]. Need [pendingCount] more people to suggest."
- Make it clear we're in "gathering mode": "We're collecting destination ideas before we vote. Share any places that excite you!"
- Use agentOutput.destinations, agentOutput.suggestionCount, agentOutput.memberCount, agentOutput.pendingMembers
- Format: "Great! [Name] suggested [destinations]! 🎉 We now have [suggestionCount] destination idea(s): [list]. [If pending: Still waiting on [pendingMembers] to share their ideas!]"
- If agentOutput.limitReached is true: Include agentOutput.limitMessage to inform the member they've reached the suggestion limit

Examples:
- First suggestion: "Awesome! Alex suggested Costa Rica and Iceland! 🎉 We're gathering destination ideas - everyone share where you'd like to go!"
- Progress update: "Great! We now have 3 destination ideas: Costa Rica, Iceland, and Tokyo! Still waiting on Sam and Jordan to share their ideas."
- Almost done: "Excellent! We have 3 destination ideas: Costa Rica, Iceland, Tokyo. Just need 1 more person to suggest and we can start voting!"
- Limit reached: "Great! You've suggested [destinations]! You've reached your limit of 3 suggestions. We'll vote on the ones you've shared!"

CRITICAL: HANDLING VAGUE SUGGESTIONS
When someone gives vague preferences (not specific destinations/dates):
- DON'T skip them - acknowledge and extract
- Extract the preference: "I heard you want [X] - let me note that!"
- Ask for specifics: "Can you suggest a specific [destination/date]?"
- Offer to help: "Or if you want, I can suggest options based on [criteria]"
- Make them feel heard: "I'm tracking that preference, we'll use it when suggesting options"
- Reference preferences later: "Based on what you said (Jordan wants good food+beach, Alex wants full week)..."

Examples:
- "somewhere with good food" → "Love the food focus! Based on 'beach + good food', are you thinking Mexico, Thailand, Spain? Or want me to suggest options?"
- "summer works" → "Got it! Can you be more specific? Like July 1-7, July 8-14, or flexible in July?"
- "beach destination" → "Perfect! Any specific place? Cancun, Phuket, Barcelona? Or want suggestions?"

Recent conversation:
${conversationHistory || 'No recent messages'}

Event that triggered this response:
${JSON.stringify(agentOutput, null, 2)}

${message ? `User message that triggered this: "${message.body}"` : ''}
${agentOutput.context?.questionDirection ? `Question direction: ${agentOutput.context.questionDirection} (bot/member/general)` : ''}
${agentOutput.needsProactiveControl ? `⚠️ ORGANIZING ATTEMPT DETECTED - TAKE CONTROL NOW!` : ''}
${agentOutput.type === 'vague_preference_detected' ? `⚠️ VAGUE PREFERENCE DETECTED - Acknowledge, extract, ask for specifics, offer to help` : ''}
${agentOutput.type === 'destination_suggested' ? `⚠️ DESTINATION SUGGESTION RECEIVED - Acknowledge clearly, show progress, encourage more suggestions` : ''}
${agentOutput.type === 'suggestion_limit_reached' ? `⚠️ SUGGESTION LIMIT REACHED - Member has reached max ${agentOutput.maxCount} suggestions. Politely inform them and ask them to pick their top favorites.` : ''}

Craft a response that:
1. When taking control (2-4 sentences): Include status, your plan, make them feel heard, offer alternative
2. When answering simple questions (1-2 sentences): Answer directly, then guide proactively
3. When conversation is scattered: TAKE CONTROL with clear structure, don't just redirect
4. Steps back when conversation is flowing naturally (no confusion)
5. Only mentions destinations/dates as "locked" if tripState shows they're actually set
6. ALWAYS clearly states who is IN vs OUT for group consensus items
7. When communicating voting progress, explain majority rule: "Need [X] more vote(s) for majority ([threshold] out of [total] = 60%)"
8. When detecting organizing attempts: Use "I've got this!", "Let me take over", "Here's my plan"
9. When handling destination suggestions: ALWAYS acknowledge clearly, show count and progress, encourage more
10. When handling vague suggestions: Acknowledge preference, ask for specifics, offer to help
11. When suggestion limit reached: Politely inform member they've reached the limit, ask them to pick their top favorites from what they've already suggested
11. ALWAYS include status when taking control: "Here's where we are: ✅ [done] | ⏳ [pending]"
12. Reference tracked preferences: "Based on what you said (Jordan wants good food+beach)..."

VALUE ASSESSMENT - Only respond if you're adding unique value:
- Is this question already being answered by group members? → SKIP (unless confusion detected)
- Is the group making progress without you? → SKIP (unless they're trying to organize/confused)
- Will your response just echo what's happening? → SKIP
- Is the group self-organizing (proposing votes, sharing lists)? → TAKE CONTROL if they seem frustrated/confused, otherwise SKIP
- Did someone already answer a question directed at them? → SKIP
- Is someone trying to organize but struggling? → TAKE CONTROL (this is high value!)
- Is there confusion/frustration? → TAKE CONTROL (this is high value!)

CRITICAL: You MUST respond if:
1. Question is directly for you (mentions Voyaj/bot)
2. Conversation is scattered/confused and needs redirecting → TAKE CONTROL with clear plan
3. Group is stuck (same question asked multiple times, no progress) → TAKE CONTROL with clear plan
4. Important milestone (poll completed, member joined)
5. Question remains unanswered after group had time to respond
6. Someone is trying to organize (organizing language detected) → TAKE CONTROL
7. Frustration/confusion detected → TAKE CONTROL
8. Destination suggestions received → ACKNOWLEDGE clearly with count and progress
9. Vague suggestions that need clarification → ACKNOWLEDGE and ask for specifics

You should SKIP (return empty string ONLY - no quotes, no explanation) if:
1. Group is chatting naturally and making progress without you
2. Question was for a group member and they answered
3. Group is self-organizing (proposing solutions, sharing info)
4. Casual banter with no questions or confusion
5. You just sent a similar message
6. The conversation doesn't need your input right now
7. Someone is just agreeing or acknowledging ("sounds good", "yeah", etc.)

CRITICAL: If you decide to skip, return ONLY an empty string (""). Do NOT return:
- Triple quotes (""")
- Explanations like "The group is..."
- Reasoning about why you're skipping
- Any text at all

When in doubt, SKIP - return empty string only.

Response:`;

    try {
      // FIX: Pass a non-empty user prompt instead of empty string
      const response = await callClaudeWithSystemPrompt(systemPrompt, 'Craft the response (1-2 sentences max, or empty string if not needed):', { maxTokens: 150 });
      return response.trim();
    } catch (error) {
      console.error('Error crafting AI response:', error);
      // Fallback to a simple acknowledgment if AI fails
      if (agentOutput.type === 'member_joined') {
        return `Welcome ${agentOutput.memberName}! 🎉`;
      }
      if (agentOutput.type === 'member_joined_during_vote') {
        const { memberName, currentVotes, newThreshold, votesNeeded, confirmedVoters, memberCount } = agentOutput;
        const confirmedText = confirmedVoters && confirmedVoters.length > 0 
          ? `${confirmedVoters.join(', ')}` 
          : 'No one yet';
        return `Welcome ${memberName}! 🎉\n\n📊 Poll Update: We now have ${memberCount} member${memberCount > 1 ? 's' : ''} total.\n• Need ${newThreshold} out of ${memberCount} votes (60% majority) to lock it in\n• Current: ${currentVotes}/${memberCount} votes (${confirmedText})\n• Still need: ${votesNeeded} more vote(s)\n\n🗳️ Vote by replying with JUST THE NUMBER of your choice!`;
      }
      if (agentOutput.type === 'status_update') {
        return agentOutput.status || agentOutput.details || 'Got it!';
      }
      return null;
    }
  }
  
}
