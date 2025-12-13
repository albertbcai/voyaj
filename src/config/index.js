import dotenv from 'dotenv';

dotenv.config();

export const config = {
  database: {
    url: process.env.DATABASE_URL || 'postgresql://localhost:5432/voyaj',
  },
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY,
  },
  twilio: {
    accountSid: process.env.TWILIO_ACCOUNT_SID,
    authToken: process.env.TWILIO_AUTH_TOKEN,
    phoneNumber: process.env.TWILIO_PHONE_NUMBER,
  },
  server: {
    port: process.env.PORT || 3000,
    env: process.env.NODE_ENV || 'development',
    testMode: process.env.TEST_MODE === 'true' || process.env.NODE_ENV === 'test',
  },
  claude: {
    // Model selection: Haiku for tests (cheapest), Sonnet 4 for production
    // Haiku 3: $0.25/$1.25 per million tokens (input/output) - cheapest option for state machine testing
    // Haiku 3.5: $0.80/$4.00 per million tokens (input/output) - newer but more expensive
    // Sonnet 4: $3.00/$15.00 per million tokens (input/output)
    defaultModel: process.env.TEST_MODE === 'true' || process.env.NODE_ENV === 'test'
      ? 'claude-3-haiku-20240307'  // Cheapest model for testing (deprecated but sufficient for state machine tests)
      : 'claude-sonnet-4-20250514',  // Best model for production
  },
};




