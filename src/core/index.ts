import { 
  connect, 
  type NatsConnection, 
  type JetStreamClient, 
  DeliverPolicy, 
  AckPolicy,
  type JetStreamManager,
  type JetStreamPullSubscription,
} from 'nats';
import { nanoid } from 'nanoid';

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
import { 
  type JobMap, 
  type DefaultJobMap,
  jobs as defaultJobs,
  createJobs,
  JobsBuilder
} from './jobs';

/**
 * Simplified Protoqueue configuration options
 */
export interface ProtoqueueConfig {
  /** NATS server URL (default: nats://localhost:4222) */
  url?: string;
  /** Stream name for JetStream */
  streamName: string;
  /** Subject prefix for publishing and subscribing (default: 'jobs') */
  subjectPrefix?: string;
  /** Enable verbose logging (default: false) */
  verbose?: boolean;
  /** Use in-memory storage for faster performance (default: false) */
  inMemory?: boolean;
  /** Real-time mode - optimized for speed over persistence (default: false) */
  realTimeMode?: boolean;
  /** Maximum message retention time in hours (default: 24) */
  maxAgeHours?: number;
  /** Maximum retries for failed jobs (default: 3) */
  maxRetries?: number;
  /** Advanced queue options */
  advanced?: Partial<QueueOptions>;
}

/**
 * Handler function for processing jobs
 */
export type JobHandler<T extends JobMap, K extends keyof T> = 
  (jobName: K, payload: T[K], metadata?: Record<string, any>) => Promise<TaskResult>;

/**
 * Protoqueue - High-performance queuing system built on NATS JetStream
 * with type-safe job handling
 */
export class Protoqueue<T extends JobMap = DefaultJobMap> {
  private nc: NatsConnection | null = null;
  private js: JetStreamClient | null = null;
  private jsm: JetStreamManager | null = null;
  private isShuttingDown = false;
  private isConnected = false;
  private handlers: Map<string, JobHandler<T, any>> = new Map();
  private options: Required<QueueOptions>;
  private consumers: Map<string, JetStreamPullSubscription> = new Map();
  private verbose: boolean;
  private subjectPrefix: string;

  /**
   * Creates a new Protoqueue instance
   */
  constructor(private config: ProtoqueueConfig) {
    // Default options optimized for performance
    this.options = {
      maxRetries: config.maxRetries ?? 3,
      ackWait: 30000,
      batchSize: 10,
      retryDelay: 1000,
      consumerType: 'pull',
      ackPolicy: 'explicit',
      queueGroup: '',
      deliverAll: true,
      deliverNew: false,
      deliverFrom: new Date(0),
      flowControl: {
        maxPending: 1000,
        maxPendingBytes: 1024 * 1024,
      },
      ...(config.advanced || {})
    };
    this.verbose = !!config.verbose;
    this.subjectPrefix = config.subjectPrefix || 'jobs';
    
    if (this.verbose) {
      logger.info(`Protoqueue initialized for stream: ${config.streamName}, subject prefix: ${this.subjectPrefix}`);
    }
  }

  /**
   * Connect to NATS and setup the queue
   */
  async connect(url?: string): Promise<this> {
    if (this.isConnected) return this;
    
    // Use provided URL or config URL or default
    const serverUrl = url || this.config.url || 'nats://localhost:4222';
    
    try {
      this.nc = await connect({ servers: serverUrl });
      this.js = this.nc.jetstream();
      this.jsm = await this.nc.jetstreamManager();
      
      // Create wildcard subject for all job types
      const subjects = [`${this.subjectPrefix}.*`];
      
      // Convert maxAgeHours to milliseconds
      const maxAge = this.config.maxAgeHours ? (this.config.maxAgeHours * 60 * 60 * 1000) : undefined;
      
      // Ensure stream exists with user-defined options
      await streamService.ensureStream(
        this.jsm, 
        this.config.streamName, 
        subjects,
        {
          storage: this.config.inMemory ? 'memory' : 'file',
          maxAge,
          replicas: 1, // Default to single replica for simplicity
          realTimeMode: this.config.realTimeMode,
          noWildcards: false
        }
      );
      
      // Start any previously registered handlers
      if (this.handlers.size > 0) {
        for (const [jobName, handler] of this.handlers.entries()) {
          await this.setupConsumer(jobName as keyof T, handler);
        }
      }
      
      this.isConnected = true;
      if (this.verbose) logger.info(`Connected to NATS at ${serverUrl}`);
      
      return this;
    } catch (error) {
      logger.error('Failed to connect to NATS', error);
      throw error;
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
      this.consumers.clear();
      this.handlers.clear();
      if (this.verbose) logger.info('Disconnected from NATS');
    } catch (error) {
      logger.warn('Error while disconnecting from NATS', error);
    } finally {
      this.isShuttingDown = false;
    }
  }

