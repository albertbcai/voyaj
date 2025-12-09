// Base agent class that all agents extend
import * as db from '../db/queries.js';

export class BaseAgent {
  constructor(agentName, emoji) {
    this.agentName = agentName;
    this.emoji = emoji || '🤖';
  }

  async handle(context, message) {
    throw new Error('handle() must be implemented by subclass');
  }

  // Structured logging helpers for consistent debugging
  log(level, message, data = {}) {
    const prefix = `   ${this.emoji} ${this.agentName}:`;
    const timestamp = new Date().toISOString();
    
    const logMessage = `${prefix} ${message}`;
    const logData = data && Object.keys(data).length > 0 ? ` | Data: ${JSON.stringify(data)}` : '';
    
    switch (level) {
      case 'error':
        console.error(`${logMessage}${logData}`);
        break;
      case 'warn':
        console.warn(`${logMessage}${logData}`);
        break;
      case 'info':
      default:
        console.log(`${logMessage}${logData}`);
        break;
    }
  }

  logEntry(methodName, context, message) {
    this.log('info', `→ ${methodName}`, {
      tripId: context.trip?.id,
      stage: context.trip?.stage,
      member: context.member?.name,
      messagePreview: message?.body?.substring(0, 50),
    });
  }

  logExit(methodName, result) {
    this.log('info', `← ${methodName}`, {
      success: result?.success,
      outputType: result?.output?.type,
      skipped: result?.skip,
    });
  }

  async logError(error, context, message, additionalContext = {}) {
    const errorContext = {
      agent: this.agentName,
      tripId: context.trip?.id,
      stage: context.trip?.stage,
      member: context.member?.name,
      messageBody: message?.body,
      messageFrom: message?.from,
      ...additionalContext,
    };

    this.log('error', `ERROR in ${this.agentName}`, {
      error: error.message,
      stack: error.stack?.split('\n')[0], // First line of stack
      ...errorContext,
    });

    // Also log to database if tripId is available
    if (context.trip?.id) {
      try {
        await db.logError(context.trip.id, error, errorContext);
      } catch (dbError) {
        console.error(`   ❌ Failed to log error to database:`, dbError.message);
      }
    }
  }

  logAICall(methodName, input, output, error = null) {
    if (error) {
      this.log('warn', `AI call failed: ${methodName}`, {
        input: typeof input === 'string' ? input.substring(0, 100) : JSON.stringify(input).substring(0, 100),
        error: error.message,
      });
    } else {
      this.log('info', `AI call: ${methodName}`, {
        inputPreview: typeof input === 'string' ? input.substring(0, 100) : JSON.stringify(input).substring(0, 100),
        outputPreview: typeof output === 'string' ? output.substring(0, 100) : JSON.stringify(output).substring(0, 100),
      });
    }
  }
}




