import { 
  type JetStreamManager, 
  type StreamConfig, 
  RetentionPolicy, 
  StorageType 
} from 'nats';
import logger from './logger';

/**
 * Stream service for JetStream stream management
 */
export class StreamService {
  /**
   * Create or update a JetStream stream
   */
  async ensureStream(
    jsm: JetStreamManager,
    streamName: string,
    subjects: string[],
    options: {
      storage?: 'file' | 'memory';
      maxAge?: number;
      replicas?: number;
      realTimeMode?: boolean;
      noWildcards?: boolean;
    } = {}
  ): Promise<void> {
    try {
      // Check if stream exists
      const streamInfo = await jsm.streams.info(streamName).catch(() => null);
      
      // Default max age is 24 hours in nanoseconds
      const DEFAULT_MAX_AGE = 24 * 60 * 60 * 1000 * 1000 * 1000;
      
      // Set storage type based on options
      const storage = options.realTimeMode 
        ? StorageType.Memory 
        : (options.storage === 'memory' ? StorageType.Memory : StorageType.File);
      
      // Configure the stream
      const config: Partial<StreamConfig> = {
        subjects: options.noWildcards ? subjects : subjects,
        retention: RetentionPolicy.Limits,
        max_age: options.maxAge 
          ? options.maxAge * 1000 * 1000 // Convert ms to ns
          : DEFAULT_MAX_AGE,
        storage,
        num_replicas: options.replicas || 1
      };
      
      // Add explicit subject filters for exact matching
      if (options.noWildcards && subjects.length > 0) {
        // Use direct subjects assignment for exact filtering
        // instead of using subject_filter which may not be supported in all versions
      }
      
      if (!streamInfo) {
        // Create stream if it doesn't exist
        await jsm.streams.add({
          name: streamName,
          ...config
        });
        logger.info(`Created stream: ${streamName} (storage: ${storage})`);
      } else {
        // Update stream if needed
        await jsm.streams.update(streamName, {
          ...config
        });
        logger.info(`Updated stream: ${streamName} (storage: ${storage})`);
      }
    } catch (error) {
      logger.error('Failed to setup stream', error);
      throw new Error(`Failed to setup stream: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get statistics for a stream
   */
  async getStreamStats(jsm: JetStreamManager, streamName: string): Promise<any> {
    try {
      const stream = await jsm.streams.info(streamName);
      return {
        messages: stream.state.messages,
        bytes: stream.state.bytes,
        firstSequence: stream.state.first_seq,
        lastSequence: stream.state.last_seq,
        consumer_count: stream.state.consumer_count
      };
    } catch (error) {
      logger.error('Failed to get stream stats', error);
      throw new Error(`Failed to get stream stats: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

// Create a default instance
export const streamService = new StreamService(); 