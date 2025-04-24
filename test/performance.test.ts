import { Protoqueue } from '../src/core';
import { protoService } from '../src/services/proto';
import { sleep } from '../src/utils/helpers';
import type { TaskData, TaskResult } from '../src/types';
import { afterAll, beforeAll, describe, expect, test, it } from 'bun:test';

async function waitFor(fn: () => boolean, timeout = 5000, interval = 20) {
  const start = Date.now();
  while (!fn()) {
    if (Date.now() - start > timeout) throw new Error('Timeout');
    await sleep(interval);
  }
}

describe('Protoqueue Performance Tests', () => {
  let queue: Protoqueue;
  const streamName = 'performance-test';
  const subject = 'performance.test';
  const batchSizes = [10, 50];
  const messageCounts = [5, 10];
  const results: Record<string, any> = {};
  const TEST_TIMEOUT = 30000;
  const BATCH_SIZE = 20;
  const MESSAGE_COUNT = 50;

  beforeAll(async () => {
    queue = new Protoqueue({
      url: 'nats://localhost:4222',
      streamName: 'test-stream',
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
    queue = new Protoqueue({
      streamName: singleStream, 
      options: {
        ackWait: 5000, 
        batchSize: 1,
      },
    });
    await queue.connect();
    const task = {
      data: { message: 'Test message' },
      metadata: { timestamp: Date.now() }
    };
    const taskId = await queue.add('test', task);
    let processedCount = 0;
    let resolve: () => void = () => {};
    const done = new Promise<void>(r => { resolve = r; });
    await queue.process('test', async (task: TaskData) => {
      processedCount++;
      if (processedCount === 1) resolve();
      return { success: true };
    });
    await done;
    await queue.disconnect();
    expect(processedCount).toBe(1);
  });

  // Test queue performance with different batch sizes and message counts
  test.each(batchSizes)('Queue Performance - Batch Size: %d', async (batchSize) => {
    const batchResults: Record<string, any> = {};
    let totalProcessedCount = 0;
    for (const messageCount of messageCounts) {
      const testStream = `${streamName}-perf-${batchSize}-${messageCount}`;
      const testSubject = `${subject}.perf.${batchSize}.${messageCount}`;
      queue = new Protoqueue({
        streamName: testStream,
          options: {
          ackWait: 5000,
          batchSize: batchSize,
        },
      });
      await queue.connect();
      const tasks = Array.from({ length: messageCount }, (_, i) => ({
        data: { id: i },
        metadata: { timestamp: Date.now() },
      }));
      let enqueuedCount = 0;
      const enqueueTime = await (async () => {
        const start = process.hrtime.bigint();
        const chunkSize = 10;
        for (let i = 0; i < tasks.length; i += chunkSize) {
          const chunk = tasks.slice(i, i + chunkSize);
          await Promise.all(chunk.map(task => queue.add('test', task)));
          enqueuedCount += chunk.length;
        }
        const end = process.hrtime.bigint();
        return Number(end - start) / 1e9;
      })();
      let processedCount = 0;
      let resolve: () => void = () => {};
      const done = new Promise<void>(r => { resolve = r; });
      await queue.process('test', async (task: TaskData) => {
        processedCount++;
        if (processedCount === messageCount) resolve();
        return { success: true };
      });
      await done;
      await queue.disconnect();
      totalProcessedCount += processedCount;
    }
    results[`batchSize_${batchSize}`] = batchResults;
    expect(totalProcessedCount).toBeGreaterThan(0);
  });

  // it('should process messages in batches efficiently', async () => {
  //   const startTime = Date.now();
  //   let processedCount = 0;
  //   let resolve: () => void = () => {};
  //   const done = new Promise<void>(r => { resolve = r; });
  //   await queue.process(async (task: TaskData): Promise<TaskResult> => {
  //     processedCount++;
  //     if (processedCount === 20) resolve();
  //     return { success: true };
  //   });
  //   const batchResults: string[] = [];
  //   const EFFICIENT_MESSAGE_COUNT = 20;
  //   for (let i = 0; i < EFFICIENT_MESSAGE_COUNT; i += BATCH_SIZE) {
  //     const batch = Array(Math.min(BATCH_SIZE, EFFICIENT_MESSAGE_COUNT - i))
  //       .fill(null)
  //       .map((_, index) => ({
  //         data: { value: i + index },
  //         metadata: { timestamp: Date.now() }
  //       }));
  //     const batchIds = await queue.enqueueBatch(batch);
  //     batchResults.push(...batchIds);
  //   }
  //   await done;
  //   const endTime = Date.now();
  //   const duration = endTime - startTime;
  //   const messagesPerSecond = (EFFICIENT_MESSAGE_COUNT / duration) * 1000;
  //   expect(processedCount).toBe(EFFICIENT_MESSAGE_COUNT);
  //   expect(batchResults.length).toBe(EFFICIENT_MESSAGE_COUNT);
  //   expect(duration).toBeLessThan(TEST_TIMEOUT);
  // }, TEST_TIMEOUT);
}); 