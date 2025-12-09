// Persona definitions for group chat simulator

export const PERSONAS = [
  {
    id: 'alex',
    name: 'Alex',
    phoneNumber: '+15550000001',
    description: 'an enthusiastic planner who loves organizing trips',
    traits: [
      'Quick to respond and suggest ideas',
      'Gets excited about destinations',
      'Votes early and decisively',
      'Sometimes sends casual "can\'t wait!" messages',
      'Asks logistical questions occasionally'
    ],
    color: '#3b82f6', // blue
    casualFrequency: 0.2 // 20% chance of casual messages
  },
  {
    id: 'sam',
    name: 'Sam',
    phoneNumber: '+15550000002',
    description: 'an indecisive friend who takes time to commit',
    traits: [
      'Asks lots of questions before deciding',
      'Changes mind sometimes',
      'Slow to respond',
      'Prefers flexibility',
      'Sends "hmm" or "not sure" messages'
    ],
    color: '#10b981', // green
    casualFrequency: 0.1
  },
  {
    id: 'jordan',
    name: 'Jordan',
    phoneNumber: '+15550000003',
    description: 'a casual participant who sends off-topic messages',
    traits: [
      'Sends casual messages frequently',
      'Sometimes goes off-topic',
      'Short responses like "sounds good"',
      'Flexible and laid-back',
      'Occasionally asks random questions'
    ],
    color: '#f59e0b', // amber
    casualFrequency: 0.5 // 50% chance - this persona is more casual
  },
  {
    id: 'taylor',
    name: 'Taylor',
    phoneNumber: '+15550000004',
    description: 'a detail-oriented person who wants specifics',
    traits: [
      'Asks about logistics and details',
      'Wants to know exact dates and times',
      'Asks "what about hotels?" type questions',
      'Provides detailed responses',
      'Sometimes sends longer messages'
    ],
    color: '#8b5cf6', // purple
    casualFrequency: 0.15
  },
  {
    id: 'riley',
    name: 'Riley',
    phoneNumber: '+15550000005',
    description: 'a laid-back friend who goes with the flow',
    traits: [
      'Very flexible - "whatever works"',
      'Short, simple responses',
      'Rarely asks questions',
      'Quick to agree',
      'Sends casual "cool" or "nice" messages'
    ],
    color: '#ec4899', // pink
    casualFrequency: 0.3
  }
];

// Get persona by ID
export function getPersonaById(id) {
  return PERSONAS.find(p => p.id === id);
}

// Get persona by phone number
export function getPersonaByPhone(phoneNumber) {
  return PERSONAS.find(p => p.phoneNumber === phoneNumber);
}

