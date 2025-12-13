import { BaseAgent } from './base.js';
import * as db from '../db/queries.js';
import { twilioClient } from '../utils/twilio.js';
import { emitEvent, EVENTS } from '../state/eventEmitter.js';
import { checkStateTransitions } from '../state/stateMachine.js';
import { parseDateRange } from '../utils/helpers.js';
import { callClaude } from '../utils/claude.js';

export class VotingAgent extends BaseAgent {
  constructor() {
    super('Voting', '🗳️');
  }

  static MAX_SUGGESTIONS_PER_MEMBER = 3;

  async handle(context, message) {
    const { trip, member } = context;
    
    this.logEntry('handle', context, message);
    
    // Log current state for debugging
    console.log(`   🗳️  Voting: Current state - stage: "${trip.stage}", destination: "${trip.destination || 'none'}", start_date: "${trip.start_date || 'none'}", end_date: "${trip.end_date || 'none'}"`);
    
    try {

    // Handle different stages
    if (trip.stage === 'collecting_destinations' || trip.stage === 'planning' || (trip.stage === 'dates_set' && !trip.destination)) {
      // CRITICAL: Don't process destination suggestions if destination is already set
      if (trip.destination) {
        console.log(`   🗳️  Voting: Destination already set to "${trip.destination}", skipping destination suggestion processing`);
        return { success: false, skip: true };
      }
      // Since orchestrator already used AI to route destination suggestions here,
      // we should trust that decision. Only reject very obvious non-suggestions.
      const suggestion = message.body.trim();
      const lowerSuggestion = suggestion.toLowerCase();
      
      // Only reject if message is EXACTLY a casual phrase (not if it contains these words)
      // This prevents false positives like "Ok for destinations, I'm thinking Tokyo..."
      const isCasualMessage = (lowerSuggestion === 'ok' || 
                               lowerSuggestion === 'sounds good' ||
                               lowerSuggestion === 'yeah' ||
                               lowerSuggestion === 'cool' ||
                               lowerSuggestion === 'nice' ||
                               lowerSuggestion.length < 2) &&
                              // Don't reject if message contains destination-like words (cities, countries)
                              !this.looksLikeDestinationMessage(suggestion);
      
      if (isCasualMessage) {
        console.log(`   🗳️  Voting: Skipping casual message, not a destination suggestion`);
        console.log(`   🗳️  Voting: Message body: "${suggestion.substring(0, 100)}${suggestion.length > 100 ? '...' : ''}"`);
        return { success: false, skip: true };
      }
      
      // Log that we're processing this as a destination suggestion
      console.log(`   🗳️  Voting: Processing as destination suggestion: "${suggestion.substring(0, 100)}${suggestion.length > 100 ? '...' : ''}"`);

      // Now check membership only if it looks like a real suggestion
      if (!member) {
        console.log(`   🗳️  Voting: Member not found, but message looks like destination - routing to coordinator for member join`);
        // Don't send a message here - let coordinator handle it properly
        return { success: false, skip: true };
      }

      this.log('info', 'Collecting destination suggestion');
      const result1 = await this.handleDestinationSuggestion(context, message);
      this.logExit('handle', result1);
      return result1;
    }

    if (trip.stage === 'voting_destination' || trip.stage === 'voting_dates') {
      // Also check if destination is already set - if so, we shouldn't be voting
      if (trip.stage === 'voting_destination' && trip.destination) {
        console.log(`   🗳️  Voting: Destination already set to "${trip.destination}", but stage is voting_destination - this is inconsistent, skipping vote`);
        return { success: false, skip: true };
      }
      
      this.log('info', `Processing vote - poll: ${trip.stage}`);
      const result2 = await this.handleVote(context, message);
      this.logExit('handle', result2);
      return result2;
    }

    // Fallback
    this.log('info', 'No matching stage, skipping');
    const result = { success: false, skip: true };
    this.logExit('handle', result);
    return result;
    } catch (error) {
      await this.logError(error, context, message, { method: 'handle' });
      throw error;
    }
  }

