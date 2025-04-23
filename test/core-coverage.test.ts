import { Protoqueue } from '../src/core';
import { afterAll, describe, expect, test } from 'bun:test';

describe('Protoqueue Core Coverage', () => {
  let queue: Protoqueue;
  const streamName = 'core-coverage-stream';
  const subject = 'core.coverage.subject';

  afterAll(async () => {
    if (queue) await queue.disconnect();
  });

  test('decode errors: handler not called', async () => {
    queue = new Protoqueue({
      streamName: `${streamName}-decode`,
      subject: `${subject}.decode`,
      options: { batchSize: 1 },
    });
    await queue.connect();
    let processed = false;
    let resolve: () => void = () => {};
    const done = new Promise<void>(r => { resolve = r; });
    await queue.process(async () => {
      processed = true;
      resolve();
      return { success: true };
    });
    if ((queue as any).js) {
      await (queue as any).js.publish((queue as any).config.subject, Buffer.from('not-protobuf'));
    }
    // Wait a short time to ensure handler is not called
    await Promise.race([
      done,
      new Promise(res => setTimeout(res, 100))
    ]);
    expect(processed).toBe(false);
    await queue.disconnect();
  });

  test('empty batch returns empty array', async () => {
    queue = new Protoqueue({
      streamName: `${streamName}-empty`,
      subject: `${subject}.empty`,
      options: { batchSize: 1 },
    });
    await queue.connect();
    expect(await queue.enqueueBatch([])).toEqual([]);
    await queue.disconnect();
  });

  test('verbose flag: no error thrown, logs suppressed', async () => {
    queue = new Protoqueue({
      streamName: `${streamName}-verbose`,
      subject: `${subject}.verbose`,
      options: { batchSize: 1 },
      verbose: false,
    });
    await queue.connect();
    await queue.enqueue({ data: { foo: 'bar' } });
    await queue.disconnect();
  });

  test('disconnect cleans up resources', async () => {
    queue = new Protoqueue({
      streamName: `${streamName}-cleanup`,
      subject: `${subject}.cleanup`,
      options: { batchSize: 1 },
    });
    await queue.connect();
    await queue.disconnect();
    expect((queue as any).isConnected).toBe(false);
    expect((queue as any).nc).toBe(null);
    expect((queue as any).js).toBe(null);
    expect((queue as any).jsm).toBe(null);
  });

  test('getStats returns messages and bytes', async () => {
    queue = new Protoqueue({
      streamName: `${streamName}-stats`,
      subject: `${subject}.stats`,
      options: { batchSize: 1 },
    });
    await queue.connect();
    const stats = await queue.getStats();
    expect(stats).toHaveProperty('messages');
    expect(stats).toHaveProperty('bytes');
    await queue.disconnect();
  });
}); 