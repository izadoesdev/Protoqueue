/**
 * Job definitions for Protoqueue
 * 
 * This module provides a type-safe way to define and extend job types.
 * Users can create their own job schemas or extend the default ones.
 */

// Base type representing the structure of a job map
export type JobMap = Record<string, any>;

// Empty job map that users can extend
export type EmptyJobMap = Record<string, never>;

/**
 * Default jobs provided as examples
 */
export const defaultJobs = {
  /**
   * Analytics job for tracking user events
   */
  analytics: {
    event: "page_view",
    userId: "user_123",
    properties: {},
  } as {
    event: string;
    userId: string;
    properties?: Record<string, unknown>;
  },
  
  /**
   * Email job for sending messages
   */
  email: {
    to: "user@example.com",
    subject: "Welcome to Protoqueue",
    body: "Your account has been created",
    attachments: [],
  } as {
    to: string;
    subject: string;
    body: string;
    attachments?: Array<{ name: string; content: string }>;
  },
  
  /**
   * Image processing job
   */
  imageProcess: {
    url: "https://example.com/image.jpg",
    operations: ["resize", "compress"],
    targetFormat: "webp",
  } as {
    url: string;
    operations: string[];
    targetFormat?: string;
    width?: number;
    height?: number;
  },
};

// Default implementation of JobMap using the example jobs
export type DefaultJobMap = typeof defaultJobs;

// Helper to extract job names as a union type
export type JobName<T extends JobMap = DefaultJobMap> = keyof T;

// Helper to get payload type for a specific job
export type JobPayload<T extends JobMap, K extends keyof T> = T[K];

/**
 * Jobs factory to create and extend job definitions
 * 
 * This provides a fluent API for defining job types
 */
export class JobsBuilder<T extends JobMap = EmptyJobMap> {
  private jobMap: T;
  
  constructor(initialJobs: T = {} as T) {
    this.jobMap = initialJobs;
  }
  
  /**
   * Add a new job type to the job map
   * 
   * @example
   * ```typescript
   * const myJobs = new JobsBuilder()
   *   .add('sendEmail', {
   *     to: '',
   *     subject: '',
   *     body: ''
   *   } as {
   *     to: string;
   *     subject: string;
   *     body: string;
   *   })
   *   .add('processPayment', {
   *     amount: 0,
   *     currency: 'USD'
   *   } as {
   *     amount: number;
   *     currency: string;
   *   })
   *   .build();
   * ```
   */
  add<K extends string, V>(jobName: K, template: V): JobsBuilder<T & Record<K, V>> {
    const newJobs = {
      ...this.jobMap,
      [jobName]: template
    };
    
    return new JobsBuilder<T & Record<K, V>>(newJobs as T & Record<K, V>);
  }
  
  /**
   * Merge another job map into this one
   * 
   * @example
   * ```typescript
   * // Start with default jobs
   * const myJobs = new JobsBuilder()
   *   .merge(defaultJobs)
   *   // Add additional custom jobs
   *   .add('customJob', { ... })
   *   .build();
   * ```
   */
  merge<U extends JobMap>(jobs: U): JobsBuilder<T & U> {
    const merged = {
      ...this.jobMap,
      ...jobs
    };
    
    return new JobsBuilder<T & U>(merged as T & U);
  }
  
  /**
   * Get the final job map
   */
  build(): T {
    return this.jobMap;
  }
}

// Create a function to start building jobs
export function createJobs<T extends JobMap = EmptyJobMap>(
  initialJobs?: T
): JobsBuilder<T> {
  return new JobsBuilder<T>(initialJobs || {} as T);
}

// For backward compatibility
export const jobs = defaultJobs; 