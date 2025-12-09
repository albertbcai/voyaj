import { BaseAgent } from './base.js';
import * as db from '../db/queries.js';
import { twilioClient } from '../utils/twilio.js';
import { callClaudeWithSystemPrompt } from '../utils/claude.js';
import { emitEvent, EVENTS } from '../state/eventEmitter.js';
import { checkStateTransitions } from '../state/stateMachine.js';

export class CoordinatorAgent extends BaseAgent {
  constructor() {
    super('Coordinator', '👤');
  }

  async handle(context, message) {
    const { trip, member, allMembers } = context;

    this.logEntry('handle', context, message);
    
    try {
      this.log('info', `Handling message in stage "${trip.stage}"`);

    // Handle based on trip stage
    switch (trip.stage) {
      case 'created':
        console.log(`   👤 Coordinator: First member joining`);
        return await this.handleFirstMember(context, message);

      case 'collecting_members':
        // Enhanced question detection
        const body = message.body.toLowerCase().trim();
        const hasQuestionMark = message.body.includes('?');
        const hasQuestionWords = /\b(what|when|where|how|why|can|could|would|should|does|do|will|is|are|which|who|whom|whose|if|whether|clarify|clarification|explain|understand|know|wondering|wonder|ask|asking|question|questions)\b/i.test(message.body);
        const hasQuestionPhrases = /\b(when do|when will|when are|how do|how will|how are|what do|what will|what are|can we|should we|do we|are we|will we|need to|should know|want to know|just to clarify|to clarify|to understand)\b/i.test(body);
        const isQuestion = hasQuestionMark || hasQuestionWords || hasQuestionPhrases;
        
        const isTooLong = body.length > 30;
        const hasMultipleWords = body.split(/\s+/).length > 3;
        const hasVoyaj = body.toLowerCase().includes('voyaj');
        
        // If it's a question or casual conversation, handle as general
        if (isQuestion || hasVoyaj || (hasMultipleWords && !isQuestion)) {
          console.log(`   👤 Coordinator: Message in collecting_members but not a name, handling as conversation`);
          return await this.handleGeneral(context, message);
        }
        
        // Only treat as member join if it looks like a simple name
        if (!isTooLong && !hasMultipleWords && !body.includes('@')) {
          console.log(`   👤 Coordinator: Member join attempt - calling handleMemberJoin`);
          const result = await this.handleMemberJoin(context, message);
          console.log(`   👤 Coordinator: handleMemberJoin returned:`, result?.success, result?.output?.type);
          return result;
        }
        
        // Fallback to general conversation
        console.log(`   👤 Coordinator: Unclear intent, handling as conversation`);
        return await this.handleGeneral(context, message);

      case 'planning':
        // Extract budget and accommodation preferences if mentioned
        if (member) {
          await this.extractBudgetAndAccommodationPreferences(context, message);
        }
        
        // Flexible planning stage - can accept both destination suggestions and date availability
        // First, check if this is a simple name (member trying to join)
        const bodyForPlanning = message.body.toLowerCase().trim();
        const isSimpleName = !member && 
                            bodyForPlanning.length > 0 && 
                            bodyForPlanning.length <= 30 && 
                            bodyForPlanning.split(/\s+/).length <= 3 &&
                            !bodyForPlanning.includes('?') &&
                            !/\b(what|when|where|how|why|can|could|would|should|does|do|will|is|are|voyaj|bot|confused|wait|already)\b/i.test(bodyForPlanning);
        
        if (isSimpleName) {
          console.log(`   👤 Coordinator: Simple name detected in planning stage, handling member join`);
          return await this.handleMemberJoin(context, message);
        }
        
        // Check question direction - is it for bot or for a group member? (AI-powered)
        const questionDirection = await this.detectQuestionDirection(message.body, allMembers);
        
        // Only route to responder if:
        // 1. Question is directly for bot (mentions Voyaj/bot)
        // 2. Question is general trip planning with no specific recipient
        // 3. Question is for a group member BUT we'll let responder check if it was answered
        const mentionsVoyajPlanning = /voyaj|bot/i.test(message.body);
        const hasQuestionMarkPlanning = message.body.includes('?');
        const isGeneralQuestion = /\b(what|when|where|how|why|can|could|would|should|does|do|will|is|are)\b/i.test(bodyForPlanning);
        
        if (mentionsVoyajPlanning || (hasQuestionMarkPlanning && questionDirection === 'bot') || (hasQuestionMarkPlanning && questionDirection === 'general' && isGeneralQuestion)) {
          console.log(`   👤 Coordinator: Question for bot or general trip planning, routing to responder`);
          // Get current state to guide directive response
          const hasDestination = !!trip.destination;
          const hasDates = !!(trip.start_date && trip.end_date);
          const suggestionCount = await db.getDestinationSuggestionCount(trip.id);
          const availabilityCount = await db.getDateAvailabilityCount(trip.id);
          const memberCount = allMembers ? allMembers.length : 0;
          
          return {
            success: true,
            output: {
              type: 'conversation',
              context: {
                stage: 'planning',
                hasDestination,
                hasDates,
                suggestionCount,
                availabilityCount,
                memberCount,
                destination: trip.destination,
                startDate: trip.start_date,
                endDate: trip.end_date,
                members: allMembers.map(m => m.name),
                questionDirection, // Pass direction to responder
              },
              sendTo: 'group',
            },
          };
        } else if (questionDirection === 'member') {
          // Question is for a specific group member - let responder check if it was answered
          console.log(`   👤 Coordinator: Question directed at group member, routing to responder to check if answered`);
          return {
            success: true,
            output: {
              type: 'conversation',
              context: {
                stage: 'planning',
                hasDestination: !!trip.destination,
                hasDates: !!(trip.start_date && trip.end_date),
                questionDirection: 'member', // Signal this is for a member
              },
              sendTo: 'group',
            },
          };
        }
        
        // Use AI to determine if this is about dates or destinations
        const dateOrDestination = await this.detectDateVsDestination(message.body, trip);
        
        if (dateOrDestination === 'date') {
          console.log(`   👤 Coordinator: AI detected date availability, handing off to parser`);
          return { handoff: 'parser' };
        } else if (dateOrDestination === 'destination') {
          console.log(`   👤 Coordinator: AI detected destination suggestion, handing off to voting`);
          return { handoff: 'voting' };
        } else {
          // Unclear - treat as conversation
          console.log(`   👤 Coordinator: AI couldn't determine date vs destination, treating as conversation`);
          return await this.handleGeneral(context, message);
        }

      case 'collecting_destinations':
        // Check if this is a question or directed at Voyaj - if so, respond
        // Otherwise, let orchestrator route it (it will filter casual messages)
        const bodyForDest = message.body.toLowerCase();
        const isQuestionForDest = /\b(what|when|where|how|why|can|could|would|should|does|do|will|is|are|voyaj|bot)\b/i.test(bodyForDest);
        const hasQuestionMarkForDest = message.body.includes('?');
        const mentionsVoyaj = /voyaj|bot/i.test(message.body);
        
        if (isQuestionForDest || hasQuestionMarkForDest || mentionsVoyaj) {
          console.log(`   👤 Coordinator: Question or mention of Voyaj, responding`);
          return await this.handleGeneral(context, message);
        }
        
        // Casual conversation - ignore it (don't respond)
        console.log(`   👤 Coordinator: Casual conversation in collecting_destinations, ignoring`);
        return { success: true, ignored: true }; // Success but no response sent

      case 'collecting_dates':
        // Hand off to parser agent for date availability
        console.log(`   👤 Coordinator: Handing off to parser agent for date availability`);
        return { handoff: 'parser' };

      case 'voting_destination':
      case 'voting_dates':
        // Hand off to voting agent
        console.log(`   👤 Coordinator: Handing off to voting agent`);
        return { handoff: 'voting' };

      case 'tracking_flights':
      case 'destination_set':
      case 'dates_set':
        console.log(`   👤 Coordinator: Tracking flights or planning stage`);
        return await this.handlePlanning(context, message);

      default:
        this.log('info', 'General conversation');
        const result = await this.handleGeneral(context, message);
        this.logExit('handle', result);
        return result;
    }
    } catch (error) {
      await this.logError(error, context, message, { method: 'handle' });
      throw error;
    }
  }