  /**
   * Add a job to the queue with type safety
   */
  async add<K extends keyof T>(
    jobName: K, 
    payload: T[K], 
    metadata?: Record<string, any>
  ): Promise<string> {
    if (!this.isConnected || !this.js) {
      throw new Error('Protoqueue not connected. Call connect() before adding jobs.');
    }
    
    try {
      // Generate a unique ID for this job
      const id = nanoid();
      
      // Create metadata
      const jobMetadata = {
        id,
        timestamp: Date.now(),
        jobName: String(jobName),
        ...(metadata || {})
      };
      
      // Create the subject for this job type
      const subject = `${this.subjectPrefix}.${String(jobName)}`;
      
      // Create and encode job using protobuf
      const taskMessage = protoService.createTask(id, payload, jobMetadata);
      const buffer = protoService.encodeTask(taskMessage);
      
      // Publish
      await this.js.publish(subject, buffer);
      
      if (this.verbose) logger.info(`Added job: ${String(jobName)} with ID: ${id}`);
      
      return id;
    } catch (error) {
      logger.error(`Failed to add job: ${String(jobName)}`, error);
      throw error;
    }
  }
  
  /**
   * Add multiple jobs of the same type to the queue
   */
  async addBatch<K extends keyof T>(
    jobName: K, 
    payloads: Array<T[K]>, 
    metadata?: Record<string, any>
  ): Promise<string[]> {
    if (!payloads.length) return [];
    if (!this.isConnected || !this.js) {
       throw new Error('Protoqueue not connected. Call connect() before batch adding jobs.');
    }
    
    // Parallelize job adds for performance
    return Promise.all(payloads.map(payload => this.add(jobName, payload, metadata)));
  }
  
  /**
   * Register a handler for a specific job type
   */
  process<K extends keyof T>(
    jobName: K, 
    handler: (payload: T[K], metadata?: Record<string, any>) => Promise<TaskResult>
  ): this {
    // Create a wrapper that adapts the handler to the expected format
    const wrappedHandler: JobHandler<T, K> = async (name, payload, metadata) => {
      return handler(payload, metadata);
    };
    
    // Store the handler
    this.handlers.set(String(jobName), wrappedHandler);
    
    // If already connected, set up the consumer immediately
    if (this.isConnected && this.js && this.jsm) {
      this.setupConsumer(jobName, wrappedHandler).catch(err => {
        logger.error(`Failed to setup consumer for job: ${String(jobName)}`, err);
      });
    }
    
    if (this.verbose) logger.info(`Registered handler for job: ${String(jobName)}`);
    
    return this;
  }
  
  /**
   * Setup a consumer for a specific job type
   */
  private async setupConsumer<K extends keyof T>(
    jobName: K, 
    handler: JobHandler<T, K>
  ): Promise<void> {
    if (!this.js || !this.jsm) throw new Error('Not connected to NATS');
    
    // Create a unique consumer name for this job type
    const subject = `${this.subjectPrefix}.${String(jobName)}`;
    const durable = `${this.config.streamName}-${subject.replace(/\./g, '-')}-consumer`;
    
    // Create consumer with optimized configuration
    const consumerConfig = {
      ack_policy: AckPolicy.Explicit,
      ack_wait: msToNs(this.options.ackWait),
      deliver_policy: DeliverPolicy.All,
      durable_name: durable,
      filter_subject: subject,
      max_batch: this.options.batchSize,
      max_deliver: this.options.maxRetries + 1
    };
    
    try {
      // Ensure consumer exists
      await this.jsm.consumers.add(this.config.streamName, consumerConfig);
      
      // Create pull subscription
      const consumer = await this.js.pullSubscribe(subject, {
        stream: this.config.streamName,
        config: consumerConfig
      });
      
      // Store consumer reference
      this.consumers.set(String(jobName), consumer);
      
      // Start processing loop
      this.startProcessingLoop(jobName, consumer, handler);
      
      if (this.verbose) logger.info(`Started consumer for job: ${String(jobName)}`);
    } catch (error) {
      logger.error(`Failed to setup consumer for job: ${String(jobName)}`, error);
      throw error;
    }
  }
  
