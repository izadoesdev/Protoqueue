/**
 * Task data and optional metadata
 */
export interface TaskData {
  /**
   * The main data payload of the task
   */
  data: unknown;
  /**
   * Optional metadata for the task
   */
  metadata?: {
    /**
     * Task priority (1-5, with 5 being highest)
     */
    priority?: number;
    /**
     * Timestamp when the task was created
     */
    timestamp?: number;
    /**
     * Number of retry attempts for this task
     */
    retries?: number;
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
}

/**
 * Configuration options for the queue
 */
export interface QueueOptions {
  /**
   * Maximum number of retry attempts for failed tasks
   */
  maxRetries?: number;
  /**
   * Maximum time to wait for task acknowledgment in milliseconds
   */
  ackWait?: number;
  /**
   * Number of messages to fetch in a batch
   */
  batchSize?: number;
  /**
   * Base delay between retries in milliseconds
   */
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