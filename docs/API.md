# Protoqueue API Documentation

## Overview

Protoqueue is a robust queuing system built on NATS JetStream and Protocol Buffers. It provides a simple and powerful API for task queuing and processing with features like retries, dead letter queues, and priority-based processing.

## Core Concepts

### Tasks

A task is the basic unit of work in Protoqueue. Each task consists of:

- **id**: A unique identifier (UUID) for the task
- **data**: The actual payload of the task (any JSON-serializable object)
- **metadata**: Additional information about the task, including:
  - **priority**: Task priority (1-5, with 5 being highest)
  - **timestamp**: When the task was created
  - **retries**: How many times the task has been retried

### Streams

Streams are the persistent storage mechanism provided by NATS JetStream. Protoqueue creates and manages streams for you, including:

- Main task stream
- Retry subjects
- Dead letter queue

### Consumers

Consumers are subscriptions to streams that allow processing of tasks. Protoqueue creates consumers for:

- Processing new tasks
- Processing tasks in the dead letter queue

## API Reference

### `Protoqueue` Class

#### Constructor

```typescript
new Protoqueue(streamName: string, subject: string, options?: QueueOptions)
```

Creates a new Protoqueue instance.

**Parameters:**
- `streamName`: The name of the NATS JetStream stream to use
- `subject`: The subject to publish and subscribe to
- `options`: Optional configuration (see below)

**Options:**
```typescript
export interface QueueOptions {
  maxRetries?: number;    // Default: 3
  ackWait?: number;       // Default: 30000 (30 seconds)
  batchSize?: number;     // Default: 10
  retryDelay?: number;    // Default: 1000 (1 second)
}
```

#### Methods

##### `connect`

```typescript
async connect(url?: string): Promise<void>
```

Connects to the NATS server and initializes the JetStream stream.

**Parameters:**
- `url`: NATS server URL (default: 'nats://localhost:4222')

**Example:**
```typescript
await queue.connect();
// or
await queue.connect('nats://my-nats-server:4222');
```

##### `disconnect`

```typescript
async disconnect(): Promise<void>
```

Gracefully disconnects from the NATS server.

**Example:**
```typescript
await queue.disconnect();
```

##### `enqueue`

```typescript
async enqueue(taskData: TaskData): Promise<string>
```

Adds a task to the queue for processing.

**Parameters:**
- `taskData`: Task data and metadata

**Returns:**
- The unique ID of the enqueued task

**Example:**
```typescript
const taskId = await queue.enqueue({
  data: { 
    orderId: '12345',
    customer: 'John Doe',
    items: [
      { productId: 'p1', quantity: 2 }
    ]
  },
  metadata: {
    priority: 5 // High priority
  }
});
```

##### `process`

```typescript
async process(handler: (task: any) => Promise<TaskResult>): Promise<void>
```

Begins processing tasks from the queue.

**Parameters:**
- `handler`: The function that processes each task. Should return a `TaskResult`.

**TaskResult Interface:**
```typescript
export interface TaskResult {
  success: boolean;
  error?: string;
}
```

**Example:**
```typescript
queue.process(async (task) => {
  try {
    // Process the task
    console.log(`Processing order ${task.data.orderId}`);
    
    // Simulate task processing
    await processOrder(task.data);
    
    // Return success
    return { success: true };
  } catch (error) {
    // Return failure with error message
    return { 
      success: false, 
      error: error.message 
    };
  }
});
```

##### `processDLQ`

```typescript
async processDLQ(handler: (task: any) => Promise<TaskResult>): Promise<void>
```

Begins processing tasks from the dead letter queue.

**Parameters:**
- `handler`: The function that processes each DLQ task. Should return a `TaskResult`.

**Example:**
```typescript
queue.processDLQ(async (task) => {
  console.log(`Processing failed task ${task.id}`);
  console.log(`This task failed ${task.metadata.retries} times`);
  
  // Special handling for failed tasks
  await logFailedTask(task);
  
  // Always mark as success to remove from DLQ
  return { success: true };
});
```

##### `getStats`

```typescript
async getStats(): Promise<any>
```

Gets statistics about the current queue.

**Returns:**
- Object containing queue statistics

**Example:**
```typescript
const stats = await queue.getStats();
console.log(`Messages in queue: ${stats.messages}`);
console.log(`Queue size in bytes: ${stats.bytes}`);
```

## Error Handling

Protoqueue implements several error handling strategies:

1. **Task Failures**: If a task handler returns `{ success: false }`, the task will be retried according to the configured `maxRetries`.

2. **Dead Letter Queue**: After exhausting all retries, tasks are moved to the dead letter queue (DLQ).

3. **Connection Failures**: Protoqueue will throw errors when it can't connect to NATS. You should handle these in your application.

Example error handling:

```typescript
try {
  await queue.connect();
  // ... use queue
} catch (error) {
  console.error('Queue error:', error);
  // Handle connection failure
}
```

## Best Practices

1. **Idempotency**: Design your task handlers to be idempotent (safe to execute multiple times).

2. **Task Size**: Keep task data reasonably small. For large data, store it externally and include a reference.

3. **Timeouts**: Set appropriate `ackWait` values based on your task execution times.

4. **Priorities**: Use priorities effectively - reserve high priorities (4-5) for truly urgent tasks.

5. **Error Handling**: Always return proper `TaskResult` objects and handle DLQ messages.

6. **Graceful Shutdown**: Always call `disconnect()` when shutting down your application.

## Example Workflows

### Basic Task Processing

```typescript
import { Protoqueue } from 'protoqueue';

const queue = new Protoqueue('orders', 'orders.processing');
await queue.connect();

// Process tasks
queue.process(async (task) => {
  try {
    await processOrder(task.data);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Enqueue a task
await queue.enqueue({
  data: { orderId: '12345', customer: 'John Doe' }
});
```

### Using Dead Letter Queue

```typescript
// Process main queue
queue.process(async (task) => {
  // Normal processing logic
  // ...
});

// Process dead letter queue
queue.processDLQ(async (task) => {
  // Alert about failed task
  await sendFailureAlert(task);
  
  // Log failure for analysis
  await logFailedTask(task);
  
  // Mark as processed (removes from DLQ)
  return { success: true };
});
```

### Priority-Based Processing

```typescript
// High priority tasks
await queue.enqueue({
  data: { orderId: '12345', customer: 'VIP Customer' },
  metadata: { priority: 5 }
});

// Normal priority tasks
await queue.enqueue({
  data: { orderId: '67890', customer: 'Regular Customer' },
  metadata: { priority: 3 }
});
``` 