import { 
  connect, 
  type NatsConnection, 
  StringCodec, 
  type JetStreamClient, 
  DeliverPolicy, 
  AckPolicy,
  type JetStreamManager,
  type JetStreamPullSubscription,
} from 'nats';
import { randomUUID } from 'node:crypto';

import type { 
  TaskData, 
  TaskResult, 
  QueueOptions, 
  QueueStats 
} from '../types';
import { logger } from '../services/logger';
import { protoService } from '../services/proto';
import { streamService } from '../services/stream';
import { msToNs, calculateBackoff, sleep } from '../utils/helpers';

/**
 * ProtoQueue - A queuing system built on NATS JetStream and Protocol Buffers
 */
export class ProtoQueue {
  private nc: NatsConnection | null = null;
  private js: JetStreamClient | null = null;
  private jsm: JetStreamManager | null = null;
  private sc = StringCodec();
  private streamName: string;
  private subject: string;
  private options: Required<QueueOptions>;
  private deadLetterSubject: string;

  /**
   * Creates a new ProtoQueue instance
   * 
   * @param streamName - The name of the NATS JetStream stream
   * @param subject - The subject to publish and subscribe to
   * @param options - Optional configuration options
   */
  constructor(streamName: string, subject: string, options: QueueOptions = {}) {
    this.streamName = streamName;
    this.subject = subject;
    this.deadLetterSubject = `${subject}.deadletter`;
    
    // Default options
    this.options = {
      maxRetries: 3,
      ackWait: 30000, // 30 seconds
      batchSize: 10,
      retryDelay: 1000, // 1 second
      ...options
    };

    logger.info(`ProtoQueue initialized for stream: ${streamName}, subject: ${subject}`);
  }

  /**
   * Connect to NATS server
   * 
   * @param url - NATS server URL
   */
  async connect(url = 'nats://localhost:4222'): Promise<void> {
    try {
      this.nc = await connect({ servers: url });
      this.js = this.nc.jetstream();
      this.jsm = await this.nc.jetstreamManager();
      
      // Ensure stream exists
      await this.setupStream();
      
      logger.info(`Connected to NATS at ${url}`);
    } catch (error) {
      logger.error('Failed to connect to NATS', error);
      throw error;
    }
  }

  /**
   * Create or update the stream configuration
   */
  private async setupStream(): Promise<void> {
    if (!this.jsm) throw new Error('Not connected to NATS');
    
    const subjects = [
      this.subject, 
      `${this.subject}.*`, 
      this.deadLetterSubject
    ];
    
    await streamService.ensureStream(this.jsm, this.streamName, subjects);
  }

  /**
   * Gracefully disconnect from NATS
   */
  async disconnect(): Promise<void> {
    if (this.nc) {
      await this.nc.drain();
      this.nc = null;
      this.js = null;
      this.jsm = null;
      logger.info('Disconnected from NATS');
    }
  }

  /**
   * Enqueue a task to be processed
   * 
   * @param taskData - Task data and metadata
   * @returns The task ID
   */
  async enqueue(taskData: TaskData): Promise<string> {
    if (!this.js) throw new Error('Not connected to NATS');
    
    try {
      const id = randomUUID();
      
      // Create metadata with defaults
      const metadata = {
        priority: 3,
        timestamp: Date.now(),
        retries: 0,
        ...(taskData.metadata || {})
      };
      
      // Create and encode task using protobuf
      const taskMessage = protoService.createTask(id, taskData.data, metadata);
      const buffer = protoService.encodeTask(taskMessage);
      
      // Publish to JetStream
      await this.js.publish(this.subject, buffer);
      
      logger.debug(`Enqueued task: ${id}`);
      return id;
    } catch (error) {
      logger.error('Failed to enqueue task', error);
      throw error;
    }
  }
  
  /**
   * Process tasks from the queue
   * 
   * @param handler - Function to process each task
   */
  async process(handler: (task: TaskData) => Promise<TaskResult>): Promise<void> {
    if (!this.js) throw new Error('Not connected to NATS');
    
    try {
      // Create or update consumer
      const consumerConfig = {
        ack_policy: AckPolicy.Explicit,
        ack_wait: msToNs(this.options.ackWait), // Convert to nanoseconds
        deliver_policy: DeliverPolicy.All,
        max_deliver: this.options.maxRetries + 1, // Original attempt + retries
        durable_name: `${this.streamName}-consumer`,
      };
      
      const consumer = await this.js.pullSubscribe(this.subject, {
        stream: this.streamName,
        config: consumerConfig
      });
      
      logger.info(`Processing tasks from ${this.subject}`);
      
      // Start processing loop
      this.startProcessing(consumer, handler);
    } catch (error) {
      logger.error('Failed to setup consumer', error);
      throw error;
    }
  }
  
