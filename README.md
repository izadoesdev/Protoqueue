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
- [Type-Safe Jobs](#type-safe-jobs)
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
  subjectPrefix: 'jobs',
});

// 2. Connect to NATS
await queue.connect('nats://localhost:4222');

// 3. Add a job (fully type-safe)
await queue.add('analytics', {
  event: 'page_view',
  userId: '123',
  properties: { referrer: 'google' }
});

// 4. Process jobs with type safety
queue.process('analytics', async (payload, metadata) => {
  console.log(`Processing ${payload.event} for user ${payload.userId}`);
  // ...do work...
  return { success: true };
});

// 5. Process email jobs (different payload type automatically inferred)
queue.process('email', async (payload) => {
  console.log(`Sending email to: ${payload.to}`);
  // TypeScript knows payload has to, subject, and body properties
  return { success: true };
});
```

### 4. Customizing Job Types

```typescript
// Define your own job types in a central file
const myJobs = {
  pdf: {
    url: 'https://example.com/document.pdf',
    pages: [1, 2, 3],
    format: 'A4',
  } as {
    url: string;
    pages: number[];
    format: string;
  },
  
  notification: {
    userId: 'user_123',
    message: 'New message received',
    type: 'push',
  } as {
    userId: string;
    message: string;
    type: 'email' | 'sms' | 'push';
  }
};

// Create a queue with your custom job types
const customQueue = new Protoqueue<typeof myJobs>({
  streamName: 'custom-jobs',
});

// Now TypeScript ensures the payload matches the job type
await customQueue.add('pdf', {
  url: 'https://example.com/invoice.pdf',
  pages: [1],
  format: 'A4'
});

// This would cause a TypeScript error:
// await customQueue.add('pdf', { url: 'https://example.com/doc.pdf' });
// Property 'pages' is missing in type '{ url: string; }' but required in type...
```

---

## API Reference

### Protoqueue

#### Constructor
```typescript
new Protoqueue<T extends JobMap = typeof defaultJobs>(config: ProtoqueueConfig)
```
- `config.streamName`: Name of the JetStream stream
- `config.subjectPrefix`: Prefix for job subjects (default: "jobs")
- `config.options`: (Optional) QueueOptions
- `config.url`: (Optional) NATS server URL
- `config.verbose`: (Optional) Enable verbose logging

#### Methods
- `connect(url?: string): Promise<this>` — Connect to NATS
- `disconnect(): Promise<void>` — Gracefully disconnect
- `add<K extends keyof T>(jobName: K, payload: T[K], metadata?: Record<string, any>): Promise<string>` — Add a job to the queue
- `addBatch<K extends keyof T>(jobName: K, payloads: Array<T[K]>, metadata?: Record<string, any>): Promise<string[]>` — Add multiple jobs
- `process<K extends keyof T>(jobName: K, handler: (payload: T[K], metadata?: Record<string, any>) => Promise<TaskResult>): this` — Register a job handler
- `getStats(): Promise<QueueStats>` — Get queue statistics

#### Static Methods
- `create<T extends JobMap = typeof defaultJobs>(config: ProtoqueueConfig): Promise<Protoqueue<T>>` — Create and connect a queue 

#### Types
```typescript
// Define your job types
const jobs = {
  email: {} as {
    to: string;
    subject: string;
    body: string;
  },
  analytics: {} as {
    event: string;
    userId: string;
    properties?: Record<string, unknown>;
  }
};

// Use in your queue
const queue = new Protoqueue<typeof jobs>({...});

// Payload types are automatically enforced
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
  subjectPrefix: string; // Prefix for job subjects
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
queue.process('email', async (payload) => {
  try {
    // ...process...
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message, details: { stack: err.stack } };
  }
});
```

---

## Type-Safe Jobs

Protoqueue provides complete type safety for both job producers and consumers, without any boilerplate:

### 1. Centralized Job Schema

Jobs are defined in a central location with full TypeScript typing:

```typescript
// You can use the built-in job types
import { Protoqueue, jobs } from 'protoqueue';

