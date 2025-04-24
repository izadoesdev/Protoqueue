import { Protoqueue, createJobs, jobs as defaultJobs, JobMap } from '../src/core';

async function main() {
  // Example 1: Creating jobs from scratch with builder pattern
  console.log('\n--- Example 1: Creating jobs from scratch ---');
  
  // Define job types
  interface EmailJobs {
    sendEmail: {
      to: string;
      subject: string;
      body: string;
      cc?: string[];
    };
    processPayment: {
      amount: number;
      currency: string;
      customerId: string;
      paymentMethodId: string;
    };
  }
  
  // Build custom job types with the builder pattern
  const customJobs = createJobs()
    .add('sendEmail', {
      to: '',
      subject: '',
      body: '',
      cc: [] as string[]
    } as EmailJobs['sendEmail'])
    .add('processPayment', {
      amount: 0,
      currency: 'USD',
      customerId: '',
      paymentMethodId: ''
    } as EmailJobs['processPayment'])
    .build();
  
  // Create a queue with the custom jobs
  const queue1 = await Protoqueue.createClient<typeof customJobs>('custom-jobs-queue', {
    inMemory: true,
    verbose: true
  });
  
  // Type-safe job submission
  const emailId = await queue1.add('sendEmail', {
    to: 'user@example.com',
    subject: 'Custom Jobs Example',
    body: 'This email was sent from a custom job type',
    cc: ['manager@example.com']
  });
  
  console.log(`Added custom email job with ID: ${emailId}`);
  
  // Type-safe processing
  queue1.process('sendEmail', async (payload) => {
    console.log(`Processing custom email to: ${payload.to}`);
    if (payload.cc && payload.cc.length > 0) {
      console.log(`With CC: ${payload.cc.join(', ')}`);
    }
    return { success: true };
  });
  
  // Example 2: Extending the default jobs
  console.log('\n--- Example 2: Extending default jobs ---');
  
  // Define notification job type
  interface NotificationJob {
    notification: {
      userId: string;
      message: string;
      channel: 'email' | 'sms' | 'push';
    };
  }
  
  // Extend default jobs with additional custom jobs
  const extendedJobs = createJobs()
    .merge(defaultJobs) // Start with all default jobs
    .add('notification', {
      userId: '',
      message: '',
      channel: 'push' as const
    } as NotificationJob['notification'])
    .build();
  
  // Create a queue with the extended jobs
  const queue2 = await Protoqueue.createClient<typeof extendedJobs>('extended-jobs-queue', {
    inMemory: true,
    verbose: true
  });
  
  // Use both default and custom jobs
  const analyticsId = await queue2.add('analytics', {
    event: 'custom_event',
    userId: 'user_123',
    properties: { source: 'custom-jobs-example' }
  });
  
  const notificationId = await queue2.add('notification', {
    userId: 'user_123',
    message: 'New feature available',
    channel: 'push'
  });
  
  console.log(`Added analytics job with ID: ${analyticsId}`);
  console.log(`Added notification job with ID: ${notificationId}`);
  
  // Process both job types
  queue2.process('analytics', async (payload) => {
    console.log(`Processing analytics event: ${payload.event}`);
    return { success: true };
  });
  
  queue2.process('notification', async (payload) => {
    console.log(`Sending ${payload.channel} notification to user: ${payload.userId}`);
    console.log(`Message: ${payload.message}`);
    return { success: true };
  });
  
  // Example 3: Interface-based job definition
  console.log('\n--- Example 3: Interface-based job definition ---');
  
  // Define jobs using TypeScript interfaces
  interface BackgroundJobs {
    generateReport: {
      reportType: 'sales' | 'inventory' | 'marketing';
      startDate: string;
      endDate: string;
      format: 'pdf' | 'csv' | 'xlsx';
    };
    dataSync: {
      source: string;
      destination: string;
      tables: string[];
      fullSync: boolean;
    };
  }
  
  // Create queue with interface-defined jobs
  const queue3 = await Protoqueue.createClient<BackgroundJobs>('background-jobs-queue', {
    inMemory: true,
    verbose: true
  });
  
  // Use interface-based jobs
  const reportId = await queue3.add('generateReport', {
    reportType: 'sales',
    startDate: '2023-01-01',
    endDate: '2023-01-31',
    format: 'pdf'
  });
  
  console.log(`Added report job with ID: ${reportId}`);
  
  // Process with full type safety
  queue3.process('generateReport', async (payload) => {
    console.log(`Generating ${payload.reportType} report in ${payload.format} format`);
    console.log(`Date range: ${payload.startDate} to ${payload.endDate}`);
    return { success: true };
  });
  
  // Keep the application running to process jobs
  console.log('\nWaiting for jobs to be processed...');
  setTimeout(async () => {
    await queue1.disconnect();
    await queue2.disconnect();
    await queue3.disconnect();
    console.log('All queues disconnected');
  }, 5000);
}

// Run the examples
main().catch(error => console.error('Error running examples:', error)); 