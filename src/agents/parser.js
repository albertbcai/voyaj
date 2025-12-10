import { BaseAgent } from './base.js';
import * as db from '../db/queries.js';
import { twilioClient } from '../utils/twilio.js';
import { callClaude } from '../utils/claude.js';
import { emitEvent, EVENTS } from '../state/eventEmitter.js';

export class ParserAgent extends BaseAgent {
  constructor() {
    super('Parser', '✈️');
  }

  async handle(context, message) {
    const { trip, member } = context;
    
    this.logEntry('handle', context, message);
    
    try {

    if (!member) {
      console.log(`   ✈️  Parser: Member not found, rejecting`);
      return {
        success: false,
        output: {
          type: 'conversation',
          message: 'You need to join the trip first. Reply with your name.',
          sendTo: 'individual',
        },
      };
    }

    // Handle date availability collection
    if (trip.stage === 'collecting_dates' || trip.stage === 'planning' || trip.stage === 'destination_set') {
      console.log(`   ✈️  Parser: Collecting date availability`);
      return await this.handleDateAvailability(context, message);
    }

    // Handle flight information
    console.log(`   ✈️  Parser: Processing flight information`);

    // Try rule-based parsing first (cheap)
    const parsed = this.parseWithRules(message.body);
    console.log(`   ✈️  Parser: Rule-based parsing - confidence: ${parsed.confidence}`);

    if (parsed.confidence > 0.7) {
      console.log(`   ✈️  Parser: Using rule-based result (${parsed.airline} ${parsed.flightNumber})`);
      return await this.handleFlight(context, parsed, member);
    }

    // Fall back to AI parsing (expensive)
    console.log(`   ✈️  Parser: Rule-based failed, trying AI parsing...`);
    const aiParsed = await this.parseWithAI(message.body);
    console.log(`   ✈️  Parser: AI parsing - confidence: ${aiParsed.confidence}`);
    return await this.handleFlight(context, aiParsed, member);
    } catch (error) {
      this.logError('handle', error, { context, message });
      return {
        success: false,
        output: {
          type: 'conversation',
          message: 'I had trouble processing that. Can you try rephrasing?',
          sendTo: 'individual',
        },
      };
    }
  }

  async handleDateAvailability(context, message) {
    const { trip, member, dateAvailability } = context;
    const text = message.body.trim().toLowerCase();

        // Check for "flexible"
        if (text.includes('flexible')) {
          await db.createDateAvailability(trip.id, member.id, {
            startDate: null,
            endDate: null,
            isFlexible: true,
          });
          
          // Re-fetch fresh data after saving to get accurate pending list
          const freshAvailability = await db.getDateAvailability(trip.id);
          const availabilityCount = freshAvailability.length;
          const memberCount = context.allMembers.length;
          const majority = Math.ceil(memberCount * 0.6); // 60% majority
          
          // Allow progress with majority OR if we've been waiting 48+ hours
          const stageEnteredAt = new Date(trip.stage_entered_at || trip.created_at);
          const hoursWaiting = (Date.now() - stageEnteredAt.getTime()) / (1000 * 60 * 60);
          const hasTimeout = hoursWaiting >= 48;
          
          if (availabilityCount >= memberCount || (availabilityCount >= majority && hasTimeout)) {
            return await this.startDateVoting(context);
          }
          
          // Use fresh data to calculate pending members
          const pending = context.allMembers
            .filter(m => !freshAvailability.some(a => a.member_id === m.id))
            .map(m => m.name);
          
          return {
            success: true,
            output: {
              type: 'date_availability_submitted',
              dateRange: 'flexible',
              availabilityCount,
              memberCount,
              pendingMembers: pending.length > 0 ? pending : null,
              sendTo: 'individual',
            },
          };
        }

    // Parse date range with Claude
    const parsed = await this.parseDateRangeWithAI(message.body);
    
    if (parsed.startDate && parsed.endDate) {
      await db.createDateAvailability(trip.id, member.id, {
        startDate: parsed.startDate,
        endDate: parsed.endDate,
        isFlexible: false,
      });
      
      const formatted = this.formatDateRange(parsed.startDate, parsed.endDate);
      
      // Re-fetch fresh data after saving to get accurate pending list
      const freshAvailability = await db.getDateAvailability(trip.id);
      const availabilityCount = freshAvailability.length;
      const memberCount = context.allMembers.length;
      const majority = Math.ceil(memberCount * 0.6); // 60% majority
      
      // Allow progress with majority OR if we've been waiting 48+ hours
      const stageEnteredAt = new Date(trip.stage_entered_at || trip.created_at);
      const hoursWaiting = (Date.now() - stageEnteredAt.getTime()) / (1000 * 60 * 60);
      const hasTimeout = hoursWaiting >= 48;
      
      if (availabilityCount >= memberCount || (availabilityCount >= majority && hasTimeout)) {
        return await this.startDateVoting(context);
      }
      
      // Use fresh data to calculate pending members
      const pending = context.allMembers
        .filter(m => !freshAvailability.some(a => a.member_id === m.id))
        .map(m => m.name);
      
      return {
        success: true,
        output: {
          type: 'date_availability_submitted',
          dateRange: formatted,
          availabilityCount,
          memberCount,
          pendingMembers: pending.length > 0 ? pending : null,
          sendTo: 'individual', // Individual acknowledgment, group status if pending
        },
      };
    } else {
      await twilioClient.sendSMS(message.from, 'I couldn\'t understand those dates. Try:\n• "March 15-22"\n• "I\'m flexible in April"\n• "Late May or early June"');
      return { success: false };
    }
  }