  async handleDestinationSuggestion(context, message) {
    const { trip, member, destinationSuggestions } = context;
    const suggestion = message.body.trim();

    // If we're in dates_set stage and destination is not set, transition to planning first
    if (trip.stage === 'dates_set' && !trip.destination) {
      console.log(`   🗳️  Voting: Transitioning from dates_set to planning to collect destination suggestions`);
      await db.updateTrip(trip.id, {
        stage: 'planning',
        stage_entered_at: new Date(),
      });
      // Update trip object in context for rest of processing
      trip.stage = 'planning';
    }

    // Skip only very obvious non-suggestions (exact matches only)
    // Trust the orchestrator's AI-based routing decision
    const lowerSuggestion = suggestion.toLowerCase();
    const isCasualMessage = (lowerSuggestion === 'ok' || 
                           lowerSuggestion === 'sounds good' ||
                           lowerSuggestion === 'yeah' ||
                           lowerSuggestion.length < 2) &&
                           !this.looksLikeDestinationMessage(suggestion);
    
    if (isCasualMessage) {
      console.log(`   🗳️  Voting: Skipping casual message, not a suggestion`);
      return { success: false, skip: true };
    }

    // Check if this is a vague preference (not a specific destination) - extract and store
    const isVaguePreference = await this.isVagueDestinationPreference(suggestion);
    if (isVaguePreference.isVague) {
      console.log(`   🗳️  Voting: Detected vague preference, extracting and storing`);
      // Store as preference
      const { addTripPreference } = await import('../db/queries.js');
      await addTripPreference(
        trip.id,
        member.id,
        'destination_criteria',
        isVaguePreference.preferenceText,
        suggestion
      );
      
      // Return output that responder can format to acknowledge and ask for specifics
      return {
        success: true,
        output: {
          type: 'vague_preference_detected',
          preferenceType: 'destination_criteria',
          preferenceText: isVaguePreference.preferenceText,
          originalMessage: suggestion,
          sendTo: 'individual',
        },
      };
    }

    // Extract multiple destinations from the message (AI-powered)
    const destinations = await this.extractDestinations(suggestion);
    console.log(`   🗳️  Voting: extractDestinations returned ${destinations.length} destinations:`, destinations);
    
    // Check how many suggestions this member already has (fetch fresh from DB, don't rely on context)
    const allSuggestions = await db.getDestinationSuggestions(trip.id);
    const memberSuggestions = allSuggestions.filter(s => s.member_id === member.id);
    const currentCount = memberSuggestions.length;
    const MAX_SUGGESTIONS = VotingAgent.MAX_SUGGESTIONS_PER_MEMBER;
    
    if (currentCount >= MAX_SUGGESTIONS) {
      console.log(`   🗳️  Voting: Member ${member.name} already has ${currentCount} suggestions (max: ${MAX_SUGGESTIONS})`);
      return {
        success: true,
        output: {
          type: 'suggestion_limit_reached',
          memberName: member.name,
          currentCount,
          maxCount: MAX_SUGGESTIONS,
          message: `You've already suggested ${currentCount} destinations! Please pick your top ${MAX_SUGGESTIONS} favorites and we'll vote on those.`,
          sendTo: 'individual',
        },
      };
    }
    
    // Calculate how many more suggestions this member can make
    const remainingSlots = MAX_SUGGESTIONS - currentCount;
    const destinationsToProcess = destinations.slice(0, remainingSlots);
    const skippedCount = destinations.length - destinationsToProcess.length;
    
    if (skippedCount > 0) {
      console.log(`   🗳️  Voting: Limiting to ${remainingSlots} suggestions (${skippedCount} skipped to stay within limit)`);
    }
    
    let savedCount = 0;
    let alreadySuggested = false;
    
    // Save each destination suggestion (up to the limit)
    for (const dest of destinationsToProcess) {
      try {
        const normalized = await this.normalizeDestination(dest, context.allMembers);
        if (!normalized || normalized.length === 0) continue;
        
        // Check if this specific destination was already suggested by this member (use fresh data from DB)
        const alreadySuggestedThis = memberSuggestions.some(s => 
          s.destination.toLowerCase() === normalized.toLowerCase()
        );
        
        if (!alreadySuggestedThis) {
          await db.createDestinationSuggestion(trip.id, member.id, normalized);
          console.log(`   🗳️  Voting: Destination suggestion recorded: "${dest}" → normalized to "${normalized}"`);
          savedCount++;
        } else {
          alreadySuggested = true;
        }
      } catch (error) {
        // Skip if it's a name (not a destination) or other error
        if (error.message === 'NAME_NOT_DESTINATION') {
          console.log(`   🗳️  Voting: Skipping "${dest}" - looks like a name, not a destination`);
        } else {
          console.log(`   🗳️  Voting: Error normalizing "${dest}":`, error.message);
        }
        continue;
      }
    }
    
    if (savedCount === 0 && destinations.length > 0) {
      alreadySuggested = true; // All destinations were already suggested
    }

    // Check if ready to transition to voting
    const suggestionCount = await db.getDestinationSuggestionCount(trip.id);
    const memberCount = context.allMembers.length;
    console.log(`   🗳️  Voting: Checking if ready to vote - suggestionCount: ${suggestionCount}, memberCount: ${memberCount}`);

    if (suggestionCount >= memberCount) {
      console.log(`   🗳️  Voting: All suggestions collected (${suggestionCount} >= ${memberCount}), transitioning to voting`);
      return await this.startDestinationVoting(context);
    }

    // Get pending members for status update (use fresh data from DB)
    const pending = context.allMembers
      .filter(m => !allSuggestions.some(s => s.member_id === m.id))
      .map(m => m.name);
    
    const isNewSuggestion = !allSuggestions.some(s => s.member_id === member.id);
    
    await checkStateTransitions(trip.id);

    // Return structured output for responder to format
    const savedDestinations = destinationsToProcess.filter(d => d && d.length > 0);
    let responseMessage = null;
    if (skippedCount > 0) {
      responseMessage = `You've reached your limit of ${MAX_SUGGESTIONS} suggestions. We'll vote on the ones you've shared!`;
    }
    
    return {
      success: true,
      output: {
        type: 'destination_suggested',
        memberName: member.name, // Include member name for acknowledgment
        destinations: savedDestinations,
        savedCount,
        alreadySuggested,
        suggestionCount,
        memberCount,
        pendingMembers: isNewSuggestion && pending.length > 0 ? pending : null,
        limitReached: skippedCount > 0,
        limitMessage: responseMessage,
        sendTo: skippedCount > 0 ? 'individual' : 'group', // Send to individual if limit reached
      },
    };
  }

