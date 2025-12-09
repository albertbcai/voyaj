import { CoordinatorAgent } from './agents/coordinator.js';
import { VotingAgent } from './agents/voting.js';
import { ParserAgent } from './agents/parser.js';
import { ResponderAgent } from './agents/responder.js';
import { contextBuilder } from './context/contextBuilder.js';
import * as db from './db/queries.js';
import { twilioClient } from './utils/twilio.js';
import { callClaude } from './utils/claude.js';
import { logError } from './db/queries.js';
import { tripEvents, EVENTS } from './state/eventEmitter.js';

class Orchestrator {
  constructor() {
    // Register all agents
    this.agents = {
      coordinator: new CoordinatorAgent(),
      voting: new VotingAgent(),
      parser: new ParserAgent(),
      responder: new ResponderAgent(), // Social face of Voyaj
    };
    
    // Listen for stage changes and send appropriate messages
    this.setupStageChangeHandlers();
  }
  
  setupStageChangeHandlers() {
    tripEvents.on(EVENTS.STAGE_CHANGED, async ({ tripId, from, to }) => {
      console.log(`   📢 Stage changed: ${from} → ${to} for trip ${tripId}`);
      try {
        await this.handleStageChange(tripId, from, to);
      } catch (error) {
        console.error(`   ❌ Orchestrator: Error in stage change handler:`, error);
      }
    });
  }
  
  async handleStageChange(tripId, from, to) {
    try {
      console.log(`   📢 Orchestrator: handleStageChange called for ${from} → ${to}`);
      const trip = await db.getTrip(tripId);
      if (!trip) {
        console.log(`   ⚠️  Orchestrator: Trip ${tripId} not found`);
        return;
      }
      
      // Execute the action defined in the state machine for the new stage
      const { STAGES } = await import('./state/stateMachine.js');
      const newStageConfig = STAGES[to];
      console.log(`   📢 Orchestrator: Checking action for stage ${to}, action exists: ${!!newStageConfig?.action}`);
      if (newStageConfig && newStageConfig.action) {
        console.log(`   📢 Orchestrator: Executing action for stage ${to}`);
        // Actions now return structured outputs - format with responder
        const actionResult = await newStageConfig.action(trip, this.agents);
        if (actionResult && actionResult.output) {
          const responder = this.agents.responder;
          // Build proper context with all members
          const allMembers = await db.getMembers(tripId);
          const context = {
            trip,
            allMembers,
          };
          // Create a dummy message for responder (won't be used, but needed for signature)
          const dummyMessage = { from: '', body: '', groupChatId: trip.group_chat_id };
          await responder.formatAndSend(actionResult.output, context, dummyMessage);
        }
        console.log(`   ✅ Orchestrator: Action executed successfully`);
      } else {
        console.log(`   ⚠️  Orchestrator: No action defined for stage ${to}`);
      }
    } catch (error) {
      console.error(`   ❌ Orchestrator: Error in handleStageChange:`, error);
    }
  }

  async process(tripId, message) {
    try {
      // Get trip
      const trip = await db.getTrip(tripId);
      if (!trip) {
        throw new Error(`Trip ${tripId} not found`);
      }

      console.log(`   🎯 Orchestrator: Processing message for trip ${tripId} (stage: ${trip.stage})`);

      // Save message to database
      await db.createMessage(tripId, message.from, message.body, message.groupChatId, message.source || 'sms');

      // Detect intent - AI-first with rule-based fast-path for obvious cases
      let intent = this.detectIntentFastPath(trip, message);
      if (intent) {
        console.log(`   🧠 Intent Detection (Fast-path): ${intent.type} → Agent: ${intent.agent}`);
      } else {
        console.log(`   🧠 Intent Detection: Using AI...`);
        intent = await this.detectIntentWithAI(trip, message);
        console.log(`   🧠 Intent Detection (AI): ${intent.type} → Agent: ${intent.agent}`);
      }

      // Build context
      const context = await contextBuilder.build(tripId, message.from, intent);
      console.log(`   📦 Context: Built for ${intent.agent} agent (${context.allMembers?.length || 0} members)`);

      // Select agent
      const agent = this.agents[intent.agent];
      console.log(`   🤖 Agent: ${intent.agent} handling message`);

      // Execute agent
      const result = await agent.handle(context, message);
      
      // If agent skipped (not a valid action), use responder for conversation
      if (result.skip) {
        console.log(`   ⏭️  Agent skipped, using responder for conversation`);
        const responder = this.agents.responder;
        const responderContext = await contextBuilder.build(tripId, message.from, { type: 'conversation', agent: 'responder' });
        // Use output from result if provided, otherwise create default
        const conversationOutput = result.output || {
          type: 'conversation',
          sendTo: 'individual',
        };
        return await responder.formatAndSend(conversationOutput, responderContext, message);
      }

      // Handle handoffs
      if (result.handoff) {
        console.log(`   🔀 Handoff: ${intent.agent} → ${result.handoff}`);
        const newAgent = this.agents[result.handoff];
        return await newAgent.handle(context, message);
      }

      // If agent returned structured output, format it with responder
      if (result.output && result.output.type) {
        console.log(`   📝 Agent returned structured output, formatting with responder`);
        const responder = this.agents.responder;
        return await responder.formatAndSend(result.output, context, message);
      }

      if (result.success) {
        console.log(`   ✅ Agent completed successfully`);
      }

      return result;
    } catch (error) {
      console.error('   ❌ Orchestrator error:', error);
      await this.handleError(tripId, message, error);
      return { success: false, error: error.message };
    }
  }

