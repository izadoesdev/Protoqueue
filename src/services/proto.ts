import protobuf from 'protobufjs';
import { safeJsonStringify, safeJsonParse } from '../utils/helpers';
import logger from './logger';

/**
 * Protocol Buffer service for task serialization/deserialization
 */
export class ProtoService {
  private root: protobuf.Root;
  private Task: protobuf.Type;
  private TaskMetadata: protobuf.Type;

  constructor(protoPath = './proto/task.proto') {
    try {
      this.root = protobuf.loadSync(protoPath);
      this.Task = this.root.lookupType('protoqueue.Task');
      this.TaskMetadata = this.root.lookupType('protoqueue.TaskMetadata');
      logger.info('Protocol Buffers loaded successfully');
    } catch (error) {
      logger.error('Failed to load Protocol Buffers', error);
      throw new Error(`Failed to load Protocol Buffers: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Create a task message
   */
  createTask(id: string, data: unknown, metadata: Record<string, any> = {}): any {
    try {
      return this.Task.create({
        id,
        data: Buffer.from(safeJsonStringify(data)),
        metadata
      });
    } catch (error) {
      logger.error('Failed to create task message', error);
      throw error;
    }
  }

  /**
   * Encode a task message to a buffer
   */
  encodeTask(task: any): Uint8Array {
    try {
      return this.Task.encode(task).finish();
    } catch (error) {
      logger.error('Failed to encode task message', error);
      throw error;
    }
  }

  /**
   * Decode a buffer to a task message
   */
  decodeTask(buffer: Uint8Array): any {
    try {
      const decodedTask = this.Task.decode(buffer);
      const task = this.Task.toObject(decodedTask, {
        longs: String,
        defaults: true
      });

      // Parse JSON data
      if (task.data) {
        task.data = safeJsonParse(Buffer.from(task.data).toString());
      }

      return task;
    } catch (error) {
      logger.error('Failed to decode task message', error);
      throw error;
    }
  }
}

// Create a default instance
export const protoService = new ProtoService(); 