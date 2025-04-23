import { 
  connect, 
  type NatsConnection, 
  type JetStreamClient, 
  DeliverPolicy, 
  AckPolicy,
  type JetStreamManager,
  type JetStreamPullSubscription,
  DiscardPolicy
} from 'nats';
import { randomUUID } from 'node:crypto';

import type { 
  TaskData, 
  TaskResult, 
  QueueOptions, 
  QueueStats 
} from '../types';
import logger from '../services/logger';
import { protoService } from '../services/proto';
import { streamService } from '../services/stream';
import { msToNs, sleep } from '../utils/helpers';

/**
 * Protoqueue configuration options
 */
export interface ProtoqueueConfig {
  /** NATS server URL */
  url?: string;
  /** Stream name for JetStream */
  streamName: string;
  /** Subject to publish and subscribe to */
  subject: string;
  /** Queue options */
  options?: QueueOptions;
}

/**
 * Protoqueue - High-performance queuing system built on NATS JetStream
 */
export class Protoqueue {
  private nc: NatsConnection | null = null;
  private js: JetStreamClient | null = null;
  private jsm: JetStreamManager | null = null;
  private isShuttingDown = false;
  private isConnected = false;
  private taskHandler?: (task: TaskData) => Promise<TaskResult>;
  private options: Required<QueueOptions>;

  /**
   * Creates a new Protoqueue instance
   */
  constructor(private config: ProtoqueueConfig) {
    // Default options optimized for performance
    this.options = {
      maxRetries: 3,
      ackWait: 30000,
      batchSize: 10,
      retryDelay: 1000,
      ...(config.options || {})
    };

    logger.info(`Protoqueue initialized for stream: ${config.streamName}, subject: ${config.subject}`);
  }

