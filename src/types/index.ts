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
 * Configuration options for the queue
 */
export interface QueueOptions {
  /**
   * Maximum time to wait for task acknowledgment in milliseconds
   */
  ackWait?: number;
  /**
   * Number of messages to fetch in a batch
   */
  batchSize?: number;
  
  // These are kept for backward compatibility but are no longer used
  maxRetries?: number;
  retryDelay?: number;
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