  async parseDateRangeWithAI(text) {
    const prompt = `Extract date range from this message: "${text}"

Output JSON only:
{
  "startDate": "YYYY-MM-DD" or null,
  "endDate": "YYYY-MM-DD" or null,
  "type": "date_range" | "flexible" | "unavailable_range"
}

Examples:
"07/15 - 07/31" → {"startDate": "2025-07-15", "endDate": "2025-07-31", "type": "date_range"}
"July 15-31" → {"startDate": "2025-07-15", "endDate": "2025-07-31", "type": "date_range"}
"flexible" → {"startDate": null, "endDate": null, "type": "flexible"}

Only JSON, nothing else.`;

    try {
      const response = await callClaude(prompt, { maxTokens: 150, temperature: 0.0 });
      const cleaned = response.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const parsed = JSON.parse(cleaned);
      return parsed;
    } catch (e) {
      console.error('Failed to parse date range with AI:', e);
      return { startDate: null, endDate: null };
    }
  }

  formatDateRange(startDate, endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'];
    
    const startMonth = monthNames[start.getMonth()];
    const startDay = start.getDate();
    const endMonth = monthNames[end.getMonth()];
    const endDay = end.getDate();

    if (startMonth === endMonth) {
      return `${startMonth} ${startDay}-${endDay}`;
    } else {
      return `${startMonth} ${startDay} - ${endMonth} ${endDay}`;
    }
  }

  async startDateVoting(context) {
    const { trip } = context;
    
    // Get all availability
    const availability = await db.getDateAvailability(trip.id);
    
    // Find overlapping dates
    const { findOverlappingDates } = await import('../utils/dateOverlap.js');
    const options = findOverlappingDates(availability);
    
    if (options.length === 0) {
      // Build conflict message showing each member's availability
      const conflictDetails = ['Hmm, no overlapping dates found. 😕\n\nHere\'s what everyone shared:'];
      
      for (const avail of availability) {
        let dateText;
        if (avail.is_flexible) {
          dateText = 'flexible';
        } else if (avail.start_date && avail.end_date) {
          dateText = this.formatDateRange(avail.start_date, avail.end_date);
        } else {
          dateText = 'not specified';
        }
        
        const memberName = avail.member_name || 'Unknown';
        conflictDetails.push(`• ${memberName}: ${dateText}`);
      }
      
      conflictDetails.push('\nCan someone adjust their availability? Or expand your ranges! Reply with your new dates.');
      
      return {
        success: false,
        output: {
          type: 'status_update',
          status: 'Hmm, no overlapping dates found. 😕',
          details: conflictDetails.join('\n'),
          sendTo: 'group',
        },
      };
    }
    
    if (options.length === 1) {
      // Only one option - lock it immediately
      await db.updateTrip(trip.id, {
        start_date: options[0].startDate,
        end_date: options[0].endDate,
        stage: 'dates_set',
        stage_entered_at: new Date(),
      });
      // Trigger state transition - state machine will detect the stage change and emit the event automatically
      const { checkStateTransitions } = await import('../state/stateMachine.js');
      await checkStateTransitions(trip.id);
      
      return {
        success: true,
        output: {
          type: 'poll_completed',
          pollType: 'dates',
          winner: options[0].display,
          voteCount: context.allMembers.length,
          unanimous: true,
          sendTo: 'group',
        },
      };
    }

    // Present voting options
    await db.updateTrip(trip.id, {
      stage: 'voting_dates',
      stage_entered_at: new Date(),
    });
    
    const { checkStateTransitions } = await import('../state/stateMachine.js');
    await checkStateTransitions(trip.id);

    const memberCount = context.allMembers.length;
    const majorityThreshold = Math.ceil(memberCount * 0.6);

    return {
      success: true,
      output: {
        type: 'poll_started',
        pollType: 'dates',
        options: options.map(o => o.display),
        memberCount,
        majorityThreshold,
        sendTo: 'group',
      },
    };
  }

