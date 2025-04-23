/**
 * Simplified logger service
 */
export class Logger {
  private prefix: string;
  private enableDebug: boolean;

  constructor(prefix: string, enableDebug = false) {
    this.prefix = prefix;
    this.enableDebug = enableDebug;
  }

  /**
   * Log an informational message
   */
  info(message: string, ...args: any[]): void {
    console.log(`[${this.prefix}] INFO: ${message}`, ...args);
  }

  /**
   * Log a warning message
   */
  warn(message: string, ...args: any[]): void {
    console.warn(`[${this.prefix}] WARN: ${message}`, ...args);
  }

  /**
   * Log an error message
   */
  error(message: string, error?: any, ...args: any[]): void {
    if (error instanceof Error) {
      console.error(`[${this.prefix}] ERROR: ${message}`, error.message, ...args);
      if (error.stack) {
        console.error(error.stack);
      }
    } else {
      console.error(`[${this.prefix}] ERROR: ${message}`, error, ...args);
    }
  }

  /**
   * Log a debug message (only if debug is enabled)
   */
  debug(message: string, ...args: any[]): void {
    if (this.enableDebug) {
      console.debug(`[${this.prefix}] DEBUG: ${message}`, ...args);
    }
  }
}

// Create a default logger instance
export const logger = new Logger('Protoqueue'); 