  async handleFirstMember(context, message) {
    const { trip } = context;

    // Check if this is actually the first member (trip might have been created but no one joined yet)
    const memberCount = await db.getMemberCount(trip.id);
    
    if (memberCount > 0) {
      // Trip already has members, but stage is still 'created' - transition to collecting_members
      await db.updateTrip(trip.id, { stage: 'collecting_members', stage_entered_at: new Date() });
      // Don't send welcome message again - just handle as member join
      return await this.handleMemberJoin(context, message);
    }

    // This is truly the first member - send welcome message
    // IMPORTANT: Send to the sender since there are no members yet (can't use sendToGroup)
    await db.updateTrip(trip.id, { stage: 'collecting_members', stage_entered_at: new Date() });
    
    return {
      success: true,
      output: {
        type: 'conversation',
        message: "What's up! 🎉 Voyaj here - I'm gonna help you all plan an awesome trip.\n\nFirst things first: reply with your name so I know who's in. Once we hit 2 people, we'll start picking where to go!\n\nReady? Let's do this! 🚀",
        sendTo: 'individual',
      },
    };
  }

  async handleMemberJoin(context, message) {
    const { trip } = context;
    const name = message.body.trim();

    console.log(`   👤 Coordinator: handleMemberJoin called - name: "${name}", trip: ${trip.id}, stage: ${trip.stage}`);

    // Check if already a member
    if (context.member) {
      // Already joined, this might be a different message
      // But if it's a short name-like message, they might be trying to join again
      if (message.body.trim().length < 30 && !message.body.includes(' ')) {
        return {
          success: true,
          output: {
            type: 'conversation',
            message: `You're already in this trip as ${context.member.name}! What can I help with?`,
            sendTo: 'individual',
          },
        };
      }
      return await this.handleGeneral(context, message);
    }

    // Use AI to validate if this is actually a name (not a question, destination, etc.)
    const isLikelyName = await this.validateNameWithAI(name, context.allMembers);

    if (!isLikelyName) {
      // This doesn't look like a name - treat as general conversation
      console.log(`   👤 Coordinator: Message doesn't look like a name, treating as conversation`);
      return await this.handleGeneral(context, message);
    }

    // Add as member
    console.log(`   👤 Coordinator: Creating member - trip: ${trip.id}, phone: ${message.from}, name: "${name}"`);
    const member = await db.createMember(trip.id, message.from, name);
    console.log(`   ✅ Coordinator: Member created - id: ${member.id}, name: ${member.name}`);

    const memberCount = await db.getMemberCount(trip.id);
    const allMembers = await db.getMembers(trip.id);
    console.log(`   👤 Coordinator: Total members now: ${memberCount}`);

    emitEvent(EVENTS.MEMBER_JOINED, { tripId: trip.id, memberId: member.id, name });

    // Check if member joined during voting - need to update threshold
    if (trip.stage === 'voting_destination' || trip.stage === 'voting_dates') {
      const pollType = trip.stage === 'voting_destination' ? 'destination' : 'dates';
      const votes = await db.getVotes(trip.id, pollType);
      const currentVotes = votes.length;
      const oldThreshold = Math.ceil((memberCount - 1) * 0.6);
      const newThreshold = Math.ceil(memberCount * 0.6);
      const votesNeeded = Math.max(0, newThreshold - currentVotes);
      const confirmedVoters = allMembers
        .filter(m => votes.some(v => v.member_id === m.id))
        .map(m => m.name);
      
      return {
        success: true,
        output: {
          type: 'member_joined_during_vote',
          memberName: name,
          memberCount,
          pollType,
          currentVotes,
          newThreshold,
          votesNeeded,
          confirmedVoters,
          thresholdChanged: oldThreshold !== newThreshold,
          sendTo: 'group',
        },
      };
    }

    // If enough people, transition to collecting destinations
    if (memberCount >= 2) {
      await this.startDestinationCollection(trip);
      // Return structured output for responder to format
      return {
        success: true,
        output: {
          type: 'member_joined',
          memberName: name,
          memberCount,
          allMembers,
          sendTo: 'group',
        },
      };
    } else {
      // Return structured output for status update
      const memberNames = allMembers.map(m => m.name).join(', ');
      const needed = 2 - memberCount;
      return {
        success: true,
        output: {
          type: 'status_update',
          status: `We have ${memberCount} people: ${memberNames}.`,
          details: `Need ${needed} more to start planning! Reply with your name to join.`,
          sendTo: 'group',
        },
      };
    }
  }

