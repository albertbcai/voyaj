import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config/index.js';
import {
  getSnapshotKey,
  snapshotExists,
  loadSnapshot,
  saveSnapshot,
  isRecordMode,
  isReplayMode,
} from './snapshotManager.js';

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

// Cost tracking for eval scenarios
let costTracker = {
  totalInputTokens: 0,
  totalOutputTokens: 0,
  calls: [],
};

// Model pricing per million tokens (input/output)
const MODEL_PRICING = {
  'claude-3-5-haiku-20241022': { input: 0.80, output: 4.00 },
  'claude-sonnet-4-20250514': { input: 3.00, output: 15.00 },
};

export function getCostTracker() {
  return costTracker;
}

export function resetCostTracker() {
  costTracker = {
    totalInputTokens: 0,
    totalOutputTokens: 0,
    calls: [],
  };
}

export function calculateCost(tracker) {
  let totalCost = 0;
  for (const call of tracker.calls) {
    const pricing = MODEL_PRICING[call.model] || MODEL_PRICING['claude-3-5-haiku-20241022'];
    const inputCost = (call.inputTokens / 1_000_000) * pricing.input;
    const outputCost = (call.outputTokens / 1_000_000) * pricing.output;
    totalCost += inputCost + outputCost;
  }
  return totalCost;
}

// Snapshot-based mocking: Record real API responses and replay them
// This replaces the old pattern-based mocking system for better reliability

export async function callClaude(prompt, options = {}) {
  const snapshotKey = getSnapshotKey(prompt, null, options);
  
  // Replay mode: Check for existing snapshot (skip if recording)
  if (isReplayMode() && !isRecordMode()) {
    if (await snapshotExists(snapshotKey)) {
      // Snapshot found - use it (don't track cost)
      return await loadSnapshot(snapshotKey);
    } else {
      // Snapshot missing - will make real API call
      console.log(`   ⚠️  Snapshot missing: ${snapshotKey.substring(0, 8)}... (will use real API)`);
      console.log(`   📝 Prompt preview: ${prompt.substring(0, 100)}...`);
      
      // Track for scenario log
      const { getSnapshotUsageLog } = await import('./snapshotManager.js');
      const log = getSnapshotUsageLog();
      log.push({
        type: 'missing',
        key: snapshotKey.substring(0, 8),
        promptPreview: prompt.substring(0, 100),
        timestamp: new Date(),
      });
    }
  }
  
  // In record mode, always call API (even if snapshot exists, to update it)

  // Real API call (or record mode)
  const response = await retryWithBackoff(async () => {
    // Use explicit model override, or default from config (Haiku in test mode, Sonnet 4 in production)
    const model = options.model || config.claude.defaultModel;
    
    const apiResponse = await anthropic.messages.create({
      model,
      max_tokens: options.maxTokens || 1024,
      temperature: options.temperature ?? 1.0,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    // Track usage for cost calculation
    if (apiResponse.usage) {
      const inputTokens = apiResponse.usage.input_tokens || 0;
      const outputTokens = apiResponse.usage.output_tokens || 0;
      costTracker.totalInputTokens += inputTokens;
      costTracker.totalOutputTokens += outputTokens;
      costTracker.calls.push({
        model,
        inputTokens,
        outputTokens,
      });
    }

    return apiResponse.content[0].text;
  });

  // Record mode: Save snapshot
  const recordMode = isRecordMode();
  if (recordMode) {
    try {
      await saveSnapshot(snapshotKey, response, {
        prompt: prompt.substring(0, 100), // Preview for debugging
        model: options.model || config.claude.defaultModel,
      });
    } catch (error) {
      console.error(`❌ Failed to save snapshot in callClaude: ${error.message}`);
      throw error;
    }
  }

  return response;
}

export async function callClaudeWithSystemPrompt(systemPrompt, userPrompt, options = {}) {
  const snapshotKey = getSnapshotKey(userPrompt, systemPrompt, options);
  
  // Replay mode: Check for existing snapshot (skip if recording)
  if (isReplayMode() && !isRecordMode()) {
    if (await snapshotExists(snapshotKey)) {
      // Snapshot found - use it (don't track cost)
      return await loadSnapshot(snapshotKey);
    } else {
      // Snapshot missing - will make real API call
      console.log(`   ⚠️  Snapshot missing: ${snapshotKey.substring(0, 8)}... (will use real API)`);
      console.log(`   📝 Prompt preview: ${userPrompt.substring(0, 100)}...`);
      
      // Track for scenario log
      const { getSnapshotUsageLog } = await import('./snapshotManager.js');
      const log = getSnapshotUsageLog();
      log.push({
        type: 'missing',
        key: snapshotKey.substring(0, 8),
        promptPreview: userPrompt.substring(0, 100),
        timestamp: new Date(),
      });
    }
  }
  
  // In record mode, always call API (even if snapshot exists, to update it)

  // Real API call (or record mode)
  const response = await retryWithBackoff(async () => {
    // Use explicit model override, or default from config (Haiku in test mode, Sonnet 4 in production)
    const model = options.model || config.claude.defaultModel;
    
    const apiResponse = await anthropic.messages.create({
      model,
      max_tokens: options.maxTokens || 1024,
      temperature: options.temperature ?? 1.0,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: userPrompt,
        },
      ],
    });

    // Track usage for cost calculation
    if (apiResponse.usage) {
      const inputTokens = apiResponse.usage.input_tokens || 0;
      const outputTokens = apiResponse.usage.output_tokens || 0;
      costTracker.totalInputTokens += inputTokens;
      costTracker.totalOutputTokens += outputTokens;
      costTracker.calls.push({
        model,
        inputTokens,
        outputTokens,
      });
    }

    return apiResponse.content[0].text;
  });

  // Record mode: Save snapshot
  if (isRecordMode()) {
    try {
      await saveSnapshot(snapshotKey, response, {
        prompt: userPrompt.substring(0, 100), // Preview for debugging
        systemPrompt: systemPrompt ? systemPrompt.substring(0, 100) : null,
        model: options.model || config.claude.defaultModel,
      });
    } catch (error) {
      console.error(`❌ Failed to save snapshot in callClaudeWithSystemPrompt: ${error.message}`);
      throw error;
    }
  }

  return response;
}

