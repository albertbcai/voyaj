// Base agent class that all agents extend

export class BaseAgent {
  async handle(context, message) {
    throw new Error('handle() must be implemented by subclass');
  }
}