  async startDestinationVoting(context) {
    const { trip } = context;
    
    // Get all suggestions
    const suggestions = await db.getDestinationSuggestions(trip.id);
    console.log(`   🗳️  Voting: startDestinationVoting - Found ${suggestions.length} suggestions in DB:`, 
      suggestions.map(s => `"${s.destination}" (member: ${s.member_id})`).join(', '));
    
    // Consolidate duplicates
    const uniqueDestinations = this.consolidateSuggestions(suggestions);
    console.log(`   🗳️  Voting: After consolidation - ${uniqueDestinations.length} unique destinations:`, uniqueDestinations);
    
    if (uniqueDestinations.length === 1) {
      console.log(`   🗳️  Voting: Only 1 unique destination found ("${uniqueDestinations[0]}"), skipping voting and locking immediately`);
      // Only one unique destination - lock it immediately
      await db.updateTrip(trip.id, {
        destination: uniqueDestinations[0],
        stage: 'destination_set',
        stage_entered_at: new Date(),
      });
      // Trigger state transition - state machine action will send the next prompt
      await checkStateTransitions(trip.id);
      return {
        success: true,
        output: {
          type: 'poll_completed',
          pollType: 'destination',
          winner: uniqueDestinations[0],
          voteCount: context.allMembers.length,
          unanimous: true,
          sendTo: 'group',
        },
      };
    }
    
    console.log(`   🗳️  Voting: Multiple unique destinations (${uniqueDestinations.length}), starting voting poll`);

    // Present voting options - transition to voting stage
    await db.updateTrip(trip.id, {
      stage: 'voting_destination',
      stage_entered_at: new Date(),
    });
    await checkStateTransitions(trip.id);

    const memberCount = context.allMembers.length;
    const majorityThreshold = Math.ceil(memberCount * 0.6);

    return {
      success: true,
      output: {
        type: 'poll_started',
        pollType: 'destination',
        options: uniqueDestinations,
        memberCount,
        majorityThreshold,
        sendTo: 'group',
      },
    };
  }

