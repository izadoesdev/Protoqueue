import { describe, test, expect, beforeAll, afterAll, mock } from 'bun:test';
import { ProtoQueue, type TaskResult } from '../src/index';

describe('ProtoQueue', () => {
  test('should be defined', () => {
    expect(ProtoQueue).toBeDefined();
  });

  // These are integration tests that require a running NATS server
  // They will be skipped if NATS is not available
  describe.skip('integration tests', () => {
    let queue: ProtoQueue;

    beforeAll(async () => {
      queue = new ProtoQueue('test-stream', 'test.subject');
      try {
        await queue.connect();
      } catch (error) {
        console.error('Failed to connect to NATS:', error);
        throw error;
      }
    });

    afterAll(async () => {
      await queue.disconnect();
    });

    test('should enqueue and process a task', async () => {
      const handler = mock((task: any): Promise<TaskResult> => {
        return Promise.resolve({ success: true });
      });

      queue.process(handler);

      const taskId = await queue.enqueue({
        data: { test: 'data' },
        metadata: { priority: 1 }
      });

      expect(taskId).toBeDefined();
      
      // Wait for task to be processed
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      expect(handler).toHaveBeenCalled();
    });
    
    test('should move failed tasks to DLQ after max retries', async () => {
      const handler = mock((task: any): Promise<TaskResult> => {
        return Promise.resolve({ success: false, error: 'Test failure' });
      });

      const dlqHandler = mock((task: any): Promise<TaskResult> => {
        return Promise.resolve({ success: true });
      });

      queue.process(handler);
      queue.processDLQ(dlqHandler);

      const taskId = await queue.enqueue({
        data: { test: 'data' },
        metadata: { priority: 1 }
      });

      expect(taskId).toBeDefined();
      
      // Wait for task to be processed and moved to DLQ
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      expect(handler).toHaveBeenCalled();
      expect(dlqHandler).toHaveBeenCalled();
    });
  });
}); 