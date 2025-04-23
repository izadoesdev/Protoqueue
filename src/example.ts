import { ProtoQueue, TaskResult } from './index';
import logger from './services/logger';

// Create a debug-enabled logger for this example
const exampleLogger = logger.child({ module: 'Example' });

async function main() {
  // Create queue with optimized configuration
  const queue = await ProtoQueue.create({
    streamName: 'example-stream',
    subject: 'example.subject',
    options: {
      ackWait: 3000,    // Reduced from 5000ms to 3000ms for faster processing
      batchSize: 15,    // Increased from 5 to 15 for better throughput
      maxRetries: 3     // Keep retry logic for reliability
    }
  });
  
  try {
    exampleLogger.info('Connected to NATS');
    
    // Start processing tasks using an optimized handler
    queue.process(async (task) => {
      const { id, priority = 'default' } = task.metadata || {};
      
      // Log only essential information to reduce overhead
      exampleLogger.info(`Processing task: ${id} (priority: ${priority})`);
      
      try {
        // Simulate work with reduced artificial delay
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Simulate random failures (20% chance - reduced from 30%)
        if (Math.random() < 0.2) {
          throw new Error('Random processing error');
        }
        
        exampleLogger.info(`Task ${id} completed`);
        return { success: true };
      } catch (error) {
        exampleLogger.warn(`Task ${id} failed: ${error instanceof Error ? error.message : String(error)}`);
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    });

    // Batch-enqueue tasks for better performance
    exampleLogger.info('Enqueueing tasks in batch...');
    
    const tasks = [
      {
        data: { message: 'Hello, World!', type: 'greeting' },
        metadata: { priority: 1 }
      },
      {
        data: { message: 'Process data', type: 'processing' },
        metadata: { priority: 5 }
      },
      {
        data: { message: 'Send notification', type: 'notification' },
        metadata: { priority: 3 }
      }
    ];
    
    // Process tasks in parallel for better performance
    await queue.enqueueBatch(tasks);
    
    // Get stats less frequently to reduce overhead
    const statsInterval = setInterval(async () => {
      try {
        const stats = await queue.getStats();
        exampleLogger.info('Queue Stats:', stats);
      } catch (error) {
        exampleLogger.error('Failed to get stats:', error);
      }
    }, 10000); // Changed from 5000ms to 10000ms
    
    // Set up proper signal handling with cleanup
    const cleanup = async () => {
      clearInterval(statsInterval);
      exampleLogger.info('Shutting down...');
      await queue.disconnect();
      exampleLogger.info('Disconnected from NATS');
      process.exit(0);
    };
    
    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
    
    exampleLogger.info('Waiting for messages...');
    await new Promise(() => {});
  } catch (error) {
    exampleLogger.error('Error:', error);
    await queue.disconnect();
    process.exit(1);
  }
}

main().catch((error) => exampleLogger.error('Unhandled error:', error)); 