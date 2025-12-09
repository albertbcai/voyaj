// Parse chat messages to infer trip stage and context

export function parseChatContext(chatHistory) {
  // Get last few bot messages to infer stage
  const botMessages = chatHistory
    .filter(msg => msg.sender === 'Bot' || msg.sender === 'Voyaj' || (typeof msg === 'string' ? false : msg.text && !msg.sender))
    .slice(-5)
    .map(msg => (typeof msg === 'string' ? msg : msg.text || '').toLowerCase());

  const allMessages = chatHistory.map(msg => msg.text.toLowerCase()).join(' ');

  // Infer stage from bot messages
  if (botMessages.some(msg => msg.includes('reply with your name') || msg.includes('everyone reply'))) {
    return {
      stage: 'collecting_members',
      action: 'join',
      context: 'Bot is asking people to join with their names'
    };
  }

  if (botMessages.some(msg => msg.includes('where should we go') || msg.includes('destination'))) {
    return {
      stage: 'collecting_destinations',
      action: 'suggest_destination',
      context: 'Bot is asking for destination suggestions'
    };
  }

  if (botMessages.some(msg => msg.includes('here are your options') || msg.includes('vote with just the number'))) {
    const hasDestinationOptions = botMessages.some(msg => 
      msg.includes('portugal') || msg.includes('greece') || msg.includes('italy') || 
      msg.includes('1️⃣') || msg.includes('2️⃣') || msg.includes('3️⃣')
    );
    const hasDateOptions = botMessages.some(msg => 
      msg.includes('march') || msg.includes('april') || msg.includes('may') || 
      msg.includes('june') || msg.includes('july') || msg.includes('august')
    );

    if (hasDestinationOptions) {
      return {
        stage: 'voting_destination',
        action: 'vote_destination',
        context: 'Bot is asking to vote on destination options',
        options: extractVotingOptions(chatHistory[chatHistory.length - 1]?.text || '')
      };
    } else if (hasDateOptions) {
      return {
        stage: 'voting_dates',
        action: 'vote_dates',
        context: 'Bot is asking to vote on date options',
        options: extractVotingOptions(chatHistory[chatHistory.length - 1]?.text || '')
      };
    }
  }

  if (botMessages.some(msg => msg.includes('when can everyone go') || msg.includes('date availability'))) {
    return {
      stage: 'collecting_dates',
      action: 'provide_dates',
      context: 'Bot is asking for date availability'
    };
  }

  if (botMessages.some(msg => msg.includes('book your flights') || msg.includes('text me when you book'))) {
    return {
      stage: 'tracking_flights',
      action: 'report_flight',
      context: 'Bot is asking people to report flight bookings'
    };
  }

  // Default: general conversation
  return {
    stage: 'conversation',
    action: 'chat',
    context: 'General conversation'
  };
}

function extractVotingOptions(messageText) {
  // Extract numbered options from bot message
  const options = [];
  const lines = messageText.split('\n');
  
  for (const line of lines) {
    // Match patterns like "1️⃣ 🇵🇹 Portugal" or "1. Portugal"
    const match = line.match(/(\d+)[️⃣.]\s*(.+)/);
    if (match) {
      options.push({
        number: parseInt(match[1], 10),
        text: match[2].trim()
      });
    }
  }
  
  return options;
}

// Determine what a persona should do based on context
export function getPersonaAction(context, persona, chatHistory) {
  const { stage, action, options } = context;

  // Check if persona has already responded in this stage
  const recentBotMessages = chatHistory
    .filter(msg => msg.sender === 'Bot')
    .slice(-3);
  
  const personaMessages = chatHistory
    .filter(msg => msg.sender === persona.name)
    .slice(-5);

  // If casual message requested, always do that
  if (action === 'casual') {
    return {
      type: 'casual',
      description: 'Send a casual, off-topic message'
    };
  }

  // Determine action based on stage
  switch (stage) {
    case 'collecting_members':
      // Check if persona has joined
      const hasJoined = personaMessages.some(msg => 
        msg.text.toLowerCase().includes(persona.name.toLowerCase()) ||
        msg.text.length < 30 // Short name-like message
      );
      if (!hasJoined) {
        return {
          type: 'join',
          description: 'Join the trip with your name',
          message: persona.name
        };
      }
      break;

    case 'collecting_destinations':
      // Check if persona has suggested
      const hasSuggested = personaMessages.some(msg => 
        msg.text.length > 2 && 
        !msg.text.match(/^\d+$/) && // Not just a number
        !msg.text.toLowerCase().includes('ok') &&
        !msg.text.toLowerCase().includes('sounds good')
      );
      if (!hasSuggested) {
        return {
          type: 'suggest_destination',
          description: 'Suggest a destination',
          needsAI: true
        };
      }
      break;

    case 'voting_destination':
    case 'voting_dates':
      // Check if persona has voted
      const hasVoted = personaMessages.some(msg => 
        msg.text.match(/^\d+$/) || // Just a number
        msg.text.toLowerCase().match(/^(i vote|vote|option)\s*\d+/i)
      );
      if (!hasVoted && options && options.length > 0) {
        // Pick a random option (personality-based)
        const optionNumber = persona.id === 'sam' 
          ? Math.floor(Math.random() * options.length) + 1 // Indecisive - random
          : 1; // Others vote for first option
        return {
          type: 'vote',
          description: `Vote for option ${optionNumber}`,
          message: optionNumber.toString()
        };
      }
      break;

    case 'collecting_dates':
      // Check if persona has provided dates
      const hasProvidedDates = personaMessages.some(msg => 
        msg.text.toLowerCase().includes('flexible') ||
        msg.text.match(/\d+\/\d+/) || // Date format
        msg.text.match(/(january|february|march|april|may|june|july|august|september|october|november|december)/i)
      );
      if (!hasProvidedDates) {
        return {
          type: 'provide_dates',
          description: 'Provide date availability',
          needsAI: true
        };
      }
      break;

    case 'tracking_flights':
      // Check if persona has reported flight
      const hasReportedFlight = personaMessages.some(msg => 
        msg.text.toLowerCase().includes('booked') ||
        msg.text.toLowerCase().includes('flight') ||
        msg.text.match(/\b(AA|UA|Delta|United|American|Southwest|JetBlue|DL)\s*\d+/i)
      );
      if (!hasReportedFlight) {
        return {
          type: 'report_flight',
          description: 'Report flight booking',
          needsAI: true
        };
      }
      break;
  }

  // Default: casual message or general response
  return {
    type: 'casual',
    description: 'Send a casual message',
    needsAI: true
  };
}

