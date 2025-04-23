import { Protoqueue } from '../src/core';
import type { TaskData, TaskResult } from '../src/types';
import { describe, expect, test, afterAll } from 'bun:test';

const streamName = 'critical-coverage-stream';
const subject = 'critical.coverage.subject';

let queue: Protoqueue;
afterAll(async () => { if (queue) await queue.disconnect(); });

test('max retries and permanent failure', async () => {
  queue = new Protoqueue({
    streamName: `${streamName}-retries`,
    subject: `${subject}.retries`,
    options: { maxRetries: 1, batchSize: 1, retryDelay: 5 },
  });
  await queue.connect();
  let callCount = 0;
  let resolve: () => void = () => {};
  const done = new Promise<void>(r => { resolve = r; });
  await queue.process(async () => {
    callCount++;
    console.log('max retries handler call', callCount);
    if (callCount === 2) resolve();
    return { success: false };
  });
  await queue.enqueue({ data: { foo: 'bar' } });
  await done;
  expect(callCount).toBe(2);
  await queue.disconnect();
}, { timeout: 10000 });

test('concurrent processing of multiple tasks', async () => {
  queue = new Protoqueue({
    streamName: `${streamName}-concurrent`,
    subject: `${subject}.concurrent`,
    options: { batchSize: 2 },
  });
  await queue.connect();
  const total = 2;
  let processed = 0;
  let resolve: () => void = () => {};
  const done = new Promise<void>(r => { resolve = r; });
  await queue.process(async () => {
    processed++;
    console.log('concurrent handler', processed);
    if (processed === total) resolve();
    return { success: true };
  });
  await queue.enqueueBatch(Array.from({ length: total }, (_, i) => ({ data: { i } })));
  await done;
  expect(processed).toBe(total);
  await queue.disconnect();
});

test('graceful shutdown does not lose tasks', async () => {
  queue = new Protoqueue({
    streamName: `${streamName}-shutdown`,
    subject: `${subject}.shutdown`,
    options: { batchSize: 2 },
  });
  await queue.connect();
  let processed = 0;
  let resolve: () => void = () => {};
  const done = new Promise<void>(r => { resolve = r; });
  await queue.process(async () => {
    processed++;
    if (processed === 2) {
      await queue.disconnect();
      resolve();
    }
    return { success: true };
  });
  await queue.enqueueBatch([{ data: { a: 1 } }, { data: { b: 2 } }]);
  await done;
  expect(processed).toBe(2);
});

test('reconnect and resume processing', async () => {
  const queue1 = new Protoqueue({
    streamName: `${streamName}-reconnect`,
    subject: `${subject}.reconnect`,
    options: { batchSize: 1 },
  });
  await queue1.connect();
  let processed = 0;
  let resolve: () => void = () => {};
  const done = new Promise<void>(r => { resolve = r; });
  await queue1.process(async () => {
    processed++;
    console.log('reconnect handler (first)', processed);
    if (processed === 1) {
      await queue1.disconnect();
      setTimeout(async () => {
        const queue2 = new Protoqueue({
          streamName: `${streamName}-reconnect`,
          subject: `${subject}.reconnect`,
          options: { batchSize: 1 },
        });
        await queue2.connect();
        await queue2.process(async () => {
          processed++;
          console.log('reconnect handler (second)', processed);
          if (processed === 2) resolve();
          return { success: true };
        });
        await queue2.enqueue({ data: { c: 3 } });
      }, 200);
    }
    return { success: true };
  });
  await queue1.enqueue({ data: { a: 1 } });
  await done;
  expect(processed).toBe(2);
  await queue1.disconnect();
});

test('batch enqueue/process consistency', async () => {
  queue = new Protoqueue({
    streamName: `${streamName}-batch`,
    subject: `${subject}.batch`,
    options: { batchSize: 2 },
  });
  await queue.connect();
  const total = 2;
  let processed = 0;
  let resolve: () => void = () => {};
  const done = new Promise<void>(r => { resolve = r; });
  await queue.process(async () => {
    processed++;
    if (processed === total) resolve();
    return { success: true };
  });
  await queue.enqueueBatch(Array.from({ length: total }, (_, i) => ({ data: { i } })));
  await done;
  expect(processed).toBe(total);
  await queue.disconnect();
});

test('custom metadata roundtrip', async () => {
  queue = new Protoqueue({
    streamName: `${streamName}-meta`,
    subject: `${subject}.meta`,
    options: { batchSize: 1 },
  });
  await queue.connect();
  let receivedMeta: any = null;
  let receivedTask: any = null;
  let resolve: () => void = () => {};
  const done = new Promise<void>(r => { resolve = r; });
  await queue.process(async (task: TaskData) => {
    receivedMeta = task.metadata;
    receivedTask = task;
    console.log('custom metadata handler', task);
    resolve();
    return { success: true };
  });
  const meta = { foo: 'bar', custom: 42 };
  await queue.enqueue({ data: { test: 1 }, metadata: meta });
  await done;
  // Check if custom fields are in the merged metadata
  expect(receivedMeta?.foo).toBe('bar');
  expect(receivedMeta?.custom).toBe(42);
  await queue.disconnect();
});

test('error propagation does not crash process', async () => {
  queue = new Protoqueue({
    streamName: `${streamName}-error`,
    subject: `${subject}.error`,
    options: { batchSize: 1 },
  });
  await queue.connect();
  let processed = false;
  let resolve: () => void = () => {};
  const done = new Promise<void>(r => { resolve = r; });
  await queue.process(async () => {
    processed = true;
    resolve();
    throw new Error('handler error');
  });
  await queue.enqueue({ data: { test: 'err' } });
  await done;
  expect(processed).toBe(true);
  await queue.disconnect();
}); 