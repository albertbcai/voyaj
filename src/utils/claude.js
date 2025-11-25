import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config/index.js';

const anthropic = new Anthropic({
  apiKey: config.anthropic.apiKey,
});

// Retry helper with exponential backoff
async function retryWithBackoff(fn, maxRetries = 3, baseDelay = 1000) {
  let lastError;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      // Check if it's a retryable error (529 Overloaded, 500 Server Error, 503 Service Unavailable)
      const isRetryable = error.status === 529 || error.status === 500 || error.status === 503;
      
      if (!isRetryable || attempt === maxRetries - 1) {
        // Only log if it's the final attempt or not retryable
        if (attempt === maxRetries - 1 && isRetryable) {
          // Don't log 529 errors - they're temporary and handled gracefully
          if (error.status !== 529) {
            console.warn(`Claude API error after ${maxRetries} retries (${error.status}): ${error.message}`);
          }
        } else if (!isRetryable) {
          console.error('Claude API non-retryable error:', error.message);
        }
        throw error;
      }
      
      // Exponential backoff: 1s, 2s, 4s
      const delay = baseDelay * Math.pow(2, attempt);
      // Only log retry attempts if it's the last retry (reduce noise)
      if (attempt === maxRetries - 2) {
        console.log(`Claude API overloaded (${error.status}), retrying... (attempt ${attempt + 1}/${maxRetries})`);
      }
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError;
}

export async function callClaude(prompt, options = {}) {
  return await retryWithBackoff(async () => {
    const response = await anthropic.messages.create({
      model: options.model || 'claude-sonnet-4-20250514',
      max_tokens: options.maxTokens || 1024,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    return response.content[0].text;
  });
}

export async function callClaudeWithSystemPrompt(systemPrompt, userPrompt, options = {}) {
  return await retryWithBackoff(async () => {
    const response = await anthropic.messages.create({
      model: options.model || 'claude-sonnet-4-20250514',
      max_tokens: options.maxTokens || 1024,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: userPrompt,
        },
      ],
    });

    return response.content[0].text;
  });
}