  /**
   * Connect to NATS and setup the queue
   */
  async connect(url = 'nats://localhost:4222'): Promise<this> {
    if (this.isConnected) return this;
    
    try {
      this.nc = await connect({ servers: url });
      this.js = this.nc.jetstream();
      this.jsm = await this.nc.jetstreamManager();
      
      // Ensure stream exists
      await this.setupStream();
      
      // Start processing if handler was already set
      if (this.taskHandler) {
        await this.startConsumer(this.taskHandler);
      }
      
      this.isConnected = true;
      logger.info(`Connected to NATS at ${url}`);
      
      return this;
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
    
    const subjects = [this.config.subject];
    
    // Ensure the stream exists with optimized settings
    await streamService.ensureStream(this.jsm, this.config.streamName, subjects);
    
    try {
      // Update with optimized settings
      await this.jsm.streams.update(this.config.streamName, {
        subjects,
        discard: DiscardPolicy.Old,
        max_age: 60 * 60 * 1000 * 1000 * 1000, // 1 hour in ns
        num_replicas: 1
      });
    } catch (error) {
      logger.warn('Could not update stream settings', error);
    }
  }

  /**
   * Disconnect from NATS
   */
  async disconnect(): Promise<void> {
    if (!this.nc || !this.isConnected) return;
    
    this.isShuttingDown = true;
    this.isConnected = false;
    
    try {
      await this.nc.drain();
      this.nc = null;
      this.js = null;
      this.jsm = null;
      logger.info('Disconnected from NATS');
    } catch (error) {
      logger.warn('Error while disconnecting from NATS', error);
    } finally {
      this.isShuttingDown = false;
    }
  }

  /**
   * Enqueue a task
   */
  async enqueue<T extends object = object>(
    task: { data: T, metadata?: Record<string, any> }
  ): Promise<string> {
    if (!this.isConnected) await this.connect(this.config.url);
    if (!this.js) throw new Error('Failed to connect to NATS');
    
    try {
      // Generate a unique ID for this task
      const id = randomUUID();
      
      // Create metadata
      const metadata = {
        id,
        timestamp: Date.now(),
        ...(task.metadata || {})
      };
      
      // Create and encode task using protobuf
      const taskMessage = protoService.createTask(id, task.data, metadata);
      const buffer = protoService.encodeTask(taskMessage);
      
      // Publish
      await this.js.publish(this.config.subject, buffer);
      
      return id;
    } catch (error) {
      logger.error('Failed to enqueue task', error);
      throw error;
    }
  }
  
  /**
   * Enqueue multiple tasks in a batch
   */
  async enqueueBatch<T extends object = object>(
    tasks: Array<{ data: T, metadata?: Record<string, any> }>
  ): Promise<string[]> {
    if (!tasks.length) return [];
    if (!this.isConnected) await this.connect(this.config.url);
    
    // Process all tasks in parallel
    return Promise.all(tasks.map(task => this.enqueue(task)));
  }
  
  /**
   * Process tasks from the queue
   */
  async process<T = unknown>(
    handler: (task: TaskData) => Promise<TaskResult>
  ): Promise<this> {
    this.taskHandler = handler;
    
    if (!this.isConnected) {
      await this.connect(this.config.url);
    } else if (this.js) {
      await this.startConsumer(this.taskHandler);
    }
    
    return this;
  }
  
  /**
   * Start the consumer for processing tasks
   */
  private async startConsumer(
    handler: (task: TaskData) => Promise<TaskResult>
  ): Promise<void> {
    if (!this.js) throw new Error('Not connected to NATS');
    
    try {
      // Create a unique consumer name
      const durable = `${this.config.streamName}-${this.config.subject.replace(/\./g, '-')}-consumer`;
      
      // Create consumer with optimized configuration
      const consumerConfig = {
        ack_policy: AckPolicy.Explicit,
        ack_wait: msToNs(this.options.ackWait),
        deliver_policy: DeliverPolicy.All,
        durable_name: durable,
        filter_subject: this.config.subject,
        max_batch: this.options.batchSize,
        max_deliver: this.options.maxRetries + 1
      };
      
      // Ensure consumer exists
      try {
        await this.jsm?.consumers.add(this.config.streamName, consumerConfig);
      } catch (error) {
        // Consumer might already exist, which is fine
        logger.debug('Consumer might already exist', error);
      }
      
      // Create pull subscription
      const consumer = await this.js.pullSubscribe(this.config.subject, {
        stream: this.config.streamName,
        config: consumerConfig
      });
      
      logger.info(`Processing tasks from ${this.config.subject}`);
      
      // Start processing loop in background
      this.startProcessingLoop(consumer, handler);
    } catch (error) {
      logger.error('Failed to setup consumer', error);
      throw error;
    }
  }
  
  /**
   * Start processing tasks in background
   */
  private async startProcessingLoop(
    consumer: JetStreamPullSubscription, 
    handler: (task: TaskData) => Promise<TaskResult>
  ): Promise<void> {
    // Process in background
    (async () => {
      while (!this.isShuttingDown) {
        try {
          // Pull messages with a longer timeout for testing
          consumer.pull({ batch: this.options.batchSize, expires: 5000 });
          
          for await (const msg of consumer) {
            if (this.isShuttingDown) break;
            
            try {
              // Decode task
              const task = protoService.decodeTask(msg.data);
              logger.info(`Processing task: ${task.id}`);
              
              try {
                // Process task
                const result = await handler(task);
                
                if (result.success) {
                  msg.ack();
                  logger.info(`Successfully processed task: ${task.id}`);
                } else if (msg.info.deliveryCount < this.options.maxRetries) {
                  msg.nak(this.options.retryDelay);
                  logger.warn(`Task failed, will retry: ${task.id}, error: ${result.error}`);
                } else {
                  logger.warn(`Task failed permanently: ${task.id}, error: ${result.error}`);
                  msg.term();
                }
              } catch (error) {
                logger.error(`Error processing task: ${task.id}`, error);
                
                if (msg.info.deliveryCount < this.options.maxRetries) {
                  msg.nak(this.options.retryDelay);
                } else {
                  msg.term();
                }
              }
            } catch (error) {
              // Task decode error - terminal
              logger.error('Error decoding task', error);
              msg.term();
            }
          }
        } catch (error) {
          if (!this.isShuttingDown) {
            logger.error('Error in processing loop', error);
            await sleep(1000); // Longer sleep on error
          }
        }
      }
    })();
  }
  
  /**
   * Get queue stats
   */
  async getStats(): Promise<QueueStats> {
    if (!this.isConnected) await this.connect(this.config.url);
    if (!this.jsm) throw new Error('Failed to connect to NATS');
    
    try {
      return await streamService.getStreamStats(this.jsm, this.config.streamName);
    } catch (error) {
      logger.error('Failed to get stream stats', error);
      throw error;
    }
  }
  
  /**
   * Create and connect a Protoqueue in one step
   */
  static async create(config: ProtoqueueConfig): Promise<Protoqueue> {
    const queue = new Protoqueue(config);
    await queue.connect(config.url);
    return queue;
  }
} 