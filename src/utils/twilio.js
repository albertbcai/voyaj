// Mock Twilio client for testing (no real SMS needed)
// In production, replace with real Twilio client

class MockTwilioClient {
  constructor() {
    this.sentMessages = [];
  }

  async sendSMS(to, body) {
    const message = {
      to,
      body,
      timestamp: new Date(),
    };
    
    this.sentMessages.push(message);
    console.log(`[MOCK SMS] To: ${to}`);
    console.log(`[MOCK SMS] Body: ${body}`);
    console.log('---');
    
    return { sid: `mock_${Date.now()}` };
  }

  getSentMessages() {
    return this.sentMessages;
  }

  clearSentMessages() {
    this.sentMessages = [];
  }
}

// Export singleton instance
export const twilioClient = new MockTwilioClient();

// In production, uncomment this:
/*
import twilio from 'twilio';
import { config } from '../config/index.js';

export const twilioClient = twilio(
  config.twilio.accountSid,
  config.twilio.authToken
);
*/