  async handleVote(context, message) {
    const { trip, member, currentPoll, existingVotes } = context;

    if (!currentPoll) {
      return { success: false, skip: true };
    }

    const choice = message.body.trim();
    console.log(`   🗳️  Voting: Processing vote - poll: ${currentPoll.type}, choice: "${choice}"`);
    
    // Parse numeric vote (1, 2, 3) or natural language (AI-powered)
    const parsedVote = await this.parseVote(choice, currentPoll.type, context);
    
    if (!parsedVote) {
      console.log(`   🗳️  Voting: Could not parse vote, skipping`);
      return { success: false, skip: true };
    }

    // Record vote
    await db.createVote(trip.id, currentPoll.type, member.id, parsedVote);
    console.log(`   🗳️  Voting: Vote recorded for ${member.name}: "${parsedVote}"`);

    // Check if member already voted
    const alreadyVoted = existingVotes?.some(v => v.member_id === member.id);

    // Check if poll should close
    const totalMembers = context.allMembers.length;
    const totalVotes = await db.getVoteCount(trip.id, currentPoll.type);
    const majorityThreshold = Math.ceil(totalMembers * 0.6);
    const votesNeeded = Math.max(0, majorityThreshold - totalVotes);

    console.log(`   🗳️  Voting: Progress - ${totalVotes}/${totalMembers} votes (need ${majorityThreshold} for majority)`);

    const majorityVoted = totalVotes >= majorityThreshold;

    if (majorityVoted) {
      // Check for ties before closing poll
      const results = await db.getVoteResults(trip.id, currentPoll.type);
      const topVoteCount = parseInt(results[0]?.count || 0, 10);
      const tiedOptions = results.filter(r => parseInt(r.count, 10) === topVoteCount);

      if (tiedOptions.length > 1) {
        // We have a tie - send nudge instead of closing
        console.log(`   🗳️  Voting: Tie detected (${tiedOptions.length} options with ${topVoteCount} vote${topVoteCount > 1 ? 's' : ''} each)`);

        return {
          success: true,
          output: {
            type: 'vote_tie_detected',
            pollType: currentPoll.type,
            tiedOptions: tiedOptions.map(t => ({ choice: t.choice, voteCount: parseInt(t.count, 10) })),
            allResults: results.map(r => ({ choice: r.choice, voteCount: parseInt(r.count, 10) })),
            totalVotes,
            sendTo: 'group',
          },
        };
      }

      console.log(`   🗳️  Voting: Majority reached! Closing poll...`);
      return await this.closePoll(context);
    }

    // Get pending and confirmed voters
    const pendingVoters = this.getPendingVoters(context, existingVotes);
    const allVotes = await db.getVotes(trip.id, currentPoll.type);
    const confirmedVoters = context.allMembers
      .filter(m => allVotes.some(v => v.member_id === m.id))
      .map(m => m.name);

    emitEvent(EVENTS.DESTINATION_VOTED, { tripId: trip.id, pollType: currentPoll.type });

    // Return structured output
    return {
      success: true,
      output: {
        type: 'vote_recorded',
        choice: parsedVote,
        alreadyVoted,
        voteCount: totalVotes,
        totalMembers,
        votesNeeded,
        majorityThreshold,
        confirmedVoters,
        pendingVoters: pendingVoters.length > 0 ? pendingVoters : null,
        sendTo: 'individual', // Individual acknowledgment, group status if pending
      },
    };
  }

