# ProtoQueue

A lightweight, high-performance queue system built on NATS JetStream and Protocol Buffers.

## Features

- Fast and reliable message queuing using NATS JetStream
- Type-safe task handling with Protocol Buffers
- Built-in retry mechanism with exponential backoff
- Dead Letter Queue (DLQ) for failed tasks
- Priority-based task processing
- Simple and intuitive API

## Prerequisites

- [Bun](https://bun.sh) (v1.0 or later)
- [Docker](https://www.docker.com) (for running NATS)

## Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/protoqueue.git
cd protoqueue

# Install dependencies
bun install
```

## Quick Start

1. Start NATS using Docker Compose:

```bash
docker-compose up -d
```

2. Run the example:

```bash
bun run src/example.ts
```

## Usage

### Basic Usage

```typescript
import { ProtoQueue } from './index';

// Create a new queue
const queue = new ProtoQueue('my-stream', 'my.subject');

// Connect to NATS
await queue.connect();

// Process tasks
queue.process(async (task) => {
  console.log('Processing task:', task.id);
  
  try {
    // Your task processing logic here
    // ...
    
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Enqueue a task
await queue.enqueue({
  data: { /* your task data */ },
  metadata: { priority: 1 }
});

// Disconnect when done
await queue.disconnect();
```

### Advanced Configuration

```typescript
const queue = new ProtoQueue('my-stream', 'my.subject', {
  maxRetries: 5,           // Maximum number of retries for failed tasks
  ackWait: 30000,          // Time to wait for acknowledgment in milliseconds
  batchSize: 10,           // Number of messages to fetch at once
  retryDelay: 1000         // Base delay for retries in milliseconds
});
```

### Processing Dead Letter Queue

```typescript
// Handle failed tasks in the DLQ
queue.processDLQ(async (task) => {
  console.log('Processing failed task from DLQ:', task.id);
  console.log('Failure count:', task.metadata.retries);
  
  // Special handling for failed tasks
  // ...
  
  return { success: true };
});
```

### Monitoring Queue Stats

```typescript
// Get queue statistics
const stats = await queue.getStats();
console.log('Queue stats:', stats);
```

## Protocol Buffers Schema

The task schema is defined in `proto/task.proto`:

```protobuf
syntax = "proto3";

package protoqueue;

message TaskMetadata {
  int32 priority = 1;
  int64 timestamp = 2;
  int32 retries = 3;
}

message Task {
  string id = 1;
  bytes data = 2;
  TaskMetadata metadata = 3;
}
```

## Architecture

ProtoQueue is built on NATS JetStream, which provides:

- **Persistence**: Tasks are stored on disk and survive server restarts
- **Replication**: Tasks can be replicated across multiple servers for high availability
- **Flow Control**: Consumers only receive as many messages as they can process
- **Acknowledgements**: Messages are only removed once processed successfully

## Development

```bash
# Build the project
bun run build

# Run in development mode
bun run dev

# Run tests
bun test
```

## License

MIT