  // Fast-path rule-based detection for obvious cases (single words, clear patterns)
  // Returns null if unclear, triggering AI detection
  detectIntentFastPath(trip, message) {
    const body = message.body.toLowerCase().trim();
    
    // Only handle VERY obvious cases - everything else goes to AI
    
    // Obvious numeric vote in voting stage
    if ((trip.stage === 'voting_destination' || trip.stage === 'voting_dates') && /^\d+$/.test(body)) {
      return { type: 'vote', agent: 'voting' };
    }
    
    // Obvious single-word name in collecting_members stage (very simple)
    if (trip.stage === 'collecting_members') {
      if (body.length > 0 && body.length <= 20 && body.split(/\s+/).length === 1 && !body.includes('?') && !body.includes('@')) {
        return { type: 'member_join', agent: 'coordinator' };
      }
    }
    
    // Obvious commands
    if (body.startsWith('@bot') || body.startsWith('bot ')) {
      return { type: 'command', agent: 'coordinator' };
    }
    
    // Everything else is unclear - use AI
    return null;
  }

  looksLikeDestinationSuggestion(text) {
    const lower = text.toLowerCase().trim();
    
    // Too short or too long to be a destination
    if (lower.length < 2 || lower.length > 50) return false;
    
    // Common casual phrases that aren't destinations
    const casualPhrases = [
      'ok', 'sounds good', 'yeah', 'cool', 'nice', 'awesome', 'great',
      'i agree', 'me too', 'same', 'hmm', 'wait', 'what', 'how', 'when',
      'budget', 'thinking', 'wondering', 'questions', 'also', 'and', 'but'
    ];
    if (casualPhrases.some(phrase => lower.includes(phrase) && lower.length < 30)) {
      return false;
    }
    
    // Questions aren't destinations
    if (lower.includes('?')) return false;
    
    // Multiple sentences suggest conversation, not a destination
    if (lower.split(/[.!?]/).length > 2) return false;
    
    // If it's a single word or short phrase (2-3 words), likely a destination
    const wordCount = lower.split(/\s+/).length;
    if (wordCount <= 3 && wordCount >= 1) {
      // But exclude common question words
      const questionWords = ['what', 'where', 'when', 'how', 'why', 'who', 'which'];
      const firstWord = lower.split(/\s+/)[0];
      if (!questionWords.includes(firstWord)) {
        return true;
      }
    }
    
    // If it mentions a known destination pattern (city, country names)
    const destinationPatterns = [
      /\b(tokyo|paris|london|bali|spain|italy|greece|portugal|japan|france|thailand|vietnam|mexico|iceland|norway|sweden|denmark|germany|switzerland|austria|croatia|morocco|turkey|egypt|dubai|singapore|hong kong|south korea|taiwan|philippines|indonesia|malaysia|new zealand|australia|brazil|argentina|chile|peru|colombia|costa rica|panama|belize|guatemala|honduras|nicaragua)\b/i
    ];
    if (destinationPatterns.some(pattern => pattern.test(lower))) {
      return true;
    }
    
    return false;
  }