  async startDestinationCollection(trip) {
    // Trigger state transition - the state machine action will send the message
    // Make sure we check transitions after a small delay to ensure member count is updated
    await checkStateTransitions(trip.id);
    // Also check again in case the first check didn't catch it
    await new Promise(resolve => setTimeout(resolve, 100));
    await checkStateTransitions(trip.id);
  }

  async handlePlanning(context, message) {
    const body = message.body.toLowerCase();

    if ((body.includes('who') && body.includes('book')) || body.includes('flight')) {
      return await this.showFlightStatus(context);
    }

    if (body.includes('plan') || body.includes('itinerary')) {
      return await this.showItinerary(context);
    }

    // General response with context
    return await this.handleGeneral(context, message);
  }

  async showFlightStatus(context) {
    const { trip, allMembers } = context;
    const flights = await db.getFlights(trip.id);
    const bookedCount = flights.length;
    const totalMembers = allMembers.length;

    return {
      success: true,
      output: {
        type: 'status_update',
        status: bookedCount === 0 
          ? 'No flights booked yet. Text me when you book! ✈️'
          : `${bookedCount}/${totalMembers} confirmed ✈️`,
        details: bookedCount === 0
          ? 'Example: BOOKED United'
          : flights.map(f => {
              if (f.airline && f.flight_number) {
                return `✅ ${f.member_name} - ${f.airline} ${f.flight_number}`;
              }
              return `✅ ${f.member_name} - Booked`;
            }).join('\n') + (allMembers.filter(m => !flights.some(f => f.member_id === m.id)).length > 0 
              ? '\n\n' + allMembers.filter(m => !flights.some(f => f.member_id === m.id)).map(m => `⏳ ${m.name}`).join('\n')
              : ''),
        sendTo: 'group',
      },
    };
  }

