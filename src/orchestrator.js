import { CoordinatorAgent } from './agents/coordinator.js';
import { VotingAgent } from './agents/voting.js';
import { ParserAgent } from './agents/parser.js';
import { contextBuilder } from './context/contextBuilder.js';
import * as db from './db/queries.js';
import { twilioClient } from './utils/twilio.js';
import { callClaude } from './utils/claude.js';
import { logError } from './db/queries.js';

class Orchestrator {
  constructor() {
    // Register all agents
    this.agents = {
      coordinator: new CoordinatorAgent(),
      voting: new VotingAgent(),
      parser: new ParserAgent(),
    };
  }

  async process(tripId, message) {
    try {
      // Get trip
      const trip = await db.getTrip(tripId);
      if (!trip) {
        throw new Error(`Trip ${tripId} not found`);
      }

      // Save message to database
      await db.createMessage(tripId, message.from, message.body, message.groupChatId, message.source || 'sms');

      // Detect intent
      const intent = this.detectIntent(trip, message) || await this.detectIntentWithAI(trip, message);

      // Build context
      const context = await contextBuilder.build(tripId, message.from, intent);

      // Select agent
      const agent = this.agents[intent.agent];

      // Execute agent
      const result = await agent.handle(context, message);
      
      // If agent skipped (not a valid action), fall back to conversation
      if (result.skip) {
        const coordinator = this.agents.coordinator;
        return await coordinator.handleGeneral(context, message);
      }

      // Handle handoffs
      if (result.handoff) {
        const newAgent = this.agents[result.handoff];
        return await newAgent.handle(context, message);
      }

      return result;
    } catch (error) {
      console.error('Orchestrator error:', error);
      await this.handleError(tripId, message, error);
      return { success: false, error: error.message };
    }
  }

  detectIntent(trip, message) {
    const body = message.body.toLowerCase().trim();

    // Member joining
    if (trip.stage === 'collecting_members' && body.length < 30 && !body.includes('@')) {
      return { type: 'member_join', agent: 'coordinator' };
    }

    // Voting
    if (trip.stage === 'voting_destination' || trip.stage === 'voting_dates') {
      return { type: 'vote', agent: 'voting' };
    }

    // Flight booking (check this BEFORE voting, as flight messages shouldn't be votes)
    if (/\b(booked|flight|AA|UA|Delta|United|American|Southwest|JetBlue|DL|just booked|i booked)\b/i.test(body)) {
      return { type: 'flight', agent: 'parser' };
    }

    // Commands
    if (body.startsWith('@bot') || body.startsWith('bot')) {
      return { type: 'command', agent: 'coordinator' };
    }

    // Default: conversation
    return { type: 'conversation', agent: 'coordinator' };
  }

  async detectIntentWithAI(trip, message) {
    // Only called if rules don't match
    try {
      const prompt = `Trip stage: ${trip.stage}
Message: "${message.body}"

What is the user's intent?
- member_join: User is joining with their name
- vote: User is voting on something
- flight: User reporting flight booking
- question: User asking a question
- conversation: General chat

Reply with just the intent name.`;

      const response = await callClaude(prompt, { maxTokens: 50 });
      const intentType = response.trim().toLowerCase();

      return {
        type: intentType,
        agent: this.mapIntentToAgent(intentType),
      };
    } catch (error) {
      console.error('AI intent detection failed:', error);
      // Fallback to conversation
      return { type: 'conversation', agent: 'coordinator' };
    }
  }

  mapIntentToAgent(intentType) {
    const mapping = {
      member_join: 'coordinator',
      vote: 'voting',
      flight: 'parser',
      question: 'coordinator',
      conversation: 'coordinator',
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