  async detectIntentWithAI(trip, message) {
    // Primary intent detection using AI
    try {
      const allMembers = await db.getMembers(trip.id);
      const memberNames = allMembers.map(m => m.name).join(', ');
      
      // Get context about current state
      let stateContext = '';
      if (trip.stage === 'planning') {
        const suggestionCount = await db.getDestinationSuggestionCount(trip.id);
        const availabilityCount = await db.getDateAvailabilityCount(trip.id);
        stateContext = `Currently collecting both destinations (${suggestionCount} suggestions) and dates (${availabilityCount} submissions).`;
      } else if (trip.stage === 'collecting_destinations') {
        const suggestionCount = await db.getDestinationSuggestionCount(trip.id);
        stateContext = `Currently collecting destination suggestions (${suggestionCount} collected so far).`;
      } else if (trip.stage === 'collecting_dates') {
        const availabilityCount = await db.getDateAvailabilityCount(trip.id);
        stateContext = `Currently collecting date availability (${availabilityCount} submissions so far).`;
      } else if (trip.stage === 'voting_destination' || trip.stage === 'voting_dates') {
        const votes = await db.getVotes(trip.id, trip.stage === 'voting_destination' ? 'destination' : 'dates');
        stateContext = `Currently voting (${votes.length} votes cast so far).`;
      }
      
      const prompt = `You are analyzing a group chat message to determine user intent for a trip planning app.

Trip stage: ${trip.stage}
${stateContext}
Message: "${message.body}"
${memberNames ? `Group members: ${memberNames}` : 'No members yet'}

Determine the user's intent. Reply with JSON only:
{
  "intent": "member_join" | "destination_suggestion" | "date_availability" | "vote" | "flight" | "question" | "conversation",
  "confidence": "high" | "medium" | "low",
  "reasoning": "brief explanation"
}

Intent definitions:
- member_join: User is providing their name to join the trip (simple name, no questions)
- destination_suggestion: User suggesting a travel destination (city, country, region)
- date_availability: User providing when they're available (dates, date ranges, "flexible")
- vote: User voting on a poll (numeric vote like "1" or "2", or natural language vote)
- flight: User reporting flight booking information
- question: User asking a question (has "?", question words, or seeking information)
- conversation: General chat, acknowledgment, or unclear intent

Be smart about context:
- "march or april" in planning stage → date_availability
- "Tokyo or Shanghai" in planning stage → destination_suggestion
- "1" in voting stage → vote
- "Alex" when no member exists → member_join
- "What dates work?" → question
- "sounds good" → conversation`;

      const response = await callClaude(prompt, { maxTokens: 200 });
      const cleaned = response.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const parsed = JSON.parse(cleaned);
      
      const intentType = parsed.intent || 'conversation';
      console.log(`   🧠 AI Intent Reasoning: ${parsed.reasoning || 'No reasoning provided'} (confidence: ${parsed.confidence || 'unknown'})`);

      return {
        type: intentType,
        agent: this.mapIntentToAgent(intentType),
      };
    } catch (error) {
      console.error('AI intent detection failed:', error);
      // Fallback to rule-based detection
      const fallbackIntent = this.detectIntentFallback(trip, message);
      return fallbackIntent || { type: 'conversation', agent: 'coordinator' };
    }
  }
  
  // Fallback rule-based detection (used if AI fails)
  detectIntentFallback(trip, message) {
    const body = message.body.toLowerCase().trim();
    
    // Very obvious cases only
    if (trip.stage === 'voting_destination' || trip.stage === 'voting_dates') {
      if (/^\d+$/.test(body.trim())) {
        return { type: 'vote', agent: 'voting' };
      }
    }
    
    if (trip.stage === 'collecting_members') {
      if (body.length > 0 && body.length <= 30 && body.split(/\s+/).length <= 3 && !body.includes('?')) {
        return { type: 'member_join', agent: 'coordinator' };
      }
    }
    
    return null;
  }

  mapIntentToAgent(intentType) {
    const mapping = {
      member_join: 'coordinator',
      destination_suggestion: 'voting',
      date_availability: 'parser',
      vote: 'voting',
      flight: 'parser',
      question: 'coordinator',
      conversation: 'coordinator',
      command: 'coordinator',
    };
    return mapping[intentType] || 'coordinator';
  }

  async handleError(tripId, message, error) {
    // Log error
    await logError(tripId, error, { message: message.body, from: message.from });

    // Send fallback response
    try {
      await twilioClient.sendSMS(
        message.from,
        "I didn't quite catch that. Can you rephrase? Or visit voyaj.app for help."
      );
    } catch (smsError) {
      console.error('Failed to send error SMS:', smsError);
    }
  }
}

export const orchestrator = new Orchestrator();