  async checkFlightBookingStatus(trip) {
    // Called by nudge scheduler
    const members = await db.getMembers(trip.id);
    const flights = await db.getFlights(trip.id);
    const bookedCount = flights.length;
    const totalMembers = members.length;
    const unbooked = members.filter(m => !flights.some(f => f.member_id === m.id));

    if (bookedCount === totalMembers) {
      // Everyone booked - celebrate and transition
      await db.updateTrip(trip.id, { all_flights_booked: true, stage: 'trip_confirmed', stage_entered_at: new Date() });
      await this.sendToGroup(trip.id, `🎊 EVERYONE'S BOOKED!\n\n${members.map(m => {
        const flight = flights.find(f => f.member_id === m.id);
        if (flight?.airline && flight?.flight_number) {
          return `✅ ${m.name} - ${flight.airline} ${flight.flight_number}`;
        }
        return `✅ ${m.name} - Booked`;
      }).join('\n')}\n\n${trip.destination} ${trip.start_date ? new Date(trip.start_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric' }) : ''} is HAPPENING! 🎉\n\nI'll check in 2 weeks before to help with logistics. Have fun!`);
      const { checkStateTransitions } = await import('../state/stateMachine.js');
      await checkStateTransitions(trip.id);
      return;
    }

    // Calculate time since dates were locked
    const datesLockedAt = trip.stage_entered_at ? new Date(trip.stage_entered_at).getTime() : Date.now();
    const hoursSinceLocked = (Date.now() - datesLockedAt) / (1000 * 60 * 60);

    // Escalation ladder
    if (bookedCount === 0 && hoursSinceLocked > 72) {
      // No one booked after 3 days
      await this.sendToGroup(trip.id, '🚨 Prices are going up! Who\'s booking first? Don\'t wait too long!');
      await db.updateTrip(trip.id, { nudge_count: (trip.nudge_count || 0) + 1, last_nudge_at: new Date() });
    } else if (bookedCount > 0 && unbooked.length > 0) {
      // Some booked, some haven't
      if (hoursSinceLocked > 24 && (trip.nudge_count || 0) < 3) {
        const unbookedNames = unbooked.map(m => m.name).join(', ');
        await this.sendToGroup(trip.id, `✅ ${bookedCount}/${totalMembers} confirmed! 🎉\n\n${unbookedNames} - everyone's booking. Don't miss out!`);
        await db.updateTrip(trip.id, { nudge_count: (trip.nudge_count || 0) + 1, last_nudge_at: new Date() });
      }
    } else if (unbooked.length === 1) {
      // One person left
      const lastPerson = unbooked[0];
      await twilioClient.sendSMS(lastPerson.phone_number, `You're the last one! Everyone's waiting. What's holding you back?`);
      await db.updateTrip(trip.id, { nudge_count: (trip.nudge_count || 0) + 1, last_nudge_at: new Date() });
    }
  }

  async detectQuestionDirection(messageBody, allMembers) {
    // Use AI to detect question direction
    try {
      const memberNames = allMembers.map(m => m.name).join(', ');
      
      const prompt = `Analyze this group chat message to determine who the question is directed at:

Message: "${messageBody}"
${memberNames ? `Group members: ${memberNames}` : 'No members yet'}

Determine the question direction. Reply with JSON only:
{
  "direction": "bot" | "member" | "general" | "none",
  "targetMember": "member name" or null,
  "reasoning": "brief explanation"
}

Directions:
- bot: Question is for Voyaj/bot (mentions "Voyaj", "bot", or clearly asking the system)
- member: Question is for a specific group member (e.g., "Alex, what do you think?", "What about Sarah?")
- general: Question is for the group in general (e.g., "What dates work?", "Where should we go?")
- none: Not a question or unclear intent`;

      const response = await callClaudeWithSystemPrompt('', prompt, { maxTokens: 150 });
      const cleaned = response.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const parsed = JSON.parse(cleaned);
      
      this.log('info', `Question direction AI reasoning: ${parsed.reasoning || 'No reasoning'} (direction: ${parsed.direction})`);
      this.logAICall('detectQuestionDirection', messageBody, parsed);
      return parsed.direction || 'general';
    } catch (error) {
      this.logAICall('detectQuestionDirection', messageBody, null, error);
      this.log('warn', `AI question direction failed, using fallback: ${error.message}`);
      // Fallback to rule-based
      return this.detectQuestionDirectionFallback(messageBody, allMembers);
    }
  }
  
