// Mock Twilio client for testing
export class MockTwilioClient {
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
    return { sid: `mock_${Date.now()}` };
  }

  getSentMessages() {
    return this.sentMessages;
  }

  clearSentMessages() {
    this.sentMessages = [];
  }

  getMessagesTo(phoneNumber) {
    return this.sentMessages.filter(m => m.to === phoneNumber);
  }

  getLastMessageTo(phoneNumber) {
    const messages = this.getMessagesTo(phoneNumber);
    return messages.length > 0 ? messages[messages.length - 1] : null;
  }
}

export const mockTwilioClient = new MockTwilioClient();


