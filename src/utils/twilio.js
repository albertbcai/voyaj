// Mock Twilio client for testing (no real SMS needed)
// In production, replace with real Twilio client

class MockTwilioClient {
  constructor() {
    this.sentMessages = [];
    this.messagesByRecipient = new Map();
  }

  async sendSMS(to, body) {
    const message = {
      to,
      body,
      timestamp: new Date(),
    };
    
    this.sentMessages.push(message);
    
    // Store by recipient for easy retrieval
    if (!this.messagesByRecipient.has(to)) {
      this.messagesByRecipient.set(to, []);
    }
    this.messagesByRecipient.get(to).push(message);
    
    console.log('\n' + '='.repeat(60));
    console.log(`📤 BOT RESPONSE [${new Date().toLocaleTimeString()}]`);
    console.log(`   To: ${to}`);
    console.log(`   Body: "${body}"`);
    console.log('='.repeat(60) + '\n');
    
    return { sid: `mock_${Date.now()}` };
  }

  getSentMessages() {
    return this.sentMessages;
  }

  clearSentMessages() {
    this.sentMessages = [];
    this.messagesByRecipient.clear();
  }

  getMessagesForRecipient(phoneNumber) {
    return this.messagesByRecipient.get(phoneNumber) || [];
  }

  getLatestMessageForRecipient(phoneNumber) {
    const messages = this.getMessagesForRecipient(phoneNumber);
    return messages.length > 0 ? messages[messages.length - 1] : null;
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




