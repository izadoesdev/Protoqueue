# Protoqueue

A high-performance, reliable task queue system built on NATS JetStream and Protocol Buffers.

![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)

## Overview

Protoqueue provides a robust task queue implementation utilizing NATS JetStream for persistence and Protocol Buffers for efficient message serialization. It handles task retries, dead-letter queues, and provides a clean API for task processing.

## Features

- **Reliable Message Delivery**: At-least-once message delivery semantics with acknowledgments
- **Automatic Retries**: Configurable retry logic with exponential backoff
- **Dead Letter Queue**: Failed tasks automatically move to DLQ after max retries
- **Protocol Buffer Serialization**: Efficient binary serialization of task data
- **Stateful Task Tracking**: Detailed metadata with priority, timestamp, and retry count
- **Horizontal Scaling**: Multiple consumers can process tasks in parallel
- **Real-time Monitoring**: Built-in stats collection for queue monitoring
- **Clean TypeScript API**: Fully typed interfaces for task creation and processing

## Installation

```bash
# Using npm
npm install protoqueue

# Using yarn
yarn add protoqueue

# Using bun
bun add protoqueue
```

## Prerequisites

- [NATS Server](https://nats.io/) with JetStream enabled
- Node.js 16+ or Bun runtime

## Quick Start

```typescript
import { ProtoQueue, TaskResult } from 'protoqueue';

// Initialize queue
const queue = new ProtoQueue('my-stream', 'tasks.subject', {
  maxRetries: 3,
  ackWait: 30000, // 30 seconds
  batchSize: 10,
  retryDelay: 1000, // 1 second
});

// Connect to NATS
await queue.connect('nats://localhost:4222');

// Process tasks
queue.process(async (task) => {
  console.log('Processing task:', task.id);
  console.log('Task data:', task.data);
  
  try {
    // Process the task
    // ...
    
    return { success: true };
  } catch (error) {
    return { 
      success: false, 
      error: error.message 
    };
  }
});

// Process tasks from dead letter queue
queue.processDLQ(async (task) => {
  console.log('Processing DLQ task:', task.id);
  console.log('Task retries:', task.metadata?.retries);
  
  // Handle failed task
  // ...
  
  return { success: true };
});

// Enqueue a task
await queue.enqueue({
  data: { 
    userId: 123,
    action: 'sendEmail',
    payload: { to: 'user@example.com', subject: 'Hello' }
  },
  metadata: {
    priority: 5, // Higher priority (1-5)
  }
});
```

## Architecture

Protoqueue is built on the following components:

1. **NATS JetStream**: Provides reliable message persistence and delivery
2. **Protocol Buffers**: Efficient binary serialization of messages
3. **Task Processor**: Handles task execution, acknowledgment, and retries

The workflow is:

1. Producer enqueues tasks with optional metadata
2. Tasks are serialized using Protocol Buffers and published to JetStream
3. Consumers process tasks and acknowledge successful completion
4. Failed tasks are either retried with exponential backoff or sent to DLQ

## API Reference

### ProtoQueue

The main class for interacting with the queue.

#### Constructor

```typescript
constructor(streamName: string, subject: string, options?: QueueOptions)
```

- `streamName`: The name of the NATS JetStream stream
- `subject`: The subject to publish and subscribe to
- `options`: Optional configuration

#### Options

```typescript
interface QueueOptions {
  maxRetries?: number;       // Maximum retry attempts (default: 3)
  ackWait?: number;          // Acknowledgment timeout in ms (default: 30000)
  batchSize?: number;        // Number of messages to fetch (default: 10)
  retryDelay?: number;       // Base delay between retries in ms (default: 1000)
}
```

#### Methods

- **connect(url?: string): Promise\<void\>**
  Connect to the NATS server.

- **disconnect(): Promise\<void\>**
  Gracefully disconnect from NATS.

- **enqueue(taskData: TaskData): Promise\<string\>**
  Enqueue a task to be processed, returns the task ID.

- **process(handler: (task: TaskData) => Promise\<TaskResult\>): Promise\<void\>**
  Process tasks from the queue.

- **processDLQ(handler: (task: TaskData) => Promise\<TaskResult\>): Promise\<void\>**
  Process tasks from the dead letter queue.

- **getStats(): Promise\<QueueStats\>**
  Get queue statistics.

### Types

```typescript
interface TaskData {
  data: unknown;
  metadata?: {
    priority?: number;
    timestamp?: number;
    retries?: number;
    [key: string]: unknown;
  };
}

interface TaskResult {
  success: boolean;
  error?: string;
}

interface QueueStats {
  messages: number;
  bytes: number;
  firstSequence: number;
  lastSequence: number;
  consumer_count: number;
}
```

## Configuration

### Stream Setup

The queue automatically creates the stream if it doesn't exist.

```typescript
// Custom stream configuration
await queue.connect();
```

### Consumer Configuration

The consumer is configured during the initialization of the queue.

```typescript
// Configure with custom options
const queue = new ProtoQueue('my-stream', 'tasks.subject', {
  maxRetries: 5,
  ackWait: 60000, // 60 seconds
  batchSize: 20,
  retryDelay: 2000, // 2 seconds
});
```

## Handling Errors

Error handling is built into the task processing flow:

1. Return `{ success: false, error: 'error message' }` to trigger a retry
2. Throw an exception in your handler to trigger automatic negative acknowledgment
3. Tasks exceeding max retry attempts are moved to the DLQ

Example:

```typescript
queue.process(async (task) => {
  try {
    // Process task
    if (!isValidTask(task)) {
      return { success: false, error: 'Invalid task data' };
    }
    
    // Success
    return { success: true };
  } catch (error) {
    // Will be retried
    return { success: false, error: error.message };
  }
});

// Handle permanently failed tasks
queue.processDLQ(async (task) => {
  // Log, alert, or handle the failed task
  console.error(`Task ${task.id} failed after ${task.metadata?.retries} attempts`);
  
  // Acknowledge to remove from DLQ
  return { success: true };
});
```

## Monitoring

Get real-time statistics about your queue:

```typescript
// Get queue stats
const stats = await queue.getStats();
console.log(`Queue has ${stats.messages} messages, ${stats.consumer_count} consumers`);
```

## Performance Considerations

- **Batch Size**: Adjust the `batchSize` option based on your processing capacity
- **Acknowledgment Wait**: Set `ackWait` to match your expected processing time
- **Retry Delay**: Configure `retryDelay` to control the backoff timing
- **Concurrency**: Run multiple instances to process in parallel

## Example Applications

### Task Processing Service

```typescript
import { ProtoQueue } from 'protoqueue';

async function startWorker() {
  const queue = new ProtoQueue('tasks', 'tasks.processing');
  await queue.connect();
  
  queue.process(async (task) => {
    // Process task
    return { success: true };
  });
  
  // Keep the process running
  process.on('SIGINT', async () => {
    await queue.disconnect();
    process.exit(0);
  });
}

startWorker().catch(console.error);
```

### Task Producer

```typescript
import { ProtoQueue } from 'protoqueue';

async function sendTasks() {
  const queue = new ProtoQueue('tasks', 'tasks.processing');
  await queue.connect();
  
  for (let i = 0; i < 100; i++) {
    await queue.enqueue({
      data: { id: i, action: 'process' },
      metadata: { priority: Math.ceil(Math.random() * 5) }
    });
  }
  
  await queue.disconnect();
}

sendTasks().catch(console.error);
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- [NATS.io](https://nats.io/) for providing the messaging platform
- [Protocol Buffers](https://developers.google.com/protocol-buffers) for efficient serialization
