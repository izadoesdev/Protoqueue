# Protoqueue

A high-performance, reliable, and scalable task queue system built on [NATS JetStream](https://docs.nats.io/nats-concepts/jetstream) and [Protocol Buffers](https://developers.google.com/protocol-buffers).

![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)

---

## Table of Contents
- [Overview](#overview)
- [Core Concepts](#core-concepts)
- [Quick Start](#quick-start)
- [API Reference](#api-reference)
- [Configuration](#configuration)
- [Error Handling](#error-handling)
- [Monitoring](#monitoring)
- [Performance Tips](#performance-tips)
- [Roadmap](#roadmap)
- [Example Applications](#example-applications)
- [Contributing](#contributing)
- [License](#license)
- [Acknowledgments](#acknowledgments)

---

## Overview

**Protoqueue** is a robust, type-safe, and efficient task queue for Node.js and Bun, designed for modern distributed systems. It leverages NATS JetStream for persistence and delivery guarantees, and Protocol Buffers for fast, compact serialization.

**Key Benefits:**
- At-least-once delivery with automatic retries
- Dead-letter queue (DLQ) for failed tasks
- Horizontal scalability (multiple consumers)
- Real-time queue stats
- Fully typed TypeScript API
- Simple, explicit connection and processing model

---

## Core Concepts

**Protoqueue** builds on NATS JetStream. Here are the main concepts:

- **Stream:** A persistent log of messages (tasks) in NATS JetStream.
- **Subject:** A topic string for publishing and subscribing to tasks (e.g., `tasks.email`).
- **Consumer:** A worker that pulls and processes tasks from a stream.
- **ACK/NAK/TERM:**
  - **ACK:** Acknowledge successful processing (removes task).
  - **NAK:** Negative acknowledgment (task will be retried).
  - **TERM:** Terminal failure (task is moved to DLQ or dropped).
- **DLQ (Dead Letter Queue):** Where tasks go after exceeding max retries.
- **Protobuf:** Used for efficient, type-safe serialization of task data.

---

## Quick Start

### 1. Install

```bash
bun add protoqueue
# or
npm install protoqueue
```

### 2. Prerequisites
- [NATS Server](https://nats.io/download/nats-io/nats-server/) running with JetStream enabled
- Node.js 16+ or Bun

### 3. Minimal Example

```typescript
import { Protoqueue } from 'protoqueue';

// 1. Create the queue instance
const queue = new Protoqueue({
  streamName: 'my-stream',
  subject: 'tasks.email',
});

// 2. Connect to NATS
await queue.connect('nats://localhost:4222');

// 3. Enqueue a task
await queue.enqueue({
  data: { to: 'user@example.com', subject: 'Welcome!' },
  metadata: { priority: 3 }
});

// 4. Process tasks
queue.process(async (task) => {
  console.log('Processing:', task.data);
  // ...do work...
  return { success: true };
});
```

---

## API Reference

### Protoqueue

#### Constructor
```typescript
new Protoqueue(config: ProtoqueueConfig)
```
- `config.streamName`: Name of the JetStream stream
- `config.subject`: Subject to publish/subscribe
- `config.options`: (Optional) QueueOptions
- `config.url`: (Optional) NATS server URL
- `config.verbose`: (Optional) Enable verbose logging

#### Methods
- `connect(url?: string): Promise<this>` — Connect to NATS
- `disconnect(): Promise<void>` — Gracefully disconnect
- `enqueue(task: { data: T, metadata?: Record<string, any> }): Promise<string>` — Enqueue a task
- `enqueueBatch(tasks: Array<{ data: T, metadata?: Record<string, any> }>): Promise<string[]>` — Enqueue multiple tasks
- `process(handler: (task: TaskData) => Promise<TaskResult>): Promise<this>` — Start processing tasks
- `getStats(): Promise<QueueStats>` — Get queue statistics

#### Types
```typescript
interface TaskData {
  id: string;
  data: unknown;
  metadata?: {
    timestamp?: number;
    [key: string]: unknown;
  };
}

interface TaskResult {
  success: boolean;
  error?: string;
  details?: Record<string, any>;
}

interface QueueOptions {
  maxRetries?: number;
  ackWait?: number;
  batchSize?: number;
  retryDelay?: number;
}

interface QueueStats {
  messages: number;
  bytes: number;
  firstSequence: number;
  lastSequence: number;
  consumer_count: number;
}
```

---

## Configuration

### ProtoqueueConfig
```typescript
interface ProtoqueueConfig {
  url?: string; // NATS server URL
  streamName: string; // JetStream stream name
  subject: string; // Subject to publish/subscribe
  options?: QueueOptions; // Queue options
  verbose?: boolean; // Enable verbose logging
}
```

### QueueOptions
- `maxRetries` (default: 3): Max retry attempts before moving to DLQ
- `ackWait` (default: 30000): Time (ms) to wait for task acknowledgment
- `batchSize` (default: 10): Number of tasks to pull at once
- `retryDelay` (default: 1000): Delay (ms) before retrying a failed task

---

## Error Handling

- If your handler returns `{ success: false, error: '...' }`, the task will be retried (up to `maxRetries`).
- If your handler throws, the error is logged and the task is retried.
- After exceeding `maxRetries`, the task is moved to the DLQ (if configured) or dropped.
- The `TaskResult.details` field can be used to pass extra error info (e.g., stack trace).

**Example:**
```typescript
queue.process(async (task) => {
  try {
    // ...process...
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message, details: { stack: err.stack } };
  }
});
```

---

## Monitoring

Get real-time stats:
```typescript
const stats = await queue.getStats();
console.log(`Messages: ${stats.messages}, Consumers: ${stats.consumer_count}`);
```

---

## Performance Tips
- **Batch Size:** Increase `batchSize` for higher throughput, but ensure your handler can keep up.
- **ackWait:** Set to the max time your handler might need.
- **Retry Delay:** Tune for your workload; higher values reduce NATS load.
- **Horizontal Scaling:** Run multiple consumers for parallel processing.
- **Explicit Connection:** Always call `connect()` before enqueueing or processing.

---

## Roadmap

- [ ] **DLQ Processing:** Expose `processDLQ` for handling dead-lettered tasks
- [ ] **Priority Queues:** Support for task prioritization
- [ ] **Web Dashboard:** Real-time monitoring and management UI
- [ ] **Pluggable Serializers:** Support for JSON, Avro, etc.
- [ ] **Advanced Metrics:** Prometheus/Grafana integration
- [ ] **Multi-Stream Support:** Route tasks to different streams/subjects
- [ ] **Better Type Inference:** Stronger typing for task data
- [ ] **Graceful Shutdown:** Improved cancellation and draining
- [ ] **Cloud Native Examples:** Recipes for Kubernetes, Docker Compose

---

## Example Applications

### Simple Worker
```typescript
import { Protoqueue } from 'protoqueue';

async function main() {
  const queue = new Protoqueue({ streamName: 'tasks', subject: 'tasks.email' });
  await queue.connect();

  queue.process(async (task) => {
    // Simulate work
    await new Promise(r => setTimeout(r, 100));
    return { success: true };
  });
}

main();
```

### Task Producer
```typescript
import { Protoqueue } from 'protoqueue';

async function sendTasks() {
  const queue = new Protoqueue({ streamName: 'tasks', subject: 'tasks.email' });
  await queue.connect();

  for (let i = 0; i < 10; i++) {
    await queue.enqueue({
      data: { email: `user${i}@example.com` },
      metadata: { priority: 1 }
    });
  }

  await queue.disconnect();
}

sendTasks();
```

---

## Contributing

Contributions are welcome! Please:
1. Fork the repo
2. Create a feature branch
3. Commit and push your changes
4. Open a Pull Request

---

## License

MIT

---

## Acknowledgments
- [NATS.io](https://nats.io/) for the messaging platform
- [Protocol Buffers](https://developers.google.com/protocol-buffers) for serialization