  detectQuestionDirectionFallback(messageBody, allMembers) {
    // Rule-based fallback
    const body = messageBody.toLowerCase();
    const mentionsVoyaj = /voyaj|bot/i.test(messageBody);
    
    if (mentionsVoyaj) {
      return 'bot';
    }
    
    // Check if question starts with a member name
    const memberNames = allMembers.map(m => m.name.toLowerCase());
    for (const name of memberNames) {
      const namePattern = new RegExp(`^${name}[,\\s]+`, 'i');
      if (namePattern.test(messageBody)) {
        return 'member';
      }
      if (new RegExp(`(what about|how about|\\?.*${name}|${name}.*\\?)`, 'i').test(messageBody)) {
        return 'member';
      }
    }
    
    if (messageBody.includes('?')) {
      return 'general';
    }
    
    if (/\b(what|when|where|how|why|can|could|would|should|does|do|will|is|are)\b/i.test(body)) {
      return 'general';
    }
    
    return 'none';
  }
  
  async validateNameWithAI(name, allMembers) {
    // Use AI to validate if message is actually a name
    try {
      const existingNames = allMembers.map(m => m.name).join(', ');
      
      const prompt = `Is this message a person's name (for joining a group), or is it something else (question, destination, etc.)?

Message: "${name}"
${existingNames ? `Existing group members: ${existingNames}` : 'No existing members'}

Reply with JSON only:
{
  "isName": true or false,
  "reasoning": "brief explanation"
}

Examples:
- "Alex" → isName: true
- "Tokyo" → isName: false (destination)
- "What dates work?" → isName: false (question)
- "Alex what do you think?" → isName: false (question, not just a name)
- "John Smith" → isName: true
- "march or april" → isName: false (dates)`;

      const response = await callClaudeWithSystemPrompt('', prompt, { maxTokens: 150 });
      const cleaned = response.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const parsed = JSON.parse(cleaned);
      
      this.log('info', `Name validation AI reasoning: ${parsed.reasoning || 'No reasoning'} (isName: ${parsed.isName})`);
      this.logAICall('validateNameWithAI', name, parsed);
      return parsed.isName === true;
    } catch (error) {
      this.logAICall('validateNameWithAI', name, null, error);
      this.log('warn', `AI name validation failed, using fallback: ${error.message}`);
      // Fallback to rule-based
      return this.validateNameFallback(name);
    }
  }
  
  validateNameFallback(name) {
    // Rule-based fallback
    const lowerName = name.toLowerCase();
    const hasQuestionWords = /\b(is|are|what|when|where|how|why|can|could|would|should|does|do|will|this|that|voyaj|working|next|ok|cool|so|agree|confused|whats|up|yeah|yea|wait|hmm)\b/i.test(lowerName);
    const hasQuestionMark = name.includes('?');
    const isTooLong = name.length > 30;
    const hasTooManyWords = name.split(/\s+/).length > 3;
    
    return name.length > 0 && 
           !hasQuestionWords &&
           !hasQuestionMark && 
           !isTooLong &&
           !hasTooManyWords;
  }
  
  async detectDateVsDestination(messageBody, trip) {
    // Use AI to distinguish between date availability and destination suggestions
    try {
      const prompt = `In a trip planning context, determine if this message is about:
1. Date availability (when the person is available to travel)
2. Destination suggestion (where the person wants to go)
3. Neither (general conversation, question, etc.)

Message: "${messageBody}"
Trip stage: ${trip.stage}

Reply with JSON only:
{
  "type": "date" | "destination" | "neither",
  "reasoning": "brief explanation"
}

Examples:
- "march or april" → type: "date"
- "Tokyo or Shanghai" → type: "destination"
- "I'm flexible in May" → type: "date"
- "Thailand, Japan, or maybe Europe" → type: "destination"
- "What dates work?" → type: "neither" (question)
- "sounds good" → type: "neither" (acknowledgment)`;

      const response = await callClaudeWithSystemPrompt('', prompt, { maxTokens: 150 });
      const cleaned = response.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const parsed = JSON.parse(cleaned);
      
      this.log('info', `Date vs destination AI reasoning: ${parsed.reasoning || 'No reasoning'} (type: ${parsed.type})`);
      this.logAICall('detectDateVsDestination', messageBody, parsed);
      return parsed.type || 'neither';
    } catch (error) {
      this.logAICall('detectDateVsDestination', messageBody, null, error);
      this.log('warn', `AI date vs destination detection failed, using fallback: ${error.message}`);
      // Fallback to rule-based
      return this.detectDateVsDestinationFallback(messageBody);
    }
  }
  
