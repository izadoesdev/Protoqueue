import { Protoqueue, jobs } from '../src/core';

// Example 1: Minimal configuration with factory method
async function example1() {
  // One-line client creation with just stream name
  const queue = await Protoqueue.createClient('my-queue');
  
  // Add a job to the queue
  const jobId = await queue.add('email', {
    to: 'user@example.com',
    subject: 'Welcome!',
    body: 'Thanks for signing up.'
  });
  
  console.log(`Job added with ID: ${jobId}`);
  
  // Process jobs
  queue.process('email', async (payload, metadata) => {
    console.log(`Processing email to: ${payload.to}`);
    // Send email logic would go here
    return { success: true };
  });
  
  // Cleanup
  setTimeout(() => queue.disconnect(), 5000);
}

// Example 2: Using some common configuration options
async function example2() {
  const queue = await Protoqueue.create({
    streamName: 'notification-queue',
    inMemory: true, // Use in-memory storage for better performance
    maxRetries: 5,  // Increase retries for reliability
    verbose: true   // Enable verbose logging
  });
  
  // Add a batch of analytics events
  const eventIds = await queue.addBatch('analytics', [
    { event: 'page_view', userId: 'user_1', properties: { page: 'home' } },
    { event: 'button_click', userId: 'user_2', properties: { button: 'signup' } }
  ]);
  
  console.log(`Added ${eventIds.length} analytics events`);
  
  // Process analytics events
  queue.process('analytics', async (payload) => {
    console.log(`Processing ${payload.event} event for user ${payload.userId}`);
    // Analytics processing logic would go here
    return { success: true };
  });
  
  // Cleanup
  setTimeout(() => queue.disconnect(), 5000);
}

// Example 3: Custom job types with TypeScript
interface CustomJobs {
  sendPush: {
    deviceToken: string;
    title: string;
    body: string;
    data?: Record<string, any>;
  };
  processPayment: {
    amount: number;
    currency: string;
    customerId: string;
    paymentMethodId: string;
  };
}

async function example3() {
  // Create a queue with custom job types
  const queue = await Protoqueue.createClient<CustomJobs>('payment-queue', {
    maxAgeHours: 48, // Keep messages for 48 hours
    realTimeMode: false // Ensure persistence
  });
  
  // Add a payment job with type safety
  const paymentId = await queue.add('processPayment', {
    amount: 99.99,
    currency: 'USD',
    customerId: 'cust_123',
    paymentMethodId: 'pm_456'
  });
  
  console.log(`Payment job added with ID: ${paymentId}`);
  
  // Process payments with type checking
  queue.process('processPayment', async (payload) => {
    console.log(`Processing payment of ${payload.amount} ${payload.currency}`);
    // Payment processing logic would go here
    return { success: true };
  });
  
  // Cleanup
  setTimeout(() => queue.disconnect(), 5000);
}

// Run examples
(async () => {
  try {
    console.log('Running Example 1: Minimal Configuration');
    await example1();
    
    console.log('\nRunning Example 2: Common Configuration Options');
    await example2();
    
    console.log('\nRunning Example 3: Custom Job Types');
    await example3();
  } catch (error) {
    console.error('Example error:', error);
  }
})(); 