// Mock Claude API for testing
export class MockClaudeClient {
  constructor() {
    this.calls = [];
    this.responses = new Map(); // Map of prompt patterns to responses
  }

  async callClaude(prompt, options = {}) {
    this.calls.push({ prompt, options, timestamp: new Date() });
    
    // Check for predefined responses
    for (const [pattern, response] of this.responses.entries()) {
      if (typeof pattern === 'string' && prompt.includes(pattern)) {
        return response;
      }
      if (pattern instanceof RegExp && pattern.test(prompt)) {
        return response;
      }
    }

    // Default responses based on prompt content
    if (prompt.includes('intent')) {
      if (prompt.includes('name') || prompt.includes('join')) {
        return 'member_join';
      }
      if (prompt.includes('vote') || prompt.includes('Tokyo') || prompt.includes('Bali')) {
        return 'vote';
      }
      if (prompt.includes('flight') || prompt.includes('booked')) {
        return 'flight';
      }
      return 'conversation';
    }

    if (prompt.includes('Extract flight information')) {
      const json = {
        booked: true,
        airline: prompt.match(/\b([A-Z]{2})\s*(\d+)\b/)?.[1] || null,
        flightNumber: prompt.match(/\b([A-Z]{2})\s*(\d+)\b/)?.[2] || null,
        departureTime: null,
        arrivalTime: null,
      };
      return JSON.stringify(json);
    }

    if (prompt.includes('extract location') || prompt.includes('japan')) {
      return 'japan';
    }

    // Default response
    return 'I understand.';
  }

  async callClaudeWithSystemPrompt(systemPrompt, userPrompt, options = {}) {
    return await this.callClaude(userPrompt, options);
  }

  setResponse(pattern, response) {
    this.responses.set(pattern, response);
  }

  clearResponses() {
    this.responses.clear();
  }

  getCalls() {
    return this.calls;
  }

  clearCalls() {
    this.calls = [];
  }

  getCallCount() {
    return this.calls.length;
  }
}

export const mockClaudeClient = new MockClaudeClient();