  detectDateVsDestinationFallback(messageBody) {
    // Rule-based fallback
    const body = messageBody.toLowerCase();
    const looksLikeDate = /\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b/i.test(body) ||
                         /\b(\d{1,2}[\/\-]\d{1,2}|\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})\b/.test(messageBody) ||
                         /\b(flexible|available|free|weekend|week|month)\b/i.test(body);
    
    if (looksLikeDate) {
      return 'date';
    }
    
    // Check for destination patterns
    const destinationPatterns = [
      /\b(tokyo|paris|london|bali|spain|italy|greece|portugal|japan|france|thailand|vietnam|mexico|iceland|norway|sweden|denmark|germany|switzerland|austria|croatia|morocco|turkey|egypt|dubai|singapore|hong kong|south korea|taiwan|philippines|indonesia|malaysia|new zealand|australia|brazil|argentina|chile|peru|colombia|costa rica|panama|belize|guatemala|honduras|nicaragua)\b/i
    ];
    
    if (destinationPatterns.some(pattern => pattern.test(body))) {
      return 'destination';
    }
    
    return 'neither';
  }

  async showItinerary(context) {
    const { trip } = context;
    return {
      success: true,
      output: {
        type: 'status_update',
        status: 'Itinerary feature coming soon!',
        details: 'For now, let\'s focus on getting flights booked. ✈️',
        sendTo: 'group',
      },
    };
  }

  async handleGeneral(context, message) {
    const { trip, allMembers } = context;
    
    // Enhanced question detection for all stages (declare once at top)
    const msgBody = message.body.toLowerCase();
    const msgHasQuestionMark = message.body.includes('?');
    const msgHasQuestionWords = /\b(what|when|where|how|why|can|could|would|should|does|do|will|is|are|which|who|whom|whose|if|whether|clarify|clarification|explain|understand|know|wondering|wonder|ask|asking|question|questions)\b/i.test(message.body);
    const msgHasQuestionPhrases = /\b(when do|when will|when are|how do|how will|how are|what do|what will|what are|can we|should we|do we|are we|will we|need to|should know|want to know|just to clarify|to clarify|to understand)\b/i.test(msgBody);
    const msgIsQuestion = msgHasQuestionMark || msgHasQuestionWords || msgHasQuestionPhrases;
    
    // Special handling for early stages
    if (trip.stage === 'created' || trip.stage === 'collecting_members') {
      const memberCount = allMembers.length;
      
      if (memberCount === 0) {
        // No members yet - just remind them to join
        return {
          success: true,
          output: {
            type: 'conversation',
            message: 'Hey! Reply with your name to join the trip. 🎉',
            sendTo: 'individual',
          },
        };
      }
      
      // If it's a question, answer it with current state
      if (msgIsQuestion) {
        return {
          success: true,
          output: {
            type: 'conversation',
            context: {
              stage: trip.stage,
              members: allMembers.map(m => m.name),
              memberCount,
              destination: trip.destination,
              startDate: trip.start_date,
              endDate: trip.end_date,
            },
            sendTo: 'individual',
          },
        };
      }
      
      // We have members but still collecting - list who's in and what's needed
      if (memberCount < 2) {
        const memberNames = allMembers.map(m => m.name).join(', ');
        const needed = 2 - memberCount;
        return {
          success: true,
          output: {
            type: 'conversation',
            message: `We have ${memberCount} people: ${memberNames}.\n\nNeed ${needed} more to start planning! Reply with your name to join.`,
            sendTo: 'individual',
          },
        };
      } else {
        // 2+ members but still in collecting_members - might be transitioning
        // Respond to casual conversation or questions
        const memberNames = allMembers.map(m => m.name).join(', ');
        return {
          success: true,
          output: {
            type: 'conversation',
            context: {
              stage: trip.stage,
              members: allMembers.map(m => m.name),
              memberCount,
              destination: trip.destination,
              startDate: trip.start_date,
              endDate: trip.end_date,
            },
            sendTo: 'individual',
          },
        };
      }
    }
    
    // For collecting_destinations and collecting_dates, provide helpful context
    if (trip.stage === 'collecting_destinations') {
      const suggestions = await db.getDestinationSuggestions(trip.id);
      const suggestionCount = suggestions.length;
      const memberCount = allMembers.length;
      const pending = allMembers.filter(m => !suggestions.some(s => s.member_id === m.id));
      
      // Enhanced question detection
      const body = message.body.toLowerCase();
      const hasQuestionMark = message.body.includes('?');
      const hasQuestionWords = /\b(what|when|where|how|why|can|could|would|should|does|do|will|is|are|which|who|whom|whose|if|whether|clarify|clarification|explain|understand|know|wondering|wonder|ask|asking|question|questions)\b/i.test(message.body);
      const hasQuestionPhrases = /\b(when do|when will|when are|how do|how will|how are|what do|what will|what are|can we|should we|do we|are we|will we|need to|should know|want to know|just to clarify|to clarify|to understand)\b/i.test(body);
      
      const isQuestion = hasQuestionMark || hasQuestionWords || hasQuestionPhrases;
      
      if (isQuestion) {
        // Return structured output for responder to format with AI
        // Always send to group - questions benefit everyone
        return {
          success: true,
          output: {
            type: 'conversation',
            context: {
              stage: 'collecting_destinations',
              suggestionCount,
              memberCount,
              pending: pending.map(m => m.name),
            },
            sendTo: 'group',
          },
        };
      }
      
      // Not a question - ignore casual conversation
      return { success: true, ignored: true };
    }
    
    if (trip.stage === 'collecting_dates') {
      const availability = await db.getDateAvailability(trip.id);
      const availabilityCount = availability.length;
      const memberCount = allMembers.length;
      const pending = allMembers.filter(m => !availability.some(a => a.member_id === m.id));
      
      if (msgIsQuestion) {
        // Return structured output for responder to format with AI
        // Always send to group - questions benefit everyone
        return {
          success: true,
          output: {
            type: 'conversation',
            context: {
              stage: 'collecting_dates',
              availabilityCount,
              memberCount,
              pending: pending.map(m => m.name),
              destination: trip.destination,
            },
            sendTo: 'group',
          },
        };
      }
      
      // Not a question - ignore casual conversation
      return { success: true, ignored: true };
    }
    
    // For all other stages, if it's a question, respond intelligently
    if (msgIsQuestion) {
      // Return structured output for responder to format with full context
      // Always send to group - questions benefit everyone
      return {
        success: true,
        output: {
          type: 'conversation',
          context: {
            stage: trip.stage,
            destination: trip.destination,
            startDate: trip.start_date,
            endDate: trip.end_date,
            members: allMembers.map(m => m.name),
            memberCount: allMembers.length,
          },
          sendTo: 'group',
        },
      };
    }
    
    // Not a question and not in collection stages - ignore casual conversation
    return { success: true, ignored: true };
  }

  async sendToGroup(tripId, message) {
    const members = await db.getMembers(tripId);
    for (const member of members) {
      await twilioClient.sendSMS(member.phone_number, message);
    }
  }

  async getTripSummary(trip, members) {
    const memberNames = members.map(m => m.name).join(', ');
    let summary = `📋 Trip Summary:\n👥 Members: ${memberNames}`;
    
    if (trip.destination) {
      summary += `\n📍 Destination: ${trip.destination}`;
    } else {
      summary += `\n📍 Destination: Not decided yet`;
    }
    
    if (trip.start_date && trip.end_date) {
      const startDate = new Date(trip.start_date).toLocaleDateString();
      const endDate = new Date(trip.end_date).toLocaleDateString();
      summary += `\n📅 Dates: ${startDate} - ${endDate}`;
    } else {
      summary += `\n📅 Dates: Not decided yet`;
    }
    
    // Add progress checklist
    summary += `\n\n📊 Progress:`;
    summary += await this.getProgressChecklist(trip, members);
    
    return summary;
  }

  async getProgressChecklist(trip, members) {
    const memberCount = members.length;
    const hasDestination = !!trip.destination;
    const hasDates = !!(trip.start_date && trip.end_date);
    
    // Determine flight booking status
    let flightStatus = 'pending';
    let flightCount = 0;
    if (trip.stage === 'tracking_flights' || trip.stage === 'trip_confirmed') {
      flightCount = await db.getFlightCount(trip.id);
      const memberCount = members.length;
      if (flightCount >= memberCount) {
        flightStatus = 'complete';
      } else {
        flightStatus = 'in_progress';
      }
    }
    
    let checklist = '';
    
    // Step 1: Gather members (2+ people)
    if (memberCount >= 2) {
      checklist += `\n✅ Gather members (${memberCount} people)`;
    } else {
      checklist += `\n⏳ Gather members (${memberCount}/2 people)`;
    }
    
    // Step 2: Choose destination
    if (hasDestination) {
      checklist += `\n✅ Choose destination (${trip.destination})`;
    } else if (trip.stage === 'collecting_destinations' || trip.stage === 'voting_destination') {
      checklist += `\n⏳ Choose destination (in progress)`;
    } else {
      checklist += `\n⬜ Choose destination`;
    }
    
    // Step 3: Pick dates
    if (hasDates) {
      const startDate = new Date(trip.start_date).toLocaleDateString();
      const endDate = new Date(trip.end_date).toLocaleDateString();
      checklist += `\n✅ Pick dates (${startDate} - ${endDate})`;
    } else if (trip.stage === 'collecting_dates' || trip.stage === 'voting_dates') {
      checklist += `\n⏳ Pick dates (in progress)`;
    } else {
      checklist += `\n⬜ Pick dates`;
    }
    
    // Step 4: Book flights
    if (flightStatus === 'complete') {
      checklist += `\n✅ Book flights (all confirmed)`;
    } else if (flightStatus === 'in_progress') {
      checklist += `\n⏳ Book flights (${flightCount}/${members.length} booked)`;
    } else {
      checklist += `\n⬜ Book flights`;
    }
    
    // Add current action needed
    const currentAction = this.getCurrentAction(trip, members);
    if (currentAction) {
      checklist += `\n\n🎯 Next: ${currentAction}`;
    }
    
    return checklist;
  }

  getCurrentAction(trip, members) {
    const memberCount = members.length;
    
    switch (trip.stage) {
      case 'collecting_members':
        if (memberCount < 2) {
          return `Need ${2 - memberCount} more person${2 - memberCount > 1 ? 's' : ''} to join`;
        }
        return 'Waiting for enough people to start planning';
        
      case 'collecting_destinations':
        return 'Everyone: Share destination ideas - suggest any places that excite you!';
        
      case 'voting_destination':
        return 'Vote for your preferred destination (reply with the number)';
        
      case 'collecting_dates':
        return 'Everyone: Share your date availability (e.g., "March 15-22" or "I\'m flexible in April")';
        
      case 'voting_dates':
        return 'Vote for your preferred dates (reply with the number)';
        
      case 'tracking_flights':
        return 'Book your flights and text me: "BOOKED [airline] [flight number]" or just "BOOKED"';
        
      case 'trip_confirmed':
        return 'Trip is confirmed! See you there! 🎉';
        
      default:
        this.log('warn', `Unknown stage: ${trip.stage}`);
        return null;
    }
  }

  async extractBudgetAndAccommodationPreferences(context, message) {
    const { trip, member } = context;
    if (!member) return;
    
    const text = message.body.toLowerCase();
    
    // Check for budget mentions
    const budgetPatterns = [
      /\$(\d+)\s*-\s*\$?(\d+)/, // $400-500
      /\$(\d+)\s*(per person|pp|each)/, // $400 per person
      /\b(budget|cost|price|spend|spending)\s*(of|is|around|about)?\s*\$?(\d+)/i, // budget of $400
      /\b(\d+)\s*-\s*\$?(\d+)\s*(range|budget)/i, // 400-500 range
    ];
    
    for (const pattern of budgetPatterns) {
      const match = message.body.match(pattern);
      if (match) {
        const budgetText = match[0];
        const { addTripPreference } = await import('../db/queries.js');
        await addTripPreference(
          trip.id,
          member.id,
          'budget_preferences',
          budgetText,
          message.body
        );
        console.log(`   👤 Coordinator: Extracted budget preference: "${budgetText}"`);
        break;
      }
    }
    
    // Check for accommodation mentions
    const accommodationPatterns = [
      /\b(airbnb|air bnb|vrbo|rental|house|apartment|condo)\b/i,
      /\b(hotel|resort|hostel|motel)\b/i,
      /\b(accommodation|where to stay|staying|lodging)\b/i,
    ];
    
    for (const pattern of accommodationPatterns) {
      if (pattern.test(message.body)) {
        const match = message.body.match(pattern);
        const accText = match ? match[0] : message.body.substring(0, 100);
        const { addTripPreference } = await import('../db/queries.js');
        await addTripPreference(
          trip.id,
          member.id,
          'accommodation_preferences',
          accText,
          message.body
        );
        console.log(`   👤 Coordinator: Extracted accommodation preference: "${accText}"`);
        break;
      }
    }
  }
}

