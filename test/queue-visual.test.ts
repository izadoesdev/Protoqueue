import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { Protoqueue, type TaskData, type TaskResult } from '../src/index';
import { randomUUID } from 'node:crypto';
import { Database } from 'bun:sqlite';

interface ProcessedTask {
  id: string;
  data: string;
  processed_at: string;
  status: string;
}

describe('Queue Visual Test', () => {
  let queue: Protoqueue;
  let db: Database;
  const testStreamName = `visual-test-${randomUUID().slice(0, 8)}`;
  const testSubject = `visual.test.${randomUUID().slice(0, 8)}`;

  beforeAll(async () => {
    // Create SQLite database
    db = new Database(':memory:');
    db.run(`
      CREATE TABLE processed_tasks (
        id TEXT PRIMARY KEY,
        data TEXT,
        processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        status TEXT
      )
    `);

    // Create test queue
    queue = await Protoqueue.create({
      streamName: testStreamName,
      subject: testSubject,
      options: {
        batchSize: 1,
        ackWait: 1000,
        maxRetries: 1
      }
    });
  });

  afterAll(async () => {
    await queue.disconnect();
    db.close();
  });

  test('should process tasks and store in database', async () => {
    // Set up handler that stores in database
    await queue.process(async (task: TaskData): Promise<TaskResult> => {
      console.log('Processing task:', JSON.stringify(task, null, 2));
      
      // The task ID is in the root of the task object
      const id = task.id;
      if (!id) {
        console.error('Task missing internal ID:', JSON.stringify(task, null, 2));
        return { success: false, error: 'Missing internal task ID' };
      }
      
      const data = JSON.stringify(task.data);
      
      // Store in database
      db.run(
        'INSERT INTO processed_tasks (id, data, status) VALUES (?, ?, ?)',
        [id, data, 'processed']
      );
      
      return { success: true };
    });

    // Enqueue some test tasks (no need to provide IDs)
    const tasks = [
      { data: { message: 'Task 1', value: 100 } },
      { data: { message: 'Task 2', value: 200 } },
      { data: { message: 'Task 3', value: 300 } }
    ];

    console.log('Enqueueing tasks:', JSON.stringify(tasks, null, 2));
    const taskIds = await queue.enqueueBatch(tasks);
    console.log('Enqueued task IDs:', taskIds);

    // Wait for processing
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Query database to see what was processed
    const processed = db.query('SELECT * FROM processed_tasks ORDER BY processed_at').all() as ProcessedTask[];
    
    // Log the results for visualization
    console.log('\nProcessed Tasks in Database:');
    console.log('------------------------');
    for (const task of processed) {
      console.log(`ID: ${task.id}`);
      console.log(`Data: ${task.data}`);
      console.log(`Status: ${task.status}`);
      console.log(`Processed At: ${task.processed_at}`);
      console.log('------------------------');
    }

    // Verify all tasks were processed
    expect(processed.length).toBe(tasks.length);
    
    // Verify each task was processed correctly
    for (const taskId of taskIds) {
      const task = processed.find(t => t.id === taskId);
      expect(task).toBeDefined();
      expect(task?.status).toBe('processed');
    }
  });
}); 