/**
 * Example demonstrating type-safe job queue with Protoqueue
 * 
 * This example shows how to use the Protoqueue with type-safe job definitions
 * for both producers and consumers.
 */

import { Protoqueue } from '../src/core';

async function main() {
  try {
    // 1. Create and connect to the queue using the default job types
    const queue = await Protoqueue.create({
      streamName: 'demo-stream',
      verbose: true
    });

    console.log('Connected to NATS. Adding and processing jobs...');

    // 2. Register handlers for different job types
    
    // Analytics event handler
    queue.process('analytics', async (payload, metadata) => {
      console.log(`[ANALYTICS] Processing event: ${payload.event}`);
      console.log(`  - User ID: ${payload.userId}`);
      console.log(`  - Properties: ${JSON.stringify(payload.properties || {})}`);
      console.log(`  - Job ID: ${metadata?.id}`);
      console.log(`  - Timestamp: ${new Date(metadata?.timestamp || 0).toISOString()}`);
      
      // Just for demo purposes - simulate successful processing
      return { success: true };
    });
    
    // Email handler
    queue.process('email', async (payload) => {
      console.log(`[EMAIL] Sending email to: ${payload.to}`);
      console.log(`  - Subject: ${payload.subject}`);
      console.log(`  - Body: ${payload.body}`);
      
      // Just for demo purposes - randomly simulate failures (20% chance)
      const success = Math.random() > 0.2;
      if (!success) {
        return { 
          success: false, 
          error: 'Failed to send email (simulated)', 
          details: { retryable: true } 
        };
      }
      
      return { success: true };
    });
    
    // Image processing handler
    queue.process('imageProcess', async (payload) => {
      console.log(`[IMAGE] Processing image from: ${payload.url}`);
      console.log(`  - Operations: ${payload.operations.join(', ')}`);
      console.log(`  - Target format: ${payload.targetFormat || 'original'}`);
      
      // Just for demo purposes
      return { success: true };
    });

    // 3. Add jobs of different types
    
    // Add an analytics event
    await queue.add('analytics', {
      event: 'signup',
      userId: 'user_12345',
      properties: {
        source: 'landing_page',
        referrer: 'google'
      }
    });
    
    // Add an email
    await queue.add('email', {
      to: 'user@example.com',
      subject: 'Welcome to our platform!',
      body: 'Thank you for signing up...',
      attachments: [
        { name: 'welcome.pdf', content: 'base64-encoded-content' }
      ]
    });
    
    // Add an image processing job
    await queue.add('imageProcess', {
      url: 'https://example.com/profile.jpg',
      operations: ['resize', 'optimize'],
      targetFormat: 'webp',
      width: 300,
      height: 300
    });
    
    // Sleep to allow time for processing
    console.log('Jobs added. Processing will continue for 5 seconds...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Get queue stats before disconnecting
    const stats = await queue.getStats();
    console.log('Queue stats:', stats);
    
    // 4. Disconnect when done
    await queue.disconnect();
    console.log('Disconnected from NATS');
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

// Run the example
main();

/**
 * CUSTOM JOB TYPES EXAMPLE
 * 
 * This example shows how to define and use custom job types with Protoqueue.
 */
async function customJobsExample() {
  // 1. Define your custom job types
  interface CustomJobs {
    payment: {
      amount: number;
      currency: string;
      customerId: string;
      description?: string;
    };
    
    sms: {
      to: string;
      message: string;
      sendAt?: Date;
    };
  }
  
  // Initialize with sample values
  const myJobs = {
    payment: {
      amount: 99.99,
      currency: 'USD',
      customerId: 'cust_123'
    } as CustomJobs['payment'],
    
    sms: {
      to: '+12345678900',
      message: 'Your verification code is 123456'
    } as CustomJobs['sms']
  };
  
  // 2. Create a queue with your custom job types
  // Using a custom type that doesn't extend the default jobs
  const customQueue = new Protoqueue<typeof myJobs>({
    streamName: 'custom-stream',
    verbose: true
  });
  
  // Connect to NATS
  await customQueue.connect();
  
  // 3. Set up handlers for your custom job types
  customQueue.process('payment', async (payload) => {
    console.log(`Processing payment of ${payload.amount} ${payload.currency} for customer ${payload.customerId}`);
    return { success: true };
  });
  
  customQueue.process('sms', async (payload) => {
    console.log(`Sending SMS to ${payload.to}: ${payload.message}`);
    return { success: true };
  });
  
  // 4. Add jobs with your custom types
  await customQueue.add('payment', {
    amount: 199.99,
    currency: 'EUR',
    customerId: 'cust_456',
    description: 'Premium subscription'
  });
  
  await customQueue.add('sms', {
    to: '+9876543210',
    message: 'Your order has shipped!',
    sendAt: new Date(Date.now() + 3600 * 1000) // Send in 1 hour
  });
  
  // Wait for processing
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  // 5. Disconnect
  await customQueue.disconnect();
}

// Uncomment to run the custom jobs example
// customJobsExample(); 