  async parseVote(choice, pollType, context) {
    // Always fetch options from database as the source of truth
    let options = [];
    if (pollType === 'destination') {
      const suggestions = await db.getDestinationSuggestions(context.trip.id);
      options = this.consolidateSuggestions(suggestions);
    } else if (pollType === 'dates') {
      const availability = await db.getDateAvailability(context.trip.id);
      const { findOverlappingDates } = await import('../utils/dateOverlap.js');
      const dateOptions = findOverlappingDates(availability);
      options = dateOptions.map(opt => opt.display);
    }
    
    if (options.length === 0) {
      console.warn(`   🗳️  Voting: No options available for poll type ${pollType}`);
      return null;
    }
    
    // Try to parse as numeric vote first (1, 2, 3)
    const numericMatch = choice.match(/\b(\d+)\b/);
    if (numericMatch) {
      const optionNumber = parseInt(numericMatch[1], 10);
      
      if (optionNumber >= 1 && optionNumber <= options.length) {
        const selectedOption = options[optionNumber - 1];
        
        // If message has extra text (like "1\n\nTokyo all the way!!"), use AI to confirm
        // Otherwise, just return the option name
        if (choice.trim() !== numericMatch[1] && choice.length > 5) {
          // Message has extra text - use AI to extract the actual choice
          try {
            const prompt = `User sent this message in response to a poll: "${choice}"

Poll options:
${options.map((opt, idx) => `${idx + 1}. ${opt}`).join('\n')}

The message contains the number "${optionNumber}" which corresponds to option ${optionNumber}: "${selectedOption}".

Extract the actual vote choice. Reply with JSON only:
{
  "isVote": true or false,
  "intent": "vote" or "complaint" or "question" or "other",
  "optionName": "${selectedOption}" or null
}

If the user is voting for option ${optionNumber} (${selectedOption}), set isVote to true and optionName to "${selectedOption}".
If they're complaining, asking a question, or not voting, set isVote to false.`;

            const response = await callClaude(prompt, { maxTokens: 100, temperature: 0.0 });
            const cleaned = response.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
            const parsed = JSON.parse(cleaned);
            
            if (parsed.isVote && parsed.optionName) {
              // Validate that the option name matches one of the actual options
              const matchingOption = options.find(opt => opt.toLowerCase() === parsed.optionName.toLowerCase());
              if (matchingOption) {
                return matchingOption; // Return the actual option name from the list
              }
            }
            
            // AI says it's not a vote, or option doesn't match
            console.log(`   🗳️  Voting: AI determined message is not a vote (intent: ${parsed.intent})`);
            return null;
          } catch (error) {
            // AI parsing failed - fallback to using the number
            console.warn(`   🗳️  Voting: AI parsing failed, using numeric vote:`, error.message);
            return selectedOption;
          }
        }
        
        // Clean numeric vote - return the option name
        return selectedOption;
      }
    }

    // No number found - use AI to determine if it's a natural language vote
    try {
      const prompt = `User sent this message in response to a poll: "${choice}"

Poll options:
${options.map((opt, idx) => `${idx + 1}. ${opt}`).join('\n')}

Is this a valid vote? Reply with JSON only:
{
  "isVote": true or false,
  "intent": "vote" or "complaint" or "question" or "other",
  "optionName": "option name from list" or null
}

If they're voting, set isVote to true and optionName to the exact option name from the list above.
If they're complaining (e.g., "This doesn't look right"), asking a question, or not voting, set isVote to false.`;

      const response = await callClaude(prompt, { maxTokens: 150, temperature: 0.0 });
      const cleaned = response.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const parsed = JSON.parse(cleaned);
      
      if (parsed.isVote && parsed.optionName) {
        // Validate that the option name matches one of the actual options
        const matchingOption = options.find(opt => opt.toLowerCase() === parsed.optionName.toLowerCase());
        if (matchingOption) {
          this.logAICall('parseVote (natural language)', choice, parsed.optionName);
          return matchingOption;
        }
      }
      
      // Not a valid vote
      this.log('info', `AI determined message is not a vote (intent: ${parsed.intent})`);
      this.logAICall('parseVote (natural language)', choice, parsed, null);
      return null;
    } catch (error) {
      // AI parsing failed - reject the vote
      this.logAICall('parseVote (natural language)', choice, null, error);
      this.log('warn', `AI parsing failed, rejecting vote: ${error.message}`);
      return null;
    }
  }

  async isVagueDestinationPreference(text) {
    // Use AI to detect if this is a vague preference (criteria) vs specific destination
    const prompt = `Is this message a vague destination preference/criteria (not a specific place), or a specific destination?

Examples of vague preferences:
- "somewhere with good food"
- "beach destination"
- "somewhere warm"
- "good food + beach"
- "taco situation is important"
- "places with good food? like i know we're doing beach"

Examples of specific destinations:
- "Tokyo"
- "Mexico"
- "Bali"
- "Portugal"
- "Cancun"

Message: "${text}"

Reply with JSON only:
{
  "isVague": true or false,
  "preferenceText": "good food + beach" or null
}

If vague, extract the preference criteria. If specific destination, set isVague to false.`;

    try {
      const { callClaude } = await import('../utils/claude.js');
      const response = await callClaude(prompt, { maxTokens: 100, temperature: 0.0 });
      const cleaned = response.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const parsed = JSON.parse(cleaned);
      
      if (parsed.isVague && parsed.preferenceText) {
        return {
          isVague: true,
          preferenceText: parsed.preferenceText,
        };
      }
      
      return { isVague: false, preferenceText: null };
    } catch (error) {
      console.error('Error detecting vague preference:', error);
      // Fallback: check for common vague patterns
      const vaguePatterns = [
        /\b(somewhere|place|places|destination|location)\s+(with|that|where)\s+/i,
        /\b(good|great|nice|amazing)\s+(food|beach|weather|culture|nightlife)/i,
        /\b(beach|food|culture|adventure|relaxing)\s+(destination|place|spot)/i,
      ];
      
      if (vaguePatterns.some(pattern => pattern.test(text))) {
        return {
          isVague: true,
          preferenceText: text.trim(),
        };
      }
      
      return { isVague: false, preferenceText: null };
    }
  }

