/**
 * Convert milliseconds to nanoseconds (for NATS JetStream)
 */
export function msToNs(ms: number): number {
  return ms * 1000000;
}

/**
 * Safely stringify an object to JSON
 */
export function safeJsonStringify(data: unknown): string {
  try {
    return JSON.stringify(data);
  } catch (error) {
    console.error('Failed to stringify data:', error);
    return '{}';
  }
}

/**
 * Safely parse JSON to an object
 */
export function safeJsonParse<T = unknown>(data: string): T {
  try {
    return JSON.parse(data) as T;
  } catch (error) {
    console.error('Failed to parse JSON:', error);
    return {} as T;
  }
}

/**
 * Sleep for a specified number of milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Calculate exponential backoff delay
 */
export function calculateBackoff(baseDelay: number, attempt: number, maxDelay = 30000): number {
  const delay = Math.min(baseDelay * 2 ** attempt, maxDelay);
  // Add some jitter to prevent thundering herd
  return delay + (Math.random() * 100);
} 