// Or define your own job types
const myJobs = {
  userOnboarding: {
    userId: "123",
    welcome: true
  } as {
    userId: string;
    welcome: boolean;
    sendEmail?: boolean;
  },
  
  logEvent: {
    name: "click",
    data: {}
  } as {
    name: string;
    data: Record<string, unknown>;
    timestamp?: number;
  }
};
```

### 2. Type-Safe Job Publishing

When you add jobs, TypeScript ensures the payload matches the job definition:

```typescript
// Create a queue with your job types
const queue = new Protoqueue<typeof myJobs>({
  streamName: 'my-stream'
});

// TypeScript validates this payload is correct for 'userOnboarding'
await queue.add('userOnboarding', {
  userId: 'user_12345',
  welcome: true,
  sendEmail: true // Optional field
});

// This would cause a TypeScript error
// Property 'welcome' is missing:
//   await queue.add('userOnboarding', { userId: '123' });
```

### 3. Type-Safe Job Processing

Protoqueue provides multiple ways to define your job types with full type safety:

#### 1. Using the Dynamic Job Builder

The easiest and most flexible way to define jobs:

```typescript
import { Protoqueue, createJobs } from 'protoqueue';

// Create custom job types with the builder pattern
const myJobs = createJobs()
  .add('sendEmail', {
    to: '',
    subject: '',
    body: ''
  } as {
    to: string;
    subject: string;
    body: string;
  })
  .add('processPayment', {
    amount: 0,
    currency: 'USD'
  } as {
    amount: number;
    currency: string;
  })
  .build();

// Create a queue with your custom jobs
const queue = await Protoqueue.createClient<typeof myJobs>('my-queue');

// Type-safe job submission
await queue.add('sendEmail', {
  to: 'user@example.com',
  subject: 'Hello',
  body: 'World'
});

// Type-safe processing
queue.process('sendEmail', async (payload) => {
  // payload is fully typed as { to: string, subject: string, body: string }
  console.log(`Sending email to ${payload.to}`);
  return { success: true };
});
```

#### 2. Extending Default Jobs

You can extend the built-in job types:

```typescript
import { Protoqueue, createJobs, jobs as defaultJobs } from 'protoqueue';

// Extend default jobs with your own
const extendedJobs = createJobs()
  .merge(defaultJobs)
  .add('customJob', {
    data: {},
    priority: 0
  } as {
    data: Record<string, any>;
    priority: number;
  })
  .build();

// Create a queue with extended jobs
const queue = await Protoqueue.createClient<typeof extendedJobs>('extended-queue');

// Use both default and custom jobs
await queue.add('email', { 
  to: 'user@example.com', 
  subject: 'Welcome', 
  body: 'Hello world' 
});

await queue.add('customJob', {
  data: { foo: 'bar' },
  priority: 1
});
```

#### 3. Using TypeScript Interfaces

You can also use pure TypeScript interfaces:

```typescript
import { Protoqueue } from 'protoqueue';

// Define your job types as an interface
interface MyJobs {
  sendEmail: {
    to: string;
    subject: string;
    body: string;
  };
  processPayment: {
    amount: number;
    currency: string;
    customerId: string;
  };
}

// Create a typed queue
const queue = await Protoqueue.createClient<MyJobs>('my-queue');

// All operations are fully typed
await queue.add('sendEmail', {
  to: 'user@example.com',
  subject: 'Hello from TypeScript',
  body: 'Type safety is awesome!'
});
```

### 4. Extending with Custom Jobs

You can create your own job collections:

```typescript
// Define a type for your jobs
interface MyCustomJobs {
  payment: {
    amount: number;
    currency: string;
  };
  notification: {
    userId: string;
    message: string;
    channel: 'email' | 'sms' | 'push';
  };
}

// Initialize with sample values
const customJobs = {
  payment: { amount: 0, currency: 'USD' } as MyCustomJobs['payment'],
  notification: { 
    userId: '', 
    message: '', 
    channel: 'email' 
  } as MyCustomJobs['notification']
};

// Use your custom jobs
const queue = new Protoqueue<typeof customJobs>({
  streamName: 'custom-jobs'
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