  /**
   * Start the processing loop for a specific job type
   */
  private async startProcessingLoop<K extends keyof T>(
    jobName: K,
    consumer: JetStreamPullSubscription, 
    handler: JobHandler<T, K>
  ): Promise<void> {
    if (this.isShuttingDown) return;
    
    try {
      consumer.pull({ batch: this.options.batchSize, expires: 5000 });
      
      for await (const msg of consumer) {
        if (this.isShuttingDown) break;
        
        try {
          // Decode message
          const task = protoService.decodeTask(msg.data);
          
          if (this.verbose) logger.info(`Processing job: ${String(jobName)} with ID: ${task.id}`);
          
          // Extract the job name and make sure it matches
          const messageJobName = task.metadata?.jobName;
          if (messageJobName && messageJobName !== String(jobName)) {
            logger.warn(`Job name mismatch: ${messageJobName} != ${String(jobName)}`);
          }
          
          // Process task
          const taskData: TaskData = {
            id: task.id,
            data: task.data,
            metadata: task.metadata
          };
          
          // Call handler with payload and metadata
          const result = await handler(
            jobName, 
            taskData.data as T[K], 
            taskData.metadata
          );
          
          if (result.success) {
            // Acknowledge successful processing
            msg.ack();
            if (this.verbose) logger.info(`Successfully processed job: ${String(jobName)} with ID: ${task.id}`);
          } else {
            // Negative acknowledge for retry
            const errorMsg = result.error || 'Unknown error';
            logger.warn(`Job processing failed: ${String(jobName)} with ID: ${task.id} - ${errorMsg}`);
            
            if (task.metadata?.retries >= this.options.maxRetries) {
              // Terminal failure - no more retries
              msg.term();
              logger.error(`Job exceeded max retries: ${String(jobName)} with ID: ${task.id} - ${errorMsg}`);
            } else {
              // Negative acknowledge for retry
              msg.nak(this.options.retryDelay);
            }
          }
        } catch (error) {
          logger.error(`Error processing job: ${String(jobName)}`, error);
          // Negative acknowledge to retry
          msg.nak(this.options.retryDelay);
        }
      }
    } catch (error) {
      if (!this.isShuttingDown) {
        logger.error(`Consumer processing loop error: ${String(jobName)}`, error);
        
        // Restart processing loop after delay
        await sleep(1000);
        this.startProcessingLoop(jobName, consumer, handler);
      }
    }
  }
  
  /**
   * Get queue statistics
   */
  async getStats(): Promise<QueueStats> {
    if (!this.jsm) {
      throw new Error('Not connected to NATS');
    }
    
    return streamService.getStreamStats(this.jsm, this.config.streamName);
  }
  
  /**
   * Factory method to create and connect a Protoqueue instance
   */
  static async create<T extends JobMap = DefaultJobMap>(
    config: ProtoqueueConfig
  ): Promise<Protoqueue<T>> {
    const queue = new Protoqueue<T>(config);
    await queue.connect(config.url);
    return queue;
  }

  /**
   * One-line client creation with minimal configuration
   */
  static createClient<T extends JobMap = DefaultJobMap>(streamName: string, options: Partial<ProtoqueueConfig> = {}): Promise<Protoqueue<T>> {
    return Protoqueue.create<T>({
      streamName,
      ...options
    });
  }
}

// Re-export jobs for convenient access
export { defaultJobs as jobs, createJobs, JobsBuilder } from './jobs';
export type { JobMap, DefaultJobMap, JobName, JobPayload, EmptyJobMap } from './jobs'; 