  async extractDestinations(text) {
    // Use AI to extract destinations from natural language
    try {
      const prompt = `Extract all travel destinations (cities, countries, or regions) from this message: "${text}"

Examples:
- "Thailand, Japan, or maybe Europe" → ["Thailand", "Japan", "Europe"]
- "Tokyo or Shanghai" → ["Tokyo", "Shanghai"]
- "I'm thinking Japan" → ["Japan"]
- "Am a overruled then" → [] (no destinations)

Reply with JSON array only:
["destination1", "destination2", ...]

If no destinations found, return empty array [].`;

      const response = await callClaude(prompt, { maxTokens: 150, temperature: 0.0 });
      const cleaned = response.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const parsed = JSON.parse(cleaned);
      
      if (Array.isArray(parsed) && parsed.length > 0) {
        // Filter out empty strings and validate
        return parsed.filter(dest => dest && typeof dest === 'string' && dest.trim().length > 0 && dest.trim().length < 100);
      }
      
      return [];
    } catch (error) {
      // AI extraction failed - fallback to regex-based extraction
      console.warn(`   🗳️  Voting: AI destination extraction failed, using fallback:`, error.message);
      
      const destinations = [];
      const separators = [',', ' or ', ' and ', ' maybe ', ' perhaps ', ' or maybe ', ' and maybe '];
      let remaining = text.trim();
      
      // Try splitting by separators
      for (const sep of separators) {
        if (remaining.toLowerCase().includes(sep.toLowerCase())) {
          const parts = remaining.split(new RegExp(sep, 'i'));
          for (const part of parts) {
            const cleaned = part.trim().replace(/^(maybe|perhaps|or|and)\s+/i, '').trim();
            if (cleaned.length > 1 && cleaned.length < 100) {
              destinations.push(cleaned);
            }
          }
          break;
        }
      }
      
      // If no separators found, treat entire message as one destination
      if (destinations.length === 0) {
        const cleaned = text.trim();
        if (cleaned.length > 1 && cleaned.length < 100) {
          destinations.push(cleaned);
        }
      }
      
      return destinations;
    }
  }

