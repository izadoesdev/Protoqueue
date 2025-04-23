import { describe, test, expect, beforeAll, afterAll, mock } from 'bun:test';
import { Protoqueue, type TaskResult } from '../src/index';
import { randomUUID } from 'node:crypto';

describe('Protoqueue', () => {
  test('should be defined', () => {
    expect(Protoqueue).toBeDefined();
  });

  // Integration tests that require a running NATS server
  describe('integration tests', () => {
    let queue: Protoqueue;
    const testStreamName = `test-stream-${randomUUID().slice(0, 8)}`;
    const testSubject = `test.subject.${randomUUID().slice(0, 8)}`;

    beforeAll(async () => {
      // Create test queue
      queue = await Protoqueue.create({
        streamName: testStreamName,
        subject: testSubject,
        options: {
          ackWait: 1000,      // Fast ack wait for testing
          batchSize: 5,       // Small batch size for testing
          maxRetries: 1       // Minimal retries for testing
        }
      });
    });
    
    afterAll(async () => {
      await queue.disconnect();
    });

    test('should enqueue and get stats', async () => {
      // Enqueue a task
      const taskId = await queue.enqueue({
        data: { test: 'data' },
        metadata: { priority: 1 }
      });

      expect(taskId).toBeDefined();
      expect(typeof taskId).toBe('string');
      
      // Get stats
      const stats = await queue.getStats();
      expect(stats).toBeDefined();
      expect(stats.messages).toBeGreaterThanOrEqual(1);
    });
    
    test('should process tasks', async () => {
      // Create a simple test queue
      const processQueue = await Protoqueue.create({
        streamName: `process-${testStreamName}`,
        subject: `process.${testSubject}`,
        options: {
          batchSize: 1,  // Process one message at a time for faster testing
          ackWait: 500   // Short ack wait for testing
        }
      });
      
      try {
        // Results tracker
        const processed = new Set<string>();
        let resolve: () => void = () => {};
        const done = new Promise<void>(r => { resolve = r; });
        // Set up handler
        await processQueue.process(async (task) => {
          const id = (task as any).id || task.metadata?.id;
          processed.add(id);
          if (processed.has(id)) resolve();
          return { success: true };
        });
        // Enqueue a task
        const taskId = await processQueue.enqueue({
          data: { test: 'process' }
        });
        // Wait for processing
        await done;
        // Check it was processed
        expect([...processed].some(x => x === taskId)).toBe(true);
      } finally {
        await processQueue.disconnect();
      }
    });
    
    test('should batch enqueue tasks', async () => {
      // Create a simple batch queue
      const batchQueue = await Protoqueue.create({
        streamName: `batch-${testStreamName}`,
        subject: `batch.${testSubject}`
      });
      
      try {
        // Enqueue small batch
        const tasks = [
          { data: { message: 'Task 1' } },
          { data: { message: 'Task 2' } },
          { data: { message: 'Task 3' } }
        ];
        const ids = await batchQueue.enqueueBatch(tasks);
        // Check we got 3 IDs back
        expect(ids.length).toBe(3);
        // Get stats and check we have at least 3 messages
        const stats = await batchQueue.getStats();
        expect(stats.messages).toBeGreaterThanOrEqual(3);
      } finally {
        await batchQueue.disconnect();
      }
    });
  });
}); 