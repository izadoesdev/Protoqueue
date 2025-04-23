import { ProtoQueue, TaskResult, Logger } from './index';

// Create a debug-enabled logger for this example
const exampleLogger = new Logger('Example', true);

async function main() {
  // Initialize ProtoQueue with custom options
  const queue = new ProtoQueue('example-stream', 'example.subject', {
    maxRetries: 3,
    ackWait: 5000, // 5 seconds
    batchSize: 5,
    retryDelay: 2000 // 2 seconds
  });
  
  try {
    // Connect to NATS
    await queue.connect();
    exampleLogger.info('Connected to NATS');
    
    // Start processing tasks
    queue.process(async (task) => {
      // task is the decoded protobuf object with id, data, and metadata
      exampleLogger.info(`Processing task: ${task.metadata?.id}`);
      exampleLogger.info('Task data:', task.data);
      exampleLogger.info('Priority:', task.metadata?.priority || 'default');
      
      // Simulate random failures (30% chance to fail)
      const shouldFail = Math.random() < 0.3;
      
      // Simulate some work
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      if (shouldFail) {
        exampleLogger.warn(`Task ${task.metadata?.id} failed`);
        return { success: false, error: 'Random processing error' };
      }
      
      exampleLogger.info(`Task ${task.metadata?.id} completed successfully`);
      return { success: true };
    });
    
    // Setup DLQ processing
    queue.processDLQ(async (task) => {
      exampleLogger.info(`Processing DLQ task: ${task.metadata?.id}`);
      exampleLogger.info('DLQ task data:', task.data);
      exampleLogger.info('DLQ task retries:', task.metadata?.retries);
      
      // In a real application, you might:
      // - Send alerts
      // - Log to a monitoring system
      // - Attempt to fix the issue manually
      // - Move to a separate error queue for later analysis
      
      // For this example, we'll just acknowledge it
      exampleLogger.info(`DLQ task ${task.metadata?.id} handled`);
      return { success: true };
    });
    
    // Enqueue some tasks
    exampleLogger.info('Enqueueing tasks...');
    
    await queue.enqueue({
      data: { message: 'Hello, World!', type: 'greeting' },
      metadata: { priority: 1 }
    });

    await queue.enqueue({
      data: { message: 'Process data', type: 'processing', items: [1, 2, 3] },
      metadata: { priority: 5 }
    });
    
    await queue.enqueue({
      data: { message: 'Send notification', type: 'notification', user: 'user123' },
      metadata: { priority: 3 }
    });
    
    // Print queue stats every 5 seconds
    setInterval(async () => {
      try {
        const stats = await queue.getStats();
        exampleLogger.info('Queue Stats:', stats);
      } catch (error) {
        exampleLogger.error('Failed to get stats:', error);
      }
    }, 5000);

    // Keep the process running
    exampleLogger.info('Waiting for messages...');
    await new Promise(() => {});
  } catch (error) {
    exampleLogger.error('Error:', error);
    await queue.disconnect();
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  exampleLogger.info('Shutting down...');
  try {
    const queue = new ProtoQueue('example-stream', 'example.subject');
    await queue.disconnect();
    exampleLogger.info('Disconnected from NATS');
  } catch (error) {
    exampleLogger.error('Error during shutdown:', error);
  }
  process.exit(0);
});

main().catch((error) => exampleLogger.error('Unhandled error:', error)); 