  /**
   * Start processing tasks in the background
   * 
   * @param consumer - The NATS consumer
   * @param handler - Function to process each task
   */
  private async startProcessing(consumer: JetStreamPullSubscription, handler: (task: TaskData) => Promise<TaskResult>): Promise<void> {
    // Process in background
    (async () => {
      while (true) {
        try {
          // Pull batch of messages
          consumer.pull({ batch: this.options.batchSize });
          
          // Wait for messages to arrive
          for await (const msg of consumer) {
            try {
              // Decode message using protobuf
              const taskBuffer = msg.data;
              const task = protoService.decodeTask(taskBuffer);
              
              logger.debug(`Processing task: ${task.id}`);
              
              // Process task
              const result = await handler(task);
              
              if (result.success) {
                // Acknowledge success
                msg.ack();
                logger.debug(`Task completed successfully: ${task.id}`);
              } else {
                const metadata = task.metadata || {};
                const retries = metadata.retries || 0;
                
                if (retries < this.options.maxRetries) {
                  // Retry task
                  const updatedTask = {
                    ...task,
                    metadata: {
                      ...metadata,
                      retries: retries + 1
                    }
                  };
                  
                  // Create updated task message
                  const taskMessage = protoService.createTask(
                    task.id, 
                    task.data, 
                    updatedTask.metadata
                  );
                  const buffer = protoService.encodeTask(taskMessage);
                  
                  // Calculate delay with exponential backoff
                  const delay = calculateBackoff(this.options.retryDelay, retries);
                  
                  // Publish to retry subject with delay
                  setTimeout(async () => {
                    if (this.js) {
                      await this.js.publish(`${this.subject}.retry`, buffer);
                      logger.debug(`Task scheduled for retry: ${task.id}, attempt: ${retries + 1}`);
                    } else {
                      logger.error(`Cannot retry task ${task.id}: Not connected to NATS`);
                    }
                  }, delay);
                  
                  // Acknowledge original message
                  msg.ack();
                } else {
                  // Move to dead letter queue
                  const taskMessage = protoService.createTask(
                    task.id, 
                    task.data, 
                    task.metadata
                  );
                  const buffer = protoService.encodeTask(taskMessage);
                  if (this.js) {
                    await this.js.publish(this.deadLetterSubject, buffer);
                    // Acknowledge to remove from main queue
                    msg.ack();
                    logger.warn(`Task ${task.id} moved to dead letter queue after ${retries} retries: ${result.error}`);
                  } else {
                    logger.error(`Cannot move task ${task.id} to DLQ: Not connected to NATS`);
                    msg.nak();
                  }
                }
              }
            } catch (error) {
              logger.error('Error processing message', error);
              // Negative acknowledge to retry
              msg.nak();
            }
          }
        } catch (error) {
          logger.error('Error processing messages', error);
          // Wait before trying again
          await sleep(1000);
        }
      }
    })();
  }
  
  /**
   * Process tasks from the dead letter queue
   * 
   * @param handler - Function to process each DLQ task
   */
  async processDLQ(handler: (task: TaskData) => Promise<TaskResult>): Promise<void> {
    if (!this.js) throw new Error('Not connected to NATS');
    
    try {
      const dlqConsumerConfig = {
        ack_policy: AckPolicy.Explicit,
        durable_name: `${this.streamName}-dlq-consumer`
      };
      
      const consumer = await this.js.pullSubscribe(this.deadLetterSubject, {
        stream: this.streamName,
        config: dlqConsumerConfig
      });
      
      logger.info(`Processing dead letter queue tasks from ${this.deadLetterSubject}`);
      
      // Start processing loop (similar to regular processing)
      this.startProcessing(consumer, handler);
    } catch (error) {
      logger.error('Failed to setup DLQ consumer', error);
      throw error;
    }
  }
  
  /**
   * Get queue stats
   * 
   * @returns Queue statistics
   */
  async getStats(): Promise<QueueStats> {
    if (!this.jsm) throw new Error('Not connected to NATS');
    
    return await streamService.getStreamStats(this.jsm, this.streamName);
  }
} 