  createDateVotingMessage(options) {
    let message = 'Based on everyone\'s availability, these dates work:\n\n';
    
    options.forEach((option, index) => {
      const number = index + 1;
      message += `${number}️⃣ 📅 ${option.display}\n`;
    });
    
    message += '\nVote with JUST THE NUMBER. Example: Reply "1"';
    
    return message;
  }

  parseWithRules(text) {
    // Extract flight info with regex
    const flightPattern = /\b([A-Z]{2})\s*(\d{2,4})\b/;
    const timePattern = /(\d{1,2}):?(\d{2})?\s*(am|pm|AM|PM)?/i;

    const flightMatch = text.match(flightPattern);

    if (flightMatch) {
      const [_, airline, number] = flightMatch;
      const timeMatch = text.match(timePattern);

      return {
        confidence: 0.9,
        booked: true,
        airline: airline,
        flightNumber: number,
        time: timeMatch ? timeMatch[0] : null,
      };
    }

    // Check for "I booked" without details
    if (/\b(booked|book|flight)\b/i.test(text)) {
      return {
        confidence: 0.5,
        booked: true,
        airline: null,
        flightNumber: null,
        time: null,
      };
    }

    return { confidence: 0 };
  }

  async parseWithAI(text) {
    // Use Claude to extract flight info
    const prompt = `Extract flight information from this message: "${text}"

Return JSON only:
{
  "booked": true/false,
  "airline": "AA" or null,
  "flightNumber": "154" or null,
  "departureTime": "10:00 AM" or null,
  "arrivalTime": "2:00 PM" or null
}

Only JSON, nothing else.`;

    try {
      const response = await callClaude(prompt, { maxTokens: 150, temperature: 0.0 });
      const cleaned = response.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const parsed = JSON.parse(cleaned);
      return { ...parsed, confidence: 0.8 };
    } catch (e) {
      console.error('Failed to parse with AI:', e);
      return { confidence: 0, booked: false };
    }
  }

  async handleFlight(context, parsed, member) {
    const { trip } = context;

    if (parsed.booked) {
      // Create flight record
      await db.createFlight(trip.id, member.id, {
        airline: parsed.airline,
        flightNumber: parsed.flightNumber,
        departureTime: parsed.departureTime ? new Date(parsed.departureTime) : null,
        arrivalTime: parsed.arrivalTime ? new Date(parsed.arrivalTime) : null,
      });

      emitEvent(EVENTS.FLIGHT_ADDED, { tripId: trip.id, memberId: member.id });

      // Check if everyone booked
      const bookedCount = await db.getFlightCount(trip.id);
      const totalMembers = context.allMembers.length;

      if (bookedCount === totalMembers) {
        // Transition handled by coordinator's checkFlightBookingStatus
        await db.updateTrip(trip.id, { all_flights_booked: true });
        const { checkStateTransitions } = await import('../state/stateMachine.js');
        await checkStateTransitions(trip.id);
      }

      return {
        success: true,
        output: {
          type: 'flight_booked',
          memberName: member.name,
          airline: parsed.airline,
          flightNumber: parsed.flightNumber,
          needsDetails: parsed.booked && !parsed.airline && !parsed.flightNumber,
          bookedCount,
          totalMembers,
          allBooked: bookedCount === totalMembers,
          sendTo: 'group',
        },
      };
    }

    return { success: false };
  }

  async sendToGroup(tripId, message) {
    const members = await db.getMembers(tripId);
    for (const member of members) {
      await twilioClient.sendSMS(member.phone_number, message);
    }
  }
}


