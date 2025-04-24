/**
 * Task data and optional metadata
 */
export interface TaskData {
  /**
   * The unique ID of the task
   */
  id: string;
  /**
   * The main data payload of the task
   */
  data: unknown;
  /**
   * Optional metadata for the task
   */
  metadata?: {
    /**
     * Timestamp when the task was created
     */
    timestamp?: number;
    /**
     * Additional custom metadata
     */
    [key: string]: unknown;
  };
}

/**
 * Result of task processing
 */
export interface TaskResult {
  /**
   * Whether the task was processed successfully
   */
  success: boolean;
  /**
   * Optional error message if task processing failed
   */
  error?: string;
  /**
   * Optional additional error details (e.g., stack trace)
   */
  details?: Record<string, any>;
}

/**
 * Consumer type
 */
export type ConsumerType = 'pull' | 'push';

/**
 * Acknowledgment policy
 */
export type AckPolicy = 'explicit' | 'none' | 'all';

/**
 * Configuration options for the queue
 */
export interface QueueOptions {
  /**
   * Maximum time to wait for task acknowledgment in milliseconds
   */
  ackWait?: number;
  
  /**
   * Number of messages to fetch in a batch (for pull consumers)
   */
  batchSize?: number;
  
  /**
   * Maximum number of retry attempts
   */
  maxRetries?: number;
  
  /**
   * Delay between retries in milliseconds
   */
  retryDelay?: number;
  
  /**
   * Consumer type: pull (default) or push
   */
  consumerType?: ConsumerType;
  
  /**
   * Acknowledgment policy: explicit (default), none (no acks needed), or all (ack full batch)
   */
  ackPolicy?: AckPolicy;
  
  /**
   * Queue group for load balancing (push consumers only)
   */
  queueGroup?: string;
  
  /**
   * Deliver all available messages including historical ones
   */
  deliverAll?: boolean;
  
  /**
   * Deliver only new messages (ignores historical messages)
   */
  deliverNew?: boolean;
  
  /**
   * Deliver from a specific time
   */
  deliverFrom?: Date;
  
  /**
   * Flow control settings for push consumers
   */
  flowControl?: {
    /**
     * Maximum number of pending messages
     */
    maxPending?: number;
    
    /**
     * Maximum pending bytes
     */
    maxPendingBytes?: number;
  };
}

/**
 * Queue statistics
 */
export interface QueueStats {
  /**
   * Number of messages in the queue
   */
  messages: number;
  /**
   * Size of the queue in bytes
   */
  bytes: number;
  /**
   * First sequence number in the queue
   */
  firstSequence: number;
  /**
   * Last sequence number in the queue
   */
  lastSequence: number;
  /**
   * Number of consumers attached to the queue
   */
  consumer_count: number;
} 