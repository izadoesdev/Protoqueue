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
  ): Promise<void> {
    try {
      // Check if stream exists
      const streamInfo = await jsm.streams.info(streamName).catch(() => null);
      
      const config: Partial<StreamConfig> = {
        subjects,
        retention: RetentionPolicy.Limits,
        max_age: 24 * 60 * 60 * 1000 * 1000 * 1000, // 24 hours in nanoseconds
        storage: StorageType.File,
        num_replicas: 1
      };
      
      if (!streamInfo) {
        // Create stream if it doesn't exist
        await jsm.streams.add({
          name: streamName,
          ...config
        });
        logger.info(`Created stream: ${streamName}`);
      } else {
        // Update stream if needed
        await jsm.streams.update(streamName, {
          ...config
        });
        logger.info(`Updated stream: ${streamName}`);
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