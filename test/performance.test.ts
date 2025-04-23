import { Protoqueue } from '../src/core';
import { protoService } from '../src/services/proto';
import { sleep } from '../src/utils/helpers';
import type { TaskData, TaskResult } from '../src/types';
import { afterAll, beforeAll, describe, expect, test, it } from 'bun:test';

describe('Protoqueue Performance Tests', () => {
  let queue: Protoqueue;
  const streamName = 'performance-test';
  const subject = 'performance.test';
  const batchSizes = [10, 50];
  const messageCounts = [100, 500];
  const results: Record<string, any> = {};
  const TEST_TIMEOUT = 30000;
  const BATCH_SIZE = 100;
  const MESSAGE_COUNT = 1000;

  beforeAll(async () => {
    queue = new Protoqueue({
      url: 'nats://localhost:4222',
      streamName: 'test-stream',
      subject: 'test.subject',
      options: {
        maxRetries: 3,
        retryDelay: 1000,
        batchSize: BATCH_SIZE
      }
    });
    await queue.connect();
  });

  afterAll(async () => {
    await queue.disconnect();
  });

  // Helper function to measure execution time
  const measureTime = async (fn: () => Promise<void>): Promise<number> => {
    const start = process.hrtime.bigint();
    await fn();
    const end = process.hrtime.bigint();
    return Number(end - start) / 1e9; // Convert to seconds
  };

  // Test protobuf encoding/decoding performance
  test('Protobuf Performance', async () => {
    // Create a task object compatible with the protobuf structure
    const taskMessage = protoService.createTask(
      'test-id',
      { message: 'Hello, World!' },
      { timestamp: Date.now() }
    );

    // Measure encoding
    const encodeTime = await measureTime(async () => {
      for (let i = 0; i < 10000; i++) {
        protoService.encodeTask(taskMessage);
      }
    });

    // Measure decoding
    const encoded = protoService.encodeTask(taskMessage);
    const decodeTime = await measureTime(async () => {
      for (let i = 0; i < 10000; i++) {
        protoService.decodeTask(encoded);
      }
    });

    results.protobuf = {
      encodeTime,
      decodeTime,
      encodeOpsPerSec: 10000 / encodeTime,
      decodeOpsPerSec: 10000 / decodeTime,
    };

    console.log('Protobuf Performance:');
    console.log(`Encoding: ${results.protobuf.encodeOpsPerSec.toFixed(2)} ops/sec`);
    console.log(`Decoding: ${results.protobuf.decodeOpsPerSec.toFixed(2)} ops/sec`);
  });

  // Diagnostic test with a single message
  test('Single Message Test', async () => {
    const singleStream = `${streamName}-single`;
    const singleSubject = `${subject}.single`;
    
    // Create a fresh queue for this test
    queue = new Protoqueue({
      streamName: singleStream,
      subject: singleSubject,
      options: {
        ackWait: 5000, 
        batchSize: 1,
      },
    });
    
    console.log('Connecting to NATS...');
    await queue.connect();
    console.log('Connected to NATS');
    
    const task = {
      data: { message: 'Test message' },
      metadata: { timestamp: Date.now() }
    };
    
    console.log('Enqueueing task...');
    const taskId = await queue.enqueue(task);
    console.log(`Task enqueued with ID: ${taskId}`);
    
    let processedCount = 0;
    
    // Process the message using Protoqueue's built-in processing
    await queue.process(async (task: TaskData) => {
      console.log(`Processing task: ${task.id}`);
      processedCount++;
      return { success: true };
    });
    
    // Wait for processing
    await sleep(1000);
    
    console.log(`Processed ${processedCount} messages`);
    await queue.disconnect();
    
    expect(processedCount).toBe(1);
  });

  // Test queue performance with different batch sizes and message counts
  test.each(batchSizes)('Queue Performance - Batch Size: %d', async (batchSize) => {
    const batchResults: Record<string, any> = {};
    let totalProcessedCount = 0;

    for (const messageCount of messageCounts) {
      // Use unique stream/subject for each test to avoid interference
      const testStream = `${streamName}-perf-${batchSize}-${messageCount}`;
      const testSubject = `${subject}.perf.${batchSize}.${messageCount}`;
      
      // Create a fresh queue
      queue = new Protoqueue({
        streamName: testStream,
        subject: testSubject,
        options: {
          ackWait: 5000,
          batchSize: batchSize,
        },
      });
      
      await queue.connect();
      console.log(`Connected to stream: ${testStream}, subject: ${testSubject}`);

      // Create tasks with smaller payload
      const tasks = Array.from({ length: messageCount }, (_, i) => ({
        data: { id: i },
        metadata: { timestamp: Date.now() },
      }));

      // Measure enqueue time
      let enqueuedCount = 0;
      const enqueueTime = await measureTime(async () => {
        // Enqueue in smaller chunks manually
        const chunkSize = 50;
        for (let i = 0; i < tasks.length; i += chunkSize) {
          const chunk = tasks.slice(i, i + chunkSize);
          await Promise.all(chunk.map(task => queue.enqueue(task)));
          enqueuedCount += chunk.length;
          console.log(`Enqueued ${enqueuedCount}/${messageCount} messages`);
          // Small delay to allow processing
          await sleep(10);
        }
      });

      console.log(`All ${enqueuedCount} messages enqueued in ${enqueueTime.toFixed(2)}s`);

      // Set up processing
      let processedCount = 0;
      let processingTimeout = false;
      
      // Set a timeout for processing
      const timeoutId = setTimeout(() => {
        processingTimeout = true;
      }, 4000);
      
      // Process messages using Protoqueue's built-in processing
      await queue.process(async (task: TaskData) => {
        if (processingTimeout) return { success: false };
        processedCount++;
        return { success: true };
      });
      
      // Wait for processing to complete or timeout
      await sleep(3000);
      
      clearTimeout(timeoutId);

      const completionRate = (processedCount / messageCount) * 100;
      
      batchResults[messageCount] = {
        enqueueTime,
        processTime: 3, // Fixed 3 second processing window
        processedCount,
        enqueueRate: messageCount / enqueueTime,
        processRate: processedCount / 3,
        totalTime: enqueueTime + 3,
        completionRate,
      };
      
      console.log(`\nBatch Size: ${batchSize}, Message Count: ${messageCount}`);
      console.log(`Processed: ${processedCount}/${messageCount} (${completionRate.toFixed(2)}%)`);
      console.log(`Enqueue Rate: ${batchResults[messageCount].enqueueRate.toFixed(2)} msgs/sec`);
      console.log(`Process Rate: ${batchResults[messageCount].processRate.toFixed(2)} msgs/sec`);
      
      // Stop processing
      await queue.disconnect();
      await sleep(100);
      
      totalProcessedCount += processedCount;
    }

    results[`batchSize_${batchSize}`] = batchResults;
    expect(totalProcessedCount).toBeGreaterThan(0); // Ensure some messages were processed
  });

  // Test memory usage with reduced message count
  test('Memory Usage', async () => {
    const initialMemory = process.memoryUsage();
    
    // Process a smaller number of messages
    const messageCount = 100;
    const memoryStream = `${streamName}-memory`;
    const memorySubject = `${subject}.memory`;
    
    // Create a fresh queue
    queue = new Protoqueue({
      streamName: memoryStream,
      subject: memorySubject,
      options: {
        ackWait: 2000,
        batchSize: 20,
      },
    });
    await queue.connect();
    
    // Create tasks
    const tasks = Array.from({ length: messageCount }, (_, i) => ({
      data: { id: i },
      metadata: { timestamp: Date.now() },
    }));

    // Enqueue in chunks
    const chunkSize = 20;
    let enqueuedCount = 0;
    for (let i = 0; i < tasks.length; i += chunkSize) {
      const chunk = tasks.slice(i, i + chunkSize);
      await Promise.all(chunk.map(task => queue.enqueue(task)));
      enqueuedCount += chunk.length;
      await sleep(10);
    }
    
    console.log(`All ${enqueuedCount} messages enqueued for memory test`);
    
    // Process messages using Protoqueue's built-in processing
    let processedCount = 0;
    
    await queue.process(async (task: TaskData) => {
      processedCount++;
      return { success: true };
    });
    
    // Wait for processing
    await sleep(3000);
    
    const finalMemory = process.memoryUsage();
    
    results.memory = {
      initial: initialMemory,
      final: finalMemory,
      difference: {
        heapUsed: finalMemory.heapUsed - initialMemory.heapUsed,
        heapTotal: finalMemory.heapTotal - initialMemory.heapTotal,
        rss: finalMemory.rss - initialMemory.rss,
      },
      processedCount,
      completionRate: (processedCount / messageCount) * 100,
    };

    console.log('\nMemory Usage:');
    console.log(`Processed: ${processedCount}/${messageCount} (${results.memory.completionRate.toFixed(2)}%)`);
    console.log(`Heap Used: ${(results.memory.difference.heapUsed / 1024 / 1024).toFixed(2)} MB`);
    console.log(`Heap Total: ${(results.memory.difference.heapTotal / 1024 / 1024).toFixed(2)} MB`);
    console.log(`RSS: ${(results.memory.difference.rss / 1024 / 1024).toFixed(2)} MB`);
    
    await queue.disconnect();
    expect(processedCount).toBeGreaterThan(0); // Ensure some messages were processed
  });

  it('should process messages in batches efficiently', async () => {
    const startTime = Date.now();
    let processedCount = 0;

    // Start processing
    await queue.process(async (task: TaskData): Promise<TaskResult> => {
      processedCount++;
      return { success: true };
    });

    // Enqueue messages in batches
    const batchResults: string[] = [];
    for (let i = 0; i < MESSAGE_COUNT; i += BATCH_SIZE) {
      const batch = Array(Math.min(BATCH_SIZE, MESSAGE_COUNT - i))
        .fill(null)
        .map((_, index) => ({
          data: { value: i + index },
          metadata: { timestamp: Date.now() }
        }));
      
      const batchIds = await queue.enqueueBatch(batch);
      batchResults.push(...batchIds);
    }

    // Wait for processing to complete
    while (processedCount < MESSAGE_COUNT) {
      await sleep(100);
      if (Date.now() - startTime > TEST_TIMEOUT) {
        throw new Error('Test timed out waiting for messages to process');
      }
    }

    const endTime = Date.now();
    const duration = endTime - startTime;
    const messagesPerSecond = (MESSAGE_COUNT / duration) * 1000;

    console.log(`Processed ${MESSAGE_COUNT} messages in ${duration}ms`);
    console.log(`Average throughput: ${messagesPerSecond.toFixed(2)} messages/second`);
    console.log(`Average latency: ${(duration / MESSAGE_COUNT).toFixed(2)}ms per message`);

    expect(processedCount).toBe(MESSAGE_COUNT);
    expect(batchResults.length).toBe(MESSAGE_COUNT);
    expect(duration).toBeLessThan(TEST_TIMEOUT);
  }, TEST_TIMEOUT);
}); 