  async normalizeDestination(destination, allMembers = []) {
    const trimmed = destination.trim();
    if (trimmed.length === 0) {
      throw new Error('NOT_A_DESTINATION');
    }
    
    // Quick rule-based checks first (no AI needed)
    const memberNames = allMembers.map(m => m.name.toLowerCase());
    const lowerDestination = trimmed.toLowerCase();
    
    // Reject if it matches a member name exactly
    if (memberNames.includes(lowerDestination)) {
      throw new Error('NAME_NOT_DESTINATION');
    }
    
    // Reject obvious non-destinations (common phrases, first-person statements)
    const obviousNonDestinations = [
      /\b(i|i'm|i am|we|we're|we are|you|you're|you are|they|they're|they are)\b/i,
      /\b(am a|this doesn|doesn't|look like|right vote|wrong|overruled)\b/i,
      /\b(ok|sounds good|yeah|yes|no|maybe|perhaps|wait|what|how|why|when|where)\b/i,
    ];
    
    if (obviousNonDestinations.some(pattern => pattern.test(trimmed))) {
      throw new Error('NOT_A_DESTINATION');
    }
    
    // Use AI to validate if it's actually a destination
    try {
      const prompt = `Is "${trimmed}" a travel destination (city, country, or region)?

Examples:
- "Tokyo" → yes (city)
- "Japan" → yes (country)
- "Am a overruled then" → no (not a destination)
- "This doesn't look right" → no (not a destination)
- "I'm flexible" → no (not a destination)

Reply with JSON only:
{
  "isDestination": true or false,
  "normalizedName": "Tokyo" or null
}

If it's a destination, provide a clean, normalized name (e.g., "Tokyo" not "tokyo" or "TOKYO"). If not, set isDestination to false and normalizedName to null.`;

      const response = await callClaude(prompt, { maxTokens: 100, temperature: 0.0 });
      const cleaned = response.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const parsed = JSON.parse(cleaned);
      
      if (!parsed.isDestination || !parsed.normalizedName) {
        throw new Error('NOT_A_DESTINATION');
      }
      
      return parsed.normalizedName;
    } catch (error) {
      // If AI fails or says it's not a destination, reject it
      if (error.message === 'NOT_A_DESTINATION' || error.message === 'NAME_NOT_DESTINATION') {
        throw error;
      }
      
      // AI call failed - use fallback: reject if it looks suspicious
      console.warn(`   🗳️  Voting: AI validation failed for "${trimmed}", using fallback:`, error.message);
      
      // Fallback: reject if it contains suspicious patterns
      if (obviousNonDestinations.some(pattern => pattern.test(trimmed))) {
        throw new Error('NOT_A_DESTINATION');
      }
      
      // Last resort: capitalize first letter (but log warning)
      console.warn(`   🗳️  Voting: Using fallback normalization for "${trimmed}"`);
      return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
    }
  }

  looksLikeDestinationMessage(text) {
    // Quick check: does the message contain common destination names?
    // This helps avoid false positives when messages start with "Ok" or contain "what"
    const lower = text.toLowerCase();
    const destinationKeywords = [
      'tokyo', 'japan', 'portugal', 'spain', 'italy', 'greece', 'france', 'bali',
      'thailand', 'vietnam', 'mexico', 'iceland', 'norway', 'sweden', 'denmark',
      'germany', 'switzerland', 'austria', 'croatia', 'morocco', 'turkey', 'egypt',
      'dubai', 'singapore', 'paris', 'london', 'barcelona', 'rome', 'amsterdam',
      'berlin', 'prague', 'vienna', 'budapest', 'lisbon', 'athens', 'cairo',
      'destination', 'destinations', 'place', 'places', 'city', 'cities', 'country', 'countries'
    ];
    
    return destinationKeywords.some(keyword => lower.includes(keyword));
  }

  consolidateSuggestions(suggestions) {
    // Simple deduplication: case-insensitive matching
    const seen = new Set();
    const unique = [];
    
    for (const suggestion of suggestions) {
      const normalized = suggestion.destination.toLowerCase().trim();
      if (!seen.has(normalized)) {
        seen.add(normalized);
        unique.push(suggestion.destination); // Keep original capitalization
      }
    }
    
    return unique;
  }

  createVotingMessage(options, type, memberCount = null, majorityThreshold = null) {
    const emojiMap = {
      'Portugal': '🇵🇹',
      'Greece': '🇬🇷',
      'Italy': '🇮🇹',
      'Spain': '🇪🇸',
      'France': '🇫🇷',
      'Japan': '🇯🇵',
      'Tokyo': '🗾',
      'Bali': '🏝️',
      'Iceland': '🧊',
    };

    // Calculate threshold if not provided
    if (!majorityThreshold && memberCount) {
      majorityThreshold = Math.ceil(memberCount * 0.6);
    }

    let message = `🗳️ TIME TO VOTE! 🗳️\n\n`;
    
    if (memberCount && majorityThreshold) {
      message += `We have ${memberCount} member${memberCount > 1 ? 's' : ''}. Vote by replying with JUST THE NUMBER:\n\n`;
    } else {
      message += `Vote by replying with JUST THE NUMBER:\n\n`;
    }

    options.forEach((option, index) => {
      const number = index + 1;
      const emoji = type === 'destination' 
        ? (emojiMap[option] || '✈️')
        : '📅';
      message += `${number}️⃣ ${emoji} ${option}\n`;
    });

    message += `\n📊 Voting Rules:\n`;
    if (memberCount && majorityThreshold) {
      message += `• Need ${majorityThreshold} out of ${memberCount} votes (60% majority) to lock it in\n`;
    } else {
      message += `• Need 60% majority to lock it in\n`;
    }
    message += `• Reply with just the number (e.g., "1" for ${options[0]})\n`;
    message += `• Poll closes when majority reached or after 48 hours\n\n`;
    message += `Example: Reply "1" to vote for ${options[0]}`;
    
    return message;
  }

  async closePoll(context) {
    const { trip, currentPoll } = context;

    // Tally votes
    const results = await db.getVoteResults(trip.id, currentPoll.type);

    if (results.length === 0) {
      return { success: false, error: 'No votes recorded' };
    }

    // Get winner (most votes)
    let winner = results[0].choice;
    const voteCount = parseInt(results[0].count, 10);

    // Validate winner against actual poll options (AI-powered)
    if (currentPoll.type === 'destination') {
      const suggestions = await db.getDestinationSuggestions(trip.id);
      const options = this.consolidateSuggestions(suggestions);
      
      // Check if winner matches an actual option
      const matchingOption = options.find(opt => opt.toLowerCase() === winner.toLowerCase());
      
      if (!matchingOption) {
        // Winner doesn't match any option - use AI to extract the correct choice
        console.warn(`   🗳️  Voting: Winner "${winner}" doesn't match any option, using AI to extract correct choice`);
        try {
          const prompt = `Vote result shows winner as: "${winner}"

But the actual poll options were:
${options.map((opt, idx) => `${idx + 1}. ${opt}`).join('\n')}

The stored winner doesn't match any option. What was the actual intended choice? Reply with JSON only:
{
  "optionName": "exact option name from the list above" or null
}

Return the exact option name that the user intended to vote for.`;

          const response = await callClaude(prompt, { maxTokens: 100, temperature: 0.0 });
          const cleaned = response.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
          const parsed = JSON.parse(cleaned);
          
          if (parsed.optionName) {
            const correctedOption = options.find(opt => opt.toLowerCase() === parsed.optionName.toLowerCase());
            if (correctedOption) {
              winner = correctedOption;
              console.log(`   🗳️  Voting: Corrected winner from "${results[0].choice}" to "${winner}"`);
            } else {
              // AI's suggestion doesn't match either - use most common valid option
              console.warn(`   🗳️  Voting: AI suggestion "${parsed.optionName}" doesn't match, using most common valid option`);
              // Find the most common vote that matches an actual option
              for (const result of results) {
                const validOption = options.find(opt => opt.toLowerCase() === result.choice.toLowerCase());
                if (validOption) {
                  winner = validOption;
                  console.log(`   🗳️  Voting: Using most common valid option: "${winner}"`);
                  break;
                }
              }
            }
          }
        } catch (error) {
          // AI correction failed - use most common valid option
          console.warn(`   🗳️  Voting: AI correction failed, using most common valid option:`, error.message);
          for (const result of results) {
            const validOption = options.find(opt => opt.toLowerCase() === result.choice.toLowerCase());
            if (validOption) {
              winner = validOption;
              console.log(`   🗳️  Voting: Using most common valid option: "${winner}"`);
              break;
            }
          }
        }
      } else {
        // Winner matches an option - use the exact option name from the list
        winner = matchingOption;
      }
      
      await db.updateTrip(trip.id, {
        destination: winner,
        stage: 'destination_set', // State machine will check if dates are set and transition appropriately
        stage_entered_at: new Date(),
      });

      // Trigger state transition - state machine will detect the stage change and emit the event automatically
      await checkStateTransitions(trip.id);
      
      return {
        success: true,
        output: {
          type: 'poll_completed',
          pollType: 'destination',
          winner,
          voteCount,
          sendTo: 'group',
        },
      };
    } else if (currentPoll.type === 'dates') {
      // For dates, winner is already a formatted date string from the options
      // We need to extract the actual dates from it
      // The winner will be something like "July 15-22" or a date range string
      const dates = parseDateRange(winner);

      if (dates.start && dates.end) {
        await db.updateTrip(trip.id, {
          start_date: dates.start,
          end_date: dates.end,
          stage: 'dates_set',
          stage_entered_at: new Date(),
        });

        // Trigger state transition - state machine will detect the stage change and emit the event automatically
        await checkStateTransitions(trip.id);
        
        return {
          success: true,
          output: {
            type: 'poll_completed',
            pollType: 'dates',
            winner,
            voteCount,
            sendTo: 'group',
          },
        };
      } else {
        return {
          success: false,
          output: {
            type: 'error',
            message: `Couldn't parse dates from "${winner}". Please try again.`,
            sendTo: 'group',
          },
        };
      }
    }

    await checkStateTransitions(trip.id);

    return { success: true, poll_closed: true };
  }

  getPendingVoters(context, existingVotes) {
    const voted = new Set(existingVotes.map(v => v.member_id));
    const pending = context.allMembers
      .filter(m => !voted.has(m.id))
      .map(m => m.name);

    return pending.length > 0 ? pending.join(', ') : 'everyone';
  }

  async sendToGroup(tripId, message) {
    const members = await db.getMembers(tripId);
    for (const member of members) {
      await twilioClient.sendSMS(member.phone_number, message);
    }
  }
}


