// Per-trip message queue (in-memory for MVP)

class MessageQueue {
  constructor() {
    this.queues = new Map(); // tripId → Array<Message>
    this.processing = new Set(); // tripIds currently processing
  }

  async add(tripId, message) {
    const queue = this.queues.get(tripId) || [];
    queue.push({
      ...message,
      timestamp: Date.now(),
    });
    this.queues.set(tripId, queue);

    // Start processing if not already processing
    if (!this.processing.has(tripId)) {
      this.processing.add(tripId);
      // Process asynchronously
      setImmediate(() => this.processQueue(tripId));
    }
  }

  async processQueue(tripId) {
    const queue = this.queues.get(tripId) || [];

    while (queue.length > 0) {
      const message = queue[0];

      try {
        // Import orchestrator here to avoid circular dependency
        const { orchestrator } = await import('../orchestrator.js');
        await orchestrator.process(tripId, message);
        queue.shift();
      } catch (error) {
        console.error(`Failed to process message for trip ${tripId}:`, error);
        queue.shift(); // Remove failed message
      }
    }

    this.processing.delete(tripId);
  }

  getQueueLength(tripId) {
    return (this.queues.get(tripId) || []).length;
  }

  clearQueue(tripId) {
    this.queues.delete(tripId);
    this.processing.delete(tripId);
  }
}

export const messageQueue = new